-- =====================================================================
-- ORAISTE Faktur — satu baris faktur boleh dijual per dus ATAU per satuan
-- produk (lusin/pack/pcs/dll), bukan cuma per dus.
-- Jalankan sekali di Supabase SQL Editor, setelah 0004_product_unit_cost.sql.
--
-- Perubahan aturan bisnis: sebelumnya "Jual SELALU per dus, tidak ada
-- ecer". Sekarang per baris faktur bisa pilih jual per dus (qty = jumlah
-- dus) ATAU per satuan produk itu sendiri (qty = jumlah lusin/pack/dll,
-- harga = harga per satuan itu). total tetap qty * unit_price, cuma
-- maknanya ikut satuan yang dipilih baris itu. Dicatat per baris lewat
-- kolom sold_unit, supaya faktur lama (yang semua barisnya 'dus') tetap
-- terbaca benar.
-- =====================================================================

alter table public.invoice_items rename column qty_box to qty;

alter table public.invoice_items
  add column sold_unit text not null default 'dus';

alter table public.invoice_items
  add constraint invoice_items_sold_unit_check
  check (sold_unit = 'dus' or sold_unit = unit_label_snapshot);

-- create_invoice() diupdate: tiap item payload boleh menyertakan
-- "sold_unit" ('dus' atau satuan produk itu). Kalau tidak dikirim,
-- default 'dus' (perilaku lama, tidak berubah).
create or replace function public.create_invoice(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_today       date := public.jakarta_today();
  v_date        date := coalesce((payload->>'invoice_date')::date, v_today);
  v_customer    public.customers%rowtype;
  v_prefix      text;
  v_term        int;
  v_delivery    text := coalesce(payload->>'delivery_status', 'delivered');
  v_paid        boolean := coalesce((payload->>'paid_in_full')::boolean, false);
  v_method      text := coalesce(payload->>'payment_method', 'cash');
  v_items       jsonb := payload->'items';
  v_seq         int;
  v_number      text;
  v_invoice_id  uuid;
  v_total       bigint;
begin
  -- Validasi header
  if v_date > v_today then
    raise exception 'Tanggal faktur tidak boleh di masa depan.';
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Faktur harus berisi minimal 1 produk.';
  end if;

  select * into v_customer from public.customers where id = (payload->>'customer_id')::uuid;
  if not found then
    raise exception 'Toko tidak ditemukan.';
  end if;

  v_term := coalesce((payload->>'term_days')::int, v_customer.default_term_days);
  if v_term < 0 then
    raise exception 'Tempo tidak boleh negatif.';
  end if;
  if v_delivery not in ('delivered', 'pending') then
    raise exception 'Status kirim tidak valid.';
  end if;
  if v_method not in ('cash', 'transfer') then
    raise exception 'Metode bayar tidak valid.';
  end if;

  -- Validasi baris
  if exists (
    select 1
    from jsonb_to_recordset(v_items) as x(product_id uuid, qty int, unit_price bigint, sold_unit text)
    where x.product_id is null
       or x.qty is null or x.qty <= 0
       or x.unit_price is null or x.unit_price < 0
  ) then
    raise exception 'Setiap produk harus punya qty lebih dari 0 dan harga yang valid.';
  end if;

  if (select count(*) <> count(distinct x.product_id)
      from jsonb_to_recordset(v_items) as x(product_id uuid)) then
    raise exception 'Produk yang sama dimasukkan lebih dari sekali.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_items) as x(product_id uuid)
    left join public.products p on p.id = x.product_id
    where p.id is null
  ) then
    raise exception 'Ada produk yang tidak ditemukan.';
  end if;

  -- Satuan jual tiap baris harus 'dus' atau sama dengan satuan produknya.
  if exists (
    select 1
    from jsonb_to_recordset(v_items) as x(product_id uuid, sold_unit text)
    join public.products p on p.id = x.product_id
    where coalesce(x.sold_unit, 'dus') not in ('dus', p.unit_label)
  ) then
    raise exception 'Satuan jual tidak sesuai satuan produk.';
  end if;

  select sum(x.qty::bigint * x.unit_price) into v_total
  from jsonb_to_recordset(v_items) as x(qty int, unit_price bigint);

  -- Nomor urut atomik: baris counter dikunci sampai transaksi selesai,
  -- dan ikut di-rollback kalau ada yang gagal (tidak ada nomor loncat).
  -- Periode mengikuti bulan tanggal faktur (v_date), bukan v_today.
  insert into public.invoice_counters as c (period, last_number)
  values (to_char(v_date, 'YYYY-MM'), 1)
  on conflict (period) do update set last_number = c.last_number + 1
  returning c.last_number into v_seq;

  select invoice_prefix into v_prefix from public.settings where id = 1;

  v_number := coalesce(v_prefix, 'SPN')
           || '/' || to_char(v_date, 'YYMM')
           || '/' || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

  insert into public.invoices (
    invoice_number, invoice_date, customer_id, customer_name_snapshot,
    term_days, due_date, delivery_status, delivered_at, total, notes
  ) values (
    v_number, v_date, v_customer.id, v_customer.name,
    v_term, v_date + v_term, v_delivery,
    case when v_delivery = 'delivered' then now() end,
    v_total, nullif(btrim(payload->>'notes'), '')
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (
    invoice_id, product_id, product_name_snapshot, box_qty_snapshot, unit_label_snapshot,
    qty, unit_price, sold_unit, line_total
  )
  select v_invoice_id, p.id, p.name, p.box_qty, p.unit_label,
         x.qty, x.unit_price, coalesce(x.sold_unit, 'dus'), x.qty::bigint * x.unit_price
  from jsonb_to_recordset(v_items) as x(product_id uuid, qty int, unit_price bigint, sold_unit text)
  join public.products p on p.id = x.product_id;

  if v_paid and v_total > 0 then
    insert into public.payments (invoice_id, amount, paid_at, method, note)
    values (v_invoice_id, v_total, v_date, v_method, 'Lunas saat faktur dibuat');
  end if;

  return jsonb_build_object('id', v_invoice_id, 'invoice_number', v_number);
end;
$$;

-- get_last_prices() diupdate: harga dinormalisasi jadi "per dus" supaya
-- tetap jadi dasar auto-isi yang konsisten di faktur berikutnya, walau
-- transaksi sebelumnya dijual per satuan (bukan per dus).
create or replace function public.get_last_prices(p_customer_id uuid)
returns table (product_id uuid, unit_price bigint, last_invoice_date date)
language sql
stable
set search_path = public
as $$
  select distinct on (ii.product_id)
    ii.product_id,
    case
      when ii.sold_unit = 'dus' then ii.unit_price
      else ii.unit_price * ii.box_qty_snapshot
    end as unit_price,
    i.invoice_date
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.customer_id = p_customer_id
    and not i.is_void
  order by ii.product_id, i.created_at desc
$$;

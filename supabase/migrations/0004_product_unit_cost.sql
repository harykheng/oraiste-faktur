-- =====================================================================
-- ORAISTE Faktur — satuan isi per dus bebas (bukan cuma "lusin"),
-- tambah harga modal & catatan produk.
-- Jalankan sekali di Supabase SQL Editor, setelah 0003_customer_map_url.sql.
--
-- Contoh: Produk A "1 dus = 50 lusin" -> box_qty=50, unit_label='lusin'.
-- Produk B "1 dus = 200 pack" -> box_qty=200, unit_label='pack'. Detail
-- turunan lain (mis. "1 bal = 50 pack, 1 pack = 5 pcs") tidak dihitung
-- sistem — cukup ditulis di kolom notes sebagai pengingat, karena toko
-- selalu beli per dus (lihat business_rules).
-- =====================================================================

alter table public.products rename column dozens_per_box to box_qty;
alter table public.invoice_items rename column dozens_per_box_snapshot to box_qty_snapshot;

alter table public.products
  add column unit_label text not null default 'lusin',
  add column cost_price bigint,
  add column notes text;

alter table public.products
  add constraint products_unit_label_check check (btrim(unit_label) <> ''),
  add constraint products_cost_price_check check (cost_price is null or cost_price >= 0);

alter table public.invoice_items
  add column unit_label_snapshot text not null default 'lusin';

alter table public.invoice_items
  add constraint invoice_items_unit_label_snapshot_check check (btrim(unit_label_snapshot) <> '');

-- create_invoice() diupdate supaya snapshot box_qty & unit_label produk
-- (sebelumnya nama kolom lama "dozens_per_box" dan satuan di-hardcode "lusin"
-- di layar/PDF, sekarang keduanya ikut data produk).
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
    from jsonb_to_recordset(v_items) as x(product_id uuid, qty_box int, unit_price bigint)
    where x.product_id is null
       or x.qty_box is null or x.qty_box <= 0
       or x.unit_price is null or x.unit_price < 0
  ) then
    raise exception 'Setiap produk harus punya qty minimal 1 dus dan harga yang valid.';
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

  select sum(x.qty_box::bigint * x.unit_price) into v_total
  from jsonb_to_recordset(v_items) as x(qty_box int, unit_price bigint);

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
    qty_box, unit_price, line_total
  )
  select v_invoice_id, p.id, p.name, p.box_qty, p.unit_label,
         x.qty_box, x.unit_price, x.qty_box::bigint * x.unit_price
  from jsonb_to_recordset(v_items) as x(product_id uuid, qty_box int, unit_price bigint)
  join public.products p on p.id = x.product_id;

  if v_paid and v_total > 0 then
    insert into public.payments (invoice_id, amount, paid_at, method, note)
    values (v_invoice_id, v_total, v_date, v_method, 'Lunas saat faktur dibuat');
  end if;

  return jsonb_build_object('id', v_invoice_id, 'invoice_number', v_number);
end;
$$;

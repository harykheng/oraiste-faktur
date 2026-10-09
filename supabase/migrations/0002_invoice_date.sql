-- =====================================================================
-- ORAISTE Faktur — tanggal faktur bisa dipilih manual
-- Jalankan sekali di Supabase SQL Editor, setelah 0001_init.sql.
-- =====================================================================

-- create_invoice() sekarang menerima payload.invoice_date (opsional, "YYYY-MM-DD").
-- Default tetap hari ini (Asia/Jakarta) kalau tidak dikirim. Tidak boleh tanggal
-- di masa depan. Nomor urut & periode counter mengikuti tanggal faktur yang
-- dipilih, bukan selalu hari ini, supaya tetap reset per bulan dengan benar
-- kalau papa membuat faktur untuk tanggal kemarin/bulan lalu.
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
    invoice_id, product_id, product_name_snapshot, dozens_per_box_snapshot,
    qty_box, unit_price, line_total
  )
  select v_invoice_id, p.id, p.name, p.dozens_per_box,
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

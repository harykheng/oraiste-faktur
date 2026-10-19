-- =====================================================================
-- ORAISTE Faktur — laporan Laba Rugi (laba kotor = penjualan - modal)
-- Jalankan sekali di Supabase SQL Editor, setelah 0007_customer_margin.sql.
--
-- Harga modal per dus disimpan (snapshot) di tiap baris faktur saat faktur dibuat,
-- jadi laba faktur lama tidak berubah kalau harga modal produk diganti nanti.
-- Baris yang dibuat sebelum migration ini (atau saat produk belum punya harga modal)
-- belum punya snapshot: laporan memakai harga modal produk SAAT INI untuk baris itu.
-- Faktur yang dibatalkan (void) tidak dihitung. Biaya operasional belum termasuk.
-- =====================================================================

alter table public.invoice_items
  add column cost_per_dus_snapshot bigint check (cost_per_dus_snapshot is null or cost_per_dus_snapshot >= 0);

-- create_invoice(): sama seperti 0005, ditambah snapshot harga modal per dus.
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
    qty, unit_price, sold_unit, line_total, cost_per_dus_snapshot
  )
  select v_invoice_id, p.id, p.name, p.box_qty, p.unit_label,
         x.qty, x.unit_price, coalesce(x.sold_unit, 'dus'), x.qty::bigint * x.unit_price,
         p.cost_price
  from jsonb_to_recordset(v_items) as x(product_id uuid, qty int, unit_price bigint, sold_unit text)
  join public.products p on p.id = x.product_id;

  if v_paid and v_total > 0 then
    insert into public.payments (invoice_id, amount, paid_at, method, note)
    values (v_invoice_id, v_total, v_date, v_method, 'Lunas saat faktur dibuat');
  end if;

  return jsonb_build_object('id', v_invoice_id, 'invoice_number', v_number);
end;
$$;

-- Laporan untuk rentang tanggal faktur (inklusif, tanggal Asia/Jakarta).
-- Modal baris = modal per dus x qty (kalau dijual per dus) atau
-- modal per dus / isi per dus x qty (kalau dijual per satuan), dibulatkan ke rupiah.
create or replace function public.get_profit_report(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
with lines as (
  select
    i.id                                   as invoice_id,
    i.customer_id,
    i.customer_name_snapshot               as customer_name,
    ii.product_id,
    ii.product_name_snapshot               as product_name,
    ii.line_total,
    ii.qty,
    ii.sold_unit,
    ii.box_qty_snapshot,
    coalesce(ii.cost_per_dus_snapshot, p.cost_price) as cost_per_dus
  from public.invoices i
  join public.invoice_items ii on ii.invoice_id = i.id
  left join public.products p on p.id = ii.product_id
  where not i.is_void
    and i.invoice_date between p_from and p_to
), costed as (
  select *,
    case
      when cost_per_dus is null then null
      when sold_unit = 'dus' then qty::bigint * cost_per_dus
      else round(qty::numeric * cost_per_dus / box_qty_snapshot)::bigint
    end as line_cost
  from lines
), by_product as (
  select product_id, product_name,
         sum(line_total)::bigint                                          as sales,
         coalesce(sum(line_total) filter (where line_cost is not null), 0)::bigint as sales_costed,
         coalesce(sum(line_cost), 0)::bigint                              as cost,
         count(*) filter (where line_cost is null)                        as uncosted
  from costed
  group by product_id, product_name
), by_customer as (
  select customer_id, customer_name,
         sum(line_total)::bigint                                          as sales,
         coalesce(sum(line_total) filter (where line_cost is not null), 0)::bigint as sales_costed,
         coalesce(sum(line_cost), 0)::bigint                              as cost
  from costed
  group by customer_id, customer_name
)
select jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'invoice_count',  (select count(distinct invoice_id) from costed),
  'sales_total',    coalesce((select sum(line_total) from costed), 0)::bigint,
  'sales_costed',   coalesce((select sum(line_total) from costed where line_cost is not null), 0)::bigint,
  'cost_total',     coalesce((select sum(line_cost) from costed), 0)::bigint,
  'uncosted_count', (select count(*) from costed where line_cost is null),
  'uncosted_sales', coalesce((select sum(line_total) from costed where line_cost is null), 0)::bigint,
  'loss_count',     (select count(*) from costed where line_cost is not null and line_total < line_cost),
  'paid_total',     coalesce((select sum(paid_amount) from public.invoice_list
                              where not is_void and invoice_date between p_from and p_to), 0)::bigint,
  'unpaid_total',   coalesce((select sum(remaining_amount) from public.invoice_list
                              where not is_void and invoice_date between p_from and p_to), 0)::bigint,
  'by_product',     coalesce((select jsonb_agg(to_jsonb(b) order by (b.sales_costed - b.cost) desc, b.sales desc)
                              from by_product b), '[]'::jsonb),
  'by_customer',    coalesce((select jsonb_agg(to_jsonb(c) order by (c.sales_costed - c.cost) desc, c.sales desc)
                              from by_customer c), '[]'::jsonb)
);
$$;

revoke all on function public.get_profit_report(date, date) from public, anon;
grant execute on function public.get_profit_report(date, date) to authenticated;

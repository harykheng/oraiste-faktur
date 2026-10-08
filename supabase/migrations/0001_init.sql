-- =====================================================================
-- ORAISTE Faktur — skema awal
-- Jalankan sekali di Supabase SQL Editor (project baru, kosong).
-- Uang = bigint rupiah. Tanggal bisnis = Asia/Jakarta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: tanggal hari ini di Asia/Jakarta
-- ---------------------------------------------------------------------
create or replace function public.jakarta_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Jakarta')::date
$$;

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------

-- Pengaturan usaha: dikunci satu baris (id selalu 1).
create table public.settings (
  id                  smallint primary key default 1 check (id = 1),
  business_name       text not null default 'ORAISTE',
  invoice_prefix      text not null default 'SPN'
                        check (invoice_prefix ~ '^[A-Z0-9]{1,10}$'),
  whatsapp_number     text,
  address             text,
  bank_name           text,
  bank_account_number text,
  bank_account_holder text
);

insert into public.settings (id) values (1);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (btrim(name) <> ''),
  dozens_per_box int not null check (dozens_per_box > 0),
  default_price  bigint not null check (default_price >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (btrim(name) <> ''),
  whatsapp_number   text,
  address           text,
  default_term_days int not null default 0 check (default_term_days >= 0),
  notes             text,
  created_at        timestamptz not null default now()
);

create table public.invoices (
  id                     uuid primary key default gen_random_uuid(),
  invoice_number         text not null unique,
  invoice_date           date not null,
  customer_id            uuid not null references public.customers (id) on delete restrict,
  customer_name_snapshot text not null,
  term_days              int not null check (term_days >= 0),
  due_date               date not null,
  delivery_status        text not null check (delivery_status in ('delivered', 'pending')),
  delivered_at           timestamptz,
  is_void                boolean not null default false,
  void_reason            text,
  total                  bigint not null check (total >= 0),
  notes                  text,
  created_by             uuid default auth.uid() references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),

  constraint invoices_due_date_check
    check (due_date = invoice_date + term_days),
  constraint invoices_delivered_at_check
    check ((delivery_status = 'delivered') = (delivered_at is not null)),
  constraint invoices_void_reason_check
    check (not is_void or coalesce(btrim(void_reason), '') <> '')
);

create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_created_at_idx  on public.invoices (created_at desc);

create table public.invoice_items (
  id                      uuid primary key default gen_random_uuid(),
  invoice_id              uuid not null references public.invoices (id) on delete restrict,
  product_id              uuid not null references public.products (id) on delete restrict,
  product_name_snapshot   text not null,
  dozens_per_box_snapshot int not null check (dozens_per_box_snapshot > 0),
  qty_box                 int not null check (qty_box > 0),
  unit_price              bigint not null check (unit_price >= 0),
  line_total              bigint not null,

  constraint invoice_items_line_total_check check (line_total = qty_box * unit_price),
  constraint invoice_items_one_row_per_product unique (invoice_id, product_id)
);

create index invoice_items_product_id_idx on public.invoice_items (product_id);

create table public.payments (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount     bigint not null check (amount > 0),
  paid_at    date not null default public.jakarta_today(),
  method     text not null check (method in ('cash', 'transfer')),
  note       text,
  created_at timestamptz not null default now()
);

create index payments_invoice_id_idx on public.payments (invoice_id);

-- Nomor urut per bulan. period = 'YYYY-MM' (Asia/Jakarta).
create table public.invoice_counters (
  period      text primary key,
  last_number int not null default 0
);

-- ---------------------------------------------------------------------
-- Penjaga aturan bisnis
-- ---------------------------------------------------------------------

-- Faktur tidak bisa diedit. Perubahan yang diizinkan hanya:
--   * Kirim nanti -> Terkirim (delivered_at diisi otomatis)
--   * Batalkan (is_void false -> true, alasan wajib)
create or replace function public.guard_invoice_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mutable text[] := array['delivery_status', 'delivered_at', 'is_void', 'void_reason'];
begin
  if old.is_void then
    raise exception 'Faktur yang sudah dibatalkan tidak bisa diubah.';
  end if;

  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'Faktur tidak bisa diedit. Batalkan lalu buat faktur baru.';
  end if;

  if new.delivery_status is distinct from old.delivery_status then
    if not (old.delivery_status = 'pending' and new.delivery_status = 'delivered') then
      raise exception 'Status kirim hanya bisa diubah dari "Kirim nanti" menjadi terkirim.';
    end if;
    new.delivered_at := coalesce(new.delivered_at, now());
  elsif new.delivered_at is distinct from old.delivered_at then
    raise exception 'Tanggal kirim tidak bisa diubah.';
  end if;

  if new.is_void and coalesce(btrim(new.void_reason), '') = '' then
    raise exception 'Alasan batal wajib diisi.';
  end if;

  if not new.is_void and new.void_reason is distinct from old.void_reason then
    raise exception 'Alasan batal hanya diisi saat membatalkan faktur.';
  end if;

  return new;
end;
$$;

create trigger invoices_guard_update
  before update on public.invoices
  for each row execute function public.guard_invoice_update();

create or replace function public.block_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Data faktur tidak bisa diubah atau dihapus. Batalkan lalu buat faktur baru.';
end;
$$;

create trigger invoices_block_delete
  before delete on public.invoices
  for each row execute function public.block_change();

create trigger invoice_items_block_update_delete
  before update or delete on public.invoice_items
  for each row execute function public.block_change();

-- Pembayaran: faktur tidak boleh batal, dan total bayar tidak boleh melebihi total faktur.
create or replace function public.guard_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_paid    bigint;
begin
  -- Kunci baris faktur supaya dua pembayaran bersamaan tidak lolos bareng.
  select * into v_invoice from public.invoices where id = new.invoice_id for update;

  if not found then
    raise exception 'Faktur tidak ditemukan.';
  end if;
  if v_invoice.is_void then
    raise exception 'Faktur sudah dibatalkan, tidak bisa dicatat pembayaran.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = new.invoice_id
    and id <> new.id;

  if v_paid + new.amount > v_invoice.total then
    raise exception 'Jumlah bayar melebihi sisa tagihan (sisa %).', v_invoice.total - v_paid;
  end if;

  return new;
end;
$$;

create trigger payments_guard
  before insert or update on public.payments
  for each row execute function public.guard_payment();

-- ---------------------------------------------------------------------
-- RPC: buat faktur (satu transaksi)
-- ---------------------------------------------------------------------
-- payload:
-- {
--   "customer_id":     "uuid",
--   "term_days":       30,              -- opsional, default tempo toko
--   "delivery_status": "delivered",     -- 'delivered' | 'pending'
--   "paid_in_full":    true,            -- true = langsung catat pembayaran sebesar total
--   "payment_method":  "cash",          -- 'cash' | 'transfer' (dipakai kalau paid_in_full)
--   "notes":           "…",             -- opsional
--   "items": [ { "product_id": "uuid", "qty_box": 3, "unit_price": 450000 } ]
-- }
-- Nama produk & isi per dus diambil dari tabel products (snapshot), total dihitung di server.
create or replace function public.create_invoice(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_today       date := public.jakarta_today();
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
  insert into public.invoice_counters as c (period, last_number)
  values (to_char(v_today, 'YYYY-MM'), 1)
  on conflict (period) do update set last_number = c.last_number + 1
  returning c.last_number into v_seq;

  select invoice_prefix into v_prefix from public.settings where id = 1;

  v_number := coalesce(v_prefix, 'SPN')
           || '/' || to_char(v_today, 'YYMM')
           || '/' || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

  insert into public.invoices (
    invoice_number, invoice_date, customer_id, customer_name_snapshot,
    term_days, due_date, delivery_status, delivered_at, total, notes
  ) values (
    v_number, v_today, v_customer.id, v_customer.name,
    v_term, v_today + v_term, v_delivery,
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
    values (v_invoice_id, v_total, v_today, v_method, 'Lunas saat faktur dibuat');
  end if;

  return jsonb_build_object('id', v_invoice_id, 'invoice_number', v_number);
end;
$$;

-- ---------------------------------------------------------------------
-- View: daftar faktur + status bayar yang DIHITUNG
-- ---------------------------------------------------------------------
-- payment_status: 'void' | 'paid' | 'partial' | 'unpaid'
-- is_overdue: belum lunas, tidak batal, dan due_date < hari ini (Jakarta)
create view public.invoice_list
with (security_invoker = true)
as
select
  i.*,
  coalesce(p.paid_amount, 0)                as paid_amount,
  i.total - coalesce(p.paid_amount, 0)      as remaining_amount,
  case
    when i.is_void                          then 'void'
    when coalesce(p.paid_amount, 0) >= i.total then 'paid'
    when coalesce(p.paid_amount, 0) > 0     then 'partial'
    else 'unpaid'
  end                                       as payment_status,
  (not i.is_void
     and coalesce(p.paid_amount, 0) < i.total
     and i.due_date < public.jakarta_today()) as is_overdue
from public.invoices i
left join (
  select invoice_id, sum(amount)::bigint as paid_amount
  from public.payments
  group by invoice_id
) p on p.invoice_id = i.id;

-- ---------------------------------------------------------------------
-- RPC: harga terakhir per produk untuk satu toko (faktur non-void saja)
-- Juga dipakai untuk menaruh produk yang pernah dibeli toko di urutan atas.
-- ---------------------------------------------------------------------
create or replace function public.get_last_prices(p_customer_id uuid)
returns table (product_id uuid, unit_price bigint, last_invoice_date date)
language sql
stable
set search_path = public
as $$
  select distinct on (ii.product_id)
    ii.product_id, ii.unit_price, i.invoice_date
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where i.customer_id = p_customer_id
    and not i.is_void
  order by ii.product_id, i.created_at desc
$$;

-- ---------------------------------------------------------------------
-- RLS & hak akses: authenticated = akses penuh, anon = tidak ada
-- ---------------------------------------------------------------------
alter table public.settings         enable row level security;
alter table public.products         enable row level security;
alter table public.customers        enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.payments         enable row level security;
alter table public.invoice_counters enable row level security;

create policy "authenticated full access" on public.settings         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.products         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.customers        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.invoices         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.invoice_items    for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.payments         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.invoice_counters for all to authenticated using (true) with check (true);

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.jakarta_today()          to authenticated;
grant execute on function public.create_invoice(jsonb)    to authenticated;
grant execute on function public.get_last_prices(uuid)    to authenticated;

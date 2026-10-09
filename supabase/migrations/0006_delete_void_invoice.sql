-- =====================================================================
-- ORAISTE Faktur — faktur yang SUDAH DIBATALKAN boleh dihapus permanen
-- (buat beres-beres data). Faktur aktif tetap tidak bisa dihapus sama
-- sekali — itu masih harus dibatalkan dulu (business_rules tidak berubah
-- untuk faktur aktif).
-- Jalankan sekali di Supabase SQL Editor, setelah 0005_flexible_sale_unit.sql.
-- =====================================================================

-- Baris & pembayaran ikut terhapus otomatis kalau fakturnya dihapus.
alter table public.invoice_items drop constraint invoice_items_invoice_id_fkey;
alter table public.invoice_items
  add constraint invoice_items_invoice_id_fkey
  foreign key (invoice_id) references public.invoices (id) on delete cascade;

alter table public.payments drop constraint payments_invoice_id_fkey;
alter table public.payments
  add constraint payments_invoice_id_fkey
  foreign key (invoice_id) references public.invoices (id) on delete cascade;

-- Hapus langsung (DELETE biasa) tetap diblokir untuk SEMUA faktur. Yang
-- boleh lewat hanya transaksi yang di-tandai lewat flag transaksi-lokal
-- "app.allow_void_delete" oleh RPC delete_void_invoice() di bawah, dan
-- itu pun cuma kalau fakturnya sudah is_void = true.
create or replace function public.guard_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.allow_void_delete', true) = 'true' and old.is_void then
    return old;
  end if;
  raise exception 'Faktur tidak bisa dihapus langsung. Batalkan faktur ini dulu (isi alasan), baru bisa dihapus.';
end;
$$;

drop trigger if exists invoices_block_delete on public.invoices;
create trigger invoices_block_delete
  before delete on public.invoices
  for each row execute function public.guard_invoice_delete();

-- Baris faktur tidak pernah bisa DIUBAH. Boleh DIHAPUS cuma sebagai
-- bagian dari penghapusan faktur void (flag yang sama seperti di atas).
create or replace function public.guard_invoice_items_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_void_delete', true) = 'true' then
    return old;
  end if;
  raise exception 'Data faktur tidak bisa diubah atau dihapus. Batalkan lalu buat faktur baru.';
end;
$$;

drop trigger if exists invoice_items_block_update_delete on public.invoice_items;
create trigger invoice_items_block_update_delete
  before update or delete on public.invoice_items
  for each row execute function public.guard_invoice_items_change();

-- Satu-satunya cara menghapus faktur. Mengunci baris fakturnya dulu,
-- pastikan sudah is_void, baru set flag transaksi-lokal lalu hapus
-- (otomatis ikut hapus invoice_items & payments lewat cascade di atas).
create or replace function public.delete_void_invoice(p_invoice_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_is_void boolean;
begin
  select is_void into v_is_void from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Faktur tidak ditemukan.';
  end if;
  if not v_is_void then
    raise exception 'Cuma faktur yang sudah dibatalkan yang bisa dihapus.';
  end if;

  perform set_config('app.allow_void_delete', 'true', true); -- true = transaksi-lokal (reset sendiri)
  delete from public.invoices where id = p_invoice_id;
end;
$$;

grant execute on function public.delete_void_invoice(uuid) to authenticated;

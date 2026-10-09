-- =====================================================================
-- ORAISTE Faktur — link lokasi toko (Google Maps / Waze)
-- Jalankan sekali di Supabase SQL Editor, setelah 0002_invoice_date.sql.
-- =====================================================================

alter table public.customers
  add column map_url text;

alter table public.customers
  add constraint customers_map_url_check
  check (map_url is null or map_url ~* '^https?://');

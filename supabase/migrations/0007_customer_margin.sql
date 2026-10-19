-- =====================================================================
-- ORAISTE Faktur — tiap toko bisa diberi persen untung default
-- (modal +15% / +20% / +25%) buat isi otomatis harga di faktur.
-- Jalankan sekali di Supabase SQL Editor, setelah 0006_delete_void_invoice.sql.
--
-- NULL = tidak ada persen khusus (pakai harga default produk seperti biasa).
-- Cuma dipakai untuk produk yang BELUM pernah dibeli toko itu; kalau sudah
-- pernah, harga terakhir toko itu tetap yang dipakai (aturan awal).
-- =====================================================================

alter table public.customers
  add column default_margin_percent smallint
  check (default_margin_percent is null or default_margin_percent in (15, 20, 25));

-- =====================================================================
-- ORAISTE Faktur — pengecualian pembulatan harga jual per produk.
-- Jalankan sekali di Supabase SQL Editor, setelah 0008_profit_report.sql.
--
-- Harga jual dari modal (+15% / +20% / +25%) biasanya dibulatkan ke atas
-- ke kelipatan 500 per satuan. Kolom ini mengubah kelipatan itu untuk
-- produk tertentu: 1 = tanpa pembulatan, 100, 500, atau 1000.
-- NULL = pakai aturan normal (kelipatan 500).
-- =====================================================================

alter table public.products
  add column price_round_step integer
  check (price_round_step is null or price_round_step in (1, 100, 500, 1000));

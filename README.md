# ORAISTE Faktur

Web app (PWA) untuk membuat faktur penjualan spon ORAISTE langsung dari HP,
lalu mengirim PDF-nya ke toko lewat WhatsApp.

Stack: React + Vite + Tailwind CSS + Supabase, deploy di Vercel.

## Setup

### 1. Buat project Supabase

1. Buka <https://supabase.com/dashboard> → **New project**. Ini project sendiri, bukan project ERP.
2. Pilih region **Southeast Asia (Singapore)**, lalu simpan database password di tempat aman.

### 2. Jalankan migration

1. Di dashboard Supabase buka **SQL Editor** → **New query**.
2. Salin seluruh isi `supabase/migrations/0001_init.sql`, tempel, lalu klik **Run**.
3. Cek di **Table Editor**: harus ada tabel `settings`, `products`, `customers`, `invoices`,
   `invoice_items`, `payments`, `invoice_counters`, dan view `invoice_list`.

### 3. Buat 2 user (tanpa halaman daftar)

1. **Authentication** → **Sign In / Providers** → **Email**: pastikan aktif.
   Matikan **Allow new users to sign up** supaya orang lain tidak bisa mendaftar.
2. **Authentication** → **Users** → **Add user** → **Create new user**.
   Isi email + password untuk papa, centang **Auto Confirm User**. Ulangi untuk akun admin.

### 4. Isi environment variable

1. **Project Settings** → **API**: salin **Project URL** dan **anon public key**.
2. Di folder project:

   ```bash
   cp .env.example .env.local
   ```

   lalu isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
   `.env.local` sudah di-ignore git, jadi jangan di-commit.

3. Jalankan lokal:

   ```bash
   npm install
   npm run dev
   ```

### 5. Deploy ke Vercel

1. Buka <https://vercel.com/new> → import repo GitHub `oraiste-faktur`.
2. Framework: **Vite** (terdeteksi otomatis). Build command `npm run build`, output `dist`.
3. **Environment Variables**: tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`
   (nilai sama dengan `.env.local`).
4. **Deploy**. Setiap push ke branch utama akan deploy ulang otomatis.
   `vercel.json` sudah mengarahkan semua URL ke `index.html` supaya refresh halaman tidak 404.

### 6. Pasang di iPhone papa

1. Buka URL Vercel di **Safari**.
2. Tap tombol **Share** → **Add to Home Screen** → **Add**.
3. Buka dari ikon "O" di layar utama, lalu login **sekali**. Sesi tersimpan, jadi tidak perlu login ulang.

   Catatan: app di Home Screen punya penyimpanan sendiri, terpisah dari tab Safari.
   Login di app Home Screen-nya, bukan hanya di Safari.

### 7. Isi data awal

1. **Pengaturan**: nama usaha, prefix faktur (default `SPN`), no. WA, alamat, rekening.
2. **Produk**: tambah semua tipe spon (isi per dus dalam lusin + harga default per dus).
3. Toko bisa ditambah langsung saat membuat faktur ("+ Toko Baru").

## Aturan penting

- Faktur **tidak bisa diedit atau dihapus**. Ini juga dijaga oleh database.
  Kalau salah: buka faktur → **Batalkan Faktur** (alasan wajib) → buat faktur baru.
- Nomor faktur `{prefix}/{YYMM}/{0001}`, urut per bulan (Asia/Jakarta), dibuat atomik di server.
- Harga otomatis memakai harga terakhir untuk toko & produk itu (faktur batal diabaikan).
  Kalau toko belum pernah membeli produk itu, harga default produk yang dipakai.
- Status bayar (Lunas / Sebagian / Belum Bayar / Lewat Tempo) dihitung dari tabel pembayaran.

## Struktur kode

```
src/
  lib/            supabase client, format rupiah & tanggal, share PDF
  components/     komponen UI (tombol, input, sheet, bottom nav)
  pages/          layar-layar app
  invoice/        buildInvoiceDoc (data → teks siap tampil) + preview layar
  pdf/            template PDF A5 + renderer
supabase/migrations/0001_init.sql   skema, RPC, view, RLS
```

Template PDF (`src/pdf/InvoiceA5.jsx`) hanya merender objek dari
`buildInvoiceDoc()`. Untuk template lain (mis. struk thermal), cukup buat
komponen baru yang menerima objek yang sama.

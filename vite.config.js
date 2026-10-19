import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Registrasi manual di src/main.jsx, supaya update bisa dicek saat app kembali aktif
      // dan halaman di-reload di waktu yang aman (lihat src/pwa.js).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'ORAISTE Faktur',
        short_name: 'ORAISTE',
        description: 'Faktur penjualan ORAISTE',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#1e40af',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Versi baru langsung aktif (tidak menunggu semua tab/app ditutup). Tanpa ini, refresh
        // biasa di HP tetap menampilkan versi lama karena service worker baru cuma "menunggu".
        // Halaman yang sedang terbuka di-reload oleh src/pwa.js begitu versi baru aktif.
        skipWaiting: true,
        clientsClaim: true,
        // Chunk @react-pdf/renderer ~1,2 MB; tetap di-cache supaya PDF cepat dibuat.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // react-pdf sengaja dipisah & dimuat belakangan, jadi peringatan ukuran chunk tidak relevan.
    chunkSizeWarningLimit: 1500,
  },
})

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi di .env.local')
}

const REQUEST_TIMEOUT_MS = 15000

// Request yang menggantung (sinyal jelek, server tidak menjawab) dihentikan
// supaya layar menampilkan pesan error, bukan loading tanpa akhir.
function fetchWithTimeout(input, init = {}) {
  if (init.signal) return fetch(input, init)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal })
    .catch((err) => {
      if (controller.signal.aborted) {
        // Nama "AbortError" supaya supabase-js tidak mengulang request ini 3x lagi.
        const timeoutError = new Error('Server tidak menjawab. Cek koneksi internet lalu coba lagi.')
        timeoutError.name = 'AbortError'
        throw timeoutError
      }
      throw err
    })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    // Sesi disimpan di localStorage dan token diperbarui otomatis,
    // jadi papa tidak perlu login ulang.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

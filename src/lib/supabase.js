import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi di .env.local')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Sesi disimpan di localStorage dan token diperbarui otomatis,
    // jadi papa tidak perlu login ulang.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

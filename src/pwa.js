import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY_MS = 15 * 60 * 1000

// Layar yang sedang diisi tidak boleh di-reload tiba-tiba (isian bisa hilang).
function isBusy() {
  return window.location.pathname.startsWith('/faktur/baru')
}

export function setupPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    immediate: true,
    // Versi baru sudah diunduh dan siap dipakai: terapkan begitu aman.
    onNeedRefresh() {
      const apply = () => {
        if (isBusy()) return setTimeout(apply, 2000)
        updateSW(true) // aktifkan versi baru lalu reload
      }
      apply()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => registration.update().catch(() => {})
      // iPhone jarang memuat ulang app dari nol, jadi cek tiap kali app kembali ke layar.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, CHECK_EVERY_MS)
    },
  })
}

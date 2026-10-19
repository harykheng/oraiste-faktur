import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY_MS = 15 * 60 * 1000

// Layar yang sedang diisi tidak boleh di-reload tiba-tiba (isian bisa hilang).
function isBusy() {
  return window.location.pathname.startsWith('/faktur/baru')
}

export function setupPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  // Cuma halaman yang sebelumnya sudah dikontrol service worker yang perlu di-reload.
  // Pada instalasi pertama, service worker baru "mengambil alih" halaman tanpa ada versi lama.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  // Service worker versi baru sudah aktif: muat ulang supaya kode terbaru dipakai.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    const apply = () => {
      if (isBusy()) return setTimeout(apply, 2000)
      reloading = true
      window.location.reload()
    }
    apply()
  })

  registerSW({
    immediate: true,
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

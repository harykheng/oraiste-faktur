// PENTING (iOS Safari): fungsi ini harus dipanggil LANGSUNG dari handler tap,
// dengan file yang sudah jadi. Jangan ada `await` sebelum navigator.share.
export function sharePdf(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file] }).then(
      () => 'shared',
      (err) => {
        if (err && err.name === 'AbortError') return 'cancelled'
        throw err
      },
    )
  }
  downloadFile(file)
  return Promise.resolve('downloaded')
}

function downloadFile(file) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

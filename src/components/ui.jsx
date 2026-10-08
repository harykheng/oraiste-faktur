import { formatNumber, parseDigits } from '../lib/format.js'

const BUTTON_VARIANTS = {
  primary: 'bg-blue-700 text-white active:bg-blue-800 disabled:bg-blue-300',
  whatsapp: 'bg-green-600 text-white active:bg-green-700 disabled:bg-green-300',
  secondary: 'bg-white text-gray-900 border border-gray-300 active:bg-gray-100 disabled:text-gray-400',
  danger: 'bg-red-600 text-white active:bg-red-700 disabled:bg-red-300',
  dangerOutline: 'bg-white text-red-700 border border-red-300 active:bg-red-50 disabled:text-red-300',
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const sizeClass = size === 'lg' ? 'min-h-16 text-xl' : 'min-h-12 text-base'
  return (
    <button
      type="button"
      className={`rounded-xl px-4 font-semibold ${sizeClass} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-gray-500">{hint}</span>}
    </label>
  )
}

const INPUT_CLASS =
  'min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200'

export function TextInput({ className = '', ...props }) {
  return <input className={`${INPUT_CLASS} ${className}`} {...props} />
}

export function TextArea({ className = '', ...props }) {
  return <textarea className={`${INPUT_CLASS} py-2 ${className}`} rows={3} {...props} />
}

// Angka bulat >= 0 (tempo, isi per dus). value: number | ''.
export function NumberInput({ value, onChange, className = '', ...props }) {
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      className={`${INPUT_CLASS} ${className}`}
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(digits === '' ? '' : Number(digits))
      }}
      {...props}
    />
  )
}

// Rupiah. value: number, ditampilkan dengan titik ribuan.
export function MoneyInput({ value, onChange, className = '', ...props }) {
  return (
    <div className={`flex min-h-12 items-center rounded-xl border border-gray-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-200 ${className}`}>
      <span className="pl-3 text-gray-500">Rp</span>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        className="min-h-12 w-full min-w-0 rounded-xl bg-transparent px-2 text-base outline-none"
        value={value ? formatNumber(value) : ''}
        onChange={(e) => onChange(parseDigits(e.target.value))}
        {...props}
      />
    </div>
  )
}

export function Stepper({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Kurangi"
        className="h-12 w-12 rounded-xl border border-gray-300 bg-white text-2xl font-bold active:bg-gray-100 disabled:text-gray-300"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Jumlah dus"
        className="h-12 w-16 rounded-xl border border-gray-300 bg-white text-center text-lg font-semibold outline-none focus:border-blue-600"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '').slice(0, 5) || 0))}
      />
      <button
        type="button"
        aria-label="Tambah"
        className="h-12 w-12 rounded-xl bg-blue-700 text-2xl font-bold text-white active:bg-blue-800"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

// Pilihan 2–4 tombol besar (mis. Tunai / Transfer).
export function Segmented({ options, value, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`min-h-12 rounded-xl border px-2 font-semibold ${
            value === o.value
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-gray-300 bg-white text-gray-800 active:bg-gray-100'
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="flex min-h-14 w-full items-center justify-between rounded-xl border border-gray-300 bg-white px-4 text-left font-semibold"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-green-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'left-7' : 'left-1'}`} />
      </span>
    </button>
  )
}

const BADGE_TONES = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  gray: 'bg-gray-200 text-gray-800',
  void: 'bg-gray-800 text-white',
}

export function Badge({ tone = 'gray', children }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}

export function Chip({ active, children, ...props }) {
  return (
    <button
      type="button"
      className={`min-h-12 shrink-0 rounded-full border px-4 font-semibold ${
        active ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white text-gray-800'
      }`}
      {...props}
    >
      {children}
    </button>
  )
}

export function PageHeader({ title, left, right }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-gray-200 bg-white px-4 pt-[env(safe-area-inset-top)]">
      {left}
      <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
      {right}
    </header>
  )
}

export function BackButton({ onClick, label = '← Kembali' }) {
  return (
    <button type="button" className="-ml-2 min-h-12 px-2 font-semibold text-blue-700" onClick={onClick}>
      {label}
    </button>
  )
}

// Lembar dari bawah layar, dipakai untuk form & konfirmasi.
export function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" className="min-h-12 px-2 font-semibold text-gray-600" onClick={onClose}>
            Tutup
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmSheet({ title, message, confirmLabel, variant = 'danger', busy, onConfirm, onClose, children }) {
  return (
    <Sheet title={title} onClose={onClose}>
      {message && <p className="mb-4 text-gray-700">{message}</p>}
      {children}
      <div className="mt-4 grid gap-2">
        <Button variant={variant} disabled={busy} onClick={onConfirm}>
          {busy ? 'Memproses…' : confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Tidak jadi
        </Button>
      </div>
    </Sheet>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return <p className="rounded-xl bg-red-50 p-3 text-red-800">{children}</p>
}

export function Loading({ text = 'Memuat…' }) {
  return <p className="p-6 text-center text-gray-500">{text}</p>
}

export function SearchInput(props) {
  return <TextInput type="search" enterKeyHint="search" autoComplete="off" {...props} />
}

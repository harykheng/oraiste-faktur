import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Button, ErrorText, Field, TextInput } from '../components/ui.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Email atau password salah.' : `Gagal masuk: ${error.message}`)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-800 text-5xl font-bold text-white">O</div>
        <h1 className="text-2xl font-bold">ORAISTE Faktur</h1>
      </div>
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="Email">
          <TextInput type="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Masuk…' : 'Masuk'}
        </Button>
      </form>
    </main>
  )
}

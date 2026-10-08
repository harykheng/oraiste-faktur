import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { Loading } from './components/ui.jsx'
import TabLayout from './components/BottomNav.jsx'
import Login from './pages/Login.jsx'
import InvoiceList from './pages/InvoiceList.jsx'
import InvoiceNew from './pages/InvoiceNew.jsx'
import InvoiceDetail from './pages/InvoiceDetail.jsx'
import Customers from './pages/Customers.jsx'
import Products from './pages/Products.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  // undefined = masih cek sesi, null = belum login
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Loading />
  if (!session) return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<TabLayout />}>
          <Route index element={<InvoiceList />} />
          <Route path="toko" element={<Customers />} />
          <Route path="produk" element={<Products />} />
          <Route path="pengaturan" element={<Settings />} />
        </Route>
        <Route path="faktur/baru" element={<InvoiceNew />} />
        <Route path="faktur/:id" element={<InvoiceDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

import { NavLink, Outlet } from 'react-router-dom'

const ICON_PATHS = {
  faktur: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  toko: 'M4 10h16l-1.5-5h-13zM5 10v10h14V10M9 20v-5h6v5',
  produk: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
  pengaturan: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
}

const TABS = [
  { to: '/', label: 'Faktur', icon: 'faktur', end: true },
  { to: '/toko', label: 'Toko', icon: 'toko' },
  { to: '/produk', label: 'Produk', icon: 'produk' },
  { to: '/pengaturan', label: 'Pengaturan', icon: 'pengaturan' },
]

export default function TabLayout() {
  return (
    <>
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold ${
                isActive ? 'text-blue-700' : 'text-gray-500'
              }`
            }
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON_PATHS[t.icon]} />
            </svg>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

import { NavLink, Outlet } from 'react-router-dom';
import {
  Stethoscope,
  Calendar,
  Phone,
  Users,
  Settings,
  LogOut,
} from 'lucide-react';

/**
 * SecretaryLayout — Dashboard shell with fixed sidebar.
 *
 * Design System specs:
 * - Sidebar: w-60, bg-primary, full height, z-30
 * - Main content: ml-60, bg-surface
 * - Nav items: icon + text, gap-3, px-3 py-2.5, rounded-lg
 * - Active: bg-white/15 text-white
 * - Passive: text-white/60
 * - Hover: text-white hover:bg-white/10
 * - Separators: bg-white/10
 *
 * Active in Faz 2 — skeleton created now for structural completeness.
 */

const navItems = [
  { to: '/dashboard', label: 'Randevular', icon: Calendar },
  { to: '/dashboard/calls', label: 'Aramalar', icon: Phone },
  { to: '/dashboard/patients', label: 'Hastalar', icon: Users },
  { to: '/dashboard/settings', label: 'Ayarlar', icon: Settings },
];

export default function SecretaryLayout() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 w-60 h-screen bg-primary z-30 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-6 flex items-center gap-2.5">
          <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-accent-foreground" />
          </div>
          <span className="text-lg font-bold text-primary-foreground">RECALL</span>
        </div>

        {/* Separator */}
        <div className="mx-4 h-px bg-white/10" />

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Separator */}
        <div className="mx-4 h-px bg-white/10" />

        {/* Logout */}
        <div className="px-3 py-4">
          <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-200 w-full">
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 p-8">
        <div className="max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

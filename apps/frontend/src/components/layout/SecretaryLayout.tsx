import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import {
  Stethoscope,
  Calendar,
  Phone,
  Users,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Settings,
  BarChart3,
} from 'lucide-react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const navItems = [
  { to: '/dashboard', label: 'Randevular', icon: Calendar },
  { to: '/dashboard/calls', label: 'Çağrı Kayıtları', icon: Phone },
  { to: '/dashboard/reports', label: 'Raporlar', icon: BarChart3 },
  { to: '/dashboard/doctors', label: 'Doktorlar', icon: Users },
  { to: '/dashboard/settings', label: 'Klinik Ayarları', icon: Settings },
];

export default function SecretaryLayout() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();

  const displayName = user?.fullName || user?.firstName || 'Klinik Sekreteri';
  const displayEmail = user?.primaryEmailAddress?.emailAddress || 'sekreter@recall.health';
  const initial = (displayName[0] || 'S').toUpperCase();

  const handleLogout = async () => {
    try {
      if (CLERK_PUBLISHABLE_KEY && signOut) {
        await signOut();
      }
    } catch {
      // ignore
    }
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 w-60 h-screen bg-primary z-30 flex flex-col justify-between">
        <div>
          {/* Logo & Clinic */}
          <div className="px-5 py-6">
            <Link to="/" className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-accent-foreground" />
              </div>
              <span className="text-lg font-bold text-primary-foreground tracking-wide">RECALL</span>
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-white/70">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              <span>Recall Sağlık Kliniği</span>
            </div>
          </div>

          {/* Separator */}
          <div className="mx-4 h-px bg-white/10" />

          {/* Nav */}
          <nav className="px-3 py-4 space-y-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-white/15 text-white shadow-sm font-semibold'
                      : 'text-white/65 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="px-3 py-4 space-y-2">
          <Link
            to="/"
            target="_blank"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Tanıtım Sayfası</span>
          </Link>

          <div className="h-px bg-white/10 my-2" />

          {/* User profile info */}
          <div className="px-3 py-1 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{displayName}</div>
              <div className="text-[10px] text-white/50 truncate">{displayEmail}</div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-red-300 hover:bg-white/10 transition-colors duration-200 w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 p-8 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

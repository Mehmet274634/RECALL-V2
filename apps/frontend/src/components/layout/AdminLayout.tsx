import { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  PlusCircle,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  LogOut,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { getUserRole, setDevRole } from '../../lib/auth';

const adminNavItems = [
  { to: '/admin', label: 'Tüm Klinikler', icon: Building2, end: true },
  { to: '/admin/new', label: 'Yeni Klinik Ekle', icon: PlusCircle, end: false },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [role, setRole] = useState<'admin' | 'secretary'>(() => getUserRole());

  useEffect(() => {
    setRole(getUserRole());
  }, []);

  const handleToggleDevRole = () => {
    if (!import.meta.env.DEV) return;
    const nextRole = role === 'admin' ? 'secretary' : 'admin';
    setDevRole(nextRole);
    setRole(nextRole);
    window.location.reload();
  };

  const handleLogout = () => {
    try {
      const clerk = (window as unknown as { Clerk?: { signOut: () => Promise<void> } }).Clerk;
      if (clerk?.signOut) {
        clerk.signOut().then(() => navigate('/login'));
        return;
      }
    } catch {
      // ignore
    }
    navigate('/login');
  };

  // If not admin, render Unauthorized (403) guard screen
  if (role !== 'admin') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-xl p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto text-red-600">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-foreground">Yetkisiz Erişim (403)</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Bu sayfa yalnızca sistem yöneticilerine (<span className="font-semibold text-foreground">Admin</span>) açıktır.
              Giriş yaptığınız hesap sekreter yetkisine sahip olduğu için yönetim paneline erişemezsiniz.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            <Link
              to="/dashboard"
              className="w-full bg-primary text-primary-foreground py-2.5 px-4 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Sekreter Paneline Dön
            </Link>

            {/* Dev role switch shortcut for testing (strictly rendered in DEV mode only) */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={handleToggleDevRole}
                className="text-xs text-muted-foreground hover:text-foreground py-2 transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                (Geliştirici Modu: Admin Rolüne Geç)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Admin Sidebar */}
      <aside className="fixed left-0 top-0 w-64 h-screen bg-[#111827] text-white z-30 flex flex-col justify-between border-r border-white/10">
        <div>
          {/* Logo & Platform Info */}
          <div className="px-5 py-6">
            <Link to="/admin" className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-wide text-white">RECALL</span>
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30">
                  Admin
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
              <span>Multi-Tenant Platform Yönetimi</span>
            </div>
          </div>

          {/* Separator */}
          <div className="mx-4 h-px bg-white/10" />

          {/* Nav Links */}
          <nav className="px-3 py-4 space-y-1.5">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            <div className="pt-4 pb-1 px-3 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Görünümler
            </div>

            <Link
              to="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 shrink-0 text-violet-400" />
              <span>Sekreter Paneline Git</span>
            </Link>
          </nav>
        </div>

        {/* Footer info & Actions */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-white/50 font-medium">Aktif Rol</div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Sistem Yöneticisi (Admin)
            </div>
            {/* Dev role switcher (strictly rendered in DEV mode only) */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={handleToggleDevRole}
                title="Test için sekreter rolüne geç"
                className="mt-2 text-[11px] text-violet-300 hover:text-white hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Sekreter Rolüne Geç (Test)
              </button>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 text-xs text-white/60 hover:text-white w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Güvenli Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

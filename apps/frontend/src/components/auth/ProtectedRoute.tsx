import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { getUserRole } from '../../lib/auth';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'secretary';
}

/**
 * Route guard enforcing Clerk authentication and role-based access.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  // If Clerk publishable key is not configured (e.g. offline dev), fallback to dev role check
  if (!CLERK_PUBLISHABLE_KEY) {
    if (import.meta.env.DEV && requiredRole === 'admin') {
      const devRole = getUserRole();
      if (devRole !== 'admin') {
        return (
          <div className="min-h-screen bg-surface flex items-center justify-center p-6">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center shadow-sm">
              <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Erişim Reddedildi</h2>
              <p className="text-sm text-muted-foreground">
                Bu sayfaya erişmek için Sistem Yöneticisi (Admin) yetkisi gerekmektedir.
              </p>
            </div>
          </div>
        );
      }
    }
    return <>{children}</>;
  }

  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />;
  }

  const userRole = (user?.publicMetadata?.role as string) || 'secretary';
  const clinicId = user?.publicMetadata?.clinicId as string | undefined;

  // 1. Admin route protection
  if (requiredRole === 'admin' && userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center shadow-sm">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Yönetici Yetkisi Gerekli</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Bu alana sadece platform yöneticileri erişebilir.
          </p>
          <a
            href="/dashboard"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            Sekreter Paneline Dön
          </a>
        </div>
      </div>
    );
  }

  // 2. Secretary clinic assignment protection (must have clinicId)
  if (requiredRole === 'secretary' && userRole === 'secretary' && !clinicId) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Klinik Yetkilendirmesi Eksik (403)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Hesabınıza tanımlı bir klinik bulunamadı. Lütfen yöneticinizden kliniğe sekreter olarak atanmanızı talep edin.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

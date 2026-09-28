import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { ShieldAlert, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'secretary';
}

/**
 * Route guard enforcing Clerk authentication and role-based access.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  // If Clerk publishable key is not configured, show clear configuration error with retry button
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-card border border-destructive/20 rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-destructive">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">
            Kimlik Doğrulama Servisi Yüklenemedi
          </h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            VITE_CLERK_PUBLISHABLE_KEY anahtarı eksik veya kimlik doğrulama servisi başlatılamadı.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Yeniden dene
          </button>
        </div>
      </div>
    );
  }

  return <ProtectedClerkAuthGuard requiredRole={requiredRole}>{children}</ProtectedClerkAuthGuard>;
}

function ProtectedClerkAuthGuard({ children, requiredRole }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Crucial: Never redirect while authentication state is still loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Once loaded, redirect unauthenticated users to /login
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

  // 2. Clinic assignment protection (for all non-admin roles)
  if (userRole !== 'admin' && !clinicId) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Klinik Yetkilendirmesi Eksik</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Hesabınıza klinik atanmamış, yöneticinize başvurun
          </p>
          <button
            type="button"
            onClick={() => signOut(() => { window.location.href = '/login'; })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Farklı Bir Hesapla Giriş Yap
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

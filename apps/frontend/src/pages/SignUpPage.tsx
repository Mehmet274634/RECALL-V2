import { useState, useEffect } from 'react';
import { SignUp, useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { Stethoscope, AlertTriangle, RefreshCw } from 'lucide-react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkSignUpWrapper() {
  const { isLoaded } = useAuth();
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => {
      if (!isLoaded) {
        setLoadTimedOut(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  if (loadTimedOut && !isLoaded) {
    return (
      <div className="w-full max-w-md bg-card border border-destructive/20 rounded-2xl p-8 text-center shadow-lg">
        <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-destructive">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">
          Clerk Yüklenemedi
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Kimlik doğrulama servisine bağlanılamadı. Reklam engelleyici (ad-blocker) veya internet bağlantınızı kontrol edip lütfen tekrar deneyin.
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
    );
  }

  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/login"
      forceRedirectUrl="/dashboard"
    />
  );
}

export default function SignUpPage() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center mb-6">
          <Link to="/" className="flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center shadow-md">
              <Stethoscope className="w-6 h-6 text-primary-foreground" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">RECALL Kayıt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Klinik davetinizi kabul edin ve hesabınızı oluşturun
          </p>
        </div>

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

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="flex flex-col items-center mb-6">
        <Link to="/" className="flex items-center gap-2.5 mb-4">
          <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center shadow-md">
            <Stethoscope className="w-6 h-6 text-primary-foreground" />
          </div>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">RECALL Kayıt</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Klinik davetinizi kabul edin ve hesabınızı oluşturun
        </p>
      </div>

      <ClerkSignUpWrapper />
    </div>
  );
}

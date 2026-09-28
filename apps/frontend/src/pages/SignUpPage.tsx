import { SignUp } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function SignUpPage() {
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

      {CLERK_PUBLISHABLE_KEY ? (
        <SignUp routing="path" path="/sign-up" signInUrl="/login" />
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Clerk yapılandırması eksik (VITE_CLERK_PUBLISHABLE_KEY tanımlanmamış).
          </p>
        </div>
      )}
    </div>
  );
}

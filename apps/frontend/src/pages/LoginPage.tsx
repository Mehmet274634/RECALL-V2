import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope, Mail, Lock, Eye, EyeOff } from 'lucide-react';

/**
 * LoginPage — Clerk will replace the form logic in Faz 0.8.
 * This is a visual skeleton following Design System specs:
 * - Primary brand colors
 * - Plus Jakarta Sans
 * - Form fields with focus:ring-2 primary
 * - rounded-lg inputs, rounded-xl buttons
 */
export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link to="/" className="flex items-center gap-2.5 mb-6">
            <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-primary-foreground" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Hoş Geldiniz</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Klinik panelinize giriş yapın
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          {/* Info: This form will be replaced by Clerk's SignIn component */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Clerk integration in Faz 0.8
            }}
          >
            {/* Email */}
            <div className="mb-5">
              <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">
                E-posta
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="ornek@klinik.com"
                  className="w-full bg-background border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors duration-200"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-6">
              <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1.5">
                Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full bg-background border border-border rounded-lg py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-all duration-200 disabled:opacity-60"
            >
              Giriş Yap
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Henüz hesabınız yok mu?{' '}
          <a href="mailto:info@recall.health" className="text-primary font-medium hover:underline">
            Bizimle iletişime geçin
          </a>
        </p>
      </motion.div>
    </div>
  );
}

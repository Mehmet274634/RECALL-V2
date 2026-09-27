import * as Sentry from '@sentry/react';
import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Sensitive field names to redact for KVKK/GDPR compliance.
 */
const SENSITIVE_KEY_PATTERNS = [
  'patientphone',
  'patient_phone',
  'phone',
  'phonenumber',
  'phone_number',
  'patientname',
  'patient_name',
  'fullname',
  'full_name',
  'complaint',
  'complaints',
  'medicalnotes',
  'healthinfo',
  'specialinstructions',
  'authorization',
  'token',
];

const PHONE_REGEX = /(?:\+?90\s*|\b0)?\s*[1-9]\d{2}\s*\d{3}\s*\d{2}\s*\d{2}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Recursively masks sensitive fields to prevent PII leakage to Sentry.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data
      .replace(PHONE_REGEX, '[REDACTED_PHONE]')
      .replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) =>
        lowerKey.includes(pattern.replace(/[-_]/g, '')),
      );

      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = redactSensitiveData(value);
      }
    }

    return sanitized;
  }

  return data;
}

/**
 * Sentry beforeSend hook to scrub sensitive health/patient data before dispatching from browser.
 */
function sentryBeforeSend(
  event: Sentry.ErrorEvent,
  _hint?: Sentry.EventHint,
): Sentry.ErrorEvent | null {
  try {
    if (event.user) {
      if (event.user.email) event.user.email = '[REDACTED_EMAIL]';
      if (event.user.username) event.user.username = '[REDACTED]';
      if (event.user.ip_address) event.user.ip_address = '[REDACTED_IP]';
    }

    if (event.extra) {
      event.extra = redactSensitiveData(event.extra) as Record<string, unknown>;
    }

    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        message: crumb.message
          ? (redactSensitiveData(crumb.message) as string)
          : crumb.message,
        data: crumb.data
          ? (redactSensitiveData(crumb.data) as Record<string, unknown>)
          : crumb.data,
      }));
    }

    if (event.exception?.values) {
      for (const val of event.exception.values) {
        if (val.value) {
          val.value = redactSensitiveData(val.value) as string;
        }
      }
    }

    return event;
  } catch (err) {
    console.error('[sentry:frontend] Error in beforeSend scrubber:', err);
    return event;
  }
}

/**
 * Initializes Sentry for apps/frontend.
 */
export function initFrontendSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn || dsn === 'placeholder' || !dsn.startsWith('http')) {
    if (import.meta.env.DEV) {
      console.log(
        '[sentry:frontend] VITE_SENTRY_DSN not configured; error tracking disabled in dev.',
      );
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'production',
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    beforeSend: sentryBeforeSend,
  });

  console.log('[sentry:frontend] Sentry initialized successfully.');
}

/**
 * Captures an exception to Sentry with sensitive data scrubbed.
 */
export function captureFrontendException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    const sanitizedContext = context
      ? (redactSensitiveData(context) as Record<string, unknown>)
      : undefined;

    Sentry.captureException(error, {
      extra: sanitizedContext,
    });
  } catch (err) {
    console.error('[sentry:frontend] Failed to capture exception:', err);
  }
}

interface FallbackProps {
  error: Error;
  resetError: () => void;
}

/**
 * User-friendly fallback component for React Error Boundary.
 */
export function ErrorFallbackUI({ error, resetError }: FallbackProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-400/10 rounded-2xl flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Beklenmeyen Bir Hata Oluştu
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            Sistemde geçici bir aksaklık yaşandı. Teknik ekibimiz durumdan otomatik olarak haberdar edildi.
          </p>
        </div>

        {import.meta.env.DEV && (
          <div className="bg-slate-100 dark:bg-slate-800/60 p-3 rounded-xl text-left text-xs font-mono text-slate-800 dark:text-slate-300 overflow-x-auto max-h-32">
            {error.message || String(error)}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => {
              resetError();
              window.location.reload();
            }}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Sayfayı Yenile
          </button>

          <a
            href="/dashboard"
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Ana Panele Dön
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Sentry React Error Boundary wrapper.
 */
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallbackUI error={error as Error} resetError={resetError} />
      )}
      onError={(error) => {
        captureFrontendException(error, { source: 'ReactErrorBoundary' });
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

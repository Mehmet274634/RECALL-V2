import * as Sentry from '@sentry/node';

/**
 * KVKK / GDPR Sensitive Field Deny-List.
 * Any key matching these names (case-insensitive) will be replaced with '[REDACTED]'.
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
  'special_instructions',
  'authorization',
  'secret',
  'password',
  'clerk_secret_key',
  'apikey',
  'api_key',
  'token',
];

// Regex for Turkish and international phone patterns
const PHONE_REGEX = /(?:\+?90\s*|\b0)?\s*[1-9]\d{2}\s*\d{3}\s*\d{2}\s*\d{2}\b/g;

// Regex for email addresses
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Recursively sanitizes any object, array, or primitive to scrub personal identifiable information (PII/KVKK).
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Mask raw phone numbers and emails inside strings
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
 * Sentry beforeSend hook to scrub sensitive health/patient data before dispatch.
 */
export function sentryBeforeSend(
  event: Sentry.ErrorEvent,
  _hint?: Sentry.EventHint,
): Sentry.ErrorEvent | null {
  try {
    // 0. Drop expected auth failures (401 Unauthorized / 403 Forbidden)
    const extra = event.extra as Record<string, unknown> | undefined;
    const statusCode = extra?.statusCode || extra?.status || (event as unknown as Record<string, unknown>).status;
    if (statusCode === 401 || statusCode === 403 || statusCode === '401' || statusCode === '403') {
      return null;
    }

    const hintError = _hint?.originalException as Record<string, unknown> | undefined;
    if (hintError && typeof hintError === 'object') {
      const errStatus = hintError.status || hintError.statusCode;
      if (errStatus === 401 || errStatus === 403) {
        return null;
      }
    }

    if (
      event.exception?.values?.some(
        (v) =>
          v.type === 'TokenVerificationError' ||
          v.value?.includes('Geçersiz veya süresi dolmuş') ||
          v.value?.includes('Yetkilendirme gerekli') ||
          v.value?.includes('atanmış geçerli bir klinik bulunamadı'),
      )
    ) {
      return null;
    }

    // 1. Scrub user details
    if (event.user) {
      if (event.user.email) event.user.email = '[REDACTED_EMAIL]';
      if (event.user.username) event.user.username = '[REDACTED]';
      if (event.user.ip_address) event.user.ip_address = '[REDACTED_IP]';
    }

    // 2. Scrub request data (headers, query, body)
    if (event.request) {
      if (event.request.headers) {
        event.request.headers = redactSensitiveData(
          event.request.headers,
        ) as Record<string, string>;
      }
      if (event.request.data) {
        event.request.data = redactSensitiveData(event.request.data);
      }
      if (event.request.query_string) {
        event.request.query_string = redactSensitiveData(
          event.request.query_string,
        ) as string;
      }
    }

    // 3. Scrub extra context
    if (event.extra) {
      event.extra = redactSensitiveData(event.extra) as Record<string, unknown>;
    }

    // 4. Scrub breadcrumbs
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

    // 5. Scrub exception values
    if (event.exception?.values) {
      for (const val of event.exception.values) {
        if (val.value) {
          val.value = redactSensitiveData(val.value) as string;
        }
      }
    }

    return event;
  } catch (err) {
    console.error('[sentry] Error in beforeSend scrubber:', err);
    return event;
  }
}

/**
 * Initializes Sentry for apps/backend.
 */
export function initBackendSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn || dsn === 'placeholder' || !dsn.startsWith('http')) {
    console.log(
      '[sentry] SENTRY_DSN not configured or placeholder; error tracking is disabled.',
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    beforeSend: sentryBeforeSend,
  });

  console.log(`[sentry] Backend initialized (env: ${process.env.NODE_ENV || 'development'})`);
}

/**
 * Safely captures an exception with scrubbed contextual data.
 */
export function captureBackendException(
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
    console.error('[sentry] Failed to capture exception:', err);
  }
}

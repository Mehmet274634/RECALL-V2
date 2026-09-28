let appInstance: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appInstance) {
      const mod = await import('../src/index.js');
      appInstance = mod.default || mod;
    }
    return appInstance(req, res);
  } catch (err: any) {
    console.error('[serverless:error]', err);
    try {
      const sentry = await import('../src/lib/logging/sentry.js');
      sentry.captureBackendException(err, { source: 'vercel-serverless-entry' });
    } catch {
      // Ignore secondary Sentry logging failure
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}


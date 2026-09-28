let appInstance: any = null;
let startupError: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appInstance && !startupError) {
      try {
        const mod = await import('../src/index.js');
        appInstance = mod.default || mod;
      } catch (err: any) {
        startupError = err;
        console.error('[serverless:startup:error]', err);
      }
    }

    if (startupError) {
      res.status(500).json({
        status: 'error',
        type: 'SERVERLESS_STARTUP_ERROR',
        message: startupError?.message || String(startupError),
        stack: startupError?.stack,
        code: startupError?.code,
      });
      return;
    }

    return appInstance(req, res);
  } catch (handlerErr: any) {
    console.error('[serverless:handler:error]', handlerErr);
    res.status(500).json({
      status: 'error',
      type: 'SERVERLESS_HANDLER_ERROR',
      message: handlerErr?.message || String(handlerErr),
      stack: handlerErr?.stack,
    });
  }
}


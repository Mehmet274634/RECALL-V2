import app from '../src/index.js';

/**
 * Vercel Serverless Function handler.
 *
 * Wraps the Express app as a single catch-all handler for Vercel's
 * serverless function model. All routes are handled by Express internally.
 *
 * See ADR-008 in DECISIONS.md for the rationale behind this approach.
 */
export default app;

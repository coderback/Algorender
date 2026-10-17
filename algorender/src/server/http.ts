// Small helpers for the app's own API routes.

/** JSON with a status. */
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Whether a state-changing request comes from the site itself. Browsers send
 * Origin with every POST; a page elsewhere, or the code sandbox (whose frames
 * have the opaque origin `null`), must not act with the learner's cookies.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  return origin === new URL(request.url).origin;
}

/** The answer when the database or accounts aren't set up (no DATABASE_URL on Vercel, say). */
export function unavailable(e: unknown): Response {
  console.error('Accounts are unavailable:', e);
  return json({ error: 'Accounts aren’t available right now.' }, 503);
}

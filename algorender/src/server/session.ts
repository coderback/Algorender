import { getAuth } from './auth';
import { json, sameOrigin, unavailable } from './http';

/**
 * The signed-in learner's id, or the response to send instead (401 with
 * `signInMessage` when nobody is signed in). State-changing requests must
 * come from the site itself.
 */
export async function signedIn(request: Request, changesState: boolean, signInMessage = 'Sign in first.'): Promise<string | Response> {
  if (changesState && !sameOrigin(request)) return json({ error: 'Cross-origin requests aren’t allowed.' }, 403);
  try {
    const session = await (await getAuth()).api.getSession({ headers: request.headers });
    return session ? session.user.id : json({ error: signInMessage }, 401);
  } catch (e) {
    return unavailable(e);
  }
}

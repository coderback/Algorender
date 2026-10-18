import { getAuth } from '@/server/auth';
import { getDatabase } from '@/server/db';
import { json, sameOrigin, unavailable } from '@/server/http';
import { parseTutorRequest, tutor, TutorError, tutorStatus } from '@/server/tutor';
import { tutorConfig } from '@/server/tutor/config';
import { azureModel, fakeModel } from '@/server/tutor/model';

// The AI tutor: hints for a signed-in learner stuck on a problem or an
// exercise, through Azure AI Foundry. See src/server/tutor/.

export const dynamic = 'force-dynamic';
/** A turn is one model call, sometimes a leak check and a retry. */
export const maxDuration = 60;

/** The signed-in learner's id, or the response to send instead. State-changing requests must come from the site itself. */
async function signedIn(request: Request, changesState: boolean): Promise<string | Response> {
  if (changesState && !sameOrigin(request)) return json({ error: 'Cross-origin requests aren’t allowed.' }, 403);
  try {
    const session = await (await getAuth()).api.getSession({ headers: request.headers });
    return session ? session.user.id : json({ error: 'Sign in to ask the tutor.' }, 401);
  } catch (e) {
    return unavailable(e);
  }
}

/** Whether the tutor is on, the learner's turns left today, and how far up the ladder they are on `?item=problem:two-sum`. */
export async function GET(request: Request): Promise<Response> {
  const config = tutorConfig();
  if (!config) return json({ enabled: false });
  const user = await signedIn(request, false);
  if (user instanceof Response) return user.status === 401 ? json({ enabled: true, signedIn: false }) : user;
  const item = new URL(request.url).searchParams.get('item') ?? '';
  if (!/^(problem|exercise):[a-z0-9-]{1,80}$/.test(item)) return json({ error: 'Name the item, e.g. ?item=problem:two-sum.' }, 400);
  try {
    return json({ enabled: true, signedIn: true, ...(await tutorStatus(await getDatabase(), config, user, item)) });
  } catch (e) {
    return unavailable(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = tutorConfig();
  if (!config) return json({ error: 'The tutor isn’t switched on here.' }, 503);
  const user = await signedIn(request, true);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  try {
    const model = config.provider === 'fake' ? fakeModel() : azureModel(config);
    return json(await tutor(await getDatabase(), model, config, user, parseTutorRequest(body)));
  } catch (e) {
    if (e instanceof TutorError) return json({ error: e.message }, e.status);
    return unavailable(e);
  }
}

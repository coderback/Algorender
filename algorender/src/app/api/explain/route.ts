import { getDatabase } from '@/server/db';
import { json, unavailable } from '@/server/http';
import { signedIn } from '@/server/session';
import { dailyUsage, TutorError } from '@/server/tutor';
import { tutorConfig } from '@/server/tutor/config';
import { explain, parseExplainRequest } from '@/server/tutor/explain';
import { azureModel, fakeModel } from '@/server/tutor/model';

// Explain-it-back scoring: the fast model scores a signed-in learner's
// explanation against a lesson prompt's rubric. It runs on the tutor's
// settings and budgets; when the tutor is off, lessons let the learner score
// themselves. See src/server/tutor/explain.ts.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIGN_IN = 'Sign in to have your explanation scored.';

/** Whether scoring is on, and the learner's tutor turns left today. */
export async function GET(request: Request): Promise<Response> {
  const config = tutorConfig();
  if (!config) return json({ enabled: false });
  const user = await signedIn(request, false, SIGN_IN);
  if (user instanceof Response) return user.status === 401 ? json({ enabled: true, signedIn: false }) : user;
  try {
    const { turns } = await dailyUsage(await getDatabase(), user, new Date());
    return json({ enabled: true, signedIn: true, turnsLeft: Math.max(0, config.turnsPerDay - turns) });
  } catch (e) {
    return unavailable(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = tutorConfig();
  if (!config) return json({ error: 'Scoring isn’t switched on here.' }, 503);
  const user = await signedIn(request, true, SIGN_IN);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  try {
    const model = config.provider === 'fake' ? fakeModel() : azureModel(config);
    return json(await explain(await getDatabase(), model, config, user, parseExplainRequest(body)));
  } catch (e) {
    if (e instanceof TutorError) return json({ error: e.message }, e.status);
    return unavailable(e);
  }
}

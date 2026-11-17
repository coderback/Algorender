import { getDatabase } from '@/server/db';
import { json, unavailable } from '@/server/http';
import { getRound, interview, InterviewError, interviewStatus, parseInterviewRequest, view } from '@/server/interview';
import { interviewConfig } from '@/server/interview/config';
import { serverSandbox } from '@/server/judge/sandbox';
import { signedIn } from '@/server/session';
import { azureModel, fakeModel } from '@/server/tutor/model';

// Mock interviews: a timed coding round run by the interviewer (the tutor's
// models in another mode) for a signed-in learner. See src/server/interview/.

export const dynamic = 'force-dynamic';
/** A debrief is a strong-model call, a leak check and maybe a retry; a Java, C++ or Go submission compiles in a sandbox. */
export const maxDuration = 120;

const SIGN_IN = 'Sign in to take a mock interview.';

/** Whether interviews are on and the learner's rounds left today, or with `?round=<id>` one of their rounds. */
export async function GET(request: Request): Promise<Response> {
  const config = interviewConfig();
  if (!config) return json({ enabled: false });
  const user = await signedIn(request, false, SIGN_IN);
  if (user instanceof Response) return user.status === 401 ? json({ enabled: true, signedIn: false }) : user;
  const round = new URL(request.url).searchParams.get('round');
  try {
    const db = await getDatabase();
    if (round) {
      if (!/^[0-9a-f-]{36}$/.test(round)) return json({ error: 'There is no such round.' }, 404);
      return json({ round: view(await getRound(db, user, round), config, new Date()) });
    }
    return json({ enabled: true, signedIn: true, ...(await interviewStatus(db, config, user)) });
  } catch (e) {
    if (e instanceof InterviewError) return json({ error: e.message }, e.status);
    return unavailable(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = interviewConfig();
  if (!config) return json({ error: 'Mock interviews aren’t switched on here.' }, 503);
  const user = await signedIn(request, true, SIGN_IN);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  try {
    const parsed = parseInterviewRequest(body);
    const model = config.tutor.provider === 'fake' ? fakeModel() : azureModel(config.tutor);
    const sandbox = parsed.action === 'submit' ? await serverSandbox() : null;
    return json(await interview({ db: await getDatabase(), model, config, sandbox }, user, parsed));
  } catch (e) {
    if (e instanceof InterviewError) return json({ error: e.message, ...(e.round && { round: e.round }) }, e.status);
    return unavailable(e);
  }
}

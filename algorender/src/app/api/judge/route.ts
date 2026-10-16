import { getAuth } from '@/server/auth';
import { getDatabase } from '@/server/db';
import { json, sameOrigin, unavailable } from '@/server/http';
import { judge, JudgeError, parseJudgeRequest } from '@/server/judge';
import { serverSandbox } from '@/server/judge/sandbox';

// The server judge: runs a signed-in learner's Java, C++ or Go code on a
// problem's examples ('run') or every test ('submit'). See src/server/judge/.

export const dynamic = 'force-dynamic';
/** A run compiles and judges in a sandbox: allow for a slow compile and the run's own time limit. */
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests aren’t allowed.' }, 403);
  let userId: string;
  try {
    const session = await (await getAuth()).api.getSession({ headers: request.headers });
    if (!session) return json({ error: 'Sign in to run Java, C++ and Go: they run on our servers.' }, 401);
    userId = session.user.id;
  } catch (e) {
    return unavailable(e);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  try {
    const parsed = parseJudgeRequest(body);
    const sandbox = await serverSandbox();
    if (!sandbox) return json({ error: 'The server judge isn’t set up here yet, so Java, C++ and Go can’t run. Python, JavaScript and TypeScript still do.' }, 503);
    return json(await judge(await getDatabase(), sandbox, userId, parsed));
  } catch (e) {
    if (e instanceof JudgeError) return json({ error: e.message }, e.status);
    return unavailable(e);
  }
}

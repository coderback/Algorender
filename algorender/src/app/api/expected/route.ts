import { getAuth } from '@/server/auth';
import { getDatabase } from '@/server/db';
import { json, sameOrigin, unavailable } from '@/server/http';
import { JudgeError } from '@/server/judge';
import { expectedAnswer, parseExpectedRequest } from '@/server/judge/expected';

// The expected answer to a signed-in learner's own test on a practice
// problem: the reference solution's, run on the server. See
// src/server/judge/expected.ts.

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests aren’t allowed.' }, 403);
  let userId: string;
  try {
    const session = await (await getAuth()).api.getSession({ headers: request.headers });
    if (!session) return json({ error: 'Sign in to see the expected answer: it comes from our solution, on our server.' }, 401);
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
    return json(await expectedAnswer(await getDatabase(), userId, parseExpectedRequest(body)));
  } catch (e) {
    if (e instanceof JudgeError) return json({ error: e.message }, e.status);
    return unavailable(e);
  }
}

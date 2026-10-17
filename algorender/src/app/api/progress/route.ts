import { getAuth } from '@/server/auth';
import { getDatabase } from '@/server/db';
import { json, sameOrigin, unavailable } from '@/server/http';
import { parseSyncRequest, sync, SyncError } from '@/server/progress';

// Syncs the signed-in learner's progress events (src/server/progress.ts).

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests aren’t allowed.' }, 403);
  let userId: string;
  try {
    const session = await (await getAuth()).api.getSession({ headers: request.headers });
    if (!session) return json({ error: 'Sign in to sync your progress.' }, 401);
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
    return json(await sync(await getDatabase(), userId, parseSyncRequest(body)));
  } catch (e) {
    if (e instanceof SyncError) return json({ error: e.message }, 400);
    return unavailable(e);
  }
}

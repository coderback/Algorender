import { getAuth } from '@/server/auth';
import { unavailable } from '@/server/http';

// Better Auth's endpoints: sign-up, sign-in, sign-out, session, OAuth callbacks…

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  try {
    return (await getAuth()).handler(request);
  } catch (e) {
    return unavailable(e);
  }
}

export { handle as GET, handle as POST };

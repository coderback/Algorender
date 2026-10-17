'use client';

import { createAuthClient } from 'better-auth/react';

/** Better Auth in the browser: sign-in, sign-up, the session. Talks to /api/auth on this site. */
export const authClient = createAuthClient();

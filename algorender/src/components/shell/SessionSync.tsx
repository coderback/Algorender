'use client';

import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { progressStore } from '@/progress/store';

/**
 * Tells the progress store who is signed in, so progress follows the account
 * on every page. Every app layout mounts it (embeds don't).
 */
export function SessionSync() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const settled = !session.isPending && !session.error;

  useEffect(() => {
    // A failed session check (offline, say) changes nothing: the device keeps its last owner.
    if (settled) void progressStore().setOwner(userId);
  }, [settled, userId]);

  return null;
}

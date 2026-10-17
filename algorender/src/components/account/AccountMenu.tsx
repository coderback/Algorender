'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { FiUser } from 'react-icons/fi';
import { authClient } from '@/lib/auth-client';
import { useMinute } from '@/lib/now';
import { useReviewCards } from '@/progress/hooks';
import { dueToday } from '@/progress/review';
import { progressStore } from '@/progress/store';

/**
 * The header's account corner: the review queue with how many cards are due,
 * and sign-in or the learner's name. It also tells the progress store who is
 * signed in, so progress follows the account on every page.
 */
export function AccountMenu({ linkClass }: { linkClass: string }) {
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const settled = !session.isPending && !session.error;

  useEffect(() => {
    // A failed session check (offline, say) changes nothing: the device keeps its last owner.
    if (settled) void progressStore().setOwner(user?.id ?? null);
  }, [settled, user?.id]);

  return (
    <>
      <ReviewLink linkClass={linkClass} />
      <Link href="/account" className={`${linkClass} inline-flex items-center gap-1.5`}>
        <FiUser aria-hidden />
        {user ? <span className="max-w-32 truncate">{user.name || 'Account'}</span> : 'Sign in'}
      </Link>
    </>
  );
}

function ReviewLink({ linkClass }: { linkClass: string }) {
  const cards = useReviewCards();
  const now = useMinute();
  const due = now ? dueToday(cards, now).length : 0;
  return (
    <Link href="/review" className={`${linkClass} inline-flex items-center gap-1.5`} aria-label={due > 0 ? `Review: ${due} due today` : 'Review'}>
      Review
      {due > 0 && (
        <span aria-hidden className="rounded-full bg-accent px-1.5 py-px text-xs font-semibold text-white">
          {due > 99 ? '99+' : due}
        </span>
      )}
    </Link>
  );
}

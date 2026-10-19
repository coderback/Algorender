'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { FiUser } from 'react-icons/fi';
import { useLearner } from './hooks';

/**
 * The learner's corner: their initial, linking to their account; signed out,
 * a person icon linking to sign in. The accessible name carries their name.
 */
export function Avatar({ size = 'm', className }: { size?: 's' | 'm'; className?: string }) {
  const user = useLearner();
  const name = user?.name?.trim() || '';
  return (
    <Link
      href="/account"
      aria-label={user ? `${name || 'Your'} account` : 'Sign in'}
      title={user ? name || 'Your account' : 'Sign in'}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink transition-transform duration-150 ease-standard hover:scale-105',
        size === 'm' ? 'size-12 text-base' : 'size-11 text-base',
        className,
      )}
    >
      {user && name ? <span aria-hidden>{name[0].toUpperCase()}</span> : <FiUser aria-hidden className="size-5" />}
    </Link>
  );
}

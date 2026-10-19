'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiChevronLeft, FiSearch, FiX } from 'react-icons/fi';
import { Avatar } from './Avatar';
import { usePalette } from './CommandPalette';
import { isHub, parentOf } from './places';

const circle = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors duration-150 ease-standard hover:bg-subtle';

/** The search circle that opens the command palette. */
export function SearchButton() {
  const palette = usePalette();
  return (
    <button type="button" onClick={palette.open} aria-label="Search" className={circle}>
      <FiSearch aria-hidden className="size-5" />
    </button>
  );
}

/** A 44px round link back to the page above. */
export function BackButton({ href, close = false }: { href: string; close?: boolean }) {
  return (
    <Link href={href} aria-label={close ? 'Close' : 'Back'} className={circle}>
      {close ? <FiX aria-hidden className="size-5" /> : <FiChevronLeft aria-hidden className="size-5" />}
    </Link>
  );
}

/**
 * Phones: hubs get search and the learner's avatar; pages below a hub get a
 * back button instead of the tab bar.
 */
export function PhoneHeader() {
  const pathname = usePathname();
  const hub = isHub(pathname);
  return (
    <header className="flex items-center gap-2 px-4 pt-6 md:hidden">
      {!hub && <BackButton href={parentOf(pathname)} />}
      <div className="ml-auto flex items-center gap-2">
        <SearchButton />
        {hub && <Avatar size="s" />}
      </div>
    </header>
  );
}

/** Focused pages (lesson, problem, review): one way out, and nothing else. */
export function FocusBar() {
  const pathname = usePathname();
  return (
    <header className="flex items-center gap-2 px-4 pt-4 sm:px-6">
      <BackButton href={parentOf(pathname)} close />
    </header>
  );
}

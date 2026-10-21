'use client';

import Link from 'next/link';
import { FiSearch } from 'react-icons/fi';
import { Kbd } from '@/components/ui/CodeBlock';
import { usePalette, useShortcutLabel } from './CommandPalette';
import { useXp } from './hooks';

/** The zap beside XP: filled with the XP colour. */
export function XpZap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" className="fill-xp stroke-xp-line" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}

/** Desktop: the search pill (opens the command palette) and the XP chip. */
export function TopBar() {
  const palette = usePalette();
  const shortcut = useShortcutLabel();
  const xp = useXp();
  return (
    <header className="hidden flex-wrap items-center gap-3 md:flex">
      <button
        type="button"
        onClick={palette.open}
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-13 max-w-[560px] min-w-0 flex-[1_1_320px] items-center gap-3 rounded-full bg-surface pr-2.5 pl-5 text-left text-[15px] text-ink-muted transition-shadow duration-150 ease-standard hover:ring-1 hover:ring-line-strong hover:ring-inset"
      >
        <FiSearch aria-hidden className="size-[18px] shrink-0" />
        <span className="flex-1 truncate">Search visualisers, lessons, problems</span>
        <Kbd>{shortcut}</Kbd>
      </button>
      <Link
        href="/play"
        aria-label={xp ? `${xp.total.toLocaleString('en-GB')} Mastery XP, ${xp.today} today` : 'Mastery XP'}
        className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold whitespace-nowrap hover:ring-1 hover:ring-line-strong hover:ring-inset"
      >
        <XpZap className="size-[18px]" />
        {xp ? `${xp.total.toLocaleString('en-GB')} XP` : 'XP'}
        {xp && <span className="font-medium text-ink-muted">+{xp.today} today</span>}
      </Link>
    </header>
  );
}

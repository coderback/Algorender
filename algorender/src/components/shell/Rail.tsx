'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar } from './Avatar';
import { dueLabel, useDueCount } from './hooks';
import { PLACE_ICON } from './icons';
import { PLACES, placeOf } from './places';

/** The desktop and tablet navigation: the six places, the theme and the learner. */
export function Rail() {
  const pathname = usePathname();
  const active = placeOf(pathname);
  const due = useDueCount();
  return (
    <nav
      aria-label="Main"
      className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-24 shrink-0 flex-col items-center justify-between gap-4 overflow-y-auto rounded-card bg-rail px-3 py-4 md:flex"
    >
      <div className="flex flex-col items-center gap-1.5">
        <Link href="/" aria-label="Algorender home" className="mb-1 flex h-[68px] w-[72px] items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-[14px] bg-logo-tile">
            <Image src="/logo.svg" alt="" width={40} height={40} className="size-10 object-contain" priority />
          </span>
        </Link>
        <ul className="flex flex-col items-center gap-1.5">
          {PLACES.map((p) => {
            const Icon = PLACE_ICON[p.id];
            const current = active === p.id;
            const badge = p.id === 'review' && due > 0;
            return (
              <li key={p.id}>
                <Link
                  href={p.href}
                  aria-current={current ? 'page' : undefined}
                  aria-label={badge ? `${p.label}: ${due} due today` : undefined}
                  className={clsx(
                    'relative flex h-15 w-[72px] flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] transition-colors duration-150 ease-standard',
                    current ? 'bg-rail-active font-semibold text-on-rail-active' : 'font-medium text-rail-ink hover:bg-rail-button hover:text-rail-active',
                  )}
                >
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                  {p.label}
                  {badge && (
                    <span aria-hidden className="absolute top-1.5 right-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1 text-[10px] font-bold text-on-badge">
                      {dueLabel(due)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <ThemeToggle variant="rail" />
        <Avatar />
      </div>
    </nav>
  );
}

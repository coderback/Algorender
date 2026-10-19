'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { dueLabel, useDueCount } from './hooks';
import { PLACE_ICON } from './icons';
import { isHub, PLACES, placeOf } from './places';

/**
 * The phone navigation: the rail as a floating bottom bar. Only hubs show it;
 * pages below a hub are focused and use a back button instead.
 */
export function TabBar() {
  const pathname = usePathname();
  const due = useDueCount();
  if (!isHub(pathname)) return null;
  const active = placeOf(pathname);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-6 gap-[3px] rounded-[26px] bg-rail p-[7px] md:hidden"
    >
      {PLACES.map((p) => {
        const Icon = PLACE_ICON[p.id];
        const current = active === p.id;
        const badge = p.id === 'review' && due > 0;
        return (
          <Link
            key={p.id}
            href={p.href}
            aria-current={current ? 'page' : undefined}
            aria-label={badge ? `${p.label}: ${due} due today` : undefined}
            className={clsx(
              'relative flex h-[54px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-[18px] text-[10px]',
              current ? 'bg-rail-active font-semibold text-on-rail-active' : 'font-medium text-rail-ink',
            )}
          >
            <Icon aria-hidden className="size-[19px]" strokeWidth={1.75} />
            {p.label}
            {badge && (
              <span aria-hidden className="absolute top-1 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-badge px-1 text-[9px] font-bold text-on-badge">
                {dueLabel(due)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

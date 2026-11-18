import Link from 'next/link';
import { cx } from '@/components/ui/cx';
import type { AreaId } from '@/progress/mastery';

/** Short names for the filter's links. */
const SHORT: Record<AreaId, string> = { dsa: 'DS&A', math: 'Math', ml: 'ML', systems: 'Systems', languages: 'Languages' };

/**
 * Learn's area filter (decision 2 of the language tracks: a "Languages"
 * filter on Learn): links that keep the tab and set `?area=`. `areas` are
 * the ones with something to learn yet.
 */
export function AreaFilter({ areas, active, tab }: { areas: readonly AreaId[]; active: AreaId | null; tab: 'path' | 'lessons' }) {
  const href = (area: AreaId | null) => {
    const q = new URLSearchParams();
    if (tab === 'lessons') q.set('tab', 'lessons');
    if (area) q.set('area', area);
    const s = q.toString();
    return s ? `/learn?${s}` : '/learn';
  };
  const links: { area: AreaId | null; label: string }[] = [{ area: null, label: 'All areas' }, ...areas.map((a) => ({ area: a, label: SHORT[a] }))];
  return (
    <nav aria-label="Areas" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:w-fit sm:max-w-full sm:px-0">
      <ul className="flex w-max gap-1 sm:rounded-full sm:bg-sunken sm:p-1">
        {links.map(({ area, label }) => {
          const on = area === active;
          return (
            <li key={label}>
              <Link
                href={href(area)}
                aria-current={on ? 'true' : undefined}
                className={cx(
                  'inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ease-standard',
                  on ? 'bg-primary text-on-primary sm:bg-segment sm:text-ink sm:shadow-segment' : 'bg-surface text-ink-soft hover:text-ink sm:bg-transparent',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

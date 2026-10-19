import Link from 'next/link';
import { clsx } from 'clsx';

export interface SectionTab {
  href: string;
  label: string;
  /** Shown after the label: "Problems · 91". */
  count?: number;
}

/**
 * The section tab group under a hub's title (Learn, Practice, Play). Tabs are
 * routes, so each is a link; the active one carries aria-current.
 */
export function SectionTabs({ tabs, active, label = 'Section', className }: { tabs: readonly SectionTab[]; active: string; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={clsx('max-w-full overflow-x-auto rounded-full bg-surface p-1.5', className)}>
      <ul className="flex w-max gap-1">
        {tabs.map((t) => {
          const current = t.href === active;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={current ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-10 items-center rounded-full px-[18px] text-sm font-semibold whitespace-nowrap transition-colors duration-150 ease-standard',
                  current ? 'bg-primary text-on-primary' : 'text-ink-soft hover:bg-sunken hover:text-ink',
                )}
              >
                {t.label}
                {t.count !== undefined && <span className={clsx('ml-1.5 font-mono font-medium', current ? 'opacity-80' : 'text-ink-muted')}>· {t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

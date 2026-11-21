'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cx } from './cx';

export interface SectionTab {
  href: string;
  label: string;
  /** Shown after the label: "Problems · 91". */
  count?: number;
}

/** The fade at an edge of the row that has more tabs past it. */
const FADE = '28px';

/**
 * The section tab group under a hub's title (Learn, Practice, Play). Tabs are
 * routes, so each is a link; the active one carries aria-current.
 *
 * On a phone the row can be wider than the screen: it scrolls sideways, the
 * active tab is scrolled into view, and an edge with more tabs past it fades
 * out, so a cut-off tab reads as "more this way" rather than a clipped word.
 */
export function SectionTabs({ tabs, active, label = 'Section', className }: { tabs: readonly SectionTab[]; active: string; label?: string; className?: string }) {
  const row = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && el.scrollWidth > el.clientWidth) {
      const box = el.getBoundingClientRect();
      const tab = current.getBoundingClientRect();
      el.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
    }
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 };
      setMore((m) => (m.start === next.start && m.end === next.end ? m : next));
    };
    // The observer calls update once straight away, and again whenever the row changes size.
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [active]);

  const mask =
    more.start || more.end
      ? `linear-gradient(to right, ${more.start ? 'transparent' : '#000'}, #000 ${more.start ? FADE : '0px'}, #000 calc(100% - ${more.end ? FADE : '0px'}), ${more.end ? 'transparent' : '#000'})`
      : undefined;

  return (
    <nav
      ref={row}
      aria-label={label}
      data-more-start={more.start || undefined}
      data-more-end={more.end || undefined}
      className={cx('w-fit max-w-full overflow-x-auto rounded-full bg-surface p-1.5 [scrollbar-width:none]', className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <ul className="flex w-max gap-1">
        {tabs.map((t) => {
          const current = t.href === active;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ease-standard sm:px-[18px]',
                  current ? 'bg-primary text-on-primary' : 'text-ink-soft hover:bg-sunken hover:text-ink',
                )}
              >
                {t.label}
                {t.count !== undefined && <span className={cx('ml-1.5 font-mono font-medium', current ? 'opacity-80' : 'text-ink-muted')}>· {t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

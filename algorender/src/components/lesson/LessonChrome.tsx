'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { STEP_LABEL, type Step } from './steps';

export type ChromeSection = { id: string; step: string; title: string };

const SectionIndex = createContext<Map<string, number>>(new Map());

/** A section's place in its lesson (0-based), for its "01 ·" eyebrow; -1 outside a lesson. */
export const useSectionIndex = (id: string) => useContext(SectionIndex).get(id) ?? -1;

const label = (step: string) => STEP_LABEL[step as Step] ?? step;

/**
 * A lesson's frame: a focus header (close, where you are, how far through,
 * time left) and an "In this lesson" list beside the content. Both follow the
 * section in view; nothing here is saved, it only tracks scrolling.
 */
export function LessonChrome({
  trackTitle,
  title,
  minutes,
  sections,
  children,
}: {
  trackTitle: string;
  title: string;
  minutes: number;
  sections: ChromeSection[];
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const [index] = useState(() => new Map(sections.map((s, i) => [s.id, i])));

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    const pick = () => {
      // The current section is the last one whose top has passed a line a third of the way down.
      const line = window.innerHeight / 3;
      let at = 0;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= line) at = i;
      });
      // At the very bottom, the last section is current even if it is short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) at = els.length - 1;
      setCurrent(at);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, [sections]);

  const n = sections.length;
  const left = Math.max(1, Math.round((minutes * (n - current - 0.5)) / Math.max(n, 1)));

  return (
    <SectionIndex.Provider value={index}>
      <header className="sticky top-0 z-30 border-b border-line-soft bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/learn" aria-label="Close the lesson, back to Learn" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink hover:bg-subtle">
            <FiX aria-hidden className="size-5" />
          </Link>
          <div className="hidden min-w-0 shrink-0 flex-col sm:flex sm:max-w-[220px]">
            <span className="truncate text-xs text-ink-muted">{trackTitle} · Lesson</span>
            <span className="truncate text-sm font-semibold">{title}</span>
          </div>
          <div role="progressbar" aria-label="How far through the lesson" aria-valuemin={1} aria-valuemax={n} aria-valuenow={current + 1} aria-valuetext={`Section ${current + 1} of ${n}`} className="flex flex-1 gap-1.5">
            {sections.map((s, i) => (
              <span key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
                <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-standard" style={{ width: i < current ? '100%' : i === current ? '50%' : '0%' }} />
              </span>
            ))}
          </div>
          <span className="hidden shrink-0 text-[13px] text-ink-muted sm:block">About {left} min left</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[220px_minmax(0,820px)] lg:justify-center">
        <nav aria-label="In this lesson" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3 rounded-tile bg-surface p-4">
            <span className="px-2 text-eyebrow text-ink-muted uppercase">In this lesson</span>
            <ol className="flex flex-col gap-1">
              {sections.map((s, i) => {
                const state = i < current ? 'done' : i === current ? 'now' : 'next';
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      aria-current={state === 'now' ? 'location' : undefined}
                      className={cx(
                        'flex items-center gap-2.5 rounded-full px-2 py-2 text-[13px] font-semibold transition-colors duration-150 ease-standard',
                        state === 'now' ? 'bg-primary text-on-primary' : 'text-ink-soft hover:bg-sunken hover:text-ink',
                      )}
                    >
                      <span
                        className={cx(
                          'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]',
                          state === 'done' && 'bg-accent text-on-accent',
                          state === 'now' && 'bg-on-primary text-primary',
                          state === 'next' && 'ring-[1.5px] ring-line-strong ring-inset',
                        )}
                      >
                        {state === 'done' ? <FiCheck aria-label="done" strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="truncate">{label(s.step)}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
        <main className="flex min-w-0 flex-col gap-12">{children}</main>
      </div>
    </SectionIndex.Provider>
  );
}

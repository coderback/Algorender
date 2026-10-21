'use client';

import Link from 'next/link';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { Chip } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, trackColour, trackLabel } from '@/data/tracks';
import { useLessonProgress, useProgressSnapshot } from '@/progress/hooks';

export type LessonRow = { slug: string; title: string; summary: string; minutes: number; concept: string };
export type LessonGroup = { track: string; title: string; lessons: LessonRow[] };

/**
 * Learn › Lessons: every lesson, grouped by track, as rows like the practice
 * list. A ring shows done, started or not yet.
 */
export function LessonList({ groups }: { groups: LessonGroup[] }) {
  const { ready, events } = useProgressSnapshot();
  const progress = useLessonProgress();
  const done = new Set(progress.completed);
  const started = new Set<string>();
  for (const e of events) if (e.kind === 'quiz.answered' || e.kind === 'lesson.scored' || e.kind === 'explanation.scored') started.add(e.data.lesson);
  const state = (slug: string) => (!ready ? null : done.has(slug) ? 'done' : started.has(slug) ? 'started' : 'new');

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => {
        const c = TRACK_CLASSES[trackColour(g.track)];
        return (
          <section key={g.track} aria-labelledby={`lessons-${g.track}`} className="rounded-card bg-surface p-3 sm:p-5">
            <div className="flex items-center gap-3 px-3 pt-2 pb-3">
              <span aria-hidden className={cx('size-3 rounded-full', c.fill)} />
              <h2 id={`lessons-${g.track}`} className="font-display text-title-card">
                {g.title}
              </h2>
              <span className="text-sm text-ink-muted">
                {g.lessons.length} {g.lessons.length === 1 ? 'lesson' : 'lessons'}
              </span>
            </div>
            <ul className="flex flex-col">
              {g.lessons.map((l) => {
                const s = state(l.slug);
                return (
                  <li key={l.slug} className="border-t border-line-soft first:border-t-0">
                    <Link href={`/learn/${l.slug}`} className="flex items-center gap-4 rounded-[18px] px-3 py-3.5 transition-colors duration-150 ease-standard hover:bg-subtle">
                      {s === 'done' ? (
                        <span role="img" aria-label="Done" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-good text-on-good">
                          <FiCheck aria-hidden className="size-4" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span
                          role="img"
                          aria-label={s === 'started' ? 'Started' : s === 'new' ? 'Not started' : 'Loading'}
                          className={cx('size-8 shrink-0 rounded-full border-2', s === 'started' ? 'border-mark-focus' : 'border-line-strong')}
                        />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] font-semibold">{l.title}</span>
                        <span className="line-clamp-1 text-[13px] text-ink-muted">{s === 'started' ? `In progress · ${l.summary}` : l.summary}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-2 sm:flex">
                        <Chip className={cx(c.bg, c.ink)}>{trackLabel(g.track)}</Chip>
                        <Chip>{l.minutes} min</Chip>
                      </span>
                      <FiChevronRight aria-hidden className="size-5 shrink-0 text-ink-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

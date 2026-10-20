'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FiCheck, FiChevronRight, FiX } from 'react-icons/fi';
import { DifficultyChip } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import { PATTERNS, type PatternId } from '../patterns';
import type { Problem } from '../schema';
import { useProblemProgress, type ProblemProgress } from '../progress';

export type ProblemRow = Pick<Problem, 'slug' | 'title' | 'difficulty' | 'summary'> & { pattern: PatternId };

type Difficulty = Problem['difficulty'] | 'all';
type Order = 'easiest' | 'mixed' | 'unsolved';

const LEVEL_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

const LEVELS: { id: Difficulty; label: string; tone: string }[] = [
  { id: 'all', label: 'All levels', tone: 'bg-sunken text-ink' },
  { id: 'easy', label: 'Easy', tone: 'bg-good-soft text-good-ink' },
  { id: 'medium', label: 'Medium', tone: 'bg-warn-soft text-warn-ink' },
  { id: 'hard', label: 'Hard', tone: 'bg-bad-soft text-bad-ink' },
];

/** How far the learner has got with a problem, for its ring and its line under the title. */
function progressNote(p: ProblemProgress | undefined): { state: 'solved' | 'tried' | 'new'; note: string } {
  if (p?.solved) return { state: 'solved', note: p.languages?.length ? `Solved in ${p.languages.length === 1 ? '1 language' : `${p.languages.length} languages`}` : 'Solved' };
  if (p && p.submissions > 0) return { state: 'tried', note: `Tried ${p.submissions === 1 ? 'once' : `${p.submissions} times`}, not passing yet` };
  return { state: 'new', note: 'Not started' };
}

/** The solved tiles in the Practice header: solved of all, then solved per level. */
export function SolvedTiles({ rows }: { rows: readonly Pick<ProblemRow, 'slug' | 'difficulty'>[] }) {
  const progress = useProblemProgress();
  const solved = rows.filter((r) => progress[r.slug]?.solved);
  const level = (d: Problem['difficulty']) => solved.filter((r) => r.difficulty === d).length;
  const tile = 'flex flex-col-reverse gap-0.5 rounded-[22px] px-3 py-2.5 sm:px-[18px] sm:py-3.5';
  return (
    <dl className="grid w-full grid-cols-4 gap-2 sm:flex sm:w-auto sm:gap-2.5">
      <div className={cx(tile, 'bg-surface sm:min-w-[120px]')}>
        <dt className="text-xs text-ink-muted sm:text-[13px]">Solved</dt>
        <dd className="font-display text-[26px] font-bold sm:text-[32px]">
          {solved.length}
          <span className="text-sm text-ink-muted sm:text-base"> / {rows.length}</span>
        </dd>
      </div>
      {(['easy', 'medium', 'hard'] as const).map((d) => (
        <div key={d} className={cx(tile, d === 'easy' ? 'bg-good-soft text-good-ink' : d === 'medium' ? 'bg-warn-soft text-warn-ink' : 'bg-bad-soft text-bad-ink')}>
          <dt className="text-xs sm:text-[13px]">{d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard'}</dt>
          <dd className="font-display text-[26px] font-bold sm:text-[32px]">{level(d)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Practice › Problems: a tile per pattern with how many you've solved (pick
 * one to filter), then every problem in a table. "Mixed, like an interview"
 * shuffles them and hides the patterns: interleaving makes spotting the
 * pattern part of the work.
 */
export function ProblemList({ rows, mixed: mixedOrder, colours }: { rows: ProblemRow[]; mixed: string[]; colours: Record<string, TrackColour> }) {
  const progress = useProblemProgress();
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [pattern, setPattern] = useState<PatternId | null>(null);
  const [order, setOrder] = useState<Order>('easiest');
  const [allPatterns, setAllPatterns] = useState(false);

  const patterns = useMemo(() => {
    const ids = [...new Set(rows.map((r) => r.pattern))];
    return ids.map((id) => {
      const mine = rows.filter((r) => r.pattern === id);
      return { id, total: mine.length, solved: mine.filter((r) => progress[r.slug]?.solved).length };
    });
  }, [rows, progress]);
  const mixed = order === 'mixed';

  const visible = useMemo(() => {
    const kept = rows.filter((r) => (difficulty === 'all' || r.difficulty === difficulty) && (mixed || !pattern || r.pattern === pattern));
    if (mixed) return mixedOrder.map((slug) => kept.find((r) => r.slug === slug)).filter((r): r is ProblemRow => r != null);
    const index = new Map(rows.map((r, i) => [r.slug, i]));
    const rank = (r: ProblemRow) => (order === 'unsolved' ? (progress[r.slug]?.solved ? 1 : 0) * 10 : 0) + LEVEL_ORDER[r.difficulty];
    return [...kept].sort((a, b) => rank(a) - rank(b) || index.get(a.slug)! - index.get(b.slug)!);
  }, [rows, difficulty, pattern, mixed, mixedOrder, order, progress]);

  const SHOWN = 12;

  return (
    <div className="flex flex-col gap-[18px]">
      {!mixed && (
        <section aria-labelledby="by-pattern" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="by-pattern" className="font-display text-title-section">
              By pattern
            </h2>
            {patterns.length > SHOWN && (
              <button type="button" onClick={() => setAllPatterns((v) => !v)} aria-expanded={allPatterns} className="hidden text-sm font-semibold text-accent-ink hover:underline sm:inline">
                {allPatterns ? 'Fewer patterns' : `All ${patterns.length} patterns`}
              </button>
            )}
          </div>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:overflow-visible sm:px-0">
            {patterns.map((p, i) => {
              const c = TRACK_CLASSES[colours[p.id] ?? 'butter'];
              const on = pattern === p.id;
              return (
                <li key={p.id} className={cx('w-[170px] shrink-0 sm:w-auto', !allPatterns && i >= SHOWN && 'sm:hidden')}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPattern(on ? null : p.id)}
                    className={cx(
                      'flex h-full w-full flex-col gap-3.5 rounded-[22px] border-2 p-3.5 text-left transition-transform duration-150 ease-standard hover:-translate-y-0.5',
                      c.bg,
                      c.ink,
                      on ? 'border-ink' : 'border-transparent',
                    )}
                  >
                    <strong className={cx('text-[15px]', c.title)}>{PATTERNS[p.id].title}</strong>
                    <span className="mt-auto flex w-full flex-col gap-1.5">
                      <span className="text-xs font-semibold">
                        {p.solved} of {p.total} solved
                      </span>
                      <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-surface/70">
                        <span className={cx('block h-full rounded-full', c.solid)} style={{ width: `${(p.solved / p.total) * 100}%` }} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="Problems" className="flex flex-col gap-2.5 rounded-card bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5 px-1 pt-1 pb-2">
          <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={difficulty === l.id}
                onClick={() => setDifficulty(l.id)}
                className={cx('h-10 rounded-full border-2 px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-standard', l.tone, difficulty === l.id ? 'border-ink' : 'border-transparent')}
              >
                {l.label}
              </button>
            ))}
          </div>
          {pattern && !mixed && (
            <button
              type="button"
              onClick={() => setPattern(null)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary pr-3 pl-3.5 text-[13px] font-semibold text-on-primary"
            >
              {PATTERNS[pattern].title}
              <FiX aria-hidden />
              <span className="sr-only">Clear the pattern filter</span>
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            Order
            <select value={order} onChange={(e) => setOrder(e.target.value as Order)} className="h-10 rounded-full bg-sunken px-3 text-[13px] font-semibold text-ink">
              <option value="easiest">Easiest first</option>
              <option value="mixed">Mixed, like an interview (patterns hidden)</option>
              <option value="unsolved">Not solved first</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="px-3 py-6 text-ink-muted">No problems match these filters.</p>
        ) : (
          <div className="flex flex-col">
            <div aria-hidden className="hidden grid-cols-[40px_minmax(0,1fr)_200px_90px_44px] gap-3 px-3 py-2 text-xs font-semibold tracking-[0.04em] text-ink-muted uppercase md:grid">
              <span />
              <span>Problem</span>
              <span>{mixed ? '' : 'Pattern'}</span>
              <span>Level</span>
              <span />
            </div>
            <ul className="flex flex-col">
              {visible.map((r) => {
                const { state, note } = progressNote(progress[r.slug]);
                const c = TRACK_CLASSES[colours[r.pattern] ?? 'butter'];
                return (
                  <li key={r.slug} className="border-t border-line-soft">
                    <Link
                      href={`/practice/${r.slug}`}
                      className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] px-2 py-3 transition-colors duration-150 ease-standard hover:bg-subtle sm:px-3 md:grid-cols-[40px_minmax(0,1fr)_200px_90px_44px]"
                    >
                      <span
                        role="img"
                        aria-label={state === 'solved' ? 'Solved' : state === 'tried' ? 'Tried, not solved yet' : 'Not solved yet'}
                        className={cx(
                          'flex size-7 items-center justify-center rounded-full',
                          state === 'solved' ? 'bg-accent text-on-accent' : state === 'tried' ? 'border-[2.5px] border-warn-ink' : 'border-[1.5px] border-line-strong',
                        )}
                      >
                        {state === 'solved' && <FiCheck aria-hidden strokeWidth={3} className="size-3.5" />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <strong className="text-[15px] font-semibold text-ink md:truncate">{r.title}</strong>
                        <span className="text-[13px] text-ink-muted">
                          <span className="md:hidden">{mixed ? '' : `${PATTERNS[r.pattern].title} · `}</span>
                          {note}
                        </span>
                      </span>
                      <span className="hidden md:block">
                        {!mixed && <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', c.bg, c.ink)}>{PATTERNS[r.pattern].title}</span>}
                      </span>
                      <DifficultyChip level={r.difficulty} className="justify-self-start" />
                      <span aria-hidden className="hidden size-9 items-center justify-center rounded-full bg-sunken text-ink md:flex">
                        <FiChevronRight />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

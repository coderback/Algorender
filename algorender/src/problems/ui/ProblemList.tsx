'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FiCheckCircle, FiCircle } from 'react-icons/fi';
import { PATTERNS, type PatternId } from '../patterns';
import type { Problem } from '../schema';
import { useProblemProgress } from '../progress';
import { DIFFICULTY_STYLE } from './difficulty';

export type ProblemRow = Pick<Problem, 'slug' | 'title' | 'difficulty' | 'summary'> & { pattern: PatternId };

type Difficulty = Problem['difficulty'] | 'all';
type Status = 'all' | 'unsolved' | 'solved';

/**
 * Every problem, grouped under its main pattern, or in one mixed list with the
 * patterns hidden: interleaving makes spotting the pattern part of the work.
 * Filters by difficulty and by whether this browser has solved it.
 */
export function ProblemList({ rows, mixed: mixedOrder }: { rows: ProblemRow[]; mixed: string[] }) {
  const progress = useProblemProgress();
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [status, setStatus] = useState<Status>('all');
  const [mixed, setMixed] = useState(false);

  const solved = (slug: string) => progress[slug]?.solved != null;
  const visible = rows.filter(
    (r) => (difficulty === 'all' || r.difficulty === difficulty) && (status === 'all' || (status === 'solved') === solved(r.slug)),
  );
  const solvedCount = rows.filter((r) => solved(r.slug)).length;
  const patterns = [...new Set(rows.map((r) => r.pattern))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line-soft bg-surface px-4 py-3 shadow-xs">
        <p className="text-sm text-ink">
          <span className="font-semibold">{solvedCount}</span> of {rows.length} solved in this browser
        </p>
        <Segmented
          label="Difficulty"
          value={difficulty}
          onChange={setDifficulty}
          options={[
            ['all', 'All'],
            ['easy', 'Easy'],
            ['medium', 'Medium'],
            ['hard', 'Hard'],
          ]}
        />
        <Segmented
          label="Show"
          value={status}
          onChange={setStatus}
          options={[
            ['all', 'All'],
            ['unsolved', 'Unsolved'],
            ['solved', 'Solved'],
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} className="size-4 accent-accent" />
          Mix them up and hide the patterns
        </label>
      </div>

      {visible.length === 0 && <p className="text-ink-soft">No problems match these filters.</p>}

      {mixed ? (
        <Rows rows={mixedOrder.map((slug) => visible.find((r) => r.slug === slug)).filter((r): r is ProblemRow => r != null)} solved={solved} />
      ) : (
        patterns.map((id) => {
          const group = visible.filter((r) => r.pattern === id);
          if (group.length === 0) return null;
          return (
            <section key={id} aria-labelledby={`pattern-${id}`}>
              <h2 id={`pattern-${id}`} className="text-xl font-semibold text-ink">
                {PATTERNS[id].title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-ink-soft">{PATTERNS[id].signal}</p>
              <Rows rows={group} solved={solved} />
            </section>
          );
        })
      )}
    </div>
  );
}

function Rows({ rows, solved }: { rows: ProblemRow[]; solved: (slug: string) => boolean }) {
  return (
    <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-surface shadow-xs">
      {rows.map((r) => (
        <li key={r.slug}>
          <Link href={`/practice/${r.slug}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-subtle">
            {solved(r.slug) ? (
              <FiCheckCircle aria-label="Solved" className="shrink-0 text-good-ink" />
            ) : (
              <FiCircle aria-label="Not solved yet" className="shrink-0 text-ink-muted" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink group-hover:text-accent-ink">{r.title}</span>
              <span className="block truncate text-sm text-ink-soft">{r.summary}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${DIFFICULTY_STYLE[r.difficulty].className}`}>
              {DIFFICULTY_STYLE[r.difficulty].label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-soft">
      <span id={`seg-${label}`}>{label}</span>
      <div role="group" aria-labelledby={`seg-${label}`} className="inline-flex overflow-hidden rounded-lg border border-line">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`px-2.5 py-1 text-sm ${value === v ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

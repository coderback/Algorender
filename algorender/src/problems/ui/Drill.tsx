'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { FiArrowRight, FiCheck, FiRefreshCw, FiX } from 'react-icons/fi';
import { CONFUSED_WITH, PATTERNS, type PatternId } from '../patterns';
import { Rng } from '../random';

export type DrillQuestion = {
  slug: string;
  title: string;
  /** The statement, rendered on the server. */
  statement: ReactNode;
  answer: PatternId;
  /** The problem's other patterns: never offered as wrong options. */
  also: PatternId[];
  why: string;
};

const ROUND = 10;

type Asked = { q: DrillQuestion; options: PatternId[] };

/** A round: questions with mixed patterns, each with the right pattern and three it is often mistaken for. */
function makeRound(questions: readonly DrillQuestion[], seed: number): Asked[] {
  const rng = new Rng(seed);
  const present = [...new Set(questions.map((q) => q.answer))];
  // Interleave: no main pattern twice in a row when it can be helped.
  const pool = rng.shuffle(questions);
  const picked: DrillQuestion[] = [];
  while (picked.length < Math.min(ROUND, questions.length)) {
    const k = pool.findIndex((q) => q.answer !== picked.at(-1)?.answer);
    picked.push(pool.splice(k >= 0 ? k : 0, 1)[0]);
  }
  return picked.map((q) => {
    const excluded = new Set([q.answer, ...q.also]);
    const near = rng.shuffle(CONFUSED_WITH[q.answer].filter((p) => !excluded.has(p) && present.includes(p)));
    const far = rng.shuffle(present.filter((p) => !excluded.has(p) && !near.includes(p)));
    return { q, options: rng.shuffle([q.answer, ...[...near, ...far].slice(0, 3)]) };
  });
}

/**
 * Pattern drills: read a problem, name the pattern that cracks it, and see
 * why. Rounds mix patterns (interleaving), so the cue has to come from the
 * problem, not from the chapter it sits in.
 */
export function Drill({ questions }: { questions: DrillQuestion[] }) {
  // The first round is the same on the server and in the browser; later ones are fresh.
  const [round, setRound] = useState(() => makeRound(questions, 1));
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<PatternId | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState<Asked[]>([]);

  const restart = () => {
    setRound(makeRound(questions, Math.floor(Math.random() * 1e9)));
    setIndex(0);
    setChosen(null);
    setScore(0);
    setMisses([]);
  };

  if (index >= round.length) {
    return (
      <div className="space-y-4 rounded-xl border border-line-soft bg-surface p-5 shadow-xs" aria-live="polite">
        <h2 className="text-xl font-semibold text-ink">
          You named {score} of {round.length} patterns.
        </h2>
        {misses.length > 0 ? (
          <div>
            <p className="text-sm text-ink-soft">Worth another look:</p>
            <ul className="mt-2 space-y-1 text-sm">
              {misses.map(({ q }) => (
                <li key={q.slug}>
                  <Link href={`/practice/${q.slug}`} className="text-accent-ink hover:underline">
                    {q.title}
                  </Link>{' '}
                  <span className="text-ink-soft">· {PATTERNS[q.answer].title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-ink-soft">Every one right. Spotting the pattern is half the work; solving one of these is the other half.</p>
        )}
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
        >
          <FiRefreshCw aria-hidden /> Another round
        </button>
      </div>
    );
  }

  const { q, options } = round[index];
  const answered = chosen != null;
  const right = chosen === q.answer;
  const choose = (p: PatternId) => {
    if (answered) return;
    setChosen(p);
    if (p === q.answer) setScore((s) => s + 1);
    else setMisses((m) => [...m, round[index]]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span>
          Question {index + 1} of {round.length}
        </span>
        <span>{score} right so far</span>
      </div>
      <div className="rounded-xl border border-line-soft bg-surface p-5 shadow-xs">{q.statement}</div>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold text-ink">Which pattern fits best?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((p) => {
            const state = !answered ? 'idle' : p === q.answer ? 'right' : p === chosen ? 'wrong' : 'idle';
            return (
              <button
                key={p}
                type="button"
                onClick={() => choose(p)}
                disabled={answered}
                aria-pressed={chosen === p}
                className={`flex items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left text-sm font-medium ${
                  state === 'right'
                    ? 'border-good-line bg-good-soft text-good-ink'
                    : state === 'wrong'
                      ? 'border-bad-line bg-bad-soft text-bad-ink'
                      : 'border-line bg-surface text-ink hover:border-accent-line hover:bg-subtle disabled:hover:border-line disabled:hover:bg-surface'
                }`}
              >
                {PATTERNS[p].title}
                {state === 'right' && <FiCheck aria-label="the right answer" />}
                {state === 'wrong' && <FiX aria-label="your answer" />}
              </button>
            );
          })}
        </div>
      </fieldset>
      {answered && (
        <div className="space-y-3 rounded-xl border border-line-soft bg-surface p-4 text-sm" aria-live="polite">
          <p className={`font-semibold ${right ? 'text-good-ink' : 'text-bad-ink'}`}>
            {right ? 'Right: ' : 'Not quite: it’s '}
            {PATTERNS[q.answer].title.toLowerCase()}.
          </p>
          <p className="text-ink-soft">{q.why}</p>
          {!right && chosen && (
            <p className="text-ink-soft">
              <span className="font-medium text-ink">{PATTERNS[chosen].title}</span> fits when: {PATTERNS[chosen].signal.charAt(0).toLowerCase() + PATTERNS[chosen].signal.slice(1)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIndex((i) => i + 1);
                setChosen(null);
              }}
              autoFocus
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
            >
              {index + 1 < round.length ? 'Next question' : 'See your score'} <FiArrowRight aria-hidden />
            </button>
            <Link href={`/practice/${q.slug}`} className="text-accent-ink hover:underline">
              Solve “{q.title}”
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

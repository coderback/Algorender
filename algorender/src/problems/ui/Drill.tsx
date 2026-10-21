'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { FiArrowRight, FiCheck, FiShuffle, FiX } from 'react-icons/fi';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, FeatureCard } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
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
  const [misses, setMisses] = useState<(Asked & { said: PatternId })[]>([]);

  const restart = () => {
    setRound(makeRound(questions, Math.floor(Math.random() * 1e9)));
    setIndex(0);
    setChosen(null);
    setScore(0);
    setMisses([]);
  };

  const finished = index >= round.length;
  const side = (
    <FeatureCard className="gap-3">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-feature-muted uppercase">This round</h2>
      <p className="flex items-baseline gap-2">
        <span className="font-display text-number-big tabular-nums">{score}</span>
        <span className="text-[15px] font-semibold">{finished ? `right of ${round.length}` : 'right so far'}</span>
      </p>
      <p className="text-sm text-feature-muted">Rounds of {ROUND}, patterns mixed. Naming the pattern is the skill interviews test first.</p>
    </FeatureCard>
  );

  if (finished) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,460px)]">
        <section aria-live="polite" className="flex flex-col gap-4 rounded-card bg-track-butter p-6 text-track-butter-ink">
          <span className="w-fit rounded-full bg-surface/70 px-3 py-1 text-xs font-semibold">End of the round</span>
          <h2 className="font-display text-title-section text-track-butter-title">
            You named {score} of {round.length} patterns.
          </h2>
          {misses.length > 0 ? (
            <>
              <p className="text-sm">Worth another look:</p>
              <ul className="flex flex-col gap-2">
                {misses.map(({ q, said }) => (
                  <li key={q.slug}>
                    <Link href={`/practice/${q.slug}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-[14px] bg-surface px-3.5 py-2.5 text-ink hover:bg-subtle">
                      <span className="text-sm font-semibold">
                        {q.title} <span className="font-normal text-ink-muted">· {PATTERNS[q.answer].title}</span>
                      </span>
                      <span className="text-[13px] text-ink-muted">you said {PATTERNS[said].title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Every one right. Spotting the pattern is half the work; solving one of these is the other half.</p>
          )}
          <Button onClick={restart} icon={<FiShuffle aria-hidden />} className="w-fit">
            Another round
          </Button>
        </section>
        {side}
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
    else setMisses((m) => [...m, { ...round[index], said: p }]);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,460px)]">
      <Card className="gap-5 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-[13px] text-accent-ink">
            Question {index + 1} of {round.length}
          </span>
          <span aria-hidden className="h-1.5 w-40 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${((index + (answered ? 1 : 0)) / round.length) * 100}%` }} />
          </span>
        </div>
        <h2 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] sm:text-[32px]">{q.title}</h2>
        <div className="text-base leading-relaxed text-ink-soft">{q.statement}</div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-semibold text-ink">Which pattern fits best?</legend>
          {options.map((p, i) => {
            const state = !answered ? 'idle' : p === q.answer ? 'right' : p === chosen ? 'wrong' : 'idle';
            return (
              <button
                key={p}
                type="button"
                onClick={() => choose(p)}
                disabled={answered}
                aria-pressed={chosen === p}
                className={cx(
                  'flex min-h-16 items-center gap-3 rounded-[22px] px-[18px] py-3 text-left text-base font-semibold transition-colors duration-150 ease-standard',
                  state === 'right'
                    ? 'bg-good-soft text-good-title ring-2 ring-ink ring-inset'
                    : state === 'wrong'
                      ? 'bg-bad-soft text-bad-title ring-2 ring-bad-line ring-inset'
                      : 'text-ink ring-[1.5px] ring-line ring-inset enabled:hover:ring-line-strong disabled:text-ink-soft',
                )}
              >
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] font-semibold text-ink">
                  {state === 'right' ? <FiCheck strokeWidth={3} /> : state === 'wrong' ? <FiX strokeWidth={3} /> : i + 1}
                </span>
                {PATTERNS[p].title}
                {state === 'right' && <span className="sr-only">(the right answer)</span>}
                {state === 'wrong' && <span className="sr-only">(your answer)</span>}
              </button>
            );
          })}
        </fieldset>
        {answered && (
          <div className={cx('flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5 text-sm', right ? 'bg-good-soft text-good-ink' : 'bg-bad-soft text-bad-ink')} aria-live="polite">
            <p className={cx('flex items-center gap-2 font-semibold', right ? 'text-good-title' : 'text-bad-title')}>
              {right ? <FiCheck aria-hidden /> : <FiX aria-hidden />}
              <span>
                {right ? 'Right: ' : 'Not quite: it’s '}
                {PATTERNS[q.answer].title.toLowerCase()}.
              </span>
            </p>
            <p>{q.why}</p>
            {!right && chosen && (
              <p>
                <span className="font-semibold">{PATTERNS[chosen].title}</span> fits when: {PATTERNS[chosen].signal.charAt(0).toLowerCase() + PATTERNS[chosen].signal.slice(1)}
              </p>
            )}
          </div>
        )}
        {answered && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="l"
              onClick={() => {
                setIndex((i) => i + 1);
                setChosen(null);
              }}
              autoFocus
              trailing={<FiArrowRight aria-hidden />}
            >
              {index + 1 < round.length ? 'Next question' : 'See your score'}
            </Button>
            <ButtonLink href={`/practice/${q.slug}`} kind="secondary">
              Solve “{q.title}”
            </ButtonLink>
          </div>
        )}
      </Card>
      {side}
    </div>
  );
}

'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { FiCheckCircle, FiTarget } from 'react-icons/fi';
import { Visualiser } from '@/components/explorer/Visualiser';
import { useLessonSlug } from './LessonContext';
import { recordScore } from './progress';

type Settings = Record<string, string | number>;
const asParams = (s: Settings = {}) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)]));

function Fallback() {
  return <div className="h-[480px] animate-pulse rounded-tile bg-subtle" aria-label="Loading visualiser" />;
}

/**
 * A visualiser inside a lesson, starting from the given settings (the same keys
 * as the page URL: preset, n, seed, input, start, ops…). Its keyboard
 * shortcuts work while you're interacting with it.
 */
export function Explore({
  slug,
  settings,
  caption,
  input = false,
}: {
  slug: string;
  settings?: Settings;
  caption?: string;
  /** Show the input panel so the learner can try their own values. */
  input?: boolean;
}) {
  return (
    <figure className="not-prose flex flex-col gap-2 rounded-card bg-surface p-3 sm:p-4">
      <Suspense fallback={<Fallback />}>
        <Visualiser slug={slug} variant="lesson" settings={asParams(settings)} showInput={input} />
      </Suspense>
      {caption && <figcaption className="px-2 pb-1 text-[13px] text-ink-muted">{caption}</figcaption>}
    </figure>
  );
}

/**
 * Predict mode as an exercise: the player stops at each decision until the
 * learner answers. Done after `goal` predictions; the best score is kept.
 */
export function PredictChallenge({ slug, settings, goal = 5 }: { slug: string; settings?: Settings; goal?: number }) {
  const lesson = useLessonSlug();
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const latest = useRef(score);
  const done = score.total >= goal;

  const onPrediction = useCallback(
    (correct: boolean) => {
      const next = { correct: latest.current.correct + (correct ? 1 : 0), total: latest.current.total + 1 };
      latest.current = next;
      setScore(next);
      if (next.total === goal) recordScore(lesson, 'prediction', slug, next);
    },
    [goal, lesson, slug],
  );

  return (
    <div data-challenge={slug} className="not-prose flex flex-col gap-4 rounded-[28px] bg-track-lilac p-4 text-track-lilac-ink sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {done ? <FiCheckCircle aria-hidden className="size-4 shrink-0" /> : <FiTarget aria-hidden className="size-4 shrink-0" />}
          {done ? `Done: ${score.correct} of ${score.total} predictions right.` : `Make ${goal} predictions: step forward and answer each question before the next step plays.`}
        </p>
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span className="sr-only">
            {Math.min(score.total, goal)} of {goal} made
          </span>
          <span aria-hidden className="font-mono">
            {Math.min(score.total, goal)}/{goal}
          </span>
          <span aria-hidden className="flex gap-1">
            {Array.from({ length: goal }, (_, i) => (
              <span key={i} className={i < score.total ? 'size-4 rounded-full bg-accent' : 'size-4 rounded-full ring-[1.5px] ring-accent ring-inset'} />
            ))}
          </span>
        </span>
      </div>
      <div className="rounded-tile bg-surface p-3 text-ink sm:p-4">
        <Suspense fallback={<Fallback />}>
          <Visualiser slug={slug} variant="lesson" settings={{ ...asParams(settings), mode: 'predict' }} onPrediction={onPrediction} />
        </Suspense>
      </div>
    </div>
  );
}

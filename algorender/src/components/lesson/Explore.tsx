'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { FiCheckCircle, FiTarget } from 'react-icons/fi';
import { Visualiser } from '@/components/explorer/Visualiser';
import { useLessonSlug } from './LessonContext';
import { recordBest } from './progress';

type Settings = Record<string, string | number>;
const asParams = (s: Settings = {}) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)]));

function Fallback() {
  return <div className="h-[480px] animate-pulse rounded-xl bg-surface" aria-label="Loading visualiser" />;
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
    <figure className="not-prose -mx-1 sm:mx-0">
      <Suspense fallback={<Fallback />}>
        <Visualiser slug={slug} variant="lesson" settings={asParams(settings)} showInput={input} />
      </Suspense>
      {caption && <figcaption className="mt-2 text-sm text-ink-muted">{caption}</figcaption>}
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
      if (next.total === goal) recordBest('predictions', `${lesson}:${slug}`, next);
    },
    [goal, lesson, slug],
  );

  return (
    <div className="not-prose space-y-3">
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${done ? 'border-good-line bg-good-soft' : 'border-warn-line bg-warn-soft'}`}
        aria-live="polite"
      >
        {done ? <FiCheckCircle aria-hidden className="text-good-ink" /> : <FiTarget aria-hidden className="text-warn-ink" />}
        <span className="font-medium text-ink">
          {done
            ? `Done: ${score.correct} of ${score.total} predictions right.`
            : `Make ${goal} predictions: step forward and answer each question before the next step plays.`}
        </span>
        <span className="ml-auto font-mono text-ink-soft">
          {Math.min(score.total, goal)}/{goal}
        </span>
      </div>
      <Suspense fallback={<Fallback />}>
        <Visualiser slug={slug} variant="lesson" settings={{ ...asParams(settings), mode: 'predict' }} onPrediction={onPrediction} />
      </Suspense>
    </div>
  );
}

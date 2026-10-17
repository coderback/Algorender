'use client';

import { useEffect, type RefObject } from 'react';
import { FiCheckCircle, FiHelpCircle, FiXCircle } from 'react-icons/fi';
import type { Checkpoint } from '@/engine/types';

/**
 * Predict mode: asks what the next step will do before the learner may see it.
 * Answer with a click or the number keys; the reveal is the next frame.
 */
export function PredictCard({
  checkpoint,
  chosen,
  onAnswer,
  scope,
}: {
  checkpoint: Checkpoint;
  chosen: number | undefined;
  onAnswer: (choice: number) => void;
  /** Only listen for number keys inside this element (several stages on one page). */
  scope?: RefObject<HTMLElement | null>;
}) {
  const answered = chosen !== undefined;

  useEffect(() => {
    if (answered) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= checkpoint.choices.length) {
        e.preventDefault();
        onAnswer(n - 1);
      }
    };
    const target: HTMLElement | Window | null = scope ? scope.current : window;
    target?.addEventListener('keydown', onKey as EventListener);
    return () => target?.removeEventListener('keydown', onKey as EventListener);
  }, [answered, checkpoint, onAnswer, scope]);

  const correct = chosen === checkpoint.answer;

  return (
    <div className="rounded-xl border border-warn-line bg-warn-soft/70 px-4 py-3" role="group" aria-label="Predict the next step">
      <p className="mb-2 flex items-center gap-2 text-[15px] font-medium text-ink">
        <FiHelpCircle aria-hidden className="shrink-0 text-warn-ink" />
        {checkpoint.question}
      </p>
      <div className="flex flex-wrap gap-2">
        {checkpoint.choices.map((choice, i) => {
          const isAnswer = i === checkpoint.answer;
          const isChosen = i === chosen;
          const style = !answered
            ? 'border-line-strong bg-surface hover:border-accent-line hover:bg-accent-soft'
            : isAnswer
              ? 'border-good-line bg-good-soft text-good-ink'
              : isChosen
                ? 'border-bad-line bg-bad-soft text-bad-ink'
                : 'border-line bg-surface text-ink-muted';
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => onAnswer(i)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${style}`}
            >
              <span className="mr-1.5 font-mono text-xs text-ink-muted">{i + 1}</span>
              {choice}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm">
        {answered &&
          (correct ? (
            <span className="inline-flex items-center gap-1.5 text-good-ink">
              <FiCheckCircle aria-hidden /> Right. Step forward to see it happen.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-bad-ink">
              <FiXCircle aria-hidden /> Not quite: it&apos;s &ldquo;{checkpoint.choices[checkpoint.answer]}&rdquo;. Step forward to see why.
            </span>
          ))}
      </p>
    </div>
  );
}

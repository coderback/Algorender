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
  step,
}: {
  checkpoint: Checkpoint;
  chosen: number | undefined;
  onAnswer: (choice: number) => void;
  /** Only listen for number keys inside this element (several stages on one page). */
  scope?: RefObject<HTMLElement | null>;
  /** The step number, for the "Your call · Step 11" eyebrow. */
  step?: number;
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
    <div className="flex flex-col gap-3.5 rounded-tile bg-track-lilac px-5 py-[18px] text-track-lilac-title" role="group" aria-label="Predict the next step">
      <div className="flex flex-col gap-1">
        <span className="text-eyebrow font-semibold text-track-lilac-ink uppercase">{step != null ? `Your call · Step ${step}` : 'Your call'}</span>
        <p className="flex items-start gap-2 text-[17px] font-semibold">
          <FiHelpCircle aria-hidden className="mt-1 shrink-0 text-track-lilac-ink" />
          {checkpoint.question}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {checkpoint.choices.map((choice, i) => {
          const isAnswer = i === checkpoint.answer;
          const isChosen = i === chosen;
          const style = !answered
            ? 'bg-surface text-ink hover:ring-[1.5px] hover:ring-track-lilac-ink hover:ring-inset'
            : isAnswer
              ? 'bg-good-soft text-good-ink ring-[1.5px] ring-good-line ring-inset'
              : isChosen
                ? 'bg-bad-soft text-bad-ink ring-[1.5px] ring-bad-line ring-inset'
                : 'bg-surface/60 text-ink-muted';
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => onAnswer(i)}
              className={`inline-flex min-h-12 items-center gap-2 rounded-full px-5 py-2 text-left text-[15px] font-semibold transition-[color,background-color,box-shadow] duration-150 ease-standard ${style}`}
            >
              <span className="font-mono text-xs font-medium text-ink-muted">{i + 1}</span>
              {choice}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className={answered ? "text-sm font-semibold" : "sr-only"}>
        {answered &&
          (correct ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-4 py-2 text-good-ink">
              <FiCheckCircle aria-hidden /> Right. Step forward to see it happen.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bad-soft px-4 py-2 text-bad-ink">
              <FiXCircle aria-hidden /> Not quite: it&apos;s &ldquo;{checkpoint.choices[checkpoint.answer]}&rdquo;. Step forward to see why.
            </span>
          ))}
      </p>
    </div>
  );
}

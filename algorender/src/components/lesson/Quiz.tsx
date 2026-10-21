'use client';

import { useState } from 'react';
import { FiCheckCircle, FiRotateCcw, FiXCircle } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { mistakeAnchor } from './anchors';
import { useLessonMistakes, useLessonSlug } from './LessonContext';
import { recordAnswer, recordMistake, recordScore } from './progress';

export type Question = {
  q: string;
  choices: string[];
  /** Index into `choices`. */
  answer: number;
  /** Why the right answer is right (shown after answering, whichever was picked). */
  why: string;
  /**
   * Wrong choices that come from a common mistake the lesson names: choice
   * index → the `<Misconception id>`. Picking one names the mistake and
   * starts it in the review queue.
   */
  traps?: Record<string, string>;
};

/**
 * Retrieval practice: answer from memory, then see why. One try per question;
 * "Try again" clears the answers. The best score is kept with the lesson, and
 * each question's first answer puts it in the review queue (src/progress/review.ts).
 * A wrong answer that comes from a mistake the lesson names says so, links to
 * the correction, and starts that mistake in the review queue too.
 */
export function Quiz({ id = 'quiz', questions }: { id?: string; questions: Question[] }) {
  const lesson = useLessonSlug();
  const mistakes = useLessonMistakes();
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picked.filter((p) => p !== null).length;
  const correct = picked.filter((p, i) => p === questions[i].answer).length;
  const finished = answered === questions.length;

  const pick = (qi: number, ci: number) => {
    if (picked[qi] !== null) return;
    const next = picked.map((p, i) => (i === qi ? ci : p));
    setPicked(next);
    recordAnswer(lesson, id, qi, ci === questions[qi].answer);
    const trap = questions[qi].traps?.[ci];
    if (trap && mistakes[trap]) recordMistake(lesson, trap, 'quiz');
    if (next.every((p) => p !== null)) {
      recordScore(lesson, 'quiz', id, { correct: next.filter((p, i) => p === questions[i].answer).length, total: questions.length });
    }
  };

  return (
    <div className="not-prose flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {questions.map((question, qi) => {
          const choice = picked[qi];
          const trap = choice !== null ? question.traps?.[choice] : undefined;
          const right = choice === question.answer;
          return (
            <li key={qi} className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
              <p className="font-mono text-xs font-medium text-accent-ink">
                Question {qi + 1} of {questions.length}
              </p>
              <p className="-mt-2 font-display text-[22px] leading-snug font-bold tracking-[-0.01em]">{question.q}</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="group" aria-label={`Question ${qi + 1}`}>
                {question.choices.map((c, ci) => {
                  const state = choice === null ? 'open' : ci === question.answer ? 'right' : ci === choice ? 'wrong' : 'other';
                  return (
                    <button
                      key={ci}
                      type="button"
                      disabled={choice !== null}
                      onClick={() => pick(qi, ci)}
                      className={cx(
                        'min-h-13 rounded-[18px] px-4 py-3 text-left text-[15px] font-semibold ring-inset transition-colors duration-150 ease-standard',
                        state === 'open' && 'ring-[1.5px] ring-line hover:ring-2 hover:ring-accent',
                        state === 'right' && 'bg-good-soft text-good-title ring-2 ring-good-ink',
                        state === 'wrong' && 'bg-bad-soft text-bad-title ring-[1.5px] ring-bad-line',
                        state === 'other' && 'text-ink-muted ring-[1.5px] ring-line-soft',
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {choice !== null && (
                <p className={cx('flex gap-2 rounded-well px-4 py-3 text-sm', right ? 'bg-good-soft text-good-title' : 'bg-bad-soft text-bad-title')}>
                  {right ? <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-good-ink" /> : <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />}
                  <span>
                    <span className="font-semibold">{right ? 'Right. ' : 'Not quite. '}</span>
                    {question.why}
                  </span>
                </p>
              )}
              {trap && mistakes[trap] && (
                <p className="rounded-well bg-warn-soft px-4 py-3 text-sm text-warn-title">
                  That answer comes from a common mistake:{' '}
                  <a href={`#${mistakeAnchor(trap)}`} className="font-semibold underline underline-offset-2">
                    {mistakes[trap]}
                  </a>
                  . It will come back in your daily review until you’ve answered it right twice.
                </p>
              )}
              {choice === null && qi === 0 && <p className="text-xs text-ink-muted">Your answer comes back in Review in a few days, so it sticks.</p>}
            </li>
          );
        })}
      </ol>
      {finished && (
        <div className="flex flex-wrap items-center gap-3 rounded-tile bg-surface px-5 py-4 text-sm" aria-live="polite">
          <span className="font-semibold text-ink">
            {correct} of {questions.length} right.
          </span>
          <span className="text-ink-soft">
            {correct === questions.length ? 'Come back in a few days and try again: remembering it later is what makes it stick.' : 'Reread the explanations above, then try again.'}
          </span>
          <button
            type="button"
            onClick={() => setPicked(questions.map(() => null))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-accent-ink hover:bg-accent-soft"
          >
            <FiRotateCcw aria-hidden /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

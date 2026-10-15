'use client';

import { useState } from 'react';
import { FiCheckCircle, FiRotateCcw, FiXCircle } from 'react-icons/fi';
import { useLessonSlug } from './LessonContext';
import { recordBest } from './progress';

export type Question = {
  q: string;
  choices: string[];
  /** Index into `choices`. */
  answer: number;
  /** Why the right answer is right (shown after answering, whichever was picked). */
  why: string;
};

/**
 * Retrieval practice: answer from memory, then see why. One try per question;
 * "Try again" clears the answers. The best score is kept with the lesson.
 */
export function Quiz({ id = 'quiz', questions }: { id?: string; questions: Question[] }) {
  const lesson = useLessonSlug();
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picked.filter((p) => p !== null).length;
  const correct = picked.filter((p, i) => p === questions[i].answer).length;
  const finished = answered === questions.length;

  const pick = (qi: number, ci: number) => {
    if (picked[qi] !== null) return;
    const next = picked.map((p, i) => (i === qi ? ci : p));
    setPicked(next);
    if (next.every((p) => p !== null)) {
      recordBest('quizzes', `${lesson}:${id}`, { correct: next.filter((p, i) => p === questions[i].answer).length, total: questions.length });
    }
  };

  return (
    <div className="not-prose space-y-4">
      <ol className="space-y-4">
        {questions.map((question, qi) => {
          const choice = picked[qi];
          return (
            <li key={qi} className="rounded-xl border border-line bg-surface p-4">
              <p className="mb-3 font-medium text-ink">
                <span className="mr-2 font-mono text-sm text-ink-muted">{qi + 1}.</span>
                {question.q}
              </p>
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`Question ${qi + 1}`}>
                {question.choices.map((c, ci) => {
                  const isAnswer = ci === question.answer;
                  const style =
                    choice === null
                      ? 'border-line-strong hover:border-accent-line hover:bg-accent-soft'
                      : isAnswer
                        ? 'border-good-line bg-good-soft text-good-ink'
                        : ci === choice
                          ? 'border-bad-line bg-bad-soft text-bad-ink'
                          : 'border-line text-ink-muted';
                  return (
                    <button
                      key={ci}
                      type="button"
                      disabled={choice !== null}
                      onClick={() => pick(qi, ci)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${style}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {choice !== null && (
                <p className="mt-3 flex gap-2 text-sm text-ink-soft">
                  {choice === question.answer ? (
                    <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-good-ink" />
                  ) : (
                    <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />
                  )}
                  <span>
                    <span className="font-medium">{choice === question.answer ? 'Right. ' : 'Not quite. '}</span>
                    {question.why}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {finished && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-subtle px-4 py-3 text-sm" aria-live="polite">
          <span className="font-medium text-ink">
            {correct} of {questions.length} right.
          </span>
          <span className="text-ink-soft">
            {correct === questions.length
              ? 'Come back in a few days and try again: remembering it later is what makes it stick.'
              : 'Reread the explanations above, then try again.'}
          </span>
          <button
            type="button"
            onClick={() => setPicked(questions.map(() => null))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-accent-ink hover:bg-accent-soft"
          >
            <FiRotateCcw aria-hidden /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

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
            <li key={qi} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 font-medium text-gray-900">
                <span className="mr-2 font-mono text-sm text-gray-400">{qi + 1}.</span>
                {question.q}
              </p>
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`Question ${qi + 1}`}>
                {question.choices.map((c, ci) => {
                  const isAnswer = ci === question.answer;
                  const style =
                    choice === null
                      ? 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                      : isAnswer
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : ci === choice
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-gray-200 text-gray-400';
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
                <p className="mt-3 flex gap-2 text-sm text-gray-700">
                  {choice === question.answer ? (
                    <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-red-600" />
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
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm" aria-live="polite">
          <span className="font-medium text-gray-900">
            {correct} of {questions.length} right.
          </span>
          <span className="text-gray-600">
            {correct === questions.length
              ? 'Come back in a few days and try again: remembering it later is what makes it stick.'
              : 'Reread the explanations above, then try again.'}
          </span>
          <button
            type="button"
            onClick={() => setPicked(questions.map(() => null))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-blue-700 hover:bg-blue-100"
          >
            <FiRotateCcw aria-hidden /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

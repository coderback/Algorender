'use client';

import { useState, useSyncExternalStore } from 'react';
import { FiCheckCircle, FiLoader, FiPlay, FiXCircle } from 'react-icons/fi';
import { getExercise } from '@/content/exercises';
import { CodeEditor } from '@/workspace/editor/CodeEditor';
import { Hints } from '@/workspace/Hints';
import { InlineText } from '@/workspace/InlineText';
import { LANGUAGES, type Language } from '@/workspace/protocol';
import { RunOutput, statusText } from '@/workspace/RunOutput';
import { loadLanguage, saveLanguage } from '@/workspace/storage';
import { useExerciseRun } from '@/workspace/useExerciseRun';
import { Workspace, type Stage } from '@/workspace/Workspace';

const noSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/** A code exercise inside a lesson: its task and hints, then the ladder (or just the stages named). */
export function CodeExercise({ exercise: slug, stages }: { exercise: string; stages?: Stage[] }) {
  const exercise = getExercise(slug)!;
  return (
    <div className="not-prose space-y-3 rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
      <h3 className="font-semibold text-ink">{exercise.title}</h3>
      <div className="space-y-2 text-sm text-ink-soft">
        {exercise.task.map((p, i) => (
          <p key={i}>
            <InlineText text={p} />
          </p>
        ))}
      </div>
      <Hints hints={exercise.hints} />
      <Workspace slug={slug} stages={stages} variant="lesson" />
    </div>
  );
}

/**
 * PRIMM's Predict then Run: read working code, commit to a prediction, then run
 * it and step through to check. Running is locked until the learner has
 * predicted, because a guess made after seeing the answer teaches little.
 */
export function PredictCode({
  exercise: slug,
  example,
  question,
  choices,
  answer,
  why,
}: {
  /** The exercise whose solution is the code to read. */
  exercise: string;
  /** The example input to run it on. */
  example?: string;
  question: string;
  choices: string[];
  answer: number;
  why: string;
}) {
  const hydrated = useHydrated();
  const exercise = getExercise(slug)!;
  if (!hydrated) {
    return (
      <div className="not-prose rounded-xl border border-line bg-surface p-4">
        <pre className="font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-soft">{exercise.solution.python}</pre>
      </div>
    );
  }
  return <PredictInner slug={slug} example={example ?? exercise.examples[0].id} question={question} choices={choices} answer={answer} why={why} />;
}

function PredictInner({
  slug,
  example,
  question,
  choices,
  answer,
  why,
}: {
  slug: string;
  example: string;
  question: string;
  choices: string[];
  answer: number;
  why: string;
}) {
  const exercise = getExercise(slug)!;
  const [language, setLanguage] = useState<Language>(() => loadLanguage() ?? 'python');
  const [picked, setPicked] = useState<number | null>(null);
  const { outcome, running, run, onFrame, frameLine, runtimeState, runtimeDetail, busy } = useExerciseRun(exercise, language);
  const code = exercise.solution[language];
  const shown = exercise.examples.find((e) => e.id === example)!;
  const stale = outcome != null && outcome.language !== language;

  return (
    <div className="not-prose space-y-3">
      <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Language">
        {(Object.keys(LANGUAGES) as Language[]).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={language === l}
            onClick={() => {
              setLanguage(l);
              saveLanguage(l);
            }}
            className={`px-3 py-1.5 text-sm transition-colors ${language === l ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'}`}
          >
            {LANGUAGES[l].label}
          </button>
        ))}
      </div>
      <CodeEditor value={code} language={language} label={`${exercise.title}: ${LANGUAGES[language].label} code to read`} readOnly minLines={4} runLine={stale ? null : frameLine} />

      <div role="group" aria-label="Predict" className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
        <p className="mb-3 font-medium text-ink">
          <InlineText text={question} />
        </p>
        <div className="flex flex-wrap gap-2">
          {choices.map((c, i) => {
            const state = picked == null ? 'open' : i === answer ? 'right' : i === picked ? 'wrong' : 'other';
            return (
              <button
                key={i}
                type="button"
                disabled={picked != null}
                aria-pressed={picked === i}
                onClick={() => setPicked(i)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  state === 'right'
                    ? 'border-good-line bg-good-soft text-good-ink'
                    : state === 'wrong'
                      ? 'border-bad-line bg-bad-soft text-bad-ink'
                      : 'border-line bg-surface text-ink hover:bg-sunken disabled:hover:bg-surface'
                }`}
              >
                <InlineText text={c} />
              </button>
            );
          })}
        </div>
        {picked != null && (
          <p className="mt-3 flex gap-2 text-sm text-ink-soft" role="status">
            {picked === answer ? <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-good-ink" /> : <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />}
            <span>
              <span className="font-semibold text-ink">{picked === answer ? 'Right. ' : 'Not quite. '}</span>
              <InlineText text={why} />
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run(code, example, { tests: false })}
          disabled={picked == null || busy}
          aria-busy={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? <FiLoader aria-hidden className="animate-spin" /> : <FiPlay aria-hidden />}
          Run it on {shown.label.toLowerCase()} input
        </button>
        <span className="text-xs text-ink-muted" role="status">
          {picked == null ? 'Make your prediction first.' : statusText(runtimeState, runtimeDetail, running)}
        </span>
      </div>

      {outcome && <RunOutput outcome={outcome} exercise={exercise} stale={stale} onFrame={onFrame} layout="stacked" keyboard="local" />}
    </div>
  );
}

'use client';

import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { FiCheckCircle, FiLoader, FiPlay, FiRotateCcw, FiXCircle } from 'react-icons/fi';
import { getExercise } from '@/content/exercises';
import { getSnippet } from '@/content/snippets';
import { CodeEditor } from '@/workspace/editor/CodeEditor';
import { Hints } from '@/workspace/Hints';
import { InlineText } from '@/workspace/InlineText';
import { LANGUAGES, LINE_LIMITS, type Language, type RunResult } from '@/workspace/protocol';
import { ErrorCard, MEMORY_LEGEND, RunOutput, RunPicture, statusText } from '@/workspace/RunOutput';
import { loadLanguage, saveLanguage } from '@/workspace/storage';
import { traceFor, type RunTrace } from '@/workspace/trace';
import { useExerciseRun } from '@/workspace/useExerciseRun';
import { useRuntime } from '@/workspace/useRuntime';
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

type Prediction = {
  question: string;
  choices: string[];
  answer: number;
  why: string;
};

/**
 * PRIMM's Predict then Run: read working code, commit to a prediction, then run
 * it and step through to check. Running is locked until the learner has
 * predicted, because a guess made after seeing the answer teaches little.
 */
export function PredictCode({
  exercise: slug,
  example,
  ...prediction
}: Prediction & {
  /** The exercise whose solution is the code to read. */
  exercise: string;
  /** The example input to run it on. */
  example?: string;
}) {
  const hydrated = useHydrated();
  const exercise = getExercise(slug)!;
  if (!hydrated) return <CodePlaceholder code={exercise.solution.python} />;
  return <PredictInner slug={slug} example={example ?? exercise.examples[0].id} prediction={prediction} />;
}

function PredictInner({ slug, example, prediction }: { slug: string; example: string; prediction: Prediction }) {
  const exercise = getExercise(slug)!;
  const [language, setLanguage] = useState<Language>(() => loadLanguage() ?? 'python');
  const [picked, setPicked] = useState<number | null>(null);
  const { outcome, running, run, onFrame, frameLine, runtimeState, runtimeDetail, busy } = useExerciseRun(exercise, language);
  const code = exercise.solution[language];
  const shown = exercise.examples.find((e) => e.id === example)!;
  const stale = outcome != null && outcome.language !== language;

  return (
    <div className="not-prose space-y-3">
      <LanguagePicker languages={Object.keys(LANGUAGES) as Language[]} language={language} onChange={setLanguage} />
      <CodeEditor value={code} language={language} label={`${exercise.title}: ${LANGUAGES[language].label} code to read`} readOnly minLines={4} runLine={stale ? null : frameLine} />
      <PredictCard {...prediction} picked={picked} onPick={setPicked} />
      <div className="flex flex-wrap items-center gap-3">
        <RunButton onClick={() => void run(code, example, { tests: false })} disabled={picked == null || busy} busy={busy}>
          Run it on {shown.label.toLowerCase()} input
        </RunButton>
        <span className="text-xs text-ink-muted" role="status">
          {picked == null ? 'Make your prediction first.' : statusText(runtimeState, runtimeDetail, running)}
        </span>
      </div>
      {outcome && <RunOutput outcome={outcome} exercise={exercise} stale={stale} onFrame={onFrame} layout="stacked" keyboard="local" />}
    </div>
  );
}

/**
 * A short program traced line by line, Python Tutor style: every step shows the
 * call stack, the objects, and arrows from names to what they refer to. The
 * learner can change the code and run it again. With a question, running waits
 * for a prediction, as in PredictCode.
 */
export function TraceCode({ snippet: id, ...prediction }: { snippet: string } & Partial<Prediction>) {
  const hydrated = useHydrated();
  const snippet = getSnippet(id)!;
  const offered = (Object.keys(LANGUAGES) as Language[]).filter((l) => snippet.code[l] != null);
  if (!hydrated) return <CodePlaceholder code={snippet.code[offered[0]]!} />;
  return <TraceInner id={id} offered={offered} prediction={prediction.question != null ? (prediction as Prediction) : null} />;
}

type Traced = { id: number; code: string; language: Language; result: RunResult; run: RunTrace | null };

function TraceInner({ id, offered, prediction }: { id: string; offered: Language[]; prediction: Prediction | null }) {
  const snippet = getSnippet(id)!;
  const [language, setLanguage] = useState<Language>(() => {
    const saved = loadLanguage();
    if (saved && offered.includes(saved)) return saved;
    // TypeScript learners read JavaScript happily when a snippet has no types to show.
    if (saved === 'typescript' && offered.includes('javascript')) return 'javascript';
    return offered[0];
  });
  const [codes, setCodes] = useState<Partial<Record<Language, string>>>(snippet.code);
  const [picked, setPicked] = useState<number | null>(null);
  const [traced, setTraced] = useState<Traced | null>(null);
  const [running, setRunning] = useState(false);
  const [frameLine, setFrameLine] = useState<number | null>(null);
  const { runtime, runtimeState, runtimeDetail } = useRuntime(language);

  const code = codes[language]!;
  const stale = traced != null && (traced.code !== code || traced.language !== language);
  const busy = running || runtimeState === 'loading';
  const locked = prediction != null && picked == null;

  const run = async () => {
    if (running || locked) return;
    setRunning(true);
    const result = await runtime.run({ language, code, entry: '', args: [], limits: LINE_LIMITS, mode: 'lines' });
    setTraced({ id: Date.now(), code, language, result, run: traceFor(result, { code }) });
    setFrameLine(null);
    setRunning(false);
  };

  const onFrame = useCallback(
    (index: number) => {
      const line = traced?.run?.trace.frames[index]?.line;
      setFrameLine(line == null ? null : line + 1);
    },
    [traced],
  );

  return (
    <div className="not-prose space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <LanguagePicker languages={offered} language={language} onChange={setLanguage} />
        <button
          type="button"
          onClick={() => setCodes((prev) => ({ ...prev, [language]: snippet.code[language] }))}
          disabled={code === snippet.code[language]}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken disabled:opacity-40"
        >
          <FiRotateCcw aria-hidden /> Undo my changes
        </button>
      </div>
      <CodeEditor
        value={code}
        onChange={(value) => setCodes((prev) => ({ ...prev, [language]: value }))}
        language={language}
        label={`${snippet.title}: ${LANGUAGES[language].label} code`}
        minLines={4}
        runLine={stale ? null : frameLine}
        errorLine={stale ? null : (traced?.result.error?.line ?? null)}
        onRun={() => void run()}
      />
      {prediction && <PredictCard {...prediction} picked={picked} onPick={setPicked} />}
      <div className="flex flex-wrap items-center gap-3">
        <RunButton onClick={() => void run()} disabled={locked || busy} busy={busy}>
          Run it line by line
        </RunButton>
        <span className="text-xs text-ink-muted" role="status">
          {locked ? 'Make your prediction first.' : statusText(runtimeState, runtimeDetail, running)}
        </span>
      </div>
      {traced && (
        <div className="space-y-3" aria-live="polite">
          {stale && (
            <p className="rounded-lg border border-warn-line bg-warn-soft px-4 py-2 text-sm text-warn-ink">
              You’ve changed the code since this run. Run it again to update the picture.
            </p>
          )}
          {traced.result.error && <ErrorCard error={traced.result.error} />}
        </div>
      )}
      {traced?.run && (
        <RunPicture key={traced.id} run={traced.run} code={traced.code} legend={MEMORY_LEGEND} title="The code" onFrame={onFrame} layout="stacked" keyboard="local" />
      )}
    </div>
  );
}

function CodePlaceholder({ code }: { code: string }) {
  return (
    <div className="not-prose rounded-xl border border-line bg-surface p-4">
      <pre className="font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-soft">{code}</pre>
    </div>
  );
}

function LanguagePicker({ languages, language, onChange }: { languages: Language[]; language: Language; onChange: (l: Language) => void }) {
  if (languages.length < 2) return null;
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Language">
      {languages.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={language === l}
          onClick={() => {
            onChange(l);
            saveLanguage(l);
          }}
          className={`px-3 py-1.5 text-sm transition-colors ${language === l ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'}`}
        >
          {LANGUAGES[l].label}
        </button>
      ))}
    </div>
  );
}

function PredictCard({ question, choices, answer, why, picked, onPick }: Prediction & { picked: number | null; onPick: (i: number) => void }) {
  return (
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
              onClick={() => onPick(i)}
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
  );
}

function RunButton({ onClick, disabled, busy, children }: { onClick: () => void; disabled: boolean; busy: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
    >
      {busy ? <FiLoader aria-hidden className="animate-spin" /> : <FiPlay aria-hidden />}
      {children}
    </button>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { FiAlertTriangle, FiArrowRight, FiCheck, FiLoader, FiPlay, FiRotateCcw, FiX } from 'react-icons/fi';
import { TraceStage } from '@/components/explorer/TraceStage';
import { argsFor, getExercise, type Exercise, type ExerciseInput, type Verdict } from '@/content/exercises';
import type { Trace } from '@/engine/types';
import type { ArrayState } from '@/viz/array/types';
import { CodeEditor } from './editor/CodeEditor';
import { DEFAULT_LIMITS, LANGUAGES, type Language, type RunError, type RunResult } from './protocol';
import { runtimeFor } from './runner';
import { loadCode, loadLanguage, saveCode, saveLanguage } from './storage';
import { printed, RUN_STATS, traceRun } from './trace';

type Outcome = {
  id: number;
  code: string;
  language: Language;
  example: string;
  result: RunResult;
  trace: Trace<ArrayState> | null;
  /** Null when the tests couldn't run at all (a syntax error, no entry function). */
  verdicts: { name: string; verdict: Verdict }[] | null;
};

const NO_PREDICT = { mode: 'watch', density: 'some', setMode: () => {}, setDensity: () => {} } as const;
const noSubscribe = () => () => {};

/**
 * Write the algorithm, run it, and watch your own code drive the array view,
 * with each judged test's verdict alongside. Storage-backed state only exists
 * in the browser, so the interactive part mounts after hydration. Takes a slug,
 * not the exercise: its `check` function can't cross from a server page.
 */
export function Workspace({ slug }: { slug: string }) {
  const exercise = getExercise(slug)!;
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!hydrated) {
    return (
      <div data-workspace="loading" className="rounded-xl border border-line bg-surface p-4">
        <pre className="font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-soft">{exercise.starter.python}</pre>
      </div>
    );
  }
  return <WorkspaceInner exercise={exercise} />;
}

function WorkspaceInner({ exercise }: { exercise: Exercise }) {
  const [language, setLanguage] = useState<Language>(() => loadLanguage() ?? 'python');
  const [codes, setCodes] = useState<Record<Language, string>>(() => {
    const saved = (l: Language) => loadCode(exercise.slug, l) ?? exercise.starter[l];
    return { python: saved('python'), javascript: saved('javascript'), typescript: saved('typescript') };
  });
  const [example, setExample] = useState(exercise.examples[0].id);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [running, setRunning] = useState(false);
  const [frameLine, setFrameLine] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const runtime = runtimeFor(language);
  const status = useSyncExternalStore(
    useCallback((cb: () => void) => runtime.onStatus(cb), [runtime]),
    () => `${runtime.status}|${runtime.detail ?? ''}`,
    () => 'idle|',
  );
  const [runtimeState, runtimeDetail] = status.split('|');

  // Python takes a few seconds to load the first time, so start it with the page.
  useEffect(() => {
    if (language === 'python') void runtime.warm();
  }, [language, runtime]);

  const code = codes[language];
  const stale = outcome != null && (outcome.code !== code || outcome.language !== language);

  const setCode = (value: string) => {
    setCodes((prev) => ({ ...prev, [language]: value }));
    saveCode(exercise.slug, language, value === exercise.starter[language] ? null : value);
  };

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    saveLanguage(next);
    setConfirmReset(false);
  };

  const reset = () => {
    setCode(exercise.starter[language]);
    setConfirmReset(false);
    setOutcome(null);
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    setConfirmReset(false);
    const source = codes[language];
    const entry = language === 'python' ? exercise.entry.python : exercise.entry.js;
    const call = (input: ExerciseInput) =>
      runtime.run({ language, code: source, entry, args: argsFor(input), limits: DEFAULT_LIMITS });

    const shown = exercise.examples.find((e) => e.id === example) ?? exercise.examples[0];
    const result = await call(shown.input);
    // A syntax error or a missing function fails every test the same way; say it once.
    const unrunnable = result.error?.kind === 'syntax' || (result.error != null && result.events.length === 0);
    let verdicts: Outcome['verdicts'] = null;
    if (!unrunnable && result.error?.kind !== 'timeout') {
      verdicts = [];
      for (const test of exercise.tests) {
        const r = await call(test.input);
        verdicts.push({ name: test.name, verdict: exercise.check(test.input, r) });
        // A timeout restarts the runner; don't pay that again for every test.
        if (r.error?.kind === 'timeout') break;
      }
    }
    setOutcome({
      id: (outcome?.id ?? 0) + 1,
      code: source,
      language,
      example: shown.id,
      result,
      trace: traceRun(result, { markSortedAtEnd: exercise.markSortedAtEnd, pointers: exercise.pointers }),
      verdicts,
    });
    setFrameLine(null);
    setRunning(false);
  };

  const onFrame = useCallback(
    (index: number) => {
      const line = outcome?.trace?.frames[index]?.line;
      setFrameLine(line == null ? null : line + 1);
    },
    [outcome],
  );

  const busy = running || runtimeState === 'loading';
  const passed = outcome?.verdicts?.filter((v) => v.verdict.pass).length ?? 0;
  const total = outcome?.verdicts?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Language">
          {(Object.keys(LANGUAGES) as Language[]).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={language === l}
              onClick={() => chooseLanguage(l)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                language === l ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'
              }`}
            >
              {LANGUAGES[l].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          Watch it run on
          <select
            value={example}
            onChange={(e) => setExample(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {exercise.examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {confirmReset ? (
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              Discard your {LANGUAGES[language].label} code?
              <button type="button" onClick={reset} className="rounded-md px-2 py-1.5 text-bad-ink hover:bg-bad-soft">
                Reset
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-sunken">
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={code === exercise.starter[language]}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken disabled:opacity-40"
            >
              <FiRotateCcw aria-hidden /> Reset code
            </button>
          )}
          <button
            type="button"
            onClick={run}
            disabled={busy}
            aria-busy={busy}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? <FiLoader aria-hidden className="animate-spin" /> : <FiPlay aria-hidden />}
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      <CodeEditor
        value={code}
        onChange={setCode}
        language={language}
        label={`Your ${LANGUAGES[language].label} code`}
        runLine={stale ? null : frameLine}
        errorLine={stale ? null : (outcome?.result.error?.line ?? null)}
        onRun={run}
      />
      <p className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
        <span>Ctrl/⌘ + Enter runs your code. Tab indents; press Esc, then Tab, to leave the editor.</span>
        <span role="status">{statusText(runtimeState, runtimeDetail, running)}</span>
      </p>

      {outcome && (
        <div className="space-y-4">
          {stale && (
            <p className="rounded-lg border border-warn-line bg-warn-soft px-4 py-2 text-sm text-warn-ink">
              You’ve changed the code since this run. Run it again to update the picture and the tests.
            </p>
          )}
          <Results outcome={outcome} passed={passed} total={total} exercise={exercise} />
          {outcome.trace && (
            <TraceStage
              key={outcome.id}
              trace={outcome.trace}
              view="array"
              pseudocode={trimTrailingBlank(outcome.code.split('\n'))}
              stats={RUN_STATS}
              legend={exercise.legend}
              predict={NO_PREDICT}
              code={{ title: 'Your code', numberAll: true }}
              share={false}
              onFrame={onFrame}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Results({ outcome, passed, total, exercise }: { outcome: Outcome; passed: number; total: number; exercise: Exercise }) {
  const { result, verdicts } = outcome;
  const output = printed(result);
  const allPass = verdicts != null && total > 0 && passed === total;
  return (
    <div className="space-y-3" aria-live="polite">
      {result.error && <ErrorCard error={result.error} />}
      {verdicts && (
        <section aria-label="Tests" className="rounded-xl border border-line-soft bg-surface shadow-xs">
          <h2
            className={`flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm font-semibold ${
              allPass ? 'text-good-ink' : 'text-ink'
            }`}
          >
            {allPass ? <FiCheck aria-hidden /> : null}
            {allPass ? `All ${total} tests pass.` : `${passed} of ${total} tests pass.`}
            {allPass && (
              <Link href={`/visualisers/${exercise.visualiser}`} className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-accent-ink hover:underline">
                Compare with the built-in visualiser <FiArrowRight aria-hidden />
              </Link>
            )}
          </h2>
          <ul className="divide-y divide-line-soft text-sm">
            {verdicts.map(({ name, verdict }) => (
              <li key={name} className="flex gap-3 px-4 py-2">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${verdict.pass ? 'text-good-ink' : 'text-bad-ink'}`}>
                  {verdict.pass ? <FiCheck aria-hidden /> : <FiX aria-hidden />}
                  {verdict.pass ? 'Pass' : 'Fail'}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{name}</span>
                  <span className="text-ink-soft"> · {verdict.message}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line-soft px-4 py-2 text-xs text-ink-muted">
            Checked in your browser, as practice: passing here isn’t a proof your code is correct.
          </p>
        </section>
      )}
      {output.length > 0 && (
        <section aria-label="Output" className="rounded-xl border border-line-soft bg-surface shadow-xs">
          <h2 className="border-b border-line-soft px-4 py-2 text-sm font-semibold text-ink">Output</h2>
          <pre className="max-h-48 overflow-auto px-4 py-2 font-mono text-[13px] whitespace-pre-wrap text-ink-soft">{output.join('\n')}</pre>
        </section>
      )}
    </div>
  );
}

const ERROR_TITLE: Record<RunError['kind'], string> = {
  syntax: 'Your code doesn’t parse',
  runtime: 'Your code raised an error',
  limit: 'Stopped early',
  timeout: 'Stopped: it took too long',
  internal: 'Something went wrong on our side',
};

function ErrorCard({ error }: { error: RunError }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-bad-line bg-bad-soft px-4 py-3 text-sm">
      <FiAlertTriangle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />
      <div className="min-w-0">
        <p className="font-semibold text-bad-ink">
          {ERROR_TITLE[error.kind]}
          {error.line != null && ` on line ${error.line}`}
        </p>
        <p className="font-mono text-[13px] break-words text-ink">{error.message}</p>
        {error.kind !== 'syntax' && error.kind !== 'internal' && (
          <p className="mt-1 text-ink-soft">The picture below shows everything up to that point.</p>
        )}
      </div>
    </div>
  );
}

function statusText(state: string, detail: string, running: boolean): string {
  if (running) return 'Running your code…';
  if (state === 'loading') return detail || 'Starting…';
  if (state === 'failed') return `The runner couldn’t start${detail ? `: ${detail}` : ''}.`;
  if (state === 'ready') return 'Ready.';
  return '';
}

function trimTrailingBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out.at(-1)!.trim() === '') out.pop();
  return out;
}


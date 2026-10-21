'use client';

import Link from 'next/link';
import { FiAlertTriangle, FiArrowRight, FiCheck, FiX } from 'react-icons/fi';
import { TraceStage } from '@/components/explorer/TraceStage';
import type { Exercise } from '@/content/exercises';
import type { LegendEntry } from '@/engine/module';
import type { Trace } from '@/engine/types';
import type { RunError } from './protocol';
import { printed, type RunTrace } from './trace';
import type { Outcome } from './useExerciseRun';

const NO_PREDICT = { mode: 'watch', density: 'some', setMode: () => {}, setDensity: () => {} } as const;

/** The memory diagram's cues, whatever the exercise draws in its own view. */
export const MEMORY_LEGEND: readonly LegendEntry[] = [
  { neutral: 'A name or object' },
  { mark: 'write', label: 'Changed on this line' },
];

/**
 * What a run produced: an error card, each judged test's verdict, anything the
 * code printed, and the run itself on the array, grid or memory view beside the learner’s code.
 */
export function RunOutput({
  outcome,
  exercise,
  stale,
  onFrame,
  layout = 'wide',
  keyboard = 'page',
}: {
  outcome: Outcome;
  exercise: Exercise;
  /** The code changed since this run. */
  stale: boolean;
  onFrame: (index: number) => void;
  layout?: 'wide' | 'stacked';
  keyboard?: 'page' | 'local';
}) {
  return (
    <div className="space-y-4">
      {stale && (
        <p className="rounded-well bg-warn-soft px-4 py-3 text-sm text-warn-ink">
          You’ve changed the code since this run. Run it again to update the picture and the tests.
        </p>
      )}
      <Results outcome={outcome} exercise={exercise} />
      {outcome.run && (
        <RunPicture
          key={outcome.id}
          run={outcome.run}
          code={outcome.code}
          legend={outcome.run.view === 'memory' ? MEMORY_LEGEND : exercise.legend}
          onFrame={onFrame}
          layout={layout}
          keyboard={keyboard}
        />
      )}
    </div>
  );
}

/** A run on its view, beside the code that made it. Remount it (a new `key`) for every run. */
export function RunPicture({
  run,
  code,
  legend,
  title = 'Your code',
  onFrame,
  layout = 'wide',
  keyboard = 'page',
}: {
  run: RunTrace;
  code: string;
  legend: readonly LegendEntry[];
  title?: string;
  onFrame: (index: number) => void;
  layout?: 'wide' | 'stacked';
  keyboard?: 'page' | 'local';
}) {
  return (
    <TraceStage<unknown>
      trace={run.trace as Trace<unknown>}
      view={run.view}
      pseudocode={trimTrailingBlank(code.split('\n'))}
      stats={run.stats}
      legend={legend}
      predict={NO_PREDICT}
      code={{ title, numberAll: true }}
      share={false}
      onFrame={onFrame}
      layout={layout}
      keyboard={keyboard}
    />
  );
}

function Results({ outcome, exercise }: { outcome: Outcome; exercise: Exercise }) {
  const { result, verdicts } = outcome;
  // The memory view shows what was printed so far, step by step.
  const output = outcome.run?.view === 'memory' ? [] : printed(result);
  const total = verdicts?.length ?? 0;
  const passed = verdicts?.filter((v) => v.verdict.pass).length ?? 0;
  const allPass = verdicts != null && total > 0 && passed === total;
  return (
    <div className="space-y-3" aria-live="polite">
      {result.error && <ErrorCard error={result.error} />}
      {verdicts && (
        <div role="group" aria-label="Tests" className="flex flex-col gap-3 rounded-card bg-surface p-5">
          <div
            className={`flex flex-wrap items-center gap-2 font-display text-title-card ${allPass ? 'text-good-ink' : 'text-ink'}`}
          >
            {allPass ? <FiCheck aria-hidden /> : null}
            {allPass ? `All ${total} tests pass.` : `${passed} of ${total} tests pass.`}
            {allPass && (
              <Link
                href={`/visualisers/${exercise.visualiser}`}
                className="ml-auto inline-flex items-center gap-1 font-sans text-[13px] font-semibold text-accent-ink hover:underline"
              >
                Compare with the built-in visualiser <FiArrowRight aria-hidden />
              </Link>
            )}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {verdicts.map(({ name, verdict }) => (
              <li key={name} className="flex gap-3 rounded-[14px] bg-sunken px-3.5 py-2.5">
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
          <p className="text-xs text-ink-muted">
            Checked in your browser, as practice: passing here isn’t a proof your code is correct.
          </p>
        </div>
      )}
      {output.length > 0 && (
        <div role="group" aria-label="Output" className="flex flex-col gap-2 rounded-card bg-surface p-5">
          <div className="text-[13px] font-semibold tracking-[0.06em] text-ink-muted uppercase">Output</div>
          <pre className="max-h-48 overflow-auto rounded-well bg-code px-4 py-3 font-mono text-[13px] whitespace-pre-wrap text-code-ink">{output.join('\n')}</pre>
        </div>
      )}
    </div>
  );
}

const ERROR_TITLE: Record<RunError['kind'], string> = {
  syntax: 'Your code doesn’t parse',
  compile: 'Your code didn’t compile',
  runtime: 'Your code raised an error',
  limit: 'Stopped early',
  timeout: 'Stopped: it took too long',
  internal: 'Something went wrong on our side',
};

export function ErrorCard({ error }: { error: RunError }) {
  return (
    <div role="alert" className="flex gap-3 rounded-well bg-bad-soft px-4 py-3.5 text-sm">
      <FiAlertTriangle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />
      <div className="min-w-0">
        <p className="font-semibold text-bad-title">
          {ERROR_TITLE[error.kind]}
          {error.line != null && ` on line ${error.line}`}
        </p>
        <p className="font-mono text-[13px] break-words whitespace-pre-wrap text-bad-title">{error.message}</p>
        {error.kind !== 'syntax' && error.kind !== 'compile' && error.kind !== 'internal' && (
          <p className="mt-1 text-bad-ink">The picture below shows everything up to that point.</p>
        )}
      </div>
    </div>
  );
}

/** One line for the runner's state, shown under the code. */
export function statusText(state: string, detail: string, running: boolean): string {
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

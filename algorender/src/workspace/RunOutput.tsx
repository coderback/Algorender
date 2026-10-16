'use client';

import Link from 'next/link';
import { FiAlertTriangle, FiArrowRight, FiCheck, FiX } from 'react-icons/fi';
import { TraceStage } from '@/components/explorer/TraceStage';
import type { Exercise } from '@/content/exercises';
import type { Trace } from '@/engine/types';
import type { RunError } from './protocol';
import { printed } from './trace';
import type { Outcome } from './useExerciseRun';

const NO_PREDICT = { mode: 'watch', density: 'some', setMode: () => {}, setDensity: () => {} } as const;

/**
 * What a run produced: an error card, each judged test's verdict, anything the
 * code printed, and the run itself on the array or grid view beside the learner’s code.
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
        <p className="rounded-lg border border-warn-line bg-warn-soft px-4 py-2 text-sm text-warn-ink">
          You’ve changed the code since this run. Run it again to update the picture and the tests.
        </p>
      )}
      <Results outcome={outcome} exercise={exercise} />
      {outcome.run && (
        <TraceStage<unknown>
          key={outcome.id}
          trace={outcome.run.trace as Trace<unknown>}
          view={outcome.run.view}
          pseudocode={trimTrailingBlank(outcome.code.split('\n'))}
          stats={outcome.run.stats}
          legend={exercise.legend}
          predict={NO_PREDICT}
          code={{ title: 'Your code', numberAll: true }}
          share={false}
          onFrame={onFrame}
          layout={layout}
          keyboard={keyboard}
        />
      )}
    </div>
  );
}

function Results({ outcome, exercise }: { outcome: Outcome; exercise: Exercise }) {
  const { result, verdicts } = outcome;
  const output = printed(result);
  const total = verdicts?.length ?? 0;
  const passed = verdicts?.filter((v) => v.verdict.pass).length ?? 0;
  const allPass = verdicts != null && total > 0 && passed === total;
  return (
    <div className="space-y-3" aria-live="polite">
      {result.error && <ErrorCard error={result.error} />}
      {verdicts && (
        <div role="group" aria-label="Tests" className="rounded-xl border border-line-soft bg-surface shadow-xs">
          <div
            className={`flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm font-semibold ${
              allPass ? 'text-good-ink' : 'text-ink'
            }`}
          >
            {allPass ? <FiCheck aria-hidden /> : null}
            {allPass ? `All ${total} tests pass.` : `${passed} of ${total} tests pass.`}
            {allPass && (
              <Link
                href={`/visualisers/${exercise.visualiser}`}
                className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-accent-ink hover:underline"
              >
                Compare with the built-in visualiser <FiArrowRight aria-hidden />
              </Link>
            )}
          </div>
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
        </div>
      )}
      {output.length > 0 && (
        <div role="group" aria-label="Output" className="rounded-xl border border-line-soft bg-surface shadow-xs">
          <div className="border-b border-line-soft px-4 py-2 text-sm font-semibold text-ink">Output</div>
          <pre className="max-h-48 overflow-auto px-4 py-2 font-mono text-[13px] whitespace-pre-wrap text-ink-soft">{output.join('\n')}</pre>
        </div>
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

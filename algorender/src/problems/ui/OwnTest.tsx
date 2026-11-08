'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { FiEye, FiPlay, FiRotateCcw } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { Field, TextAreaField } from '@/components/ui/Field';
import type { Json, RunError } from '@/workspace/protocol';
import { ErrorCard } from '@/workspace/RunOutput';
import { methodIn, nameIn } from '../codegen';
import { CALLS, describe, type CustomText } from '../custom';
import { formatValue, watchable, type CaseVerdict, type JudgeCase, type ProblemSpec } from '../judge';
import { isServerLanguage, type ProblemLanguage } from '../languages';

/** A run of the learner's own test: what their code gave on it. */
export type OwnRun = {
  test: JudgeCase;
  code: string;
  language: ProblemLanguage;
  /** The typed text it ran, to tell when the fields have changed since. */
  text: string;
  verdict: CaseVerdict | null;
  output: string[];
  /** An error that stopped the run before the test (a syntax error, no entry function, a compile error). */
  fatal: RunError | null;
};

/** The most calls of a design problem's run listed with their answers. */
const LISTED = 200;

/**
 * "Your own test", under the editor: a field per parameter (or the calls, one
 * per line, for a design problem), started from the first example, and the
 * answer the code gives. There's no expected answer: the learner works it out.
 */
export function OwnTest({
  spec,
  language,
  text,
  untouched,
  errors,
  run,
  stale,
  busy,
  notice,
  onChange,
  onReset,
  onRun,
  onWatch,
}: {
  spec: ProblemSpec;
  language: ProblemLanguage;
  text: CustomText;
  /** Still the first example, as the language writes it. */
  untouched: boolean;
  /** What's wrong with each field ('' for the whole test), after a run was tried. */
  errors: Record<string, string> | null;
  run: OwnRun | null;
  stale: boolean;
  busy: boolean;
  /** Why the server judge didn't answer, shown here (sign in, a quota). */
  notice?: ReactNode;
  onChange: (field: string, value: string) => void;
  onReset: () => void;
  onRun: () => void;
  onWatch: (test: JudgeCase, memory: boolean) => void;
}) {
  const runKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    }
  };
  const typing = { mono: true, spellCheck: false, autoCapitalize: 'off', autoComplete: 'off', autoCorrect: 'off', onKeyDown: runKey } as const;
  const design = spec.design;
  const calls = text[CALLS] ?? '';

  return (
    <section aria-labelledby="own-test-title" className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="own-test-title" className="text-[17px] font-bold text-ink">
          Your own test
        </h2>
        <p className="text-sm text-ink-soft">Try any input, such as an edge case you’re unsure about. There’s no expected answer: work out what it should be, then compare.</p>
      </div>
      {design ? (
        <TextAreaField
          id="own-calls"
          label="Calls, one per line"
          rows={Math.min(10, Math.max(3, calls.split('\n').length + 1))}
          value={calls}
          onChange={(e) => onChange(CALLS, e.target.value)}
          hint={`The first line makes the object, as in ${design.class}(${design.init.map((p) => nameIn(p.name, language)).join(', ')}); each line after it calls a method.`}
          error={errors?.[CALLS]}
          {...typing}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(spec.signature?.params ?? []).map((p) => (
            <Field
              key={p.name}
              id={`own-${p.name}`}
              label={<span className="font-mono">{nameIn(p.name, language)}</span>}
              value={text[p.name] ?? ''}
              onChange={(e) => onChange(p.name, e.target.value)}
              hint={capital(describe(p.type, language))}
              error={errors?.[p.name]}
              {...typing}
            />
          ))}
        </div>
      )}
      {errors?.[''] && (
        <p role="alert" className="rounded-well bg-bad-soft px-4 py-3 text-sm text-bad-ink">
          {errors['']}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button kind="accent" size="s" icon={<FiPlay aria-hidden />} onClick={onRun} disabled={busy} aria-keyshortcuts="Control+Enter Meta+Enter">
          Run your test
        </Button>
        <Button kind="ghost" size="s" icon={<FiRotateCcw aria-hidden />} onClick={onReset} disabled={untouched}>
          Back to example 1
        </Button>
        <span className="hidden text-xs text-ink-muted sm:inline">Ctrl/⌘ + Enter in a field runs it</span>
      </div>
      {notice}
      {run && <OwnResult spec={spec} run={run} stale={stale} busy={busy} onWatch={onWatch} />}
    </section>
  );
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

const OUTCOME = {
  ran: { label: 'finished', className: 'text-ink-soft' },
  pass: { label: 'finished', className: 'text-ink-soft' },
  fail: { label: 'finished', className: 'text-ink-soft' },
  error: { label: 'error', className: 'text-bad-ink' },
  timeout: { label: 'out of time', className: 'text-warn-ink' },
} as const;

function OwnResult({ spec, run, stale, busy, onWatch }: { spec: ProblemSpec; run: OwnRun; stale: boolean; busy: boolean; onWatch: (test: JudgeCase, memory: boolean) => void }) {
  const { verdict: v, fatal, output, test, language } = run;
  const outcome = v && OUTCOME[v.status];
  return (
    <div role="group" aria-label="Your test’s result" aria-live="polite" className="flex flex-col gap-2.5 rounded-well bg-sunken px-4 py-3.5 text-sm">
      {stale && <p className="text-warn-ink">You’ve changed the code or the test since this run. Run it again to update it.</p>}
      {fatal && <ErrorCard error={fatal} />}
      {v && outcome && (
        <>
          <p className="font-semibold text-ink">
            Your test <span className={`font-normal ${outcome.className}`}>· {outcome.label}</span>
            {v.status !== 'timeout' && <span className="font-normal text-ink-muted"> · {v.ms} ms</span>}
          </p>
          {spec.design ? (
            <CallAnswers test={test} got={Array.isArray(v.got) ? v.got : []} failed={v.status === 'error'} language={language} />
          ) : (
            v.got !== undefined && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-ink-muted">Your answer</dt>
                <dd className="font-mono text-[13px] break-words text-ink">{formatValue(v.got as Json, language, 100)}</dd>
              </dl>
            )
          )}
          {v.status !== 'ran' && <p className="text-ink-soft">{v.message}</p>}
        </>
      )}
      {output.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted">Printed</p>
          <pre className="max-h-40 overflow-auto rounded-[12px] bg-code px-3 py-2 font-mono text-[13px] whitespace-pre-wrap text-code-ink">{output.join('\n')}</pre>
        </div>
      )}
      {!fatal &&
        (isServerLanguage(language) ? (
          <p className="text-xs text-ink-muted">Watching a run step by step works in Python, JavaScript and TypeScript, which run in your browser.</p>
        ) : watchable(test) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button kind="accent" size="s" icon={<FiEye aria-hidden />} onClick={() => onWatch(test, spec.view === 'memory')} disabled={busy || stale}>
              Watch your code on this test
            </Button>
            {spec.view !== 'memory' && (
              <Button kind="onTrack" size="s" onClick={() => onWatch(test, true)} disabled={busy || stale}>
                Line by line, with memory
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">This test is too big to watch step by step; a smaller one shows the same steps more clearly.</p>
        ))}
    </div>
  );
}

/** A design problem's calls, each with what it gave, up to the one that failed. */
function CallAnswers({ test, got, failed, language }: { test: JudgeCase; got: Json[]; failed: boolean; language: ProblemLanguage }) {
  const calls = test.calls ?? [];
  const shown = calls.slice(0, Math.min(calls.length, got.length + (failed ? 1 : 0), LISTED));
  return (
    <div>
      <p className="text-xs text-ink-muted">Your answers</p>
      <ol className="mt-1 flex max-h-64 flex-col gap-0.5 overflow-auto font-mono text-[13px]">
        {shown.map(([method, ...args], i) => (
          <li key={i} className="break-words">
            <span className="text-ink-soft">
              {i === 0 ? method : methodIn(method, language)}({args.map((a) => formatValue(a, language)).join(', ')})
            </span>
            {i > 0 && i < got.length && (
              <>
                <span aria-hidden className="text-ink-muted">
                  {' '}
                  →{' '}
                </span>
                <span className="sr-only"> gives </span>
                <span className="text-ink">{formatValue(got[i], language)}</span>
              </>
            )}
            {i >= got.length && <span className="text-bad-ink"> failed</span>}
          </li>
        ))}
      </ol>
      {shown.length === LISTED && calls.length > LISTED && <p className="mt-1 text-xs text-ink-muted">… and {calls.length - LISTED} more calls</p>}
    </div>
  );
}

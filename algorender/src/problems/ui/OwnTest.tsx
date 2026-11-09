'use client';

import Link from 'next/link';
import type { KeyboardEvent, ReactNode } from 'react';
import { FiCheck, FiEye, FiPlay, FiRotateCcw, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { Field, TextAreaField } from '@/components/ui/Field';
import type { Json, RunError } from '@/workspace/protocol';
import { ErrorCard } from '@/workspace/RunOutput';
import { methodIn, nameIn } from '../codegen';
import { CALLS, describe, type CustomText } from '../custom';
import { formatValue, ownMismatch, same, watchable, type CaseVerdict, type JudgeCase, type ProblemSpec } from '../judge';
import { isServerLanguage, type ProblemLanguage } from '../languages';
import type { ExpectedState } from './serverJudge';

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
 * answer the code gives. Signed in, the expected answer (our solution's, from
 * the server) shows beside it, and the two are compared.
 */
export function OwnTest({
  spec,
  language,
  text,
  untouched,
  errors,
  run,
  expected,
  signInHref,
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
  /** The expected answer to the run's input, once asked for. */
  expected: ExpectedState | null;
  /** Where signing in starts, coming back to this problem. */
  signInHref: string;
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
        <p className="text-sm text-ink-soft">Try any input, such as an edge case you’re unsure about. Work out what it should give, then compare with the expected answer from our solution.</p>
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
      {run && <OwnResult spec={spec} run={run} expected={expected} signInHref={signInHref} stale={stale} busy={busy} onWatch={onWatch} />}
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

function OwnResult({
  spec,
  run,
  expected,
  signInHref,
  stale,
  busy,
  onWatch,
}: {
  spec: ProblemSpec;
  run: OwnRun;
  expected: ExpectedState | null;
  signInHref: string;
  stale: boolean;
  busy: boolean;
  onWatch: (test: JudgeCase, memory: boolean) => void;
}) {
  const { verdict: v, fatal, output, test, language } = run;
  const outcome = v && OUTCOME[v.status];
  const answer = expected?.state === 'answer' ? expected.expected : undefined;
  // Compared only when the code finished: an error has its own message.
  const wrong = v?.status === 'ran' && answer !== undefined ? ownMismatch(spec, test, v.got as Json, answer, language) : undefined;
  // A problem with several right answers shows ours as one of them.
  const expectedLabel = spec.check ? 'A right answer' : 'Expected';
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
            <CallAnswers
              spec={spec}
              test={test}
              got={Array.isArray(v.got) ? v.got : []}
              expected={Array.isArray(answer) ? answer : null}
              failed={v.status === 'error'}
              language={language}
            />
          ) : (
            (v.got !== undefined || answer !== undefined || expected?.state === 'loading') && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                {v.got !== undefined && (
                  <>
                    <dt className="text-ink-muted">Your answer</dt>
                    <dd className="font-mono text-[13px] break-words text-ink">{formatValue(v.got as Json, language, 100)}</dd>
                  </>
                )}
                {answer !== undefined && (
                  <>
                    <dt className="text-ink-muted">{expectedLabel}</dt>
                    <dd className="font-mono text-[13px] break-words text-ink">{formatValue(answer, language, 100)}</dd>
                  </>
                )}
                {expected?.state === 'loading' && (
                  <>
                    <dt className="text-ink-muted">{expectedLabel}</dt>
                    <dd className="text-ink-muted">Working it out…</dd>
                  </>
                )}
              </dl>
            )
          )}
          {v.status !== 'ran' && <p className="text-ink-soft">{v.message}</p>}
          {wrong === null && (
            <p className="flex items-center gap-1.5 font-semibold text-good-ink">
              <FiCheck aria-hidden className="shrink-0" />
              {spec.check ? 'Right: it’s one of the right answers.' : 'Matches the expected answer.'}
            </p>
          )}
          {wrong && (
            <p className="flex items-start gap-1.5 text-bad-ink">
              <FiX aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Doesn’t match.</span> {wrong}
              </span>
            </p>
          )}
        </>
      )}
      {v && spec.design && expected?.state === 'loading' && <p className="text-xs text-ink-muted">Working out the expected answers…</p>}
      <ExpectedNote expected={expected} signInHref={signInHref} />
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

/** Why there's no expected answer to show: sign in, our solution has none for this input, or the server can't say now. */
function ExpectedNote({ expected, signInHref }: { expected: ExpectedState | null; signInHref: string }) {
  if (expected?.state === 'none') return <p className="text-ink-soft">{expected.message}</p>;
  if (expected?.state === 'unavailable') return <p className="text-xs text-ink-muted">{expected.message}</p>;
  if (expected?.state !== 'sign-in') return null;
  return (
    <p className="text-xs text-ink-muted">
      <Link href={signInHref} className="font-medium text-accent-ink hover:underline">
        Sign in
      </Link>{' '}
      to see the expected answer too: it comes from our solution, which runs on our server.
    </p>
  );
}

/** A design problem's calls, each with what it gave, up to the one that failed, and the expected answer where it differs. */
function CallAnswers({
  spec,
  test,
  got,
  expected,
  failed,
  language,
}: {
  spec: ProblemSpec;
  test: JudgeCase;
  got: Json[];
  expected: Json[] | null;
  failed: boolean;
  language: ProblemLanguage;
}) {
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
            {i > 0 && expected && i < expected.length && (i >= got.length || !same(expected[i], got[i], spec.compare)) && (
              <span className={i < got.length ? 'text-bad-ink' : 'text-ink-muted'}> · expected {formatValue(expected[i], language)}</span>
            )}
          </li>
        ))}
      </ol>
      {shown.length === LISTED && calls.length > LISTED && <p className="mt-1 text-xs text-ink-muted">… and {calls.length - LISTED} more calls</p>}
    </div>
  );
}

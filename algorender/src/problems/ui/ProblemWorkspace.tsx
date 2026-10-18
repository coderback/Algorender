'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { FiArrowRight, FiCheck, FiClock, FiEye, FiLoader, FiPlay, FiRotateCcw, FiSend, FiServer, FiX } from 'react-icons/fi';
import { TutorPanel, type TutorResults } from '@/components/tutor/TutorPanel';
import type { LegendEntry } from '@/engine/module';
import { CodeEditor } from '@/workspace/editor/CodeEditor';
import { authClient } from '@/lib/auth-client';
import type { Json, RunError, RunResult } from '@/workspace/protocol';
import { ErrorCard, MEMORY_LEGEND, RunPicture, statusText } from '@/workspace/RunOutput';
import { loadCode, loadProblemLanguage, saveCode, saveLanguage, saveProblemLanguage } from '@/workspace/storage';
import { printed, type RunTrace } from '@/workspace/trace';
import { TREE_RUN_LEGEND } from '@/workspace/traceTree';
import { useRuntime } from '@/workspace/useRuntime';
import { methodIn, nameIn, stub } from '../codegen';
import { formatValue, judgeRequest, timeLimit, verdict, watchable, watchRequest, type CaseVerdict, type JudgeCase, type ProblemSpec } from '../judge';
import { isServerLanguage, PROBLEM_LANGUAGE_IDS, PROBLEM_LANGUAGES, type ProblemLanguage, type ServerLanguage } from '../languages';
import { receiveSubmission, recordSubmission } from '../progress';
import { replayTrace } from '../replay';
import { runOnServer } from './serverJudge';

/** One judged test's outcome. */
type Checked = { test: JudgeCase; verdict: CaseVerdict; output: string[] };

/** A run of the examples ('run') or of every test ('submit'). */
type Judged = {
  kind: 'run' | 'submit';
  code: string;
  language: ProblemLanguage;
  checked: Checked[];
  /** Tests left unrun: a timeout stops the judging, and a syntax error or missing function means nothing can run. */
  skipped: number;
  /** An error that stopped every test the same way (a syntax error, no entry function). */
  fatal: RunError | null;
};

type Watching = { test: JudgeCase; memory: boolean; code: string; run: RunTrace | null; error: RunError | null };

const noSubscribe = () => () => {};
const codeSlot = (slug: string) => `problem:${slug}`;

/**
 * The editor, the judge and the replays for one problem. The statement (a
 * server-rendered node) sits beside it, and a replay plays full width below
 * both. Storage-backed state only exists in the browser, so the interactive
 * part mounts after hydration.
 */
export function ProblemWorkspace({
  spec,
  statement,
  next,
  tutor = false,
}: {
  spec: ProblemSpec;
  statement: ReactNode;
  next?: { slug: string; title: string };
  /** The AI tutor is switched on (its server settings exist). */
  tutor?: boolean;
}) {
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated ? (
    <Solver spec={spec} statement={statement} next={next} tutor={tutor} />
  ) : (
    <Columns statement={statement}>
      <div data-workspace="loading" className="rounded-xl border border-line bg-surface p-4">
        <pre className="font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-soft">{stub(spec, 'python')}</pre>
      </div>
    </Columns>
  );
}

function Columns({ statement, children }: { statement: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0">{statement}</div>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

function Solver({ spec, statement, next, tutor }: { spec: ProblemSpec; statement: ReactNode; next?: { slug: string; title: string }; tutor: boolean }) {
  /** The line the tutor last pointed at. */
  const [pointLine, setPointLine] = useState<number | null>(null);
  const [language, setLanguage] = useState<ProblemLanguage>(() => loadProblemLanguage() ?? 'python');
  const [codes, setCodes] = useState(
    () => Object.fromEntries(PROBLEM_LANGUAGE_IDS.map((l) => [l, loadCode(codeSlot(spec.slug), l) ?? stub(spec, l)])) as Record<ProblemLanguage, string>,
  );
  /** Why the server judge didn't answer: the learner isn't signed in, or a message (a quota, an outage). */
  const [notice, setNotice] = useState<'sign-in' | string | null>(null);
  const session = authClient.useSession();
  const signedIn = session.data != null;
  const onServer = isServerLanguage(language);
  const [judged, setJudged] = useState<Judged | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [watching, setWatching] = useState<Watching | null>(null);
  const [frameLine, setFrameLine] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // Java, C++ and Go don't run in the browser; the JavaScript runner stands by unused (it starts on its first run).
  const { runtime, runtimeState, runtimeDetail } = useRuntime(onServer ? 'javascript' : language);

  const code = codes[language];
  const running = progress != null;
  const busy = running || (!onServer && runtimeState === 'loading');
  const stale = judged != null && (judged.code !== code || judged.language !== language);

  const setCode = (value: string) => {
    setCodes((prev) => ({ ...prev, [language]: value }));
    saveCode(codeSlot(spec.slug), language, value === stub(spec, language) ? null : value);
  };

  const chooseLanguage = (l: ProblemLanguage) => {
    setLanguage(l);
    saveProblemLanguage(l);
    if (!isServerLanguage(l)) saveLanguage(l);
    setConfirmReset(false);
    setNotice(null);
  };

  const judge = async (kind: 'run' | 'submit') => {
    if (busy) return;
    setNotice(null);
    if (isServerLanguage(language)) return judgeOnServer(kind, language);
    const tests = kind === 'run' ? spec.cases.filter((c) => c.group === 'example') : spec.cases;
    const checked: Checked[] = [];
    let fatal: RunError | null = null;
    setWatching(null);
    setFrameLine(null);
    for (const test of tests) {
      setProgress({ done: checked.length, total: tests.length });
      const result = await runtime.run(judgeRequest(spec, test, language, code));
      if (unrunnable(result)) {
        fatal = result.error;
        break;
      }
      const v = verdict(spec, test, result, language);
      checked.push({ test, verdict: v, output: printed(result) });
      // A timeout restarts the runner; don't pay that again for every test.
      if (v.status === 'timeout') break;
    }
    const outcome: Judged = { kind, code, language, checked, skipped: tests.length - checked.length, fatal };
    setJudged(outcome);
    setSelected(firstFailure(outcome)?.test.id ?? checked[0]?.test.id ?? null);
    setProgress(null);
    if (kind === 'submit') {
      const failed = checked.filter((c) => c.verdict.status !== 'pass').length + outcome.skipped;
      recordSubmission(spec.slug, language, { passed: !fatal && failed === 0, tests: tests.length, failed: fatal ? tests.length : failed });
    }
  };

  /** Java, C++ and Go: one request compiles the code and judges it on every test, on the server, which records a submission itself. */
  const judgeOnServer = async (kind: 'run' | 'submit', lang: ServerLanguage) => {
    setWatching(null);
    setFrameLine(null);
    setProgress({ done: 0, total: 1 });
    const answer = await runOnServer(spec.slug, lang, code, kind);
    setProgress(null);
    if (!answer.ok) {
      setNotice(answer.status === 401 ? 'sign-in' : answer.message);
      return;
    }
    const byId = new Map(spec.cases.map((c) => [c.id, c]));
    const checked = answer.body.checked.flatMap((c) => {
      const test = byId.get(c.id);
      return test ? [{ test, verdict: c.verdict, output: c.output }] : [];
    });
    const outcome: Judged = { kind, code, language: lang, checked, skipped: answer.body.skipped, fatal: answer.body.fatal };
    setJudged(outcome);
    setSelected(firstFailure(outcome)?.test.id ?? checked[0]?.test.id ?? null);
    if (answer.body.event) receiveSubmission(answer.body.event);
  };

  const watch = async (test: JudgeCase, memory: boolean) => {
    if (busy || isServerLanguage(language)) return;
    setProgress({ done: 0, total: 1 });
    const result = await runtime.run(watchRequest(spec, test, language, code, memory));
    setWatching({ test, memory, code, run: replayTrace(result, code, spec.view, memory), error: result.error });
    setFrameLine(null);
    setProgress(null);
    requestAnimationFrame(() => document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const errorLine = !stale && judged ? (judged.fatal?.line ?? null) : null;

  return (
    <>
      <Columns statement={statement}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-line" role="group" aria-label="Language">
            {PROBLEM_LANGUAGE_IDS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={language === l}
                onClick={() => chooseLanguage(l)}
                title={isServerLanguage(l) ? 'Runs on our server' : 'Runs in your browser'}
                className={`px-3 py-1.5 text-sm transition-colors ${l === 'java' ? 'border-l-2 border-line' : ''} ${
                  language === l ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'
                }`}
              >
                {PROBLEM_LANGUAGES[l].label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {confirmReset ? (
              <span className="flex items-center gap-2 text-sm text-ink-soft">
                Discard your {PROBLEM_LANGUAGES[language].label} code?
                <button
                  type="button"
                  onClick={() => {
                    setCode(stub(spec, language));
                    setConfirmReset(false);
                    setJudged(null);
                  }}
                  className="rounded-md px-2 py-1.5 text-bad-ink hover:bg-bad-soft"
                >
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
                disabled={code === stub(spec, language)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken disabled:opacity-40"
              >
                <FiRotateCcw aria-hidden /> Reset code
              </button>
            )}
            <button
              type="button"
              onClick={() => void judge('run')}
              disabled={busy}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-sunken disabled:opacity-60"
            >
              <FiPlay aria-hidden /> Run examples
            </button>
            <button
              type="button"
              onClick={() => void judge('submit')}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? <FiLoader aria-hidden className="animate-spin" /> : <FiSend aria-hidden />}
              Submit
            </button>
          </div>
        </div>
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          label={`Your ${PROBLEM_LANGUAGES[language].label} code`}
          runLine={watching && watching.code === code ? frameLine : null}
          errorLine={errorLine}
          pointLine={pointLine}
          onRun={() => void judge('run')}
          minLines={14}
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
          <span>Ctrl/⌘ + Enter runs the examples. Your code is kept in this browser.</span>
          <span role="status">
            {onServer
              ? running
                ? 'Compiling and running on our server…'
                : ''
              : progress && progress.total > 1
                ? `Running test ${progress.done + 1} of ${progress.total}…`
                : statusText(runtimeState, runtimeDetail, running)}
          </span>
        </div>
        {onServer && <ServerNote language={language} signedIn={signedIn} slug={spec.slug} />}
        {notice && notice !== 'sign-in' && (
          <p role="alert" className="rounded-lg border border-warn-line bg-warn-soft px-4 py-2 text-sm text-warn-ink">
            {notice}
          </p>
        )}
        {notice === 'sign-in' && onServer && <SignInCard language={language} slug={spec.slug} />}
        {judged && (
          <Results
            spec={spec}
            judged={judged}
            stale={stale}
            selected={selected}
            onSelect={setSelected}
            onWatch={(test, memory) => void watch(test, memory)}
            busy={busy}
            next={next}
          />
        )}
        {tutor && (
          <TutorPanel
            item={{ kind: 'problem', slug: spec.slug }}
            language={language}
            code={code}
            results={judged && !stale ? tutorResults(judged) : undefined}
            onPoint={setPointLine}
          />
        )}
      </Columns>
      {watching && (
        <section id="watch" aria-labelledby="watch-title" className="mt-6 scroll-mt-24 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="watch-title" className="text-xl font-semibold text-ink">
              Watching {watching.test.label.toLowerCase()}
              {watching.memory ? ', line by line' : ''}
            </h2>
            {spec.view !== 'memory' && (
              <button
                type="button"
                onClick={() => void watch(watching.test, !watching.memory)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-accent-ink hover:bg-sunken disabled:opacity-60"
              >
                <FiEye aria-hidden /> {watching.memory ? `Show it on the ${spec.view}` : 'Line by line, with memory'}
              </button>
            )}
          </div>
          {watching.error && <ErrorCard error={watching.error} />}
          {watching.error && !watching.memory && spec.view !== 'memory' && (
            <p className="text-sm text-ink-soft">If the view can’t follow what your code does, watch it line by line instead: the memory diagram shows any code.</p>
          )}
          {watching.run && (
            <RunPicture
              key={`${watching.test.id}:${watching.memory}:${watching.code}`}
              run={watching.run}
              code={watching.code}
              legend={legendFor(watching.run.view)}
              onFrame={(i) => {
                const line = watching.run?.trace.frames[i]?.line;
                setFrameLine(line == null ? null : line + 1);
              }}
            />
          )}
        </section>
      )}
    </>
  );
}

/** Under the editor in Java, C++ and Go: where the code runs, and what that needs. */
function ServerNote({ language, signedIn, slug }: { language: ServerLanguage; signedIn: boolean; slug: string }) {
  const name = PROBLEM_LANGUAGES[language].label;
  return (
    <p className="flex items-start gap-2 text-sm text-ink-soft">
      <FiServer aria-hidden className="mt-0.5 shrink-0" />
      {signedIn ? (
        <span>{name} is compiled and judged on our server, in a sandbox, so a run takes a few seconds.</span>
      ) : (
        <span>
          {name} runs on our server, so it needs an account:{' '}
          <Link href={signInHref(slug)} className="font-medium text-accent-ink hover:underline">
            sign in
          </Link>{' '}
          to run it. Python, JavaScript and TypeScript run in your browser without one.
        </span>
      )}
    </p>
  );
}

function SignInCard({ language, slug }: { language: ServerLanguage; slug: string }) {
  return (
    <div role="alert" className="rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-sm text-ink">
      <p className="font-semibold">Sign in to run {PROBLEM_LANGUAGES[language].label}</p>
      <p className="mt-1 text-ink-soft">Java, C++ and Go are compiled on our server, which needs an account. Your code stays in this browser while you sign in.</p>
      <Link href={signInHref(slug)} className="mt-2 inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
        Sign in or create an account <FiArrowRight aria-hidden />
      </Link>
    </div>
  );
}

const signInHref = (slug: string) => `/account?next=${encodeURIComponent(`/practice/${slug}`)}`;

/** A result that means no test can run: the code doesn't parse, or doesn't define the entry. */
function unrunnable(result: RunResult): boolean {
  const e = result.error;
  return e != null && (e.kind === 'syntax' || e.kind === 'internal' || /^Define (a|an) /.test(e.message));
}

function firstFailure(j: Judged): Checked | undefined {
  return j.checked.find((c) => c.verdict.status !== 'pass');
}

const clip = (s: string) => (s.length > 1400 ? `${s.slice(0, 1400)}…` : s);

/** A run as the tutor sees it: how many tests pass, and the first failure in the learner's language. */
function tutorResults(j: Judged): TutorResults {
  const total = j.checked.length + j.skipped;
  if (j.fatal) return { passed: 0, total, fatal: clip(j.fatal.message) };
  const f = firstFailure(j);
  const passed = j.checked.filter((c) => c.verdict.status === 'pass').length;
  if (!f) return { passed, total };
  const input = f.test.input
    ? Object.entries(f.test.input)
        .map(([name, v]) => `${name} = ${formatValue(v, j.language)}`)
        .join(', ')
    : JSON.stringify(f.test.calls ?? []);
  return {
    passed,
    total,
    failing: {
      label: f.test.label,
      input: clip(input),
      expected: clip(formatValue(f.test.expected, j.language)),
      got: clip(f.verdict.got !== undefined ? formatValue(f.verdict.got, j.language) : f.verdict.message),
      ...(f.verdict.status !== 'fail' && { error: clip(f.verdict.message) }),
    },
  };
}

const GROUP_LABEL: Record<JudgeCase['group'], string> = { example: 'Examples', test: 'Tests', random: 'Random tests' };

function Results({
  spec,
  judged,
  stale,
  selected,
  onSelect,
  onWatch,
  busy,
  next,
}: {
  spec: ProblemSpec;
  judged: Judged;
  stale: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onWatch: (test: JudgeCase, memory: boolean) => void;
  busy: boolean;
  next?: { slug: string; title: string };
}) {
  const { checked, fatal, skipped, kind, language } = judged;
  const passed = checked.filter((c) => c.verdict.status === 'pass').length;
  const total = checked.length + skipped;
  const allPass = !fatal && skipped === 0 && passed === total;
  const shown = checked.find((c) => c.test.id === selected);
  const groups = (['example', 'test', 'random'] as const).filter((g) => checked.some((c) => c.test.group === g));
  const timedOut = checked.at(-1)?.verdict.status === 'timeout' && skipped > 0;

  return (
    <div className="space-y-3" aria-live="polite">
      {stale && (
        <p className="rounded-lg border border-warn-line bg-warn-soft px-4 py-2 text-sm text-warn-ink">
          You’ve changed the code since this run. Run it again to update the results.
        </p>
      )}
      {fatal && <ErrorCard error={fatal} />}
      {!fatal && (
        <div role="group" aria-label="Test results" className="rounded-xl border border-line-soft bg-surface shadow-xs">
          <div className={`flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm font-semibold ${allPass ? 'text-good-ink' : 'text-ink'}`}>
            {allPass ? <FiCheck aria-hidden /> : null}
            {allPass
              ? kind === 'submit'
                ? `Solved: all ${total} tests pass.`
                : `All ${total} examples pass. Submit to run every test.`
              : `${passed} of ${total} ${kind === 'submit' ? 'tests' : 'examples'} pass.`}
            {timedOut && <span className="font-normal text-ink-soft">The rest weren’t run after a test ran out of time.</span>}
          </div>
          <div className="space-y-2 px-4 py-3">
            {groups.map((g) => (
              <div key={g} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-ink-muted">{GROUP_LABEL[g]}</span>
                <div className="flex flex-wrap gap-1.5">
                  {checked
                    .filter((c) => c.test.group === g)
                    .map((c) => (
                      <CaseChip key={c.test.id} checked={c} selected={c.test.id === selected} onSelect={() => onSelect(c.test.id)} />
                    ))}
                </div>
              </div>
            ))}
          </div>
          {shown && <CaseDetail spec={spec} checked={shown} language={language} onWatch={onWatch} busy={busy || stale} />}
          <p className="border-t border-line-soft px-4 py-2 text-xs text-ink-muted">
            {isServerLanguage(language)
              ? 'Compiled and judged on our server, in a sandbox.'
              : 'Checked in your browser, as practice: passing here isn’t a proof your code is correct.'}{' '}
            Each test may take up to {timeLimit(spec, language) / 1000} s in {PROBLEM_LANGUAGES[language].label}.
          </p>
        </div>
      )}
      {allPass && kind === 'submit' && (
        <div className="rounded-xl border border-good-line bg-good-soft px-4 py-3 text-sm text-ink">
          <p>
            <span className="font-semibold text-good-ink">Well done.</span> Compare your idea with the approach in the problem description, then try another.
          </p>
          {next && (
            <Link href={`/practice/${next.slug}`} className="mt-1 inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
              Next: {next.title} <FiArrowRight aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS = {
  pass: { icon: FiCheck, label: 'passed', className: 'border-good-line bg-good-soft text-good-ink' },
  fail: { icon: FiX, label: 'wrong answer', className: 'border-bad-line bg-bad-soft text-bad-ink' },
  error: { icon: FiX, label: 'error', className: 'border-bad-line bg-bad-soft text-bad-ink' },
  timeout: { icon: FiClock, label: 'out of time', className: 'border-warn-line bg-warn-soft text-warn-ink' },
} as const;

function CaseChip({ checked, selected, onSelect }: { checked: Checked; selected: boolean; onSelect: () => void }) {
  const s = STATUS[checked.verdict.status];
  const Icon = s.icon;
  const n = checked.test.label.replace(/^\D+/, '');
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${checked.test.label}: ${s.label}`}
      className={`inline-flex h-7 min-w-9 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-semibold ${s.className} ${
        selected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''
      }`}
    >
      <Icon aria-hidden /> {n}
    </button>
  );
}

function CaseDetail({
  spec,
  checked,
  language,
  onWatch,
  busy,
}: {
  spec: ProblemSpec;
  checked: Checked;
  language: ProblemLanguage;
  onWatch: (test: JudgeCase, memory: boolean) => void;
  busy: boolean;
}) {
  const { test, verdict: v, output } = checked;
  const s = STATUS[v.status];
  return (
    <div className="space-y-2 border-t border-line-soft px-4 py-3 text-sm">
      <p className="font-semibold text-ink">
        {test.label} <span className={`font-normal ${v.status === 'pass' ? 'text-good-ink' : v.status === 'timeout' ? 'text-warn-ink' : 'text-bad-ink'}`}>· {s.label}</span>
        {v.status !== 'timeout' && <span className="font-normal text-ink-muted"> · {v.ms} ms</span>}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-ink-muted">Input</dt>
        <dd className="font-mono text-[13px] break-words text-ink">{inputText(spec, test, language)}</dd>
        <dt className="text-ink-muted">Expected</dt>
        <dd className="font-mono text-[13px] break-words text-ink">{formatValue(test.expected, language)}</dd>
        {v.got !== undefined && (
          <>
            <dt className="text-ink-muted">Yours</dt>
            <dd className="font-mono text-[13px] break-words text-ink">{formatValue(v.got as Json, language)}</dd>
          </>
        )}
      </dl>
      {v.status !== 'pass' && <p className="text-ink-soft">{v.message}</p>}
      {output.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted">Printed</p>
          <pre className="max-h-40 overflow-auto rounded-md bg-sunken px-3 py-2 font-mono text-[13px] whitespace-pre-wrap text-ink-soft">{output.join('\n')}</pre>
        </div>
      )}
      {isServerLanguage(language) ? (
        <p className="text-xs text-ink-muted">
          Watching a run step by step works in Python, JavaScript and TypeScript, which run in your browser. Write it in one of those to watch it here.
        </p>
      ) : watchable(test) ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onWatch(test, spec.view === 'memory')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent-line bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-surface disabled:opacity-60"
          >
            <FiEye aria-hidden /> Watch your code on this test
          </button>
          {spec.view !== 'memory' && (
            <button
              type="button"
              onClick={() => onWatch(test, true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-soft hover:bg-sunken disabled:opacity-60"
            >
              Line by line, with memory
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">This test is too big to watch step by step; a smaller failing test shows the same mistake more clearly.</p>
      )}
    </div>
  );
}

/** A test's input as the learner's language would write the call's arguments. */
function inputText(spec: ProblemSpec, test: JudgeCase, language: ProblemLanguage): string {
  if (test.calls) {
    return test.calls
      .map(([method, ...args], i) => `${i === 0 ? method : methodIn(method, language)}(${args.map((a) => formatValue(a, language)).join(', ')})`)
      .join(', ');
  }
  return (spec.signature?.params ?? []).map((p) => `${nameIn(p.name, language)} = ${formatValue(test.input?.[p.name] ?? null, language)}`).join(', ');
}

const ARRAY_LEGEND: readonly LegendEntry[] = [{ neutral: 'Element' }, 'compare', 'swap', 'write'];
const GRID_LEGEND: readonly LegendEntry[] = [
  { neutral: 'Cell' },
  { mark: 'write', label: 'Cell your code writes' },
  { mark: 'compare', label: 'Cells it read (arrows) or compared' },
];

function legendFor(view: RunTrace['view']): readonly LegendEntry[] {
  if (view === 'array') return ARRAY_LEGEND;
  if (view === 'grid') return GRID_LEGEND;
  if (view === 'tree') return TREE_RUN_LEGEND;
  return MEMORY_LEGEND;
}

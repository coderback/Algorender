// Checking a task (schema.ts): the requests a code task's check makes, and
// the verdict from their results. The comparison is trusted code here, never
// in the sandbox; only the learner's program runs there. The same functions
// check a learner's answer in the browser (TaskPlayer, through the worker
// runtimes) and every task's starter and reference in tasks.test.ts (through
// the runtimes directly), so what the tests prove is what learners get.

import { formatValue, same } from '@/problems/judge';
import { DEFAULT_LIMITS, type Json, type Limits, type RunError, type RunRequest, type RunResult, type TestResult } from '@/workspace/protocol';
import { checkOutput, DEFAULT_CHECKER, withoutPrompts, type NamedCheck } from './checkers';
import type { ExpectedRun, ProgramCase, Task, TaskCheck, TaskExpected, TaskLanguage } from './schema';

export type Runner = (request: RunRequest) => Promise<RunResult>;

/** A check's runs: the usual limits, with a fixed seed and clock, so random and time repeat. */
export const CHECK_LIMITS: Limits = DEFAULT_LIMITS;
export const CHECK_SEED = 1;
/** 15 January 2026, 09:30 UTC: what time.time() and Date.now() say while a task is checked. */
export const CHECK_CLOCK = Date.UTC(2026, 0, 15, 9, 30);

/** One case of a checked task, as the verdict shows it. */
export type CaseVerdict = {
  name: string;
  passed: boolean;
  /** A hidden case shows no input or output until it fails. */
  hidden: boolean;
  /** Why it failed, in a line. */
  message?: string;
  stdin?: string;
  /** Expected and actual output (prompts left out, as the checker read them). */
  expected?: string;
  got?: string;
  stderr?: string;
  /** A function call, as the learner's language writes it: add(2, 3). */
  call?: string;
  error?: RunError | null;
};

export type TaskVerdict = {
  passed: boolean;
  cases: CaseVerdict[];
  /** A tests check's outcomes. */
  tests?: TestResult[];
  /** What stopped the whole check (a syntax error, an error before the tests). */
  error?: RunError | null;
  /** How many cases (or tests) ran, and how many failed: the task.checked event's counts. */
  total: number;
  failed: number;
};

const base = (language: TaskLanguage, code: string): RunRequest => ({
  language,
  code,
  entry: '',
  args: [],
  limits: CHECK_LIMITS,
  mode: 'program',
  seed: CHECK_SEED,
  clock: CHECK_CLOCK,
});

/** A program case's run. */
export function programRequest(language: TaskLanguage, code: string, c: Pick<ProgramCase, 'stdin'>): RunRequest {
  return { ...base(language, code), stdin: c.stdin };
}

/** A function check's run of one call. */
export function callRequest(language: TaskLanguage, code: string, check: Extract<TaskCheck, { kind: 'function' }>, args: Json[]): RunRequest {
  return { ...base(language, code), entry: check.entry[language]!, args: args.map((value, k) => ({ kind: 'value', name: `a${k}`, value })) };
}

/** A tests check's run. */
export function testsRequest(language: TaskLanguage, code: string, check: Extract<TaskCheck, { kind: 'tests' }>): RunRequest {
  return { ...base(language, code), tests: check.tests[language]! };
}

/** What a program case's reference run gives the checker. */
export const expectedRun = (r: RunResult): ExpectedRun => ({ stdout: r.stdout ?? '', prompts: r.prompts ?? [], exitCode: r.exitCode ?? null });

/** A task's check, whichever kind it is. */
export function checkOf(task: Task): TaskCheck | null {
  return 'check' in task ? task.check : null;
}

/**
 * Checks code against a task's check. `expected` is the reference's
 * results (expected.json); a tests check needs none.
 */
export async function checkCode(
  check: TaskCheck,
  language: TaskLanguage,
  code: string,
  expected: TaskExpected | undefined,
  run: Runner,
  named: Readonly<Record<string, NamedCheck>> = {},
): Promise<TaskVerdict> {
  if (check.kind === 'tests') {
    const r = await run(testsRequest(language, code, check));
    const tests = r.tests ?? [];
    const failed = tests.filter((t) => !t.passed).length;
    const error = r.error ?? (r.exitCode != null && r.exitCode !== 0 ? exitError(r.exitCode) : null);
    return { passed: !error && tests.length > 0 && failed === 0, cases: [], tests, error, total: Math.max(tests.length, 1), failed: error && failed === 0 ? 1 : failed };
  }

  const cases: CaseVerdict[] = [];
  if (check.kind === 'program') {
    for (const [k, c] of check.cases.entries()) {
      const want = expected?.cases?.[k];
      if (!want) throw new Error(`No expected output for case ${k + 1} in ${language}: run npm run tasks:expected`);
      const r = await run(programRequest(language, code, c));
      const hidden = c.hidden && k > 0;
      const shown = { name: c.name, hidden, stdin: c.stdin, stderr: r.stderr || undefined };
      const output = (o: { stdout: string; prompts: [number, number][] }) => (check.checker.prompts === 'keep' ? o.stdout : withoutPrompts(o.stdout, o.prompts));
      const got = { stdout: r.stdout ?? '', prompts: r.prompts ?? [] };
      if (r.error) {
        cases.push({ ...shown, passed: false, message: errorLine(r.error), error: r.error, expected: output(want), got: output(got) });
        if (r.error.kind === 'syntax') break; // every case would say the same
        continue;
      }
      const problem = checkOutput(check.checker ?? DEFAULT_CHECKER, got, want, c.stdin, named);
      const exit = problem === null && (r.exitCode ?? 0) !== (want.exitCode ?? 0) ? `It ended with exit code ${r.exitCode}, not ${want.exitCode ?? 0}.` : null;
      cases.push({ ...shown, passed: problem === null && exit === null, message: problem ?? exit ?? undefined, expected: output(want), got: output(got) });
    }
  } else {
    for (const [k, args] of check.calls.entries()) {
      const want = expected?.returns;
      if (!want || k >= want.length) throw new Error(`No expected return for call ${k + 1} in ${language}: run npm run tasks:expected`);
      const r = await run(callRequest(language, code, check, args));
      const call = `${check.entry[language]}(${args.map((a) => formatValue(a, language)).join(', ')})`;
      const expectedText = formatValue(want[k], language);
      if (r.error) {
        cases.push({ name: call, call, hidden: false, passed: false, message: errorLine(r.error), error: r.error, expected: expectedText, stderr: r.stderr || undefined });
        if (r.error.kind === 'syntax') break;
        continue;
      }
      const ok = same(want[k], r.returned, check.compare);
      cases.push({ name: call, call, hidden: false, passed: ok, message: ok ? undefined : `Returned ${formatValue(r.returned, language)}, not ${expectedText}.`, expected: expectedText, got: formatValue(r.returned, language) });
    }
  }
  const failed = cases.filter((c) => !c.passed).length;
  const total = check.kind === 'program' ? check.cases.length : check.calls.length;
  return { passed: failed === 0 && cases.length === total, cases, total, failed: failed + (total - cases.length) };
}

const exitError = (code: number): RunError => ({ kind: 'runtime', message: `The program exited with code ${code}.`, line: null });

/** An error as one line: the message, and where. */
export function errorLine(e: RunError): string {
  return e.line == null ? e.message : `${e.message} (${e.file ? `${e.file}, ` : ''}line ${e.line})`;
}

/**
 * An output task: runs the snippet (as the learner sees it) and compares what
 * they typed with what it printed, line by line, prompts and all.
 */
export async function checkPrediction(task: Extract<Task, { kind: 'output' }>, language: TaskLanguage, typed: string, run: Runner): Promise<TaskVerdict> {
  const r = await run(programRequest(language, task.code[language]!, { stdin: task.stdin }));
  if (r.error) throw new Error(`The snippet of ${task.slug} fails in ${language}: ${r.error.message}`);
  const printed = r.stdout ?? '';
  const problem = checkOutput({ kind: 'lines', prompts: 'keep' }, { stdout: typed }, { stdout: printed }, task.stdin);
  const passed = problem === null;
  return { passed, cases: [{ name: 'What it prints', hidden: false, passed, message: problem ?? undefined, expected: printed, got: typed, stdin: task.stdin || undefined }], total: 1, failed: passed ? 0 : 1 };
}

/** A choice task. */
export function checkChoice(task: Extract<Task, { kind: 'choice' }>, picked: number): TaskVerdict {
  const passed = picked === task.answer;
  return { passed, cases: [{ name: 'Your answer', hidden: false, passed, message: passed ? undefined : 'Not that one.' }], total: 1, failed: passed ? 0 : 1 };
}

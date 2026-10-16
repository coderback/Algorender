// The local judge: turns a problem's tests into run requests for the
// learner's code, and their results into verdicts. It runs in the browser, so
// its verdicts are practice feedback, not proof (the tests can't be hidden
// from a browser). Answers are compared here, outside the learner's code.
//
// The same requests also replay a test on a view ('watch'): arrays, grids,
// trees and linked lists become visual arguments the trace can draw.

import { CHECKS } from '@/content/problems/checks';
import { DEFAULT_LIMITS, LINE_LIMITS, type Arg, type Json, type Language, type RunMode, type RunRequest, type RunResult } from '@/workspace/protocol';
import { entryName, nameIn } from './codegen';
import { PYTHON_TIME_FACTOR, type Comparator, type DesignSig, type FunctionSig, type Param } from './schema';

/** One judged test, as the browser gets it. */
export type JudgeCase = {
  /** 'example-1', 'test-3', 'random-2'. */
  id: string;
  /** 'Example 1', 'Test 3', 'Random test 2'. */
  label: string;
  group: 'example' | 'test' | 'random';
  /** A function problem's arguments, by parameter name. */
  input?: Record<string, Json>;
  /** A design problem's calls, constructor first. */
  calls?: [string, ...Json[]][];
  expected: Json;
  explanation?: string;
};

export type ReplayView = 'array' | 'grid' | 'tree' | 'memory';

/** Everything the browser needs to judge a problem. Plain data, so it crosses from a server page. */
export type ProblemSpec = {
  slug: string;
  title: string;
  signature?: FunctionSig;
  design?: DesignSig;
  compare: Comparator;
  check?: string;
  timeLimitMs: number;
  view: ReplayView;
  cases: JudgeCase[];
};

export type CaseVerdict = {
  status: 'pass' | 'fail' | 'error' | 'timeout';
  /** One sentence for the learner. */
  message: string;
  /** The learner's answer, when there was one. */
  got?: Json;
  ms: number;
};

/** The time budget for one test in this language. */
export const timeLimit = (spec: ProblemSpec, language: Language) => spec.timeLimitMs * (language === 'python' ? PYTHON_TIME_FACTOR : 1);

/** The request that judges one test: the code as written, plain arguments. */
export function judgeRequest(spec: ProblemSpec, test: JudgeCase, language: Language, code: string): RunRequest {
  return {
    language,
    code,
    entry: entryName(spec, language),
    args: argsFor(spec, test, language, 'judge'),
    limits: { ...DEFAULT_LIMITS, timeoutMs: timeLimit(spec, language) },
    mode: 'judge',
    ...(spec.design && { calls: callsFor(test, language) }),
  };
}

/**
 * The request that replays one test on a view: on the problem's own view
 * (a grid from its cell reads and writes; arrays, trees and the memory
 * diagram line by line), or on the memory view when `memory` is set.
 */
export function watchRequest(spec: ProblemSpec, test: JudgeCase, language: Language, code: string, memory = false): RunRequest {
  const view = memory ? 'memory' : spec.view;
  // A grid is drawn from its cell reads and writes; everything else line by line.
  const mode: RunMode = view === 'grid' ? 'visual' : 'lines';
  return {
    language,
    code,
    entry: entryName(spec, language),
    args: argsFor(spec, test, language, view),
    limits: mode === 'lines' ? LINE_LIMITS : DEFAULT_LIMITS,
    mode,
    ...(spec.design && { calls: callsFor(test, language) }),
  };
}

function callsFor(test: JudgeCase, language: Language) {
  return (test.calls ?? []).map(([method, ...args], i) => ({ method: i === 0 ? method : nameIn(method, language), args }));
}

/** Most cells a replayed array or grid may have: more can't be watched step by step. */
export const WATCH_CELLS = 400;

function argsFor(spec: ProblemSpec, test: JudgeCase, language: Language, view: ReplayView | 'judge'): Arg[] {
  if (!spec.signature) return [];
  return spec.signature.params.map((p) => argFor(p, test.input?.[p.name] ?? null, language, view));
}

function argFor(p: Param, value: Json, language: Language, view: ReplayView | 'judge'): Arg {
  const name = nameIn(p.name, language);
  if (p.type === 'TreeNode') return { kind: 'tree', name, values: value as (number | null)[] };
  if (p.type === 'ListNode') return { kind: 'list', name, values: value as number[] };
  if (view === 'array' && p.type === 'int[]' && isInts(value) && value.length <= WATCH_CELLS) return { kind: 'array', name, values: value };
  if (view === 'grid' && p.type === 'int[][]' && isGrid(value)) return { kind: 'grid', name, values: value };
  return { kind: 'value', name, value };
}

const isInts = (v: Json): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
const isGrid = (v: Json): v is number[][] =>
  Array.isArray(v) && v.length > 0 && v.every((row) => isInts(row) && row.length === (v[0] as number[]).length) && v.length * (v[0] as number[]).length <= WATCH_CELLS;

/** Whether a test is small enough to watch on the problem's own view. */
export function watchable(test: JudgeCase): boolean {
  const size = JSON.stringify(test.input ?? test.calls ?? null).length;
  return size <= 2_000;
}

/** The verdict on one test from its run. */
export function verdict(spec: ProblemSpec, test: JudgeCase, result: RunResult, language: Language): CaseVerdict {
  const ms = Math.round(result.ms);
  const { error } = result;
  if (error?.kind === 'timeout') {
    return { status: 'timeout', message: `Took longer than ${timeLimit(spec, language) / 1000} s: is there a loop that never ends, or a faster approach?`, ms };
  }
  if (spec.design) return designVerdict(spec, test, result, language);
  if (error) return { status: 'error', message: error.line == null ? error.message : `Line ${error.line}: ${error.message}`, ms };
  const got = answerOf(spec, result);
  const problem = mismatch(spec, test, got, language);
  return problem ? { status: 'fail', message: problem, got, ms } : { status: 'pass', message: 'Correct.', got, ms };
}

/**
 * A run's answer: what the function returned, or for a void function the
 * argument it changed in place, or a design problem's list of call results.
 * An empty tree or list (None/null) is written [], as tests write it.
 */
export function answerOf(spec: ProblemSpec, result: RunResult): Json {
  if (spec.design) return result.returned;
  const sig = spec.signature!;
  const index = sig.inPlace ? sig.params.findIndex((p) => p.name === sig.inPlace) : -1;
  const got = index >= 0 ? (result.args?.[index] ?? null) : result.returned;
  const type = index >= 0 ? sig.params[index].type : sig.returns;
  return got === null && (type === 'TreeNode' || type === 'ListNode') ? [] : got;
}

function designVerdict(spec: ProblemSpec, test: JudgeCase, result: RunResult, language: Language): CaseVerdict {
  const ms = Math.round(result.ms);
  const got = Array.isArray(result.returned) ? result.returned : [];
  const expected = Array.isArray(test.expected) ? test.expected : [];
  const calls = test.calls ?? [];
  for (let i = 0; i < calls.length; i++) {
    if (i >= got.length) {
      // The run stopped here: the call raised.
      const error = result.error;
      const what = error ? (error.line == null ? error.message : `line ${error.line}: ${error.message}`) : 'it stopped';
      return { status: 'error', message: `Call ${i + 1}, ${callText(calls[i], language)}, failed: ${what}`, got, ms };
    }
    if (!same(expected[i] ?? null, got[i], spec.compare)) {
      return {
        status: 'fail',
        message: `Call ${i + 1}, ${callText(calls[i], language)}, should give ${formatValue(expected[i] ?? null, language)}, not ${formatValue(got[i], language)}.`,
        got,
        ms,
      };
    }
  }
  if (result.error) return { status: 'error', message: result.error.message, got, ms };
  return { status: 'pass', message: 'Correct.', got, ms };
}

function callText([method, ...args]: [string, ...Json[]], language: Language): string {
  return `${nameIn(method, language)}(${args.map((a) => formatValue(a, language)).join(', ')})`;
}

/** Why an answer is wrong, or null when it is right. */
function mismatch(spec: ProblemSpec, test: JudgeCase, got: Json, language: Language): string | null {
  if (spec.check) {
    const check = CHECKS[spec.check];
    if (!check) throw new Error(`No check called ${spec.check}`);
    return check(test.input ?? {}, got, test.expected, (v) => formatValue(v, language));
  }
  if (same(test.expected, got, spec.compare)) return null;
  const order = spec.compare === 'unordered' || spec.compare === 'unordered-deep' ? ' (in any order)' : '';
  return `Expected ${formatValue(test.expected, language)}${order}, got ${formatValue(got, language)}.`;
}

/** Whether two answers match under a comparator. */
export function same(expected: Json, got: Json, compare: Comparator): boolean {
  switch (compare) {
    case 'float':
      return close(expected, got);
    case 'unordered':
      return Array.isArray(expected) && Array.isArray(got) ? sameBag(expected.map(key), got.map(key)) : key(expected) === key(got);
    case 'unordered-deep':
      return key(sorted(expected)) === key(sorted(got));
    default:
      return key(expected) === key(got);
  }
}

/** A canonical string for a JSON value: object keys sorted, -0 as 0. */
function key(v: Json): string {
  return JSON.stringify(v, (_k, x: unknown) => {
    if (x === 0) return 0;
    if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return x;
  });
}

function sorted(v: Json): Json {
  if (!Array.isArray(v)) return v;
  return v.map(sorted).sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function sameBag(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  for (const x of b) {
    const n = counts.get(x);
    if (!n) return false;
    counts.set(x, n - 1);
  }
  return true;
}

function close(a: Json, b: Json): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => close(x, b[i]));
  return key(a) === key(b);
}

/** The most items of a list shown in a message. */
const SHOWN = 20;

/** A value as the learner's language writes it: None and True in Python, null and true in JS. */
export function formatValue(v: Json, language: Language): string {
  const py = language === 'python';
  if (v === null) return py ? 'None' : 'null';
  if (typeof v === 'boolean') return py ? (v ? 'True' : 'False') : String(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'string') return py ? pyString(v) : JSON.stringify(v);
  if (Array.isArray(v)) {
    const items = v.slice(0, SHOWN).map((x) => formatValue(x, language));
    if (v.length > SHOWN) items.push(`… ${v.length - SHOWN} more`);
    return `[${items.join(', ')}]`;
  }
  const entries = Object.entries(v).map(([k, x]) => `${py ? pyString(k) : k}: ${formatValue(x, language)}`);
  return `{${entries.join(', ')}}`;
}

/** Python's repr of a string: single quotes unless the text has one and no double quote. */
function pyString(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = JSON.stringify(s).slice(1, -1).replace(/\\"/g, '"');
  return quote + (quote === "'" ? body.replace(/'/g, "\\'") : body) + quote;
}

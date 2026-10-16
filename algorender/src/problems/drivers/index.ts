// The server judge's language side: the program a sandbox compiles and runs
// for a problem (a generated driver around the learner's code, and the tests
// on stdin), and how its output files become verdicts. Running it is the
// server's job (src/server/judge/); this part is plain functions, so it is
// tested directly.

import { MAX_PRINT_CHARS, MAX_PRINTS, type Json, type RunError, type RunResult } from '@/workspace/protocol';
import { timeLimit, verdict, type CaseVerdict, type JudgeCase, type ProblemSpec } from '../judge';
import type { ServerLanguage } from '../languages';
import { cppProgram } from './cpp';
import { encodeCases } from './encode';
import { goProgram } from './go';
import { javaProgram } from './java';
import { JUDGE_SCRIPT, MARKER, type Program } from './shared';

export { JUDGE_SCRIPT, type Program };

const PROGRAMS = { java: javaProgram, cpp: cppProgram, go: goProgram };

/** Everything to write into the sandbox's folder before running `sh judge.sh <language> <seconds>`. */
export function sandboxFiles(spec: ProblemSpec, language: ServerLanguage, code: string, tests: JudgeCase[]): Record<string, string> {
  const program = PROGRAMS[language](spec, code);
  return { ...program.files, 'tests.txt': encodeCases(spec, tests), 'judge.sh': JUDGE_SCRIPT };
}

/** How long the whole run may take, in seconds: every test's limit, within bounds. Compiling isn't counted. */
export function runSeconds(spec: ProblemSpec, language: ServerLanguage, tests: JudgeCase[]): number {
  const total = (timeLimit(spec, language) * tests.length) / 1000;
  return Math.ceil(Math.min(Math.max(total, 5), 20)) + 1;
}

/** The files judge.sh leaves behind (missing ones as empty strings). */
export type SandboxOutput = { status: string; compile: string; stdout: string; stderr: string; answers: string };

/** One test's outcome, as the workspace shows it. */
export type CheckedCase = { id: string; verdict: CaseVerdict; output: string[] };

/** A server run's outcome: like the browser's, a list of judged tests, the count left unrun, or one error that stopped them all. */
export type ServerVerdicts = { checked: CheckedCase[]; skipped: number; fatal: RunError | null };

/** A test's line in answers.jsonl: its index, time, value, error and error line; x marks a crash that ended the program. */
type Answer = { i: number; ms?: number; v?: Json; e?: string; l?: number; x?: 1 };

/** The verdicts from a run's output files. Judging stops at the first test that couldn't finish, as in the browser. */
export function readOutput(spec: ProblemSpec, language: ServerLanguage, tests: JudgeCase[], out: SandboxOutput, seconds: number): ServerVerdicts {
  if (out.status.trim() === 'compile') {
    return { checked: [], skipped: tests.length, fatal: { kind: 'compile', message: compileMessage(out.compile, language), line: compileLine(out.compile, language) } };
  }
  const answers = new Map<number, Answer>();
  for (const line of out.answers.split('\n')) {
    try {
      const a = JSON.parse(line) as Answer;
      if (typeof a?.i === 'number') answers.set(a.i, a);
    } catch {
      // A line cut short by a crash.
    }
  }
  const prints = splitPrints(out.stdout);
  const checked: CheckedCase[] = [];
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const answer = answers.get(i);
    const output = prints[i] ?? [];
    if (!answer) {
      checked.push({ id: test.id, verdict: verdict(spec, test, stopped(out, seconds, spec, language), language), output });
      break;
    }
    const result = toResult(spec, answer, timeLimit(spec, language));
    const v = verdict(spec, test, result, language);
    checked.push({ id: test.id, verdict: v, output });
    if (v.status === 'timeout' || answer.x) break;
  }
  return { checked, skipped: tests.length - checked.length, fatal: null };
}

function toResult(spec: ProblemSpec, a: Answer, limitMs: number): RunResult {
  const ms = a.ms ?? 0;
  const base = { events: [], arrays: {}, ms };
  if (ms > limitMs) return { ...base, returned: null, error: { kind: 'timeout', message: 'Too slow', line: null } };
  const error: RunError | null = a.e == null ? null : { kind: 'runtime', message: a.e, line: a.l ?? null };
  const sig = spec.signature;
  const inPlace = sig?.inPlace ? sig.params.findIndex((p) => p.name === sig.inPlace) : -1;
  if (inPlace >= 0) {
    const args: Json[] = sig!.params.map(() => null);
    args[inPlace] = a.v ?? null;
    return { ...base, returned: null, args, error };
  }
  return { ...base, returned: a.v ?? null, error };
}

/** Why a test has no answer: the run ran out of time, or the program died during it. */
function stopped(out: SandboxOutput, seconds: number, spec: ProblemSpec, language: ServerLanguage): RunResult {
  const [, code, took] = out.status.trim().split(/\s+/).map(Number);
  const base = { events: [], arrays: {}, ms: timeLimit(spec, language) + 1, returned: null };
  const killed = code === 137 || code === 124;
  if (killed && took >= seconds - 1) return { ...base, error: { kind: 'timeout', message: 'Too slow', line: null } };
  // 153 is SIGXFSZ: an output file passed judge.sh's size limit.
  const message = killed
    ? 'The program was stopped: it used too much memory.'
    : code === 153
      ? 'The program was stopped: it printed too much (over 8 MB).'
      : crashMessage(out.stderr, language, code);
  return { ...base, ms: 0, error: { kind: 'runtime', message, line: crashLine(out.stderr, language) } };
}

/** The learner's prints, split by test at the driver's markers, capped as in the browser. */
function splitPrints(stdout: string): string[][] {
  const tests: string[][] = [];
  let current: string[] | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith(MARKER)) {
      current = [];
      tests[Number(line.slice(MARKER.length))] = current;
    } else if (current && current.length < MAX_PRINTS) {
      current.push(line.length > MAX_PRINT_CHARS ? `${line.slice(0, MAX_PRINT_CHARS)}…` : line);
    }
  }
  // The text after the last newline is an unfinished line; the empty string after a final newline isn't a print.
  for (const t of tests) if (t && t.at(-1) === '') t.pop();
  return tests;
}

const SHOWN_LINES = 30;

/** The compiler's complaints, about the learner's file, trimmed. */
function compileMessage(text: string, language: ServerLanguage): string {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim() !== '' && !/^(# judge|Note: |\d+ errors?$)/.test(l))
    .map((l) => l.replace(/^\.\//, '').replace(/^\/[^:]*\//, ''));
  const kept = lines.slice(0, SHOWN_LINES);
  if (lines.length > SHOWN_LINES) kept.push(`… and ${lines.length - SHOWN_LINES} more lines`);
  return kept.join('\n') || `The ${language === 'cpp' ? 'C++' : language === 'go' ? 'Go' : 'Java'} code didn't compile.`;
}

/** The first line the compiler complained about in the learner's file. */
function compileLine(text: string, language: ServerLanguage): number | null {
  const file = language === 'cpp' ? 'solution\\.cpp' : language === 'go' ? 'solution\\.go' : '\\w+\\.java';
  const match = new RegExp(`(?:^|/)${file}:(\\d+)`, 'm').exec(text);
  return match ? Number(match[1]) : null;
}

/** What killed the program, from what it printed on the way out (Go's fatal errors, a Java error outside a test). */
function crashMessage(stderr: string, language: ServerLanguage, code: number): string {
  const text = stderr.replace(/\r/g, '').trim();
  if (language === 'go' && /stack overflow/.test(text)) return 'Stack overflow: the recursion went too deep (does it always reach a base case?)';
  const first = text.split('\n').find((l) => /^(fatal error|panic|Exception|Error|terminate)/.test(l)) ?? text.split('\n')[0];
  if (first) return first.length > 300 ? `${first.slice(0, 300)}…` : first;
  return `The program stopped unexpectedly (exit code ${code}).`;
}

function crashLine(stderr: string, language: ServerLanguage): number | null {
  if (language !== 'go') return null;
  const match = /solution\.go:(\d+)/.exec(stderr);
  return match ? Number(match[1]) : null;
}

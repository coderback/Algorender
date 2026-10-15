// The contract between the learner's code and the app.
//
// A runtime (Python in Pyodide, or JS/TS) runs the learner's function against
// "visual collections" and reports what it did as a list of RunEvents, in
// order. The app turns those events into the same Trace the built-in
// visualisers play (see trace.ts), so the learner's code drives the same views.
//
// Both runtimes must produce identical events for equivalent programs; the
// shared cases in contract.ts hold them to that.

import type { VarValue } from '@/engine/types';

export type Language = 'python' | 'javascript' | 'typescript';

export const LANGUAGES: Record<Language, { label: string; extension: string }> = {
  python: { label: 'Python', extension: 'py' },
  javascript: { label: 'JavaScript', extension: 'js' },
  typescript: { label: 'TypeScript', extension: 'ts' },
};

/** An argument passed to the learner's entry function. */
export type Arg =
  /** A visual array: the learner sees a list/array; reads, writes and comparisons are tracked. */
  | { kind: 'array'; name: string; values: number[] }
  /** A plain JSON value (a number, a target, a flag). Not tracked. */
  | { kind: 'value'; name: string; value: Json };

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Limits = {
  /** Visual events (compare, write, …) before the run is stopped. */
  maxEvents: number;
  /** Executed lines before the run is stopped, so an endless loop ends with a message. */
  maxSteps: number;
  /** Wall-clock budget, enforced by the main thread terminating the worker. */
  timeoutMs: number;
};

export const DEFAULT_LIMITS: Limits = { maxEvents: 5_000, maxSteps: 200_000, timeoutMs: 8_000 };

export type RunRequest = {
  language: Language;
  /** The learner's source. Defines the entry function; may define helpers. */
  code: string;
  /** Name of the function to call, e.g. `bubble_sort` (Python) or `bubbleSort` (JS/TS). */
  entry: string;
  args: Arg[];
  limits: Limits;
};

/**
 * One side of a comparison: either a cell of a visual array, or a plain value
 * (a variable such as `key`, a literal, or an expression like `arr[j] + 1`).
 */
export type Operand = { array: string; index: number; value: number } | { value: VarValue };

export type CompareOp = '<' | '<=' | '>' | '>=' | '==' | '!=';

type At = {
  /** 1-based line in the learner's source that caused the event, or null if unknown. */
  line: number | null;
  /**
   * The learner's local variables at that moment: numbers, booleans, short
   * strings, and short lists rendered as text ("[3, 1, 2]"). Names starting
   * with an underscore and the visual arrays themselves are left out.
   */
  vars: Record<string, VarValue>;
};

export type RunEvent =
  /** A visual array came into existence. The first one is the entry function's array argument. */
  | ({ kind: 'array'; array: string; name: string; values: number[] } & At)
  /**
   * A comparison in the learner's code where at least one side is a cell of a
   * visual array. `op` is the operator as written (JS === and !== report as
   * == and !=), `result` what it evaluated to.
   */
  | ({ kind: 'compare'; op: CompareOp; a: Operand; b: Operand; result: boolean } & At)
  /** arr[index] = value. A swap arrives as two writes; trace.ts recognises it. */
  | ({ kind: 'write'; array: string; index: number; value: number } & At)
  /** arr.append(value) / arr.push(value). */
  | ({ kind: 'append'; array: string; value: number } & At)
  /** arr.pop() (last element) or arr.pop(i) in Python. */
  | ({ kind: 'pop'; array: string; index: number } & At)
  /** Something the learner printed (print / console.log), as one line of text. */
  | ({ kind: 'print'; text: string } & At);

export type RunError = {
  /**
   * syntax: the code doesn't parse. runtime: it threw. limit: too many events
   * or steps (probably an endless loop). timeout: the worker was stopped.
   * internal: a bug in the runtime itself, not the learner's code.
   */
  kind: 'syntax' | 'runtime' | 'limit' | 'timeout' | 'internal';
  /** One line, learner-facing: "IndexError: list index out of range". */
  message: string;
  line: number | null;
};

export type RunResult = {
  /** Every event up to the end of the run (or up to the error). */
  events: RunEvent[];
  /** Final contents of each visual array, by array id. */
  arrays: Record<string, number[]>;
  /** The entry function's return value as JSON (null when it returned nothing). */
  returned: Json;
  error: RunError | null;
  /** Wall-clock time spent running the learner's code, in ms. */
  ms: number;
};

/** A runtime runs requests; the worker-backed ones live in runner.ts. */
export interface Runtime {
  run(request: RunRequest): Promise<RunResult>;
}

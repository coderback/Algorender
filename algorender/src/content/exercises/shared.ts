// The exercise model shared by every exercise file. Exercise files import from
// here, never from index.ts, so the index can gather them without an import cycle.
//
// Each exercise is judged locally, so its verdict is practice feedback, not a
// proof: hidden tests can't be hidden from a browser.

import type { LegendEntry } from '@/engine/module';
import type { Arg, Language, RunResult } from '@/workspace/protocol';

export type Verdict = { pass: boolean; message: string };

/**
 * One exercise. `I` is the shape of its inputs (an array and a target, a grid
 * size…); `args` turns an input into the entry function's arguments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the list holds exercises with different input shapes
export type Exercise<I = any> = {
  slug: string;
  title: string;
  /** 'write' asks for the algorithm; 'bug' hands over code with one bug to find and fix. */
  kind: 'write' | 'bug';
  /** The visualiser that shows the reference algorithm. */
  visualiser: string;
  /** One line for lists and link previews. */
  summary: string;
  /** What to do, a few short paragraphs. Backticks mark code. */
  task: string[];
  entry: { python: string; js: string };
  args: (input: I) => Arg[];
  /** What the learner starts from: a stub to fill in, or (for a bug hunt) the buggy code. */
  starter: Record<Language, string>;
  solution: Record<Language, string>;
  /**
   * The solution with some spans marked «n:text» (n numbers the blank).
   * Fill-in and faded stages blank some of them; removing the markers gives
   * the solution exactly (a test checks). Guillemets never occur in Python or JS.
   */
  blanks?: Record<Language, string>;
  /** Which blanks each faded stage hides, easiest first. */
  fades?: number[][];
  /** Plausible wrong lines mixed into the Parsons puzzle, per language. */
  distractors?: Partial<Record<Language, string[]>>;
  /** Bug hunts: what the learner sees go wrong, and (after a fix) what the bug was. */
  bug?: { symptom: string; explanation: string };
  /** Inputs the learner can watch their code run on. */
  examples: { id: string; label: string; input: I }[];
  /** Judged inputs; every one must pass the check. */
  tests: { name: string; input: I }[];
  check: (input: I, result: RunResult) => Verdict;
  /** Sorting exercises colour the array as sorted when the run ends in order. */
  markSortedAtEnd: boolean;
  /** Index variables drawn as pointers under the array when the learner uses these names. */
  pointers: string[];
  hints: string[];
  legend: LegendEntry[];
};

/** A run that crashed fails with its error, on its line. */
export const crashed = (result: RunResult): Verdict | null =>
  result.error ? { pass: false, message: result.error.line == null ? result.error.message : `Line ${result.error.line}: ${result.error.message}` } : null;

export const comparisons = (result: RunResult) => result.events.filter((e) => e.kind === 'compare').length;

export const listText = (values: readonly number[]) => `[${values.join(', ')}]`;

/** Removes «n:text» blank markers, leaving the text. */
export const stripBlanks = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

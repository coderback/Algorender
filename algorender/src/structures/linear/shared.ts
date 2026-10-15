import type { ArgSpec, StatSpec } from '@/engine/module';
import type { Checkpoint } from '@/engine/types';
import type { Item } from '@/viz/linear/tracer';

export type { Item };

export const YES_NO = ['Yes', 'No'] as const;

export const VALUE_ARG: ArgSpec = { name: 'value', label: 'Value', type: 'int', min: 0, max: 99, default: 42 };
export const indexArg = (max: number): ArgSpec => ({ name: 'index', label: 'Index', type: 'int', min: 0, max, default: 0 });

export const TOUCHED: StatSpec = { key: 'touched', label: 'Cells read or written' };

/** Integer argument; operations validate ranges themselves and narrate an error frame for bad ones. */
export const intArg = (args: Record<string, number | string>, name: string): number => {
  const n = Number(args[name]);
  return Number.isInteger(n) ? n : NaN;
};

/**
 * A numeric multiple-choice question: the correct number plus distinct
 * distractors, sorted ascending (so where the answer sits varies naturally).
 */
export function numberChoices(
  correct: number,
  candidates: readonly number[],
  { allowNegative = false } = {},
): Pick<Checkpoint, 'choices' | 'answer'> {
  const ok = (c: number) => Number.isInteger(c) && (allowNegative || c >= 0);
  // The correct value comes first in the set, so trimming to four keeps it.
  const values = [...new Set([correct, ...candidates.filter(ok)])].slice(0, 4);
  if (values.length < 2) values.push(correct + 1);
  values.sort((a, b) => a - b);
  return { choices: values.map(String), answer: values.indexOf(correct) };
}

/** Distinct values from a list as choices (e.g. "which value does pop return?"), sorted ascending. */
export function valueChoices(correct: number, others: readonly number[]): Pick<Checkpoint, 'choices' | 'answer'> | null {
  const set = [...new Set([correct, ...others])].slice(0, 4).sort((a, b) => a - b);
  if (set.length < 2) return null;
  return { choices: set.map(String), answer: set.indexOf(correct) };
}

/** Puts the correct answer at a position that varies with `salt`, so it isn't always first. */
export function arrange(correct: string, distractors: readonly string[], salt: number): Pick<Checkpoint, 'choices' | 'answer'> {
  const choices = [...distractors];
  const answer = Math.abs(Math.trunc(salt)) % (choices.length + 1);
  choices.splice(answer, 0, correct);
  return { choices, answer };
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

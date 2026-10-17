import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import { round } from './geometry';
import type { PlotPart, PlotState } from './types';

// Authoring helpers for plot modules. Math modules rebuild their parts each
// frame from the input (sharing heavy parts such as contour maps by
// reference), so instead of a tracer they need only these.

/** One frame of a plot module. */
export function plotFrame(
  parts: readonly PlotPart[],
  o: { note: string; line?: number | null; vars?: Record<string, VarValue>; checkpoint?: Checkpoint; stats?: Record<string, number> },
): Frame<PlotState> {
  return {
    state: { parts },
    line: o.line ?? null,
    note: o.note,
    vars: o.vars ?? {},
    stats: o.stats ?? {},
    ...(o.checkpoint && { checkpoint: o.checkpoint }),
  };
}

/**
 * A checkpoint's choices: the answer and up to three distinct wrong ones,
 * sorted so the answer's position gives nothing away. Null when the wrong
 * ones all coincide with the answer (nothing to ask).
 */
export function choices(answer: string, wrong: readonly string[], count = 4): Pick<Checkpoint, 'choices' | 'answer'> | null {
  const set = new Set([answer]);
  for (const w of wrong) if (set.size < count) set.add(w);
  if (set.size < 2) return null;
  const sorted = [...set].sort();
  return { choices: sorted, answer: sorted.indexOf(answer) };
}

/** A question whose choices keep the given order (Yes/No, named options). */
export function askInOrder(question: string, options: readonly string[], answer: string): Checkpoint {
  return { question, choices: options, answer: options.indexOf(answer) };
}

/** A question with sorted choices, or undefined when there is nothing to ask. */
export function ask(question: string, answer: string, wrong: readonly string[]): Checkpoint | undefined {
  const c = choices(answer, wrong);
  return c ? { question, ...c } : undefined;
}

/** Every number in the text, accepting a true minus sign. */
export function numbersIn(text: string): number[] {
  return (text.replace(/−/g, '-').match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
}

/** Plain-text number for custom input (ASCII minus, at most `digits` decimals). */
export const plain = (v: number, digits = 2) => String(round(v, digits));

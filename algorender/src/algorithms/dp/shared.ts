import type { InputSpec, StatSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

export const CELLS: StatSpec = { key: 'cells', label: 'Cells computed' };

/**
 * Bend for an arrow between two cells of one row that are `span` columns
 * apart: neighbours get a straight arrow, longer jumps arc over the cells in
 * between, higher the further they reach (capped so the arc stays near its
 * row). A positive bend arcs up for a left-to-right arrow; negate it for a
 * right-to-left arrow that should also arc up.
 */
export const arcBend = (span: number) => (Math.abs(span) <= 1 ? 0 : Math.min(1.1, 0.4 + 0.25 * Math.log2(Math.abs(span))));

/** "a, b and c" / "a or b". */
export function joinWords(words: readonly string[], last = 'and'): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${last} ${words.at(-1)}`;
}

/** Reproducible integers in [min, max]. */
export function randomInts(seed: number, count: number, min: number, max: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => min + Math.floor(rng() * (max - min + 1)));
}

/** Clamps a size-slider value (examples are also built with size 0 by tests). */
export const clampSize = (size: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(size) || min));

/**
 * Choices for "what value goes here?": the answer plus plausible wrong values
 * (given first, then answer ± 1, ± 2), in ascending order, so the answer's
 * position varies with the numbers rather than being fixed.
 */
export function numberChoices(answer: number, wrong: readonly number[], count = 4): { choices: string[]; answer: number } {
  const set = new Set<number>([answer]);
  for (const w of wrong) if (set.size < count && w >= 0 && Number.isInteger(w)) set.add(w);
  for (const d of [1, -1, 2, 3, -2]) if (set.size < count && answer + d >= 0) set.add(answer + d);
  const sorted = [...set].sort((a, b) => a - b);
  return { choices: sorted.map(String), answer: sorted.indexOf(answer) };
}

export type StringPair = { a: string; b: string };

const WORD = /^[A-Za-z0-9]+$/;

/** Custom input "first, second" for the two-string DPs (LCS, edit distance). */
export function stringPairCustom(maxLength: number): NonNullable<InputSpec<StringPair>['custom']> {
  return {
    label: `Two words (letters or digits, up to ${maxLength} each)`,
    placeholder: 'e.g. kitten, sitting',
    parse: (text) => {
      const words = text.split(/\s*(?:,|→|->|\s)\s*/).filter(Boolean);
      if (words.length !== 2) return { error: 'Enter exactly two words, separated by a comma.' };
      for (const w of words) {
        if (!WORD.test(w)) return { error: `"${w}" may only contain letters and digits.` };
        if (w.length > maxLength) return { error: `"${w}" is longer than ${maxLength} characters.` };
      }
      return { value: { a: words[0], b: words[1] } };
    },
    format: ({ a, b }) => `${a}, ${b}`,
  };
}

/** A reproducible random word over a small alphabet, so letters repeat and match often. */
export function randomWord(seed: number, length: number, alphabet = 'ABCD'): string {
  const rng = createRng(seed);
  return Array.from({ length }, () => alphabet[Math.floor(rng() * alphabet.length)]).join('');
}

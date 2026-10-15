import type { InputSpec, StatSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

export const CELLS: StatSpec = { key: 'cells', label: 'Cells computed' };

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

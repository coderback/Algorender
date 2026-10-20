import type { InputExample, InputSpec, StatSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

export type MatchInput = { text: string; pattern: string };

export const PATTERN_MAX = 8;
export const PALINDROME_MAX = 15;

export const COMPARISONS: StatSpec = { key: 'comparisons', label: 'Character comparisons' };

type Rng = () => number;
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T => items[randInt(rng, 0, items.length - 1)];
const randomText = (rng: Rng, length: number, alphabet: string) =>
  Array.from({ length }, () => alphabet[randInt(rng, 0, alphabet.length - 1)]).join('');
const shuffled = <T>(rng: Rng, items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const plant = (text: string, at: number, word: string) => text.slice(0, at) + word + text.slice(at + word.length);

/** Every position where `pattern` occurs in `text`, overlaps included. The reference the visualisers are tested against. */
export function occurrences(text: string, pattern: string): number[] {
  const out: number[] = [];
  for (let s = 0; s + pattern.length <= text.length; s++) if (text.startsWith(pattern, s)) out.push(s);
  return out;
}

// ─────────────────────────── Rabin–Karp hash ───────────────────────────

/** Rabin–Karp's hash: letters as digits a = 1 … z = 26, read in base 26, modulo a prime. */
export const HASH_BASE = 26;
export const HASH_MOD = 101;
export const letterValue = (ch: string) => ch.charCodeAt(0) - 96;
/**
 * Character comparisons the naive search makes on the same text: at every
 * shift, compare left to right until a mismatch or the whole pattern. Shown
 * beside the real count so the saving is visible (V7).
 */
export function naiveComparisons(text: string, pattern: string): number {
  let count = 0;
  for (let s = 0; s + pattern.length <= text.length; s++) {
    for (let j = 0; j < pattern.length; j++) {
      count++;
      if (text[s + j] !== pattern[j]) break;
    }
  }
  return count;
}

export function hashOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * HASH_BASE + letterValue(ch)) % HASH_MOD;
  return h;
}

/** A different 3-letter word with the same hash as `word`, chosen by `rng`. */
function collisionFor(rng: Rng, word: string): string {
  const target = hashOf(word);
  const found: string[] = [];
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const a of letters) for (const b of letters) for (const c of letters) {
    const w = a + b + c;
    if (w !== word && hashOf(w) === target) found.push(w);
  }
  return pick(rng, found);
}

// ─────────────────────────── matching inputs ───────────────────────────

type Make = (rng: Rng, size: number) => MatchInput;

const OVERLAPPING = ['aba', 'abab', 'aaa', 'abcab', 'aabaa'];

const matchExamples: Record<string, { label: string; make: Make }> = {
  repeated: {
    label: 'Repeated pattern',
    make: (rng, size) => {
      const m = Math.min(size, randInt(rng, 3, 4));
      let pattern = randomText(rng, m, 'abc');
      if (new Set(pattern).size === 1) pattern = 'ab' + pattern.slice(2);
      let text = randomText(rng, size, 'abc');
      const copies = Math.max(1, Math.min(3, Math.floor(size / (m + 2))));
      const segment = Math.floor(size / copies);
      for (let c = 0; c < copies; c++) text = plant(text, c * segment + randInt(rng, 0, segment - m), pattern);
      return { text, pattern };
    },
  },
  overlapping: {
    label: 'Overlapping matches',
    make: (rng, size) => {
      // Repeat the pattern's period: every period-step is a match, and consecutive matches overlap.
      const periodOf = (p: string) => [...p].findIndex((_, k) => k > 0 && p.startsWith(p.slice(k)));
      // Leave room for two overlapping copies after a lead of up to two letters.
      const pattern = pick(rng, OVERLAPPING.filter((p) => p.length + periodOf(p) + 2 <= size));
      const period = periodOf(pattern);
      const lead = randomText(rng, randInt(rng, 0, 2), 'c');
      const body = pattern.slice(0, period).repeat(Math.ceil(size / period) + 1);
      return { text: (lead + body).slice(0, size), pattern };
    },
  },
  none: {
    label: 'No match',
    make: (rng, size) => {
      const text = randomText(rng, size, 'ab');
      for (let attempt = 0; attempt < 32; attempt++) {
        const pattern = randomText(rng, 4, 'ab');
        if (!text.includes(pattern)) return { text, pattern };
      }
      // The text may hold every 4-letter word over {a, b}; it can't hold all 32 five-letter ones.
      const fives = Array.from({ length: 32 }, (_, k) => k.toString(2).padStart(5, '0').replace(/0/g, 'a').replace(/1/g, 'b'));
      return { text, pattern: shuffled(rng, fives).find((p) => !text.includes(p))! };
    },
  },
  naive: {
    // a…ab against a…ab: a naive matcher compares almost the whole pattern at every shift.
    label: 'Worst case for naive matching',
    make: (rng, size) => {
      const [a, b] = shuffled(rng, ['a', 'b', 'c']);
      const m = Math.min(size, randInt(rng, 3, 5));
      return { text: a.repeat(size - 1) + b, pattern: a.repeat(m - 1) + b };
    },
  },
  collision: {
    label: 'Hash collision',
    make: (rng, size) => {
      const pattern = randomText(rng, 3, 'abc');
      const decoy = collisionFor(rng, pattern);
      let text = randomText(rng, size, 'abcde');
      const half = Math.floor(size / 2);
      text = plant(text, randInt(rng, 0, half - 3), decoy);
      text = plant(text, randInt(rng, half, size - 3), pattern);
      return { text, pattern };
    },
  },
};

/** `text: abababca | pattern: abab`, or just `abababca | abab`. */
export function parseMatch(raw: string, textMax: number): { value: MatchInput } | { error: string } {
  const parts = raw.split('|');
  if (parts.length !== 2) return { error: 'Write the text, then |, then the pattern, e.g. text: abababca | pattern: abab.' };
  const fields: Partial<Record<'text' | 'pattern', string>> = {};
  const unlabelled: string[] = [];
  for (const part of parts) {
    const m = /^\s*(?:(text|pattern)\s*:)?\s*(.*?)\s*$/i.exec(part)!;
    const label = m[1]?.toLowerCase() as 'text' | 'pattern' | undefined;
    if (label) {
      if (fields[label] != null) return { error: `"${label}" appears twice.` };
      fields[label] = m[2];
    } else unlabelled.push(m[2]);
  }
  for (const key of ['text', 'pattern'] as const) if (fields[key] == null) fields[key] = unlabelled.shift();
  const text = fields.text!.toLowerCase();
  const pattern = fields.pattern!.toLowerCase();
  for (const [name, value] of [['text', text], ['pattern', pattern]] as const) {
    if (value === '') return { error: `The ${name} is empty.` };
    if (!/^[a-z]+$/.test(value)) return { error: `Use letters a–z only in the ${name} (no spaces, digits or punctuation).` };
  }
  if (text.length > textMax) return { error: `Keep the text to ${textMax} letters or fewer so every column stays readable.` };
  if (pattern.length > PATTERN_MAX) return { error: `Keep the pattern to ${PATTERN_MAX} letters or fewer.` };
  if (pattern.length > text.length) return { error: 'The pattern is longer than the text, so it cannot occur.' };
  return { value: { text, pattern } };
}

/** Input spec for "a text and a pattern": seeded examples sized by the text-length slider, plus custom text. */
export function matchInput({
  examples,
  textMax,
  defaultSize,
}: {
  examples: readonly string[];
  textMax: number;
  defaultSize: number;
}): InputSpec<MatchInput> {
  const built = examples.map((id): InputExample<MatchInput> => {
    const ex = matchExamples[id];
    if (!ex) throw new Error(`Unknown matching example "${id}"`);
    return { id, label: ex.label, make: ({ seed, size }) => ex.make(createRng(seed), Math.max(8, Math.min(textMax, size))) };
  });
  const [first, ...rest] = built;
  if (!first) throw new Error('matchInput needs at least one example');
  return {
    examples: [first, ...rest],
    size: { label: 'Text length', min: 8, max: textMax, default: defaultSize },
    custom: {
      label: `Your own text and pattern (letters a–z; text up to ${textMax}, pattern up to ${PATTERN_MAX})`,
      placeholder: 'e.g. text: abababca | pattern: abab',
      parse: (text) => parseMatch(text, textMax),
      format: ({ text, pattern }) => `text: ${text} | pattern: ${pattern}`,
    },
  };
}

// ─────────────────────────── palindrome inputs ───────────────────────────

const palindromeOf = (half: string, odd: string) => half + odd + [...half].reverse().join('');

/** Puts `core` at a random place inside random filler of the given size. */
function embed(rng: Rng, core: string, size: number, filler: string): string {
  const pad = size - core.length;
  const left = randInt(rng, 0, pad);
  return randomText(rng, left, filler) + core + randomText(rng, pad - left, filler);
}

const palindromeExamples: Record<string, { label: string; make: (rng: Rng, size: number) => string }> = {
  nested: {
    // x, xyx, xyxzxyx, …: palindromes inside palindromes, where mirroring saves the most work.
    label: 'Nested palindromes',
    make: (rng, size) => {
      const letters = shuffled(rng, [...'abcdefgh']);
      let core = letters[0];
      for (let k = 1; core.length * 2 + 1 <= size; k++) core = core + letters[k] + core;
      return embed(rng, core, size, letters.slice(5).join(''));
    },
  },
  odd: {
    label: 'Odd-length palindrome',
    make: (rng, size) => {
      const half = randomText(rng, randInt(rng, 2, Math.min(3, Math.floor((size - 1) / 2))), 'abcd');
      return embed(rng, palindromeOf(half, randomText(rng, 1, 'abcd')), size, 'abcd');
    },
  },
  even: {
    label: 'Even-length palindrome',
    make: (rng, size) => {
      const half = randomText(rng, randInt(rng, 2, Math.min(3, Math.floor(size / 2))), 'abcd');
      return embed(rng, palindromeOf(half, ''), size, 'abcd');
    },
  },
  same: {
    label: 'One repeated letter',
    make: (rng, size) => pick(rng, [...'abcdefgh']).repeat(size),
  },
  distinct: {
    label: 'All letters different',
    make: (rng, size) => shuffled(rng, [...'abcdefghijklmnopqrstuvwxyz']).slice(0, size).join(''),
  },
};

export function parseWord(raw: string): { value: string } | { error: string } {
  const word = raw.trim().toLowerCase();
  if (word === '') return { error: 'Enter a word.' };
  if (!/^[a-z]+$/.test(word)) return { error: 'Use letters a–z only (no spaces, digits or punctuation).' };
  if (word.length > PALINDROME_MAX) return { error: `Keep it to ${PALINDROME_MAX} letters or fewer so every column stays readable.` };
  return { value: word };
}

export function palindromeInput({ examples, defaultSize }: { examples: readonly string[]; defaultSize: number }): InputSpec<string> {
  const built = examples.map((id): InputExample<string> => {
    const ex = palindromeExamples[id];
    if (!ex) throw new Error(`Unknown palindrome example "${id}"`);
    return { id, label: ex.label, make: ({ seed, size }) => ex.make(createRng(seed), Math.max(5, Math.min(PALINDROME_MAX, size))) };
  });
  const [first, ...rest] = built;
  if (!first) throw new Error('palindromeInput needs at least one example');
  return {
    examples: [first, ...rest],
    size: { label: 'Length', min: 5, max: PALINDROME_MAX, default: defaultSize },
    custom: {
      label: `Your own word (letters a–z, up to ${PALINDROME_MAX})`,
      placeholder: 'e.g. racecar',
      parse: parseWord,
      format: (word) => word,
    },
  };
}

export const quote = (s: string) => `“${s}”`;

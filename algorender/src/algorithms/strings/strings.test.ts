import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { TextTracer } from '@/viz/text/tracer';
import type { TextState } from '@/viz/text/types';
import { stringAlgorithms } from '.';
import { hashOf, naiveComparisons, occurrences, parseMatch, parseWord, type MatchInput } from './shared';

const bySlug = (slug: string) => stringAlgorithms.find((a) => a.slug === slug)!;
const matchers = stringAlgorithms.filter((a) => a.slug !== 'manacher');
const manacher = bySlug('manacher');

const traceOf = (algo: AnyAlgorithm, input: unknown) => recordTrace<TextState>(algo.run(input));
const finalState = (frames: Frame<TextState>[]) => frames.at(-1)!.state;
const rowValues = (state: TextState, id: string) => state.rows.find((r) => r.id === id)!.cells.map((c) => c.text);

// ───────────────────────────── references ─────────────────────────────

function prefixFunction(p: string): number[] {
  return [...p].map((_, i) => {
    for (let len = i; len > 0; len--) if (p.slice(0, len) === p.slice(i + 1 - len, i + 1)) return len;
    return 0;
  });
}

function zArray(s: string): number[] {
  return [...s].map((_, k) => {
    if (k === 0) return 0;
    let z = 0;
    while (k + z < s.length && s[z] === s[k + z]) z++;
    return z;
  });
}

function radii(t: string): number[] {
  return [...t].map((_, i) => {
    let p = 0;
    while (i - p - 1 >= 0 && i + p + 1 < t.length && t[i - p - 1] === t[i + p + 1]) p++;
    return p;
  });
}

const isPalindrome = (s: string) => s === [...s].reverse().join('');
function longestPalindromeLength(s: string): number {
  let best = 0;
  for (let a = 0; a < s.length; a++) for (let b = a + 1; b <= s.length; b++) if (b - a > best && isPalindrome(s.slice(a, b))) best = b - a;
  return best;
}

// ───────────────────────────── arbitraries ─────────────────────────────

const word = (alphabet: string, min: number, max: number) =>
  fc.array(fc.constantFrom(...alphabet), { minLength: min, maxLength: max }).map((cs) => cs.join(''));

/** Small alphabets so matches, overlaps and borders are common. */
const matchInputs = (textMax: number) =>
  fc.oneof(word('ab', 1, textMax), word('abc', 1, textMax)).chain((text) =>
    fc.record({
      text: fc.constant(text),
      pattern: fc.oneof(
        word('ab', 1, Math.min(8, text.length)),
        // A substring of the text, so most runs have at least one match.
        fc.integer({ min: 0, max: text.length - 1 }).chain((from) =>
          fc.integer({ min: 1, max: Math.min(8, text.length - from) }).map((len) => text.slice(from, from + len)),
        ),
      ),
    }),
  );
const textMaxOf = (algo: AnyAlgorithm) => (algo.slug === 'z-algorithm' ? 22 : 24);
const inputsFor = (algo: AnyAlgorithm): fc.Arbitrary<unknown> => (algo === manacher ? word('abc', 1, 15) : matchInputs(textMaxOf(algo)));

// ───────────────────────────── correctness ─────────────────────────────

describe.each(matchers)('$slug finds matches', (algo) => {
  it('reports exactly the positions where the pattern occurs, overlaps included', () => {
    fc.assert(
      fc.property(matchInputs(textMaxOf(algo)), (input) => {
        const { frames, truncated } = traceOf(algo, input);
        expect(truncated).toBe(false);
        expect(finalState(frames).results.items).toEqual(occurrences(input.text, input.pattern).map(String));
      }),
      { numRuns: 150 },
    );
  });
});

describe('kmp', () => {
  const kmp = bySlug('kmp');
  it('builds the prefix function (lps table) of the pattern', () => {
    fc.assert(
      fc.property(matchInputs(24), (input) => {
        const state = finalState(traceOf(kmp, input).frames);
        expect(rowValues(state, 'lps').map(Number)).toEqual(prefixFunction(input.pattern));
      }),
      { numRuns: 100 },
    );
  });
  it('never compares more than 2m letters building the table or 2n searching', () => {
    fc.assert(
      fc.property(matchInputs(24), ({ text, pattern }) => {
        const stats = traceOf(kmp, { text, pattern }).frames.at(-1)!.stats;
        expect(stats.tableComparisons).toBeLessThanOrEqual(2 * pattern.length);
        expect(stats.comparisons).toBeLessThanOrEqual(2 * text.length);
      }),
      { numRuns: 100 },
    );
  });
  it('slides the pattern under the text at shift i − j while comparing', () => {
    fc.assert(
      fc.property(matchInputs(24), (input) => {
        for (const frame of traceOf(kmp, input).frames) {
          const { i, j } = frame.vars;
          if (frame.checkpoint && typeof i === 'number' && typeof j === 'number' && frame.state.rows.some((r) => r.id === 'text')) {
            expect(frame.state.rows.find((r) => r.id === 'pattern')!.offset).toBe(i - j);
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('z-algorithm', () => {
  const z = bySlug('z-algorithm');
  it('computes the Z array of P$T', () => {
    fc.assert(
      fc.property(matchInputs(22), (input) => {
        const state = finalState(traceOf(z, input).frames);
        const S = `${input.pattern}$${input.text}`;
        expect(rowValues(state, 'z').slice(1).map(Number)).toEqual(zArray(S).slice(1));
        expect(traceOf(z, input).frames.at(-1)!.stats.comparisons).toBeLessThanOrEqual(2 * S.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe('rabin-karp', () => {
  const rk = bySlug('rabin-karp');
  it('shows the true hash of the current window whenever it compares hashes', () => {
    fc.assert(
      fc.property(matchInputs(24), ({ text, pattern }) => {
        for (const frame of traceOf(rk, { text, pattern }).frames) {
          if (frame.line !== 3) continue;
          const s = frame.vars.s as number;
          const readout = (id: string) => frame.state.readouts.find((r) => r.id === id)!.value;
          expect(readout('h')).toBe(String(hashOf(text.slice(s, s + pattern.length))));
          expect(readout('hp')).toBe(String(hashOf(pattern)));
        }
      }),
      { numRuns: 100 },
    );
  });
  it('counts a spurious hit exactly when a window shares the pattern’s hash but not its letters', () => {
    fc.assert(
      fc.property(matchInputs(24), ({ text, pattern }) => {
        let expected = 0;
        for (let s = 0; s + pattern.length <= text.length; s++) {
          const w = text.slice(s, s + pattern.length);
          if (w !== pattern && hashOf(w) === hashOf(pattern)) expected++;
        }
        expect(traceOf(rk, { text, pattern }).frames.at(-1)!.stats.spurious).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

describe('manacher', () => {
  it('computes every radius and the longest palindrome', () => {
    fc.assert(
      fc.property(word('abc', 1, 15), (s) => {
        const frames = traceOf(manacher, s).frames;
        const state = finalState(frames);
        const T = `#${[...s].join('#')}#`;
        expect(rowValues(state, 'P').map(Number)).toEqual(radii(T));
        const [item] = state.results.items;
        const found = /^“([a-z]+)” at /.exec(item)![1];
        expect(found.length).toBe(longestPalindromeLength(s));
        expect(isPalindrome(found)).toBe(true);
        expect(s.includes(found)).toBe(true);
        expect(frames.at(-1)!.stats.comparisons).toBeLessThanOrEqual(2 * T.length);
      }),
      { numRuns: 150 },
    );
  });
  it('highlights the current centre i, not C', () => {
    const frames = traceOf(manacher, 'abacabad').frames;
    for (const f of frames) {
      const i = f.vars.i;
      if (typeof i !== 'number') continue;
      const keyed = Object.entries(f.state.marks).filter(([, m]) => m === 'key').map(([id]) => id);
      if (keyed.length) expect(keyed).toEqual([`T:${i}`]);
    }
  });
});

// ───────────────────────────── shared properties ─────────────────────────────

describe.each(stringAlgorithms)('$slug trace', (algo) => {
  it('narrates every frame, points at real pseudo-code lines and never lets counters go backwards', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        let prev: Record<string, number> = {};
        for (const frame of traceOf(algo, input).frames) {
          expect(frame.note.trim().length).toBeGreaterThan(0);
          if (frame.line != null) {
            expect(frame.line).toBeGreaterThanOrEqual(0);
            expect(frame.line).toBeLessThan(algo.pseudocode.length);
            expect(algo.pseudocode[frame.line].trim()).not.toBe('');
          }
          for (const [k, v] of Object.entries(frame.stats)) expect(v).toBeGreaterThanOrEqual(prev[k] ?? 0);
          prev = frame.stats;
        }
      }),
      { numRuns: 40 },
    );
  });

  it('asks well-formed predictions that the next frame resolves', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        const frames = traceOf(algo, input).frames;
        frames.forEach((frame, i) => {
          const c = frame.checkpoint;
          if (!c) return;
          expect(c.choices.length).toBeGreaterThanOrEqual(2);
          expect(c.choices.length).toBeLessThanOrEqual(4);
          expect(new Set(c.choices).size).toBe(c.choices.length);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(c.choices.length);
          expect(i).toBeLessThan(frames.length - 1);
          if (c.choices[c.answer].length > 3) expect(frame.note).not.toContain(c.choices[c.answer]);
        });
      }),
      { numRuns: 40 },
    );
  });

  it('only tracks the stats it displays, so the panel and the trace agree', () => {
    const input = algo.input.examples[0].make({ seed: 1, size: algo.input.size!.default });
    expect(Object.keys(traceOf(algo, input).frames[0].stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
  });

  it('keeps every cell, pointer, mark and range consistent, and never loses or duplicates a cell', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        const seen = new Map<string, string[]>(); // row id → cell ids, which must never change
        for (const { state } of traceOf(algo, input).frames) {
          const ids = state.rows.flatMap((r) => r.cells.map((c) => c.id));
          expect(new Set(ids).size).toBe(ids.length);
          for (const row of state.rows) {
            const cellIds = row.cells.map((c) => c.id);
            if (seen.has(row.id) && seen.get(row.id)!.length === cellIds.length) expect(cellIds).toEqual(seen.get(row.id));
            seen.set(row.id, cellIds);
            expect(row.offset).toBeGreaterThanOrEqual(0);
            if (row.offset === 0 || row.kind === 'numbers') expect(row.offset + row.cells.length).toBeLessThanOrEqual(state.columns);
          }
          const all = new Set(ids);
          for (const id of Object.keys(state.marks)) expect(all.has(id)).toBe(true);
          // Anything the narration points at must be inside the visible grid, not clipped off the edge.
          const column = (rowId: string, index: number) => state.rows.find((r) => r.id === rowId)!.offset + index;
          for (const p of state.pointers) expect(column(p.row, p.index)).toBeLessThan(state.columns);
          for (const r of state.ranges) {
            expect(r.from).toBeLessThanOrEqual(r.to);
            expect(column(r.row, r.to)).toBeLessThan(state.columns);
          }
          for (const row of state.rows) {
            row.cells.forEach((cell, k) => {
              if (state.marks[cell.id]) expect(row.offset + k).toBeLessThan(state.columns);
            });
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('never changes a frame after recording it (copy-on-write)', () => {
    fc.assert(
      fc.property(inputsFor(algo), (input) => {
        const snapshots: string[] = [];
        const frames: Frame<TextState>[] = [];
        for (const frame of algo.run(input) as Generator<Frame<TextState>>) {
          frames.push(frame);
          snapshots.push(JSON.stringify(frame));
        }
        frames.forEach((f, i) => expect(JSON.stringify(f)).toBe(snapshots[i]));
      }),
      { numRuns: 20 },
    );
  });

  it('builds and runs every example at several sizes and seeds', () => {
    const { min, max } = algo.input.size!;
    for (const example of algo.input.examples) {
      for (const size of [min, Math.floor((min + max) / 2), max]) {
        for (const seed of [1, 42, size * 31]) {
          const input = example.make({ seed, size });
          const text = typeof input === 'string' ? input : (input as MatchInput).text;
          expect(text).toHaveLength(size);
          expect(algo.input.custom!.parse(algo.input.custom!.format(input))).toEqual({ value: input });
          const { frames, truncated } = traceOf(algo, input);
          expect(truncated).toBe(false);
          expect(frames.length).toBeGreaterThan(3);
          if (typeof input === 'string') continue;
          const { pattern } = input as MatchInput;
          const found = occurrences(text, pattern);
          expect(finalState(frames).results.items).toEqual(found.map(String));
          if (example.id === 'none') expect(found).toEqual([]);
          if (example.id === 'repeated') expect(found.length).toBeGreaterThan(0);
          if (example.id === 'naive') expect(found).toEqual([size - pattern.length]);
          if (example.id === 'overlapping') {
            expect(found.length).toBeGreaterThan(1);
            expect(found[1] - found[0]).toBeLessThan(pattern.length);
          }
          if (example.id === 'collision') expect(frames.at(-1)!.stats.spurious).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('palindrome examples', () => {
  it('have the shape their names promise', () => {
    const make = (id: string, seed: number, size: number) => manacher.input.examples.find((e) => e.id === id)!.make({ seed, size }) as string;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const size of [5, 10, 15]) {
        expect(longestPalindromeLength(make('same', seed, size))).toBe(size);
        expect(longestPalindromeLength(make('distinct', seed, size))).toBe(1);
        expect(longestPalindromeLength(make('odd', seed, size))).toBeGreaterThanOrEqual(5);
        expect(longestPalindromeLength(make('even', seed, size))).toBeGreaterThanOrEqual(4);
        expect(longestPalindromeLength(make('nested', seed, size))).toBeGreaterThanOrEqual(size >= 7 ? 7 : 3);
      }
    }
  });
});

describe('custom input', () => {
  it('round-trips the documented format and accepts unlabelled or swapped fields', () => {
    expect(parseMatch('text: abababca | pattern: abab', 24)).toEqual({ value: { text: 'abababca', pattern: 'abab' } });
    expect(parseMatch('abababca | abab', 24)).toEqual({ value: { text: 'abababca', pattern: 'abab' } });
    expect(parseMatch('pattern: abab | text: ABABABCA', 24)).toEqual({ value: { text: 'abababca', pattern: 'abab' } });
  });

  it('explains what is wrong with bad input', () => {
    expect(parseMatch('abababca', 24)).toHaveProperty('error');
    expect(parseMatch('abc 1 | ab', 24)).toEqual({ error: expect.stringContaining('letters a–z') });
    expect(parseMatch(`${'a'.repeat(25)} | ab`, 24)).toEqual({ error: expect.stringContaining('24') });
    expect(parseMatch('abc | abcdefghij', 24)).toEqual({ error: expect.stringContaining('8') });
    expect(parseMatch('abc | abcd', 24)).toEqual({ error: expect.stringContaining('longer') });
    expect(parseMatch('abc | ', 24)).toEqual({ error: expect.stringContaining('empty') });
    expect(parseMatch('text: ab | text: a', 24)).toHaveProperty('error');
    expect(parseWord('Racecar')).toEqual({ value: 'racecar' });
    expect(parseWord('race car')).toHaveProperty('error');
    expect(parseWord('a'.repeat(16))).toHaveProperty('error');
  });
});

describe('TextTracer', () => {
  it('edits rows copy-on-write and keeps cell ids stable as a row slides', () => {
    const t = new TextTracer({ columns: 6, stats: ['comparisons'], results: { label: 'Found', empty: '–' } });
    t.addRow('a', 'A', 'abc');
    t.addRow('n', 'N', ['', '', ''], { kind: 'numbers' });
    const before = t.frame({ note: 'before' });
    t.setOffset('a', 2);
    t.setText('n', 1, '7');
    t.mark('found', ['a', 0]);
    const after = t.frame({ note: 'after', marks: { compare: [['a', 1]] } });
    expect(before.state.rows[0].offset).toBe(0);
    expect(before.state.rows[1].cells[1].text).toBe('');
    expect(before.state.marks).toEqual({});
    expect(after.state.rows[0].offset).toBe(2);
    expect(after.state.rows[0].cells.map((c) => c.id)).toEqual(before.state.rows[0].cells.map((c) => c.id));
    expect(after.state.rows[1].cells[1].text).toBe('7');
    expect(after.state.marks).toEqual({ 'a:0': 'found', 'a:1': 'compare' });
    expect(() => t.addRow('a', 'again', 'x')).toThrow();
    expect(() => t.text('a', 3)).toThrow();
  });
});

describe('the work strings skip (V7)', () => {
  it('counts the naive search the same way it would run', () => {
    expect(naiveComparisons('ababcab', 'abc')).toBe(3 + 1 + 3 + 1 + 1);
    expect(naiveComparisons('ab', 'abc')).toBe(0);
  });

  it('KMP draws every slide from the pattern’s old place to its new one', () => {
    fc.assert(
      fc.property(matchInputs(textMaxOf(bySlug('kmp'))), (input) => {
        const frames = traceOf(bySlug('kmp'), input).frames;
        frames.forEach(({ state }, k) => {
          if (!state.skip) return;
          const offsetOf = (s: TextState) => s.rows.find((r) => r.id === state.skip!.row)!.offset;
          expect(state.skip.to).toBe(offsetOf(state));
          expect(state.skip.from).toBe(offsetOf(frames[k - 1].state));
          expect(state.skip.to).toBeGreaterThan(state.skip.from);
        });
      }),
    );
  });

  it('Rabin–Karp lists each window once, only after its question is answered', () => {
    fc.assert(
      fc.property(matchInputs(textMaxOf(bySlug('rabin-karp'))), (input) => {
        const { text, pattern } = input as MatchInput;
        const frames = traceOf(bySlug('rabin-karp'), input).frames;
        let before = 0;
        for (const f of frames) {
          const entries = f.state.history?.entries ?? [];
          if (f.checkpoint) expect(entries.length).toBe(before);
          before = entries.length;
        }
        const windows = text.length >= pattern.length && pattern.length > 0 ? text.length - pattern.length + 1 : 0;
        expect(frames.at(-1)!.state.history?.entries.length ?? 0).toBe(windows);
      }),
    );
  });
});

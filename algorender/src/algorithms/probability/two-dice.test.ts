// Property tests for the two-dice board (B5 of the math and ML path): events
// are sets of the 36 equally likely cells, the rules for "not", "or" and "and"
// hold for every event, rectangles of rows × columns are exactly the
// independent pairs the stories show, simulated throws tally correctly and
// close in on 1/6, and every Predict question is answered by the next frame
// without its own frame giving the answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { expectGoodTrace, expectLegendMatchesMarks, expectShortPseudocode, traceOf } from '@/viz/grid/testing';
import type { GridState, ListPart, MeterPart, TablePart } from '@/viz/grid/types';
import type { MarkKey } from '@/viz/marks';
import {
  both,
  count,
  either,
  EVENTS,
  FACES,
  formatDice,
  hits,
  independent,
  not,
  OUTCOMES,
  over36,
  parseDice,
  prob,
  reduced,
  sumIs,
  tally,
  thousands,
  throwDice,
  THROW_COUNTS,
  THROW_SEED,
  TOTAL,
  twoDice,
  unorderedWays,
  waysToSum,
  type DiceInput,
  type Test,
} from './two-dice';

const trace = (input: DiceInput) => traceOf(twoDice, input).frames;
const boardOf = (f: Frame<GridState>) => f.state.parts.find((p): p is TablePart => p.kind === 'table')!;
const meterOf = (f: Frame<GridState>) => f.state.parts.find((p): p is MeterPart => p.kind === 'meter');
const listOf = (f: Frame<GridState>) => f.state.parts.find((p): p is ListPart => p.kind === 'list');
/** How many cells of the board carry this mark. */
const marked = (f: Frame<GridState>, mark: MarkKey) => Object.values(boardOf(f).marks).filter((m) => m === mark).length;
const answer = (f: Frame<GridState>) => f.checkpoint!.choices[f.checkpoint!.answer];

/** Every input the stories take, with a few seeds for the throws. */
const INPUTS: DiceInput[] = [
  ...Array.from({ length: 11 }, (_, i): DiceInput => ({ story: 'event', sum: i + 2 })),
  { story: 'or' },
  { story: 'and' },
  { story: 'dependent' },
  ...[0, 1, 7, 35, 2026, 999_999].map((seed): DiceInput => ({ story: 'throws', seed })),
];

/** A random event: any set of the 36 cells. */
const anyEvent = fc.array(fc.boolean(), { minLength: 36, maxLength: 36 }).map((bits): Test => (a, b) => bits[(a - 1) * 6 + (b - 1)]);
/** A rectangle: some rows (first die) × some columns (second die). */
const rowsAndCols = fc.tuple(fc.subarray([...FACES]), fc.subarray([...FACES]));

describe('two-dice', () => {
  it('plays every example, round-trips its text, and its legend lists exactly the marks it uses', () => {
    for (const ex of twoDice.input.examples) {
      const input = ex.make({ seed: 3, size: 0 });
      expectGoodTrace(twoDice, trace(input));
      expect(parseDice(formatDice(input))).toEqual({ value: input });
    }
    expectLegendMatchesMarks(twoDice);
    expectShortPseudocode(twoDice);
  });

  it('plays every input with the same frame count per story and enough questions for a challenge', () => {
    const counts: Record<string, Set<number>> = {};
    for (const input of INPUTS) {
      const frames = trace(input);
      expectGoodTrace(twoDice, frames);
      expect(parseDice(formatDice(input))).toEqual({ value: input });
      (counts[input.story] ??= new Set()).add(frames.length);
      expect(frames.filter((f) => f.checkpoint).length, formatDice(input)).toBeGreaterThanOrEqual(2);
    }
    expect(Object.values(counts).map((s) => s.size)).toEqual([1, 1, 1, 1, 1]);
    for (const story of ['or', 'dependent', 'event'] as const) {
      const input = INPUTS.find((i) => i.story === story)!;
      expect(trace(input).filter((f) => f.checkpoint).length, story).toBeGreaterThanOrEqual(3);
    }
  });

  it('refuses inputs outside the stories', () => {
    for (const text of ['sum 1', 'sum 13', 'sum', 'sum 7.5', 'throws', 'throws -3', `throws ${10 ** 10}`, 'xor', 'event 7', ''])
      expect(parseDice(text), text).toHaveProperty('error');
    expect(parseDice('  Sum   8 ')).toEqual({ value: { story: 'event', sum: 8 } });
    // Only the new-dice example uses its seed.
    const made = (id: string, seed: number) => JSON.stringify(twoDice.input.examples.find((e) => e.id === id)!.make({ seed, size: 0 }));
    expect(made('throws', 1)).toBe(made('throws', 2));
    expect(made('throws-new', 1)).not.toBe(made('throws-new', 2));
  });
});

describe('the board’s maths', () => {
  it('has 36 distinct ordered outcomes, and counts sums like a plain double loop', () => {
    expect(OUTCOMES.length).toBe(TOTAL);
    expect(new Set(OUTCOMES.map(([a, b]) => `${a},${b}`)).size).toBe(36);
    for (let s = 0; s <= 14; s++) {
      let ways = 0;
      let unordered = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          if (a + b === s) ways++;
          if (a <= b && a + b === s) unordered++;
        }
      expect(waysToSum(s), `sum ${s}`).toBe(ways);
      expect(unorderedWays(s)).toBe(unordered);
      expect(waysToSum(s)).toBe(s >= 2 && s <= 12 ? 6 - Math.abs(s - 7) : 0);
    }
    expect(Array.from({ length: 11 }, (_, i) => waysToSum(i + 2)).reduce((x, y) => x + y)).toBe(36);
    expect([over36(6), reduced(6), reduced(30), reduced(0), reduced(36), reduced(25)]).toEqual(['6/36', '1/6', '5/6', '0', '1', '25/36']);
    expect(thousands(36000)).toBe('36,000');
  });

  it('“not”, “or” and “and” obey their rules for every pair of events', () => {
    fc.assert(
      fc.property(anyEvent, anyEvent, (A, B) => {
        expect(prob(not(A))).toBeCloseTo(1 - prob(A), 12);
        expect(count(either(A, B))).toBe(count(A) + count(B) - count(both(A, B)));
        expect(count(both(A, B))).toBeLessThanOrEqual(Math.min(count(A), count(B)));
        // Independence is symmetric, survives swapping B for “not B”, and the sure and impossible events are independent of anything.
        expect(independent(A, B)).toBe(independent(B, A));
        expect(independent(A, not(B))).toBe(independent(A, B));
        expect(independent(A, () => true) && independent(A, () => false)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('every rectangle of rows × columns makes independent events, and multiplies', () => {
    fc.assert(
      fc.property(rowsAndCols, ([rows, cols]) => {
        const A: Test = (a) => (rows as number[]).includes(a);
        const B: Test = (_, b) => (cols as number[]).includes(b);
        expect(independent(A, B)).toBe(true);
        expect(count(both(A, B))).toBe(rows.length * cols.length);
        expect(prob(both(A, B))).toBeCloseTo((rows.length / 6) * (cols.length / 6), 12);
      }),
      { numRuns: 100 },
    );
  });

  it('the stories’ pairs are independent, or not, as they say', () => {
    const E = EVENTS;
    expect(independent(E.firstEven.test, E.secondHigh.test)).toBe(true);
    expect(independent(E.first6.test, E.second6.test)).toBe(true);
    expect(independent(E.sum7.test, E.first6.test)).toBe(true);
    expect(independent(E.sum10up.test, E.first6.test)).toBe(false);
    expect(independent(E.sum7.test, E.double.test)).toBe(false);
    expect(count(both(E.sum7.test, E.double.test))).toBe(0);
    // A sum other than 7 is not independent of the first die being 6.
    for (const s of [2, 6, 8, 12]) expect(independent(sumIs(s).test, E.first6.test), `sum ${s}`).toBe(false);
  });

  it('tallies seeded throws faithfully, and the share of sevens closes in on 1/6', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 1, max: 400 }), (seed, n) => {
        const t = throwDice(seed, n);
        expect(t).toEqual(throwDice(seed, n));
        for (const [a, b] of t) expect(FACES.includes(a as 1) && FACES.includes(b as 1)).toBe(true);
        const grid = tally(t, n);
        expect(grid.flat().reduce((x, y) => x + y)).toBe(n);
        expect(hits(t, n, EVENTS.sum7.test)).toBe(grid.reduce((s, row, i) => s + row[5 - i], 0));
      }),
      { numRuns: 60 },
    );
    // Over 36,000 throws every seed tried lands within 0.01 of 1/6 (4.6 standard deviations is 0.009).
    for (let seed = 0; seed < 20; seed++) {
      const t = throwDice(seed, 36000);
      expect(Math.abs(hits(t, 36000, EVENTS.sum7.test) / 36000 - 1 / 6)).toBeLessThan(0.01);
    }
  });
});

describe('two-dice’s questions', () => {
  it('are answered by what the next frame shows', () => {
    for (let s = 2; s <= 12; s++) {
      const f = trace({ story: 'event', sum: s });
      expect(answer(f[0])).toBe(String(waysToSum(s)));
      expect(marked(f[1], 'compare')).toBe(waysToSum(s));
      expect(answer(f[1])).toBe(over36(waysToSum(s)));
      expect(meterOf(f[2])!.segments.map((x) => x.amount)).toEqual([waysToSum(s)]);
      expect(answer(f[2])).toBe(over36(36 - waysToSum(s)));
      expect(marked(f[3], 'reject')).toBe(36 - waysToSum(s));
    }
    const or = trace({ story: 'or' });
    expect(answer(or[0])).toBe('11');
    expect(meterOf(or[1])!.segments.reduce((x, y) => x + y.amount, 0)).toBe(11);
    expect(answer(or[1])).toBe('12');
    expect(marked(or[2], 'compare') + marked(or[2], 'frontier')).toBe(12);
    expect(answer(or[2])).toBe('25');
    expect(marked(or[3], 'reject')).toBe(25);

    const and = trace({ story: 'and' });
    expect(answer(and[0])).toBe('6');
    expect(marked(and[1], 'found')).toBe(6);
    expect(answer(and[1])).toBe('No');
    expect(listOf(and[2])!.items.every((it) => it.text.endsWith('2 of 6 in B'))).toBe(true);

    const dep = trace({ story: 'dependent' });
    expect(dep.map((f) => (f.checkpoint ? answer(f) : null))).toEqual(['3', '0', '1', null]);
    expect([marked(dep[1], 'found'), marked(dep[2], 'found'), marked(dep[3], 'found')]).toEqual([3, 0, 1]);

    for (const seed of [0, 1, 7, THROW_SEED, 123_456]) {
      const f = trace({ story: 'throws', seed });
      const sevens = (k: number) => meterOf(f[k])!.segments.reduce((x, y) => x + y.amount, 0);
      // A chance promises no exact count, whatever this run's count turns out to be.
      expect(answer(f[0])).toBe('No');
      expect(f[1].note).toContain('A chance of 1/6 promises no exact count');
      expect(f[2].checkpoint!.choices).toEqual(['About 300', 'About 327', 'About 600']);
      expect(meterOf(f[1])!.total).toBe(36);
      expect(answer(f[2])).toBe('About 600');
      expect(Math.abs(sevens(3) - 600)).toBeLessThan(100);
      expect(f.map((x) => x.stats.throws)).toEqual([0, ...THROW_COUNTS]);
      // The board's tallies add up to the throws so far.
      f.slice(1).forEach((x, k) => expect(Object.values(boardOf(x).cells).flat().reduce((s, c) => s + Number(c), 0)).toBe(THROW_COUNTS[k]));
    }
  });

  it('never give their answer away in their own frame', () => {
    for (const input of INPUTS) {
      const frames = trace(input);
      frames.forEach((f, i) => {
        if (!f.checkpoint) return;
        const a = answer(f);
        const where = `${formatDice(input)} frame ${i}`;
        // Worded and fraction answers never appear in the note; counts are never stated as so many cells or outcomes.
        if (!/^\d+$/.test(a)) {
          if (!['Yes', 'No'].includes(a)) expect(f.note, where).not.toContain(a);
        } else {
          expect(f.note, where).not.toMatch(new RegExp(`(?<![\\d/])${a} (cells|outcomes)|(?<![\\d/])${a}/36`));
          expect(f.note, where).not.toMatch(new RegExp(`= ${a}(?![\\d/])`));
        }
        // Nor do the chips and meters beside the board.
        const shown = [...(listOf(f)?.items.map((it) => it.text) ?? []), ...(meterOf(f)?.segments.map((s) => s.label) ?? [])];
        for (const text of shown) expect(text.split(/[\s:=×()]+/), `${where}: ${text}`).not.toContain(a);
        // The next frame does show it (as a count, a fraction or a sentence).
        expect(frames[i + 1]).toBeDefined();
      });
    }
  });

  it('asks with real slips: unordered pairs, eleven sums, 6 + 6, the overlap and the product', () => {
    const e = trace({ story: 'event', sum: 7 });
    expect(e[0].checkpoint!.choices).toEqual(['3', '6', '7', '12']);
    expect(e[1].checkpoint!.choices).toEqual(['1/11', '3/21', '6/12', '6/36']);
    expect(e[2].checkpoint!.choices).toEqual(['10/11', '30/36', '6/30']);
    const or = trace({ story: 'or' });
    expect(or[0].checkpoint!.choices).toEqual(['6', '10', '11', '12']);
    const dep = trace({ story: 'dependent' });
    expect(dep[0].checkpoint!.choices).toContain('1');
    // The right answer does not always sit in the same place.
    const places = new Set(INPUTS.flatMap((input) => trace(input).flatMap((f) => (f.checkpoint ? [f.checkpoint.answer] : []))));
    expect(places.size).toBeGreaterThanOrEqual(3);
  });
});

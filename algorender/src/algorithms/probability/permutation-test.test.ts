// Property tests for the permutation test (B6 of the math and ML path): the
// shuffles match a plain Fisher–Yates driven by Park–Miller, the exact p
// matches a count over every split, p from shuffles closes in on it, no-effect
// p-values spread evenly, every question's answer is what the next frame
// shows, questions about random runs are fair on every seed, and no frame
// gives its own question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  ALPHA,
  anyFalseAlarm,
  BONFERRONI,
  choose,
  difference,
  EXPERIMENTS,
  exactTest,
  fastNext,
  FLASHCARDS,
  lit,
  manyTests,
  mean,
  nextState,
  nullExperiments,
  parsePermutation,
  pBin,
  permutationTest,
  PM_M,
  pmSeed,
  quickTest,
  REREADING,
  ROUNDS,
  rounds,
  SHUFFLES,
  shuffleTest,
  splitChoices,
  TESTS,
  type PermutationInput,
  type Story,
} from './permutation-test';

const trace = (input: PermutationInput) => traceOf(permutationTest, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(permutationTest, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 1, max: 1_000_000 });
const FRAMES: Record<Story, number> = { shuffle: 9, 'no-effect': 6, many: 5 };
const stock = (seed: number): PermutationInput => ({ story: 'shuffle', a: [...FLASHCARDS], b: [...REREADING], seed });
const scores = (min: number, max: number) => fc.array(fc.integer({ min: 0, max: 100 }), { minLength: min, maxLength: max });

function roundTrips(input: PermutationInput) {
  const custom = permutationTest.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** A plain Fisher–Yates driven by Park–Miller, written out separately as the reference. */
function referenceShuffles(a: readonly number[], b: readonly number[], shuffles: number, seed: number) {
  const pool = [...a, ...b];
  let state = seed;
  const diffs: number[] = [];
  for (let s = 0; s < shuffles; s++) {
    for (let i = pool.length - 1; i >= 1; i--) {
      state = (16807 * state) % 2147483647;
      const j = Math.floor((state / 2147483647) * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const A = pool.slice(0, a.length);
    const B = pool.slice(a.length);
    diffs.push(A.reduce((t, x) => t + x, 0) / A.length - B.reduce((t, x) => t + x, 0) / B.length);
  }
  const observed = a.reduce((t, x) => t + x, 0) / a.length - b.reduce((t, x) => t + x, 0) / b.length;
  const extreme = diffs.filter((d) => Math.abs(d) >= Math.abs(observed)).length;
  return { diffs, extreme, p: extreme / shuffles, state };
}

/** Every split by bitmask: the exact p by brute force. */
function bruteExact(a: readonly number[], b: readonly number[]) {
  const all = [...a, ...b];
  const n = all.length;
  const observed = Math.abs(difference(a, b));
  let splits = 0;
  let extreme = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    const A = all.filter((_, k) => mask & (1 << k));
    if (A.length !== a.length) continue;
    const B = all.filter((_, k) => !(mask & (1 << k)));
    splits++;
    if (Math.abs(mean(A) - mean(B)) >= observed) extreme++;
  }
  return { splits, extreme };
}

describe('the maths against plain references', () => {
  it('Schrage’s step is the Park–Miller step', () => {
    expect([nextState(1), nextState(16807), nextState(282475249)]).toEqual([16807, 282475249, 1622650073]);
    fc.assert(fc.property(fc.integer({ min: 1, max: PM_M - 1 }), (s) => {
        expect(fastNext(s)).toBe(nextState(s));
      }), { numRuns: 2000 });
    expect(fastNext(PM_M - 1)).toBe(nextState(PM_M - 1));
  });

  it('shuffles like a plain Fisher–Yates, and the quick test agrees', () => {
    fc.assert(
      fc.property(scores(2, 8), scores(2, 8), seeds, fc.integer({ min: 1, max: 300 }), (a, b, seed, n) => {
        const run = shuffleTest(a, b, n, seed);
        const ref = referenceShuffles(a, b, n, seed);
        expect(run.diffs).toEqual(ref.diffs);
        expect([run.extreme, run.p, run.state]).toEqual([ref.extreme, ref.p, ref.state]);
        expect(run.sums.map((s) => s / a.length - (a.reduce((t, x) => t + x, 0) + b.reduce((t, x) => t + x, 0) - s) / b.length)).toEqual(run.diffs);
        const quick = quickTest(a, b, n, seed);
        expect([quick.extreme, quick.state, quick.done]).toEqual([run.extreme, run.state, n]);
      }),
      { numRuns: 80 },
    );
  });

  it('every ordering of three is equally likely', () => {
    const counts = new Map<string, number>();
    let state = 12345;
    const pool = [0, 1, 2];
    const N = 6000;
    for (let s = 0; s < N; s++) {
      for (let i = 2; i > 0; i--) {
        state = nextState(state);
        const j = Math.floor((state / PM_M) * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      counts.set(pool.join(''), (counts.get(pool.join('')) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(Math.abs(c - N / 6)).toBeLessThan(120);
  });

  it('the exact p counts every split', () => {
    fc.assert(
      fc.property(scores(2, 6), scores(2, 6), (a, b) => {
        const exact = exactTest(a, b);
        const brute = bruteExact(a, b);
        expect([exact.splits, exact.extreme]).toEqual([brute.splits, brute.extreme]);
        expect(exact.splits).toBe(choose(a.length + b.length, a.length));
      }),
      { numRuns: 60 },
    );
    const flash = exactTest(FLASHCARDS, REREADING);
    expect([flash.observed, flash.splits, flash.extreme]).toEqual([10, 12870, 488]);
  });

  it('many shuffles close in on the exact p', () => {
    const run = shuffleTest(FLASHCARDS, REREADING, 40_000, 99);
    expect(Math.abs(run.p - exactTest(FLASHCARDS, REREADING).p)).toBeLessThan(0.006);
    // The shuffled differences balance around 0.
    expect(Math.abs(mean(run.diffs))).toBeLessThan(0.1);
  });

  it('counts n choose k, and the splits question’s slips are real and different', () => {
    for (let n = 0; n <= 16; n++) for (let k = 0; k <= n; k++) expect(choose(n, k)).toBe(k === 0 || k === n ? 1 : choose(n - 1, k - 1) + choose(n - 1, k));
    expect(splitChoices(8, 8)).toEqual({ answer: '12,870', slips: ['65,536', '518,918,400'] });
  });

  it('no-effect p-values spread evenly from 0 to 1', () => {
    const ps = nullExperiments(3, 600);
    const share = (f: (e: (typeof ps)[number]) => boolean) => ps.filter(f).length / ps.length;
    expect(share((e) => lit(e.extreme, SHUFFLES, ALPHA))).toBeGreaterThan(0.025);
    expect(share((e) => lit(e.extreme, SHUFFLES, ALPHA))).toBeLessThan(0.075);
    expect(share((e) => e.extreme > SHUFFLES / 2)).toBeGreaterThan(0.43);
    expect(share((e) => e.extreme > SHUFFLES / 2)).toBeLessThan(0.6);
    // The scores stay whole numbers in range.
    expect(ps.every((e) => [...e.a, ...e.b].every((x) => Number.isInteger(x) && x >= 0 && x <= 100))).toBe(true);
    expect([pBin(0, 1000), pBin(50, 1000), pBin(51, 1000), pBin(500, 1000), pBin(501, 1000), pBin(1000, 1000)]).toEqual([0, 0, 1, 9, 10, 19]);
  });

  it('a stopped round test decides “lit” as a full test would', () => {
    const r = rounds(5, 3);
    expect(r.lit.length).toBe(3);
    expect(r.lit.every((round) => round.length === TESTS)).toBe(true);
    // Stopping early never changes the verdict: more than the threshold's count already rules lit out.
    fc.assert(
      fc.property(scores(8, 8), scores(8, 8), seeds, (a, b, seed) => {
        const full = quickTest(a, b, 200, seed);
        const stopped = quickTest(a, b, 200, seed, 10);
        expect(stopped.extreme <= 10).toBe(full.extreme <= 10);
      }),
      { numRuns: 60 },
    );
    expect(anyFalseAlarm(ALPHA)).toBeCloseTo(0.6415, 4);
    expect(anyFalseAlarm(BONFERRONI)).toBeCloseTo(0.0488, 4);
  });
});

describe('permutation-test', () => {
  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of permutationTest.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as PermutationInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        for (const f of frames) {
          for (const part of f.state.parts) {
            if (part.kind !== 'plane') continue;
            for (const h of part.handles) {
              for (const to of [[1, h.at[1] + h.step], [1, h.at[1] - h.step], [1, h.at[1] + 4.3], [1, h.min[1]], [1, h.max[1]], [1, -50], [1, 500]] as Vec[]) {
                const moved = permutationTest.input.drag!(input as never, h.id, to) as PermutationInput;
                const again = trace(moved);
                good(again);
                roundTrips(moved);
                expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
              }
            }
          }
        }
      }
    }
  });

  it('drags A’s mean by whole points, at least one, inside 0 to 100', () => {
    const input = stock(7);
    const by = (dy: number) => (permutationTest.input.drag!(input as never, 'shift', [1, 76.5 + dy]) as PermutationInput & { story: 'shuffle' }).a;
    expect(by(0.125)).toEqual(FLASHCARDS.map((x) => x + 1));
    expect(by(-0.125)).toEqual(FLASHCARDS.map((x) => x - 1));
    expect(by(-5)).toEqual(FLASHCARDS.map((x) => x - 5));
    expect(by(0)).toEqual([...FLASHCARDS]);
    expect(Math.max(...by(400))).toBe(100);
    expect(Math.min(...by(-400))).toBe(0);
    // The handle sits on A's mean, on its step, inside its bounds.
    const h = planeOf(trace(input)[0].state, 'groups').handles[0];
    expect(h.at).toEqual([1, 76.5]);
    expect([h.min[1], h.max[1]]).toEqual([76.5 - 64, 76.5 + 9]);
  });

  it('plays any groups from any seed, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(scores(2, 8), scores(2, 8), seeds, (a, b, seed) => {
        const input: PermutationInput = { story: 'shuffle', a, b, seed };
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES.shuffle);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(5);
        frames.slice(1).forEach((f, i) => expect(f.stats.shuffles).toBeGreaterThanOrEqual(frames[i].stats.shuffles));
      }),
      { numRuns: 30 },
    );
  });

  it('plays the batch stories from any seed', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('no-effect', 'many'), seeds, (story, seed) => {
        const input = { story, seed } as PermutationInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(story === 'no-effect' ? 5 : 4);
        frames.slice(1).forEach((f, i) => expect(f.stats.shuffles).toBeGreaterThanOrEqual(frames[i].stats.shuffles));
      }),
      { numRuns: 8 },
    );
  });

  it('uses its seed: the same seed gives the same run, and new seeds new ones', () => {
    for (const ex of permutationTest.input.examples) {
      const a = JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as PermutationInput));
      expect(JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as PermutationInput))).toBe(a);
      expect(JSON.stringify(trace(ex.make({ seed: 4, size: 0 }) as PermutationInput))).not.toBe(a);
    }
    expect([pmSeed(0), pmSeed(7), pmSeed(PM_M)]).toEqual([1, 7, 1]);
  });

  it('refuses inputs outside the stories', () => {
    for (const text of [
      'coins seed 3',
      'many',
      'many seed 0',
      'many seed 1.5',
      'many seed 7 a 1 2',
      'no-effect seed 2147483647',
      'shuffle a 1 2 b 3 seed 7',
      'shuffle a 1 2 3 b 4 5 6',
      'shuffle a 1 2 3 4 5 6 7 8 9 b 1 2 seed 7',
      'shuffle a 1 2 101 b 4 5 seed 7',
      'shuffle a 1 2.5 b 4 5 seed 7',
      'shuffle a 1 -2 b 4 5 seed 7',
      'shuffle b 1 2 a 4 5 seed 7',
    ])
      expect(parsePermutation(text), text).toHaveProperty('error');
    expect(parsePermutation('shuffle a 1 2 b 3 4 5 seed 9')).toEqual({ value: { story: 'shuffle', a: [1, 2], b: [3, 4, 5], seed: 9 } });
    expect(parsePermutation('Many seed 2147483646')).toEqual({ value: { story: 'many', seed: 2147483646 } });
    const many: PermutationInput = { story: 'many', seed: 1 };
    expect(permutationTest.input.drag!(many as never, 'shift', [1, 0])).toBe(many);
  });
});

describe('every question’s answer is what the next frame shows', () => {
  it('shuffling the flashcard scores', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace(stock(seed));
        const run = shuffleTest(FLASHCARDS, REREADING, SHUFFLES, seed);
        expect(answer(frames, 0)).toBe('12,870');
        expect(frames[1].note).toContain('16 choose 8 = 12,870 ways');
        expect(readout(frames[1].state, 'latest')).toBe(`${run.diffs[0] > 0 ? '+' : ''}${fmt(run.diffs[0], 3)}`);
        expect(answer(frames, 3)).toBe('Near 0');
        // Near 0, not near the real +10 or the average score: on every seed.
        const avg = mean(run.diffs);
        expect(Math.abs(avg)).toBeLessThan(1);
        expect(readout(frames[4].state, 'average')).toBe(`${avg > 0 ? '+' : ''}${fmt(avg, 3)}`);
        expect(answer(frames, 4)).toBe('Those of +10 or more, or −10 or less');
        expect(readout(frames[5].state, 'extreme')).toBe(String(run.extreme));
        const tails = planeOf(frames[5].state, 'null');
        expect(tails.shapes.some((s) => s.kind === 'line' && s.id === 'mirror')).toBe(true);
        // The shaded bars hold exactly the extreme shuffles.
        const hist = tails.shapes.find((s) => s.kind === 'bars');
        if (hist?.kind !== 'bars') throw new Error('no bars');
        expect(hist.bars.filter((b) => b.mark === 'found').reduce((t, b) => t + b.y, 0)).toBe(run.extreme);
        expect(hist.bars.reduce((t, b) => t + b.y, 0)).toBe(SHUFFLES);
        expect(answer(frames, 5)).toBe(readout(frames[6].state, 'p'));
        expect(answer(frames, 5)).toBe(fmt(run.extreme / SHUFFLES, 4));
        expect(answer(frames, 6)).toBe('No');
        expect(frames[7].note).toMatch(/^No\. /);
        expect(answer(frames, 7)).toBe('4,000');
        expect(frames[8].note).toContain('4,000 for half');
        expect(readout(frames[8].state, 'exact')).toBe('0.0379');
      }),
      { numRuns: 25 },
    );
  });

  it('the p question works on any groups', () => {
    fc.assert(
      fc.property(scores(2, 8), scores(2, 8), seeds, (a, b, seed) => {
        const frames = trace({ story: 'shuffle', a, b, seed });
        const run = shuffleTest(a, b, SHUFFLES, seed);
        expect(answer(frames, 0)).toBe(splitChoices(a.length, b.length).answer);
        const c = frames[5].checkpoint;
        if (c) expect(c.choices[c.answer]).toBe(readout(frames[6].state, 'p'));
        expect(readout(frames[6].state, 'p')).toBe(fmt(run.p, 4));
        expect(readout(frames[8].state, 'exact')).toBe(fmt(exactTest(a, b).p, 4));
      }),
      { numRuns: 30 },
    );
  });

  it('when nothing is going on', () => {
    for (const seed of [1, 2, 7, 26, 99, 2026, 31337, 500000]) {
      const frames = trace({ story: 'no-effect', seed });
      const ex = nullExperiments(seed, EXPERIMENTS);
      const below = ex.filter((e) => lit(e.extreme, SHUFFLES, ALPHA)).length;
      const above = ex.filter((e) => e.extreme > SHUFFLES / 2).length;
      expect(answer(frames, 0)).toBe('Rarely');
      // Asked before this experiment's p is shown.
      expect(readout(frames[0].state, 'p')).toBeUndefined();
      expect(readout(frames[1].state, 'p')).toBe(fmt(ex[0].p, 4));
      expect(answer(frames, 1)).toMatch(/^Flat/);
      // Flat: no bar holds more than two and a half times its share.
      const bars = planeOf(frames[2].state, 'pvalues').shapes.find((s) => s.kind === 'bars');
      if (bars?.kind !== 'bars') throw new Error('no bars');
      expect(bars.bars.reduce((t, b) => t + b.y, 0)).toBe(EXPERIMENTS);
      expect(Math.max(...bars.bars.map((b) => b.y))).toBeLessThanOrEqual(25);
      expect(answer(frames, 2)).toBe('About 1 in 20');
      expect(readout(frames[3].state, 'below')).toBe(`${below} of ${EXPERIMENTS}`);
      expect(answer(frames, 3)).toBe('p > 0.5');
      expect(readout(frames[4].state, 'above')).toBe(`${above} of ${EXPERIMENTS}`);
      expect(answer(frames, 4)).toBe('About 1 in 100');
      expect(frames[5].note).toContain('about 1 in 100');
    }
  });

  it('twenty tests at once', () => {
    for (const seed of [1, 2, 7, 26, 99, 2026]) {
      const frames = trace({ story: 'many', seed });
      const tests = manyTests(seed);
      const k = tests.filter((t) => lit(t.extreme, SHUFFLES, ALPHA)).length;
      expect(answer(frames, 0)).toBe('About 1');
      expect(readout(frames[1].state, 'lit')).toBe(`${k} of ${TESTS}`);
      expect(answer(frames, 1)).toBe('About 64%');
      expect(readout(frames[2].state, 'theory')).toBe('0.642');
      const any = rounds(seed).lit.filter((r) => r.some(Boolean)).length;
      expect(readout(frames[2].state, 'rounds')).toBe(`${any} of ${ROUNDS}`);
      expect(answer(frames, 2)).toBe('0.0025 = 0.05 ÷ 20');
      expect(answer(frames, 3)).toBe('About 5%');
      expect(readout(frames[4].state, 'theory')).toBe('0.0488');
    }
  });
});

describe('questions about random runs are fair on every seed', () => {
  it('one no-effect test rarely gives p ≤ 0.05, and p > 0.5 always outnumbers it', () => {
    // The first question is about such experiments in general: its answer is "Rarely" on every seed, and that is true.
    let small = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const [first] = nullExperiments(seed, 1);
      if (lit(first.extreme, SHUFFLES, ALPHA)) small++;
    }
    expect(small / 400).toBeLessThan(0.1);
    fc.assert(
      fc.property(seeds, (seed) => {
        const c = trace({ story: 'no-effect', seed })[0].checkpoint!;
        expect(c.choices[c.answer]).toBe('Rarely');
        expect(c.question).toMatch(/In experiments like this/);
      }),
      { numRuns: 15 },
    );
    for (let seed = 1; seed <= 40; seed++) {
      const ex = nullExperiments(seed, EXPERIMENTS);
      const below = ex.filter((e) => lit(e.extreme, SHUFFLES, ALPHA)).length;
      const above = ex.filter((e) => e.extreme > SHUFFLES / 2).length;
      expect(above, `seed ${seed}`).toBeGreaterThan(below);
      // About 1 in 20, never none and never near half.
      expect(below, `seed ${seed}`).toBeGreaterThan(0);
      expect(below, `seed ${seed}`).toBeLessThan(30);
    }
  });

  it('twenty tests light up about one, and most rounds of 100 show at least one lit', () => {
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      total += manyTests(seed).filter((t) => lit(t.extreme, SHUFFLES, ALPHA)).length;
      const any = rounds(seed).lit.filter((r) => r.some(Boolean)).length;
      // Nearer 64% than 36% or 100%, on every seed.
      expect(any, `seed ${seed}`).toBeGreaterThan(50);
      expect(any, `seed ${seed}`).toBeLessThan(82);
    }
    expect(total / 60).toBeGreaterThan(0.6);
    expect(total / 60).toBeLessThan(1.4);
  });

  it('the flashcards’ p from 1,000 shuffles is near the exact 0.0379 on every seed', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { p } = shuffleTest(FLASHCARDS, REREADING, SHUFFLES, seed);
      expect(Math.abs(p - 488 / 12870), `seed ${seed}`).toBeLessThan(0.025);
    }
  });
});

describe('no frame gives its own question’s answer away', () => {
  it('nor does an example’s label or an experiment’s prompt', () => {
    const said = permutationTest.input.examples.flatMap((ex) =>
      trace(ex.make({ seed: 7, size: 0 }) as PermutationInput).flatMap((f) => (f.checkpoint ? [f.checkpoint.choices[f.checkpoint.answer]] : [])),
    );
    const shown = [...permutationTest.input.examples.map((ex) => ex.label), ...permutationTest.content.experiments.map((x) => x.prompt)];
    for (const text of shown) {
      for (const answer of said) {
        if (answer === 'Yes' || answer === 'No') continue;
        for (const phrase of [...(PHRASES[answer] ?? [answer]), 'lands anywhere', 'lights up', 'level']) {
          const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          expect(text.toLowerCase(), `"${text}" gives away "${answer}"`).not.toMatch(new RegExp(`(?<![\\d.,])${esc}(?![\\d])`));
        }
      }
    }
  });

  it('the no-effect story’s level pile is only counted per bar after its share question', () => {
    const frames = trace({ story: 'no-effect', seed: 9 });
    expect(frames[2].checkpoint!.choices[frames[2].checkpoint!.answer]).toBe('About 1 in 20');
    expect(frames[2].note).not.toMatch(/in each bar|1 in 20|10 of 200/);
    expect(frames[3].note).toContain('about 10 in each bar');
  });

  const PHRASES: Record<string, string[]> = {
    '12,870': ['12,870', '12870'],
    'Near 0': ['near 0', 'around 0', 'balance'],
    'Those of +10 or more, or −10 or less': ['either side', 'either direction', 'both tails', 'both sides'],
    '4,000': ['4,000', '4000'],
    'Flat: about the same in every bar': ['flat', 'equally likely', 'evenly', 'anywhere'],
    'About 1 in 20': ['1 in 20', 'in each bar', 'equally likely'],
    'p > 0.5': ['p > 0.5', 'half the range', 'equally likely'],
    'About 1 in 100': ['1 in 100', 'equally likely'],
    'Rarely': ['rarely', 'rare'],
    'About 1': ['average 1', 'about one', 'one usually', 'lights up one'],
    'About 64%': ['0.64', '64%', '0.36', '36%', 'a third'],
    '0.0025 = 0.05 ÷ 20': ['0.0025', '÷ 20'],
    'About 5%': ['about 5%', '0.049'],
  };
  it('in its note or its readouts', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('shuffle', 'no-effect', 'many'), seeds, (story, seed) => {
        const input = story === 'shuffle' ? stock(seed) : ({ story, seed } as PermutationInput);
        for (const f of trace(input)) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => `${it.label} ${it.value}`) : []))].join(' \n ').toLowerCase();
          const where = `${story} ${seed}: "${c.question}" (${said})`;
          if (said === 'Yes' || said === 'No') continue;
          for (const phrase of PHRASES[said] ?? [said]) {
            const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(shown, where).not.toMatch(new RegExp(`(?<![\\d.,])${esc}(?![\\d])`));
          }
        }
      }),
      { numRuns: 12 },
    );
  });
});

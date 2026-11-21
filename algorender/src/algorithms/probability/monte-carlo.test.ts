// Property tests for the law of large numbers and Monte Carlo (B5 of the math
// and ML path): the running averages and estimates match plain reference
// loops, the lens's area formula matches geometry, the band ± 2σ/√n holds
// most runs, every question's answer is what the next frame shows, and no
// frame gives its own question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  AREA_ASK,
  areaEstimates,
  band,
  BAR_ASK,
  CLOSE,
  comma,
  DIE_MEAN,
  diceRun,
  DRAWN,
  errorBar,
  HUNDRED_THOUSAND,
  inLens,
  inQuarter,
  lensArea,
  lensBox,
  lensDarts,
  LENS_RANGE,
  MAX_N,
  monteCarlo,
  MOST,
  parseMonteCarlo,
  piEstimates,
  piRuns,
  P_QUARTER,
  rollDice,
  RUNS,
  runningMeans,
  samplesFor,
  SIGMA_DART,
  SIGMA_DIE,
  spread,
  SPREAD_CHOICES,
  surplus,
  throwDarts,
  type MonteCarloInput,
  type Story,
} from './monte-carlo';

const trace = (input: MonteCarloInput) => traceOf(monteCarlo, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(monteCarlo, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 0, max: 1_000_000 });
const FRAMES: Record<Story, number> = { dice: 8, darts: 15, runs: 8, area: 8 };
const D_GRID = Array.from({ length: 8 }, (_, k) => k * LENS_RANGE.step);

function roundTrips(input: MonteCarloInput) {
  const custom = monteCarlo.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

const inputOf = (story: Story, seed: number, d = 1): MonteCarloInput => (story === 'area' ? { story, d, seed } : { story, seed });

describe('monte-carlo', () => {
  it('misses 0.01 at 4,096 darts on most seeds, as the challenge’s last answer says', () => {
    let near = 0;
    for (let seed = 1; seed <= 200; seed++) if (Math.abs(piEstimates(throwDarts(seed))[MAX_N - 1] - Math.PI) < CLOSE) near++;
    expect(near).toBeLessThan(100);
  });

  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of monteCarlo.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as MonteCarloInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        for (const part of frames[0].state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [[h.at[0] + h.step, 0], [h.at[0] - h.step, 0.4], [h.min[0], 0], [h.max[0], 0], [-3, 0], [9, 0]] as Vec[]) {
              const moved = monteCarlo.input.drag!(input as never, h.id, to) as MonteCarloInput;
              const again = trace(moved);
              good(again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
      }
    }
  });

  it('plays every story from any seed, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('dice', 'darts', 'runs', 'area'), seeds, fc.constantFrom(...D_GRID), (story, seed, d) => {
        const input = inputOf(story, seed, d);
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(story === 'darts' || story === 'dice' ? 5 : 3);
        // The stage's sample count never goes down.
        frames.slice(1).forEach((f, i) => expect(f.stats.n).toBeGreaterThanOrEqual(frames[i].stats.n));
      }),
      { numRuns: 40 },
    );
  });

  it('uses its seed: the same seed gives the same run, and new seeds new ones', () => {
    for (const ex of monteCarlo.input.examples) {
      const a = JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as MonteCarloInput));
      expect(JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as MonteCarloInput))).toBe(a);
      expect(JSON.stringify(trace(ex.make({ seed: 4, size: 0 }) as MonteCarloInput))).not.toBe(a);
    }
  });

  it('refuses inputs outside the stories', () => {
    for (const text of ['coins seed 3', 'darts', 'darts seed -1', 'darts seed 1.5', 'dice seed 1 2', 'area seed 7', 'area d 2 seed 7', 'area d 0.3 seed 7', 'area d -0.25 seed 7', 'runs seed 99999999999'])
      expect(parseMonteCarlo(text), text).toHaveProperty('error');
    expect(parseMonteCarlo('area d 1.75 seed 0')).toEqual({ value: { story: 'area', d: 1.75, seed: 0 } });
    // Only the lens has a handle; dragging elsewhere leaves the input as it was.
    const dice: MonteCarloInput = { story: 'dice', seed: 1 };
    expect(monteCarlo.input.drag!(dice as never, 'd', [1, 0])).toBe(dice);
  });
});

describe('the maths against plain loops', () => {
  it('running means, π estimates and runs match a direct count', () => {
    fc.assert(
      fc.property(seeds, fc.integer({ min: 1, max: MAX_N }), (seed, n) => {
        const rolls = rollDice(seed);
        expect(rolls.every((r) => Number.isInteger(r) && r >= 1 && r <= 6)).toBe(true);
        const first = rolls.slice(0, n);
        expect(runningMeans(rolls)[n - 1]).toBeCloseTo(first.reduce((s, r) => s + r, 0) / n, 9);
        const darts = throwDarts(seed);
        expect(darts.every(([x, y]) => x >= 0 && x < 1 && y >= 0 && y < 1)).toBe(true);
        const inside = darts.slice(0, n).filter(([x, y]) => Math.hypot(x, y) <= 1).length;
        expect(piEstimates(darts)[n - 1]).toBeCloseTo((4 * inside) / n, 9);
      }),
      { numRuns: 60 },
    );
    const runs = piRuns(5, 3, 100);
    expect(runs.map((r) => r.length)).toEqual([100, 100, 100]);
    expect(new Set(runs.map((r) => r[99])).size).toBeGreaterThan(1);
    expect(spread([1, 3])).toBe(1);
    expect(comma(4096)).toBe('4,096');
    expect(comma(107900)).toBe('107,900');
  });

  it('the die’s and the dart’s spreads are right', () => {
    const faces = [1, 2, 3, 4, 5, 6];
    expect(faces.reduce((s, f) => s + f, 0) / 6).toBe(DIE_MEAN);
    expect(SIGMA_DIE).toBeCloseTo(Math.sqrt(faces.reduce((s, f) => s + (f - 3.5) ** 2, 0) / 6), 12);
    // One dart scores 4 with chance π/4, else 0.
    expect(SIGMA_DART).toBeCloseTo(Math.sqrt(P_QUARTER * (4 - Math.PI) ** 2 + (1 - P_QUARTER) * Math.PI ** 2), 12);
    expect(band(SIGMA_DIE, 64) / band(SIGMA_DIE, 256)).toBeCloseTo(2, 12);
    expect(band(SIGMA_DART, samplesFor(SIGMA_DART, CLOSE))).toBeCloseTo(CLOSE, 12);
  });

  it('the lens’s area matches geometry, and a dense grid of points', () => {
    expect(lensArea(0)).toBeCloseTo(Math.PI, 12);
    expect(lensArea(1)).toBeCloseTo((2 * Math.PI) / 3 - Math.sqrt(3) / 2, 12);
    for (const d of D_GRID) {
      const { x0, x1, y0, y1, area } = lensBox(d);
      expect(area).toBeCloseTo((x1 - x0) * (y1 - y0), 12);
      const N = 400;
      let hits = 0;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) if (inLens(d, [x0 + ((x1 - x0) * (i + 0.5)) / N, y0 + ((y1 - y0) * (j + 0.5)) / N])) hits++;
      expect(Math.abs((area * hits) / (N * N) - lensArea(d))).toBeLessThan(0.005);
      // The darts all land in the box, and the estimate is box area × share.
      const darts = lensDarts(11, d, 500);
      expect(darts.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)).toBe(true);
      expect(areaEstimates(d, darts)[499]).toBeCloseTo((area * darts.filter((p) => inLens(d, p)).length) / 500, 9);
    }
    expect(errorBar(2, 0.5, 16)).toBeCloseTo((2 * 2 * 0.5) / 4, 12);
  });

  it('the band holds about 19 runs in 20, and quadrupling the samples halves the spread', () => {
    let inside = 0;
    const SEEDS = 400;
    for (let s = 0; s < SEEDS; s++) if (Math.abs(diceRun(s).means[1023] - DIE_MEAN) <= band(SIGMA_DIE, 1024)) inside++;
    expect(inside / SEEDS).toBeGreaterThan(0.9);
    expect(inside / SEEDS).toBeLessThan(0.99);
    const runs = piRuns(1, 200, 1024);
    const sd = (n: number) => spread(runs.map((r) => r[n - 1]));
    expect(sd(64) / sd(1024)).toBeGreaterThan(3.2);
    expect(sd(64) / sd(1024)).toBeLessThan(4.8);
    expect(sd(1024)).toBeCloseTo(SIGMA_DART / 32, 2);
  });
});

describe('every question’s answer is what the next frame shows', () => {
  it('the dice', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'dice', seed });
        const run = diceRun(seed);
        expect(answer(frames, 0)).toBe('No');
        expect(Number.isInteger(run.means[0])).toBe(true);
        expect(answer(frames, 1)).toBe('No');
        expect(frames[1].checkpoint!.question).toContain(`was a ${run.rolls[0]}`);
        expect(answer(frames, 2)).toBe(readout(frames[3].state, 'band'));
        expect(answer(frames, 2)).toBe('± 0.85');
        expect(frames[2].checkpoint!.choices).toEqual(['± 0.43', '± 0.85', '± 1.71']);
        expect(answer(frames, 3)).toBe('1,024');
        expect(band(SIGMA_DIE, 1024)).toBeCloseTo(band(SIGMA_DIE, 16) / 8, 12);
        expect(readout(frames[6].state, 'n')).toBe('1,024');
        expect(answer(frames, 4)).toBe('No');
        expect(frames[4].checkpoint!.question).toContain(fmt(surplus(run, 64), 1).replace('-', '−'));
        // The face counts are drawn as shares, and add up.
        const bars = planeOf(frames[7].state, 'faces').shapes.find((s) => s.kind === 'bars');
        if (bars?.kind !== 'bars') throw new Error('no bars');
        expect(bars.bars.reduce((s, b) => s + Number(b.label), 0)).toBe(MAX_N);
        expect(readout(frames[7].state, 'mean')).toBe(fmt(run.means[MAX_N - 1], 3));
      }),
      { numRuns: 25 },
    );
  });

  it('the darts', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'darts', seed });
        const est = piEstimates(throwDarts(seed));
        expect(answer(frames, 0)).toBe('π/4');
        expect(answer(frames, 1)).toBe('0, 2 or 4');
        expect([0, 2, 4]).toContain(est[1]);
        expect(readout(frames[2].state, 'estimate')).toBe(fmt(est[1], 4));
        expect(answer(frames, 5)).toBe(readout(frames[6].state, 'band'));
        expect(frames[5].checkpoint!.choices).toEqual(['± 0.41', '± 0.58', '± 0.82']);
        expect(answer(frames, 10)).toBe('About 100,000');
        expect(frames[10].checkpoint!.choices).toEqual(HUNDRED_THOUSAND);
        const need = samplesFor(SIGMA_DART, CLOSE);
        expect(need).toBeGreaterThan(70_000);
        expect(need).toBeLessThan(140_000);
        // Asked about runs in general, so the answer is the same on every seed.
        expect(answer(frames, 12)).toBe('No, most runs are not');
        expect(frames[13].note).toContain(Math.abs(est[MAX_N - 1] - Math.PI) < CLOSE ? 'this one got lucky' : 'not within');
        expect(readout(frames[13].state, 'n')).toBe('4,096');
        // Darts are drawn up to the cap, inside ones marked.
        const square = planeOf(frames[13].state, 'square');
        const darts = square.shapes.filter((s) => s.kind === 'point');
        expect(darts.length).toBe(DRAWN);
        const thrown = throwDarts(seed);
        darts.forEach((s, k) => expect(s.kind === 'point' && (s.mark === 'found') === inQuarter(thrown[k])).toBe(true));
      }),
      { numRuns: 20 },
    );
  });

  it('the runs', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'runs', seed });
        const runs = piRuns(seed);
        expect(Number(answer(frames, 0))).toBe(new Set(runs.map((r) => r[0])).size);
        expect(answer(frames, 4)).toBe('A quarter as wide');
        expect(frames[4].checkpoint!.choices).toEqual(SPREAD_CHOICES);
        expect(band(SIGMA_DART, 1024) / band(SIGMA_DART, 64)).toBeCloseTo(0.25, 12);
        const inside = runs.filter((r) => Math.abs(r[1023] - Math.PI) <= band(SIGMA_DART, 1024)).length;
        expect(answer(frames, 5)).toBe(inside >= MOST ? 'Yes' : 'No');
        expect(readout(frames[6].state, 'inside')).toBe(`${inside} of ${RUNS}`);
      }),
      { numRuns: 15 },
    );
  });

  it('the lens', () => {
    fc.assert(
      fc.property(seeds, fc.constantFrom(...D_GRID), (seed, d) => {
        const frames = trace({ story: 'area', d, seed });
        const darts = lensDarts(seed, d);
        const est = areaEstimates(d, darts);
        expect(answer(frames, 0)).toBe(AREA_ASK[1]);
        const c = frames[1].checkpoint;
        if (c) expect(c.choices[c.answer]).toBe(readout(frames[2].state, 'estimate'));
        expect(readout(frames[2].state, 'estimate')).toBe(fmt(est[15], 3));
        expect(answer(frames, 2)).toBe(BAR_ASK[1]);
        const inside = darts.filter((p) => inLens(d, p)).length;
        const bar = errorBar(lensBox(d).area, inside / MAX_N, MAX_N);
        expect(answer(frames, 6)).toBe(Math.abs(est[MAX_N - 1] - lensArea(d)) <= bar ? 'Yes' : 'No');
        expect(readout(frames[7].state, 'exact')).toBe(fmt(lensArea(d), 4));
        // The handle sits on the second circle's centre.
        expect(planeOf(frames[0].state, 'lens').handles[0].at).toEqual([d, 0]);
      }),
      { numRuns: 30 },
    );
  });
});

describe('no frame gives its own question’s answer away', () => {
  const PHRASES: Record<string, string[]> = {
    'π/4': ['π/4'],
    '0, 2 or 4': ['0, 2 or 4'],
    'A quarter as wide': ['quarter'],
    'The area of the box': ['area of the box', "box's area"],
    'About half as wide': ['half as wide', 'halve'],
    'About 100,000': ['100,000', '107,'],
    '1,024': ['1,024', '1024'],
  };
  it('in its note or its readouts', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('dice', 'darts', 'runs', 'area'), seeds, fc.constantFrom(...D_GRID), (story, seed, d) => {
        for (const f of trace(inputOf(story, seed, d))) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => it.value) : []))].join(' \n ').toLowerCase();
          const where = `${story} ${seed}: "${c.question}" (${said})`;
          if (said === 'Yes' || said === 'No') continue;
          for (const phrase of PHRASES[said] ?? [said]) {
            // A number counts only as a whole number: 2 is not in 20.
            const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(shown, where).not.toMatch(new RegExp(`(?<![\\d.,])${esc}(?![\\d])`));
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

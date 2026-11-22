// Property tests for stochastic gradient descent (B6 of the math and ML path):
// the loss and its gradient match plain loops and measured slopes, shuffles
// are permutations, an epoch's batch gradients average to the full gradient,
// the spread of a batch's gradient matches every batch counted out, every
// question's answer is what the next frame shows, questions about random runs
// are right on every seed, and no frame gives its own question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import {
  aboveLowest,
  ALL,
  AVERAGE_CHOICES,
  BATCH_SIZES,
  batchSpread,
  CLOSER,
  cloudFor,
  COME_TO_REST,
  COMPARE_AT,
  COST_CHOICES,
  cut,
  DATA,
  descend,
  distanceToMin,
  DROP_EVERY,
  epochBatches,
  ETA0,
  EVERY_STEP,
  gradOn,
  L_MIN,
  lastEpochExcess,
  lossOn,
  MIN,
  N,
  parseSgd,
  PATH_EPOCHS,
  pathsRun,
  PER_EPOCH,
  PROBE,
  randomBatches,
  rate,
  S_STEPS,
  SAME_BATCH,
  scheduleRuns,
  SCHEDULES,
  sgd,
  shuffle,
  sigmaOne,
  spreadAround,
  stepsPerEpoch,
  uphill,
  upSteps,
  WARMUP,
  WARMUP_CHOICES,
  WHOLE_CHOICES,
  WIDTH_CHOICES,
  type SgdInput,
  type Story,
} from './sgd';
import { createRng } from '@/engine/random';

const trace = (input: SgdInput) => traceOf(sgd, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(sgd, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 0, max: 1_000_000 });
const FRAMES: Record<Story, number> = { paths: 16, batch: 7, schedules: 7 };
const inputOf = (story: Story, seed: number, batch = 4): SgdInput => (story === 'batch' ? { story, batch, seed } : { story, seed });
const SEEDS = Array.from({ length: 200 }, (_, k) => k * 7919 + 3);

function roundTrips(input: SgdInput) {
  const custom = sgd.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

describe('sgd', () => {
  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of sgd.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as SgdInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        for (const part of frames[0].state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [[h.at[0] + h.step, 0], [h.at[0] - h.step, 0.4], [h.min[0], 0], [h.max[0], 0], [-3, 0], [9, 0], [2.4, 0]] as Vec[]) {
              const moved = sgd.input.drag!(input as never, h.id, to) as SgdInput;
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

  it('plays every story from any seed and batch size, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('paths', 'batch', 'schedules'), seeds, fc.constantFrom(...BATCH_SIZES), (story, seed, batch) => {
        const input = inputOf(story, seed, batch);
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(story === 'paths' ? 6 : 5);
      }),
      { numRuns: 30 },
    );
  });

  it('uses its seed: the same seed gives the same run, and new seeds new ones', () => {
    for (const ex of sgd.input.examples) {
      const a = JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as SgdInput));
      expect(JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as SgdInput))).toBe(a);
      expect(JSON.stringify(trace(ex.make({ seed: 4, size: 0 }) as SgdInput))).not.toBe(a);
    }
  });

  it('refuses inputs outside the stories, and the handle moves only the batch size', () => {
    for (const text of ['walk seed 3', 'paths', 'paths seed -1', 'paths seed 1.5', 'schedules seed 1 2', 'batch seed 7', 'batch 3 seed 7', 'batch 64 seed 7', 'batch 0 seed 7', 'batch 4 seed 99999999999'])
      expect(parseSgd(text), text).toHaveProperty('error');
    expect(parseSgd('batch 32 seed 0')).toEqual({ value: { story: 'batch', batch: 32, seed: 0 } });
    expect(parseSgd('Schedules, seed 12')).toEqual({ value: { story: 'schedules', seed: 12 } });
    const paths: SgdInput = { story: 'paths', seed: 1 };
    expect(sgd.input.drag!(paths as never, 'batch', [3, 0])).toBe(paths);
    const batch: SgdInput = { story: 'batch', batch: 4, seed: 1 };
    expect(sgd.input.drag!(batch as never, 'batch', [3.2, 0])).toEqual({ ...batch, batch: 8 });
    expect(sgd.input.drag!(batch as never, 'batch', [-2, 0])).toEqual({ ...batch, batch: 1 });
    expect(sgd.input.drag!(batch as never, 'batch', [9, 0])).toEqual({ ...batch, batch: 32 });
    // The handle sits at the chosen batch size on the spread chart's log axis.
    for (const b of BATCH_SIZES) expect(planeOf(trace({ story: 'batch', batch: b, seed: 1 })[0].state, 'spread').handles[0].at).toEqual([Math.log2(b), 0]);
  });
});

describe('the maths against plain loops', () => {
  it('the data sit near y = 1.5x + 1, and the loss and gradient match a loop and measured slopes', () => {
    expect(DATA.length).toBe(N);
    expect(DATA.every((d) => d.x >= -2 && d.x <= 2 && Math.abs(Math.round(d.x * 100) - d.x * 100) < 1e-9)).toBe(true);
    fc.assert(
      fc.property(fc.double({ min: -3, max: 5, noNaN: true }), fc.double({ min: -3, max: 5, noNaN: true }), fc.uniqueArray(fc.integer({ min: 0, max: N - 1 }), { minLength: 1, maxLength: N }), (w, b, idx) => {
        const errs = idx.map((i) => w * DATA[i].x + b - DATA[i].y);
        expect(lossOn(w, b, idx)).toBeCloseTo(errs.reduce((s, e) => s + e * e, 0) / idx.length, 9);
        const h = 1e-5;
        const [gw, gb] = gradOn(w, b, idx);
        expect(gw).toBeCloseTo((lossOn(w + h, b, idx) - lossOn(w - h, b, idx)) / (2 * h), 4);
        expect(gb).toBeCloseTo((lossOn(w, b + h, idx) - lossOn(w, b - h, idx)) / (2 * h), 4);
      }),
      { numRuns: 80 },
    );
    // The lowest point is flat, and lower than anywhere near it.
    const g = gradOn(...MIN);
    expect(Math.hypot(...g)).toBeLessThan(1e-9);
    for (const [dw, db] of [[0.01, 0], [0, 0.01], [-0.01, 0.01]]) expect(lossOn(MIN[0] + dw, MIN[1] + db)).toBeGreaterThan(L_MIN);
    expect(L_MIN).toBeCloseTo(lossOn(...MIN), 12);
  });

  it('shuffles into permutations, cuts every point into one batch, and reshuffles every epoch', () => {
    fc.assert(
      fc.property(seeds, fc.integer({ min: 1, max: N }), fc.integer({ min: 1, max: 4 }), (seed, size, epochs) => {
        const all = epochBatches(seed, size, epochs);
        expect(all.length).toBe(epochs);
        for (const batches of all) {
          expect(batches.length).toBe(stepsPerEpoch(N, size));
          expect(batches.flat().sort((a, b) => a - b)).toEqual([...ALL]);
          expect(batches.slice(0, -1).every((b) => b.length === size)).toBe(true);
          expect(batches.at(-1)!.length).toBe(N - size * (batches.length - 1));
        }
      }),
      { numRuns: 60 },
    );
    expect(cut([0, 1, 2, 3, 4, 5, 6], 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    // Fisher–Yates is fair: every order of 3 items about equally often.
    const u = createRng(1);
    const counts = new Map<string, number>();
    for (let k = 0; k < 6000; k++) {
      const key = shuffle([0, 1, 2], u).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(Math.abs(c - 1000)).toBeLessThan(120);
  });

  it('an epoch’s batch gradients average to the full gradient, anywhere', () => {
    fc.assert(
      fc.property(seeds, fc.constantFrom(1, 2, 4, 8, 16), fc.double({ min: -2, max: 4, noNaN: true }), fc.double({ min: -2, max: 4, noNaN: true }), (seed, size, w, b) => {
        const grads = epochBatches(seed, size, 1)[0].map((batch) => gradOn(w, b, batch));
        const mean = [0, 1].map((k) => grads.reduce((s, g) => s + g[k], 0) / grads.length);
        const full = gradOn(w, b);
        expect(mean[0]).toBeCloseTo(full[0], 9);
        expect(mean[1]).toBeCloseTo(full[1], 9);
      }),
      { numRuns: 60 },
    );
  });

  it('the spread of a batch’s gradient matches every batch counted out', () => {
    const G = gradOn(...PROBE);
    const singles = ALL.map((i) => gradOn(PROBE[0], PROBE[1], [i]));
    expect(sigmaOne(PROBE)).toBeCloseTo(spreadAround(singles, G), 12);
    expect(batchSpread(PROBE, 1)).toBeCloseTo(sigmaOne(PROBE), 12);
    const pairs: Vec[] = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push(gradOn(PROBE[0], PROBE[1], [i, j]));
    expect(pairs.length).toBe(496);
    expect(batchSpread(PROBE, 2)).toBeCloseTo(spreadAround(pairs, G), 9);
    const allButOne = ALL.map((skip) => gradOn(PROBE[0], PROBE[1], ALL.filter((i) => i !== skip)));
    expect(batchSpread(PROBE, N - 1)).toBeCloseTo(spreadAround(allButOne, G), 9);
    expect(batchSpread(PROBE, N)).toBe(0);
    // Random batches measure it roughly; the rule σ₁/√B is close for small batches.
    for (const size of [2, 4, 8]) {
      const drawn = randomBatches(5, size, 2000).map((b) => gradOn(PROBE[0], PROBE[1], b));
      expect(spreadAround(drawn, G) / batchSpread(PROBE, size)).toBeGreaterThan(0.9);
      expect(spreadAround(drawn, G) / batchSpread(PROBE, size)).toBeLessThan(1.1);
    }
    expect(batchSpread(PROBE, 4) / batchSpread(PROBE, 1)).toBeCloseTo(Math.sqrt(28 / 31) / 2, 12);
  });

  it('the schedules', () => {
    expect(S_STEPS).toBe(96);
    for (let t = 0; t < S_STEPS; t++) {
      expect(rate('constant', t)).toBe(ETA0);
      expect(rate('step', t)).toBe(ETA0 / 2 ** Math.floor(Math.floor(t / 8) / DROP_EVERY));
      expect(rate('cosine', t)).toBeLessThanOrEqual(ETA0);
      if (t > 0) expect(rate('cosine', t)).toBeLessThan(rate('cosine', t - 1));
      if (t > WARMUP) expect(rate('warmup', t)).toBeLessThan(rate('warmup', t - 1));
      if (t > 0 && t < WARMUP) expect(rate('warmup', t)).toBeGreaterThan(rate('warmup', t - 1));
    }
    expect(rate('cosine', 0)).toBe(ETA0);
    expect(rate('cosine', 48)).toBeCloseTo(0.15, 12);
    expect(rate('warmup', WARMUP - 1)).toBe(ETA0);
    expect(rate('warmup', 0)).toBe(0.0375);
    expect(rate('step', S_STEPS - 1)).toBe(0.0375);
    const r = descend([0, 0], [[0, 1], [2]], () => 0.1);
    expect(r.at.length).toBe(3);
    expect(r.at[1]).toEqual([0 - 0.1 * gradOn(0, 0, [0, 1])[0], 0 - 0.1 * gradOn(0, 0, [0, 1])[1]]);
  });
});

describe('questions about random runs are right on every seed', () => {
  it('the loss goes up on some step of every run, and minibatches end 4 epochs nearer the bottom', () => {
    for (const seed of SEEDS) {
      const { mini, full, epochs } = pathsRun(seed);
      expect(upSteps(mini, COMPARE_AT * PER_EPOCH), `seed ${seed}`).toBeGreaterThan(0);
      expect(distanceToMin(mini.at[COMPARE_AT * PER_EPOCH])).toBeLessThan(distanceToMin(full.at[COMPARE_AT]));
      // Reshuffled: epoch 2's first batch is not epoch 1's.
      expect([...epochs[1][0]].sort().join()).not.toBe([...epochs[0][0]].sort().join());
      // Never comes to rest: the last epoch still moves.
      const last = mini.at.slice(-PER_EPOCH).map(distanceToMin);
      expect(Math.max(...last)).toBeGreaterThan(0.01);
      for (let k = 1; k < last.length; k++) expect(last[k]).not.toBe(last[k - 1]);
    }
  });

  it('cosine ends lower than constant, and constant never settles', () => {
    for (const seed of SEEDS) {
      const runs = scheduleRuns(seed);
      expect(lastEpochExcess(runs.cosine), `seed ${seed}`).toBeLessThan(lastEpochExcess(runs.constant));
      expect(Math.max(...runs.constant.at.slice(-8).map(distanceToMin))).toBeGreaterThan(0.01);
      for (const id of SCHEDULES) expect(runs[id].losses.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('every question’s answer is what the next frame shows', () => {
  it('the paths', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'paths', seed });
        const { mini, full } = pathsRun(seed);
        expect(answer(frames, 0)).toBe(String(PER_EPOCH));
        expect(frames[1].note).toContain(`${PER_EPOCH} batches of 4`);
        expect(answer(frames, 1)).toBe(AVERAGE_CHOICES[0]);
        expect(readout(frames[2].state, 'avg')).toBe(readout(frames[2].state, 'g'));
        expect(readout(frames[2].state, 'g')).toBe(fmtVec(gradOn(-1, -1.5)));
        expect(answer(frames, 2)).toBe(EVERY_STEP[1]);
        expect(readout(frames[14].state, 'up')).toBe(`${upSteps(mini, 32)} of 32`);
        // Which path ends nearer is asked before any step, from the cost of a step alone.
        expect(answer(frames, 3)).toBe(CLOSER[1]);
        expect(frames[3].stats.steps).toBe(0);
        expect(readout(frames[3].state, 'miniper')).toBe('8');
        expect(answer(frames, 11)).toBe(SAME_BATCH[1]);
        expect(frames[12].note).toMatch(/shares \d of its 4 points/);
        expect(frames[12].checkpoint).toBeUndefined();
        expect(Number(readout(frames[14].state, 'dmini'))).toBeLessThan(Number(readout(frames[14].state, 'dfull')));
        expect(answer(frames, 14)).toBe(COME_TO_REST[1]);
        expect(frames[15].note).toContain('never settles');
        // Near the bottom the miss shrinks, but not to nothing: σ₁ there, and a batch of 4's.
        expect(frames[15].note).toContain(`misses by about ${fmt(sigmaOne(MIN), 1)} (σ₁), so a batch of 4 by about ${fmt(sigmaOne(MIN) / 2, 1)}`);
        expect(frames[15].note).not.toContain('as much as');
        expect(readout(frames[15].state, 'steps')).toBe(String(PATH_EPOCHS * PER_EPOCH));
        expect(readout(frames[14].state, 'dfull')).toBe(fmt(distanceToMin(full.at[4]), 3));
        // The batch in use is marked on the data, and the line is the current (w, b).
        const data = planeOf(frames[6].state, 'data');
        const marked = data.shapes.filter((s) => s.kind === 'point' && s.mark === 'compare').map((s) => Number(s.id.slice(1)));
        expect(marked.sort((a, b) => a - b)).toEqual([...mini.batches[2]].sort((a, b) => a - b));
      }),
      { numRuns: 20 },
    );
  });

  it('the batch size', () => {
    fc.assert(
      fc.property(seeds, fc.constantFrom(...BATCH_SIZES), (seed, batch) => {
        const frames = trace({ story: 'batch', batch, seed });
        const up = uphill(cloudFor(1, seed).tips);
        expect(up).toBe(8);
        expect(answer(frames, 0)).toBe('No');
        expect(readout(frames[1].state, 'uphill')).toBe(`${up} of 32`);
        expect(answer(frames, 1)).toBe(WIDTH_CHOICES[1]);
        const ratio = batchSpread(PROBE, 4) / batchSpread(PROBE, 1);
        expect(ratio).toBeGreaterThan(0.4);
        expect(ratio).toBeLessThan(0.6);
        expect(readout(frames[2].state, 'spread')).toBe(fmt(batchSpread(PROBE, 4), 2));
        // Giveaways: the σ₁/√B curve appears only once "about half" has been asked, and the cost per epoch only once it has been asked.
        for (const i of [0, 1]) expect(planeOf(frames[i].state, 'spread').shapes.some((s) => s.id === 'rule'), `frame ${i}`).toBe(false);
        expect(planeOf(frames[2].state, 'spread').shapes.some((s) => s.id === 'rule')).toBe(true);
        for (const i of [1, 2]) expect(readout(frames[i].state, 'cost'), `frame ${i}`).toBeUndefined();
        expect(frames[2].note).toContain('the batch gradients spread');
        expect(answer(frames, 2)).toBe(COST_CHOICES[0]);
        expect(readout(frames[3].state, 'cost')).toBe('32');
        expect(answer(frames, 3)).toBe(WHOLE_CHOICES[2]);
        expect([readout(frames[4].state, 'spread'), readout(frames[4].state, 'measured')]).toEqual(['0', '0']);
        expect(answer(frames, 5)).toBe(String(stepsPerEpoch(N, batch)));
        expect(readout(frames[6].state, 'steps')).toBe(answer(frames, 5));
      }),
      { numRuns: 20 },
    );
  });

  it('the schedules', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'schedules', seed });
        expect(answer(frames, 0)).toBe('0.0375');
        expect(frames[0].checkpoint!.choices).toEqual(['0.01875', '0.025', '0.0375', '0.075']);
        expect(readout(frames[1].state, 'last')).toBe(answer(frames, 0));
        expect(answer(frames, 1)).toBe('0.15');
        expect(readout(frames[2].state, 'half')).toBe(answer(frames, 1));
        expect(answer(frames, 2)).toBe(WARMUP_CHOICES[0]);
        expect(frames[3].note).toContain('gradients are big');
        expect(answer(frames, 3)).toBe(COME_TO_REST[1]);
        expect(frames[4].note).toContain('never settles');
        const constant = scheduleRuns(seed).constant;
        const downBy = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((e) => constant.losses[e * 8] - L_MIN < 0.1) ?? 12;
        expect(frames[4].note).toContain(downBy === 1 ? 'within an epoch' : `within ${downBy} epochs`);
        expect(answer(frames, 4)).toBe('Yes');
        const runs = scheduleRuns(seed);
        expect(lastEpochExcess(runs.cosine)).toBeLessThan(lastEpochExcess(runs.constant));
        expect(readout(frames[5].state, 'end-cosine')).toBe(aboveLowest(L_MIN + lastEpochExcess(runs.cosine)));
        expect(readout(frames[5].state, 'end-constant')).toBe(aboveLowest(L_MIN + lastEpochExcess(runs.constant)));
      }),
      { numRuns: 10 },
    );
  });
});

describe('no frame gives its own question’s answer away', () => {
  const PHRASES: Record<string, string[]> = {
    [AVERAGE_CHOICES[0]]: ['exactly', 'full gradient itself'],
    [EVERY_STEP[1]]: ['went up', 'goes up'],
    [SAME_BATCH[1]]: ['unlikely', 'new order'],
    [CLOSER[1]]: ['closer', 'nearer'],
    [COME_TO_REST[1]]: ['never settles', 'jitter'],
    [WIDTH_CHOICES[1]]: ['half'],
    [COST_CHOICES[0]]: ['whatever the batch size'],
    [WHOLE_CHOICES[2]]: ['no width'],
    [WARMUP_CHOICES[0]]: ['gradients are big', 'fling'],
  };
  it('in its note or its readouts', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('paths', 'batch', 'schedules'), seeds, fc.constantFrom(...BATCH_SIZES), (story, seed, batch) => {
        for (const f of trace(inputOf(story, seed, batch))) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const shown = [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => it.value) : []))].join(' \n ').toLowerCase();
          const where = `${story} ${seed} ${batch}: "${c.question}" (${said})`;
          if (said === 'Yes' || said === 'No') continue;
          for (const phrase of PHRASES[said] ?? [said]) {
            const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(shown, where).not.toMatch(new RegExp(`(?<![\\d.,])${esc}(?![\\d])`));
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});

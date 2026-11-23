// Property tests for k-nearest neighbours (B7 of the math and ML path): the
// distances, orders, votes and mistake counts match plain loops; every
// question's answer is what the next frame shows; the claims the notes make
// about random runs hold on every seed; and no frame, label or caption gives
// its own question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normOf } from '@/algorithms/linear-algebra/norms';
import type { Frame } from '@/engine/types';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { HeatmapShape, PlotState, Vec } from '@/viz/plot/types';
import { LONG_MS } from '@/testing/timing';
import {
  ALL_VOTE,
  BIGGER,
  boundaryEdges,
  byDistance,
  CHART_KS,
  className,
  countClasses,
  D_POINTS,
  DIP_K,
  dimensionsRun,
  DIMS,
  distance,
  FEWER,
  histogram,
  K_MAX,
  kNearestNeighbours as knn,
  METRIC_POINTS,
  metricVerdict,
  mistakes,
  mistakesByK,
  MORE_OR_FEWER,
  ordinal,
  otherK,
  parseKnn,
  predict,
  quickPredict,
  Q_N,
  queryData,
  R_K,
  R_TEST,
  R_TRAIN,
  regionsData,
  regionsRun,
  RULER_NAMES,
  RULERS,
  SMOOTHER,
  spreadOut,
  STRETCH,
  TRAIN_WRONG,
  vote,
  WHERE_BUNCHED,
  WHICH_MEASURED,
  type KnnInput,
  type Labelled,
  type Ruler,
  type Story,
} from './k-nearest-neighbours';

const trace = (input: KnnInput) => traceOf(knn, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(knn, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 0, max: 4_000_000_000 });
const coord = fc.integer({ min: -29, max: 29 }).map((v) => v / 10);
const FRAMES: Record<Story, number> = { query: 6, regions: 6, metric: 6, dimensions: 4 };
const SEEDS = Array.from({ length: 200 }, (_, k) => k * 7919 + 3);
const inputOf = (story: Story, seed: number, q: Vec = [0, 0], k = 5): KnnInput =>
  story === 'query' ? { story, q, k, seed } : story === 'metric' ? { story, q } : { story, seed };

function roundTrips(input: KnnInput) {
  const custom = knn.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** The plain way: every distance in a loop, then pick the k smallest one at a time (lower index first on ties). */
function slowPredict(points: readonly Labelled[], q: Vec, k: number, r: Ruler): number {
  const d = points.map((p) => (r === 'L2' ? (p.x - q[0]) ** 2 + (p.y - q[1]) ** 2 : r === 'y3' ? (p.x - q[0]) ** 2 + (STRETCH * (p.y - q[1])) ** 2 : distance(r, p.x - q[0], p.y - q[1])));
  const taken: number[] = [];
  for (let j = 0; j < k; j++) {
    let best = -1;
    for (let i = 0; i < points.length; i++) if (!taken.includes(i) && (best === -1 || d[i] < d[best])) best = i;
    taken.push(best);
  }
  const votes = new Map<number, number>();
  for (const i of taken) votes.set(points[i].label, (votes.get(points[i].label) ?? 0) + 1);
  const most = Math.max(...votes.values());
  return points[taken.find((i) => votes.get(points[i].label) === most)!].label;
}

describe('k-nearest-neighbours', () => {
  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of knn.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as KnnInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        for (const part of frames[0].state.parts.concat(frames[1].state.parts)) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [[h.at[0] + h.step, h.at[1]], [h.min[0], h.min[1]], [h.max[0], h.max[1]], [-9, 9], [9, -9], [1.23, -0.47]] as Vec[]) {
              const moved = knn.input.drag!(input as never, h.id, to) as KnnInput;
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

  it('plays every story from any seed, query and k, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('query', 'regions', 'metric', 'dimensions'), seeds, coord, coord, fc.integer({ min: 1, max: K_MAX }), (story, seed, x, y, k) => {
        const input = inputOf(story, seed, [x, y], k);
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBe({ query: 4, regions: 5, metric: 4, dimensions: 3 }[story]);
      }),
      { numRuns: 30 },
    );
  }, LONG_MS);

  it('uses its seed where it has data to draw: the same seed gives the same run, and new seeds new ones', () => {
    for (const ex of knn.input.examples) {
      const a = JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as KnnInput));
      expect(JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as KnnInput))).toBe(a);
      const b = JSON.stringify(trace(ex.make({ seed: 4, size: 0 }) as KnnInput));
      if (ex.id === 'metric') expect(b).toBe(a);
      else expect(b).not.toBe(a);
    }
  });

  it('refuses inputs outside the stories, and the handles move only q and k', () => {
    for (const text of ['walk seed 3', 'query 0 0 k 5', 'query 0 0 k 0 seed 1', 'query 0 0 k 16 seed 1', 'query 0.05 0 k 3 seed 1', 'query 3 0 k 3 seed 1', 'query 0 0 k 2.5 seed 1', 'regions', 'regions seed -1', 'regions seed 1.5', 'metric 0', 'metric 0 0.15', 'metric 4 0', 'dimensions seed 1 2'])
      expect(parseKnn(text), text).toHaveProperty('error');
    expect(parseKnn('Query -1.5 2.9 k 15 seed 0')).toEqual({ value: { story: 'query', q: [-1.5, 2.9], k: 15, seed: 0 } });
    expect(parseKnn('metric -0.3 1')).toEqual({ value: { story: 'metric', q: [-0.3, 1] } });
    const query: KnnInput = { story: 'query', q: [0, 0], k: 5, seed: 1 };
    expect(knn.input.drag!(query as never, 'k', [7.4, 0])).toEqual({ ...query, k: 7 });
    expect(knn.input.drag!(query as never, 'k', [-3, 0])).toEqual({ ...query, k: 1 });
    expect(knn.input.drag!(query as never, 'k', [40, 0])).toEqual({ ...query, k: K_MAX });
    expect(knn.input.drag!(query as never, 'q', [1.23, -4])).toEqual({ ...query, q: [1.2, -2.9] });
    const metric: KnnInput = { story: 'metric', q: [0, 0] };
    expect(knn.input.drag!(metric as never, 'q', [0.46, 0.04])).toEqual({ story: 'metric', q: [0.5, 0] });
    expect(knn.input.drag!(metric as never, 'k', [3, 0])).toBe(metric);
    const regions: KnnInput = { story: 'regions', seed: 1 };
    expect(knn.input.drag!(regions as never, 'q', [1, 1])).toBe(regions);
    // The handles sit at the input: q on the plane, k on the distance chart's axis.
    const frames = trace({ story: 'query', q: [0.5, -1.2], k: 9, seed: 2 });
    expect(planeOf(frames[1].state, 'plane').handles[0].at).toEqual([0.5, -1.2]);
    expect(planeOf(frames[1].state, 'dist').handles[0].at).toEqual([9, 0]);
  });
});

describe('the maths against plain loops', () => {
  it('rulers agree with the norms visualiser, and stretching y counts it three times', () => {
    fc.assert(
      fc.property(fc.double({ min: -6, max: 6, noNaN: true }), fc.double({ min: -6, max: 6, noNaN: true }), (dx, dy) => {
        expect(distance('L2', dx, dy)).toBeCloseTo(normOf([dx, dy], 2), 12);
        expect(distance('L1', dx, dy)).toBeCloseTo(normOf([dx, dy], 1), 12);
        expect(distance('Linf', dx, dy)).toBeCloseTo(normOf([dx, dy], 'inf'), 12);
        expect(distance('y3', dx, dy)).toBeCloseTo(normOf([dx, 3 * dy], 2), 12);
      }),
      { numRuns: 100 },
    );
  });

  it('orders, votes and predicts like a plain loop, under every ruler and k', () => {
    const point = fc.record({ x: coord, y: coord, label: fc.integer({ min: 0, max: 2 }) });
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 25 }), coord, coord, fc.integer({ min: 1, max: 25 }), fc.constantFrom<Ruler>(...RULERS), (points, x, y, kk, r) => {
        const k = Math.min(kk, points.length);
        const order = byDistance(points, [x, y], r);
        expect(order.map((n) => n.i).sort((a, b) => a - b)).toEqual(points.map((_, i) => i));
        for (let j = 1; j < order.length; j++) expect(order[j].d >= order[j - 1].d - 1e-12).toBe(true);
        expect(predict(points, [x, y], k, r, 3)).toBe(slowPredict(points, [x, y], k, r));
        if (r === 'L2') expect(quickPredict(points, x, y, k, 3)).toBe(predict(points, [x, y], k, r, 3));
        const v = vote(points, order, k, 3);
        expect(v.votes.reduce((s, n) => s + n, 0)).toBe(k);
        expect(v.votes[v.winner]).toBe(Math.max(...v.votes));
      }),
      { numRuns: 300 },
    );
  });

  it('breaks a vote tie in favour of the tied class with the nearest member, not the smallest label', () => {
    const points: Labelled[] = [
      { x: 1, y: 0, label: 2 },
      { x: 2, y: 0, label: 0 },
      { x: 3, y: 0, label: 0 },
      { x: 4, y: 0, label: 2 },
    ];
    const v = vote(points, byDistance(points, [0, 0]), 4, 3);
    expect(v).toEqual({ votes: [2, 0, 2], winner: 2, tied: true });
    // Equal distances go to the lower index.
    expect(byDistance([{ x: 1, y: 0, label: 0 }, { x: -1, y: 0, label: 1 }], [0, 0]).map((n) => n.i)).toEqual([0, 1]);
  });

  it('counts mistakes for every k at once exactly as one k at a time', () => {
    const { train, test } = regionsData(11);
    const some = test.slice(0, 80);
    const ks = [1, 3, 15, 31, 61];
    expect(mistakesByK(train, some, ks)).toEqual(ks.map((k) => mistakes(train, some, k)));
    expect(mistakesByK(train, train, [1])).toEqual([0]);
  });

  it('measures a boundary by the cell edges between different classes', () => {
    const h = (values: number[], cols: number): HeatmapShape => ({ kind: 'heatmap', id: 'h', x0: 0, x1: 1, y0: 0, y1: 1, cols, rows: values.length / cols, values, scale: { kind: 'classes', tones: [1, 2] } });
    expect(boundaryEdges(h([0, 0, 0, 0], 2))).toBe(0);
    expect(boundaryEdges(h([0, 1, 0, 1], 2))).toBe(2);
    expect(boundaryEdges(h([0, 1, 1, 0], 2))).toBe(4);
    expect(boundaryEdges(h([0, 0, 0, 0, 1, 0, 0, 0, 0], 3))).toBe(4);
  });

  it('moves repeated spots apart, keeping every label', () => {
    const p = spreadOut([{ x: 1, y: 1, label: 0 }, { x: 1, y: 1, label: 1 }, { x: 1.01, y: 1, label: 0 }, { x: 1, y: 2, label: 1 }]);
    expect(p).toEqual([{ x: 1, y: 1, label: 0 }, { x: 1.01, y: 1, label: 1 }, { x: 1.02, y: 1, label: 0 }, { x: 1, y: 2, label: 1 }]);
  });

  it('measures the cube’s distances with Pythagoras in d parts, and bins every one', () => {
    const runs = dimensionsRun(5);
    expect(runs.map((r) => r.d)).toEqual([...DIMS]);
    for (const r of runs) {
      expect(r.dists.length).toBe(D_POINTS);
      expect(r.near).toBe(Math.min(...r.dists));
      expect(r.far).toBe(Math.max(...r.dists));
      expect(r.ratio).toBe(r.near / r.far);
      expect(histogram(r).reduce((s, n) => s + n, 0)).toBe(D_POINTS);
      // Every gap is between 0 and 1 in each of d coordinates.
      expect(r.far).toBeLessThanOrEqual(Math.sqrt(r.d));
    }
    const two = runs[0];
    two.points!.forEach((p, i) => expect(two.dists[i]).toBeCloseTo(Math.hypot(p[0] - two.q![0], p[1] - two.q![1]), 12));
  });

  it('draws each neighbourhood through the k-th nearest, under its own ruler', () => {
    for (const r of RULERS) {
      const frames = trace({ story: 'metric', q: [0, 0] });
      const f = frames.find((fr) => fr.state.parts.some((p) => p.kind === 'plane' && p.shapes.some((s) => s.id === `ball-${r}` && s.kind === 'path' && s.mark === 'key')))!;
      const ball = planeOf(f.state).shapes.find((s) => s.id === `ball-${r}`)!;
      const radius = metricVerdict([0, 0], r).radius;
      if (ball.kind !== 'path') throw new Error('not a path');
      for (const [x, y] of ball.points) expect(Math.abs(distance(r, x, y) - radius), r).toBeLessThan(0.03);
    }
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 15, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '15th', '21st', '22nd']);
  });
});

describe('the fixed metric points', () => {
  it('give three rulers three different neighbours and winners at (0, 0), each by a clear vote', () => {
    const v = Object.fromEntries(RULERS.map((r) => [r, metricVerdict([0, 0], r)])) as Record<Ruler, ReturnType<typeof metricVerdict>>;
    expect(RULERS.map((r) => className(v[r].vote.winner))).toEqual(['C', 'B', 'A', 'B']);
    for (const r of RULERS) {
      expect(v[r].vote.tied, r).toBe(false);
      // The edge of each neighbourhood is clear by eye: the 4th nearest is at least 0.15 farther than the 3rd.
      expect(v[r].order[3].d - v[r].order[2].d, r).toBeGreaterThan(0.15);
    }
    const sets = RULERS.map((r) => v[r].order.slice(0, 3).map((n) => n.i).sort().join());
    expect(new Set(sets).size).toBe(4);
    expect(new Set(METRIC_POINTS.map((p) => `${p.x},${p.y}`)).size).toBe(METRIC_POINTS.length);
  });
});

describe('claims about random runs hold on every seed', () => {
  it('the query story’s data: no shared spots, 14 A, 13 B, 13 C, and k = 1 never misses a training point', () => {
    for (const seed of SEEDS) {
      const pts = queryData(seed);
      expect(pts.length).toBe(Q_N);
      expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size, `seed ${seed}`).toBe(Q_N);
      expect(countClasses(pts, 3)).toEqual([14, 13, 13]);
      expect(mistakes(pts, pts, 1)).toBe(0);
    }
  }, LONG_MS);

  it('regions: k = 1 is perfect on training and jagged; k = 15 smoother, misses some training points, and fewer test points; k = 121 more', () => {
    for (const seed of SEEDS) {
      const run = regionsRun(seed);
      const at = `seed ${seed}`;
      expect(new Set(run.train.map((p) => `${p.x},${p.y}`)).size, at).toBe(R_TRAIN);
      expect(countClasses(run.train, 2)).toEqual([61, 60]);
      expect(countClasses(run.test, 2)).toEqual([300, 300]);
      expect(run.trainMistakes.one, at).toBe(0);
      expect(run.edges.many, at).toBeLessThan(run.edges.one);
      expect(run.trainMistakes.many, at).toBeGreaterThan(0);
      expect(run.testMistakes.many, at).toBeLessThan(run.testMistakes.one);
      expect(run.testMistakes.all, at).toBe(300);
      expect(run.testMistakes.all, at).toBeGreaterThan(run.testMistakes.many);
      // The test curve falls, then climbs: its lowest is below both ends.
      const lowest = Math.min(...run.curve.test);
      expect(lowest, at).toBeLessThan(run.curve.test[0]);
      expect(lowest, at).toBeLessThan(run.curve.test.at(-1)!);
      expect(run.curve.train[0], at).toBe(0);
      // Past k = 61 the two clouds beside a query outvote its own: somewhere there, worse than guessing.
      expect(Math.max(...run.curve.test.slice(CHART_KS.indexOf(DIP_K), -1)), at).toBeGreaterThan(300);
    }
  }, LONG_MS);

  it('dimensions: nearest ÷ farthest grows with d, stays above a half from 100 on, and bunches near 1 in 1000', () => {
    for (const seed of SEEDS) {
      const runs = dimensionsRun(seed);
      for (let j = 1; j < runs.length; j++) expect(runs[j].ratio, `seed ${seed} d ${runs[j].d}`).toBeGreaterThan(runs[j - 1].ratio);
      expect(runs[2].ratio).toBeGreaterThan(0.5);
      expect(runs[3].ratio, `seed ${seed}`).toBeGreaterThan(0.8);
      // In 2 dimensions the distances do spread from near 0: the nearest is within a fifth of the farthest.
      expect(runs[0].ratio).toBeLessThan(0.2);
    }
  }, LONG_MS);
});

describe('every question’s answer is what the next frame shows', () => {
  it('the query', () => {
    fc.assert(
      fc.property(seeds, coord, coord, fc.integer({ min: 1, max: K_MAX }), (seed, x, y, k) => {
        const q: Vec = [x, y];
        const frames = trace({ story: 'query', q, k, seed });
        const pts = queryData(seed);
        const order = byDistance(pts, q);
        expect(answer(frames, 0)).toBe(WHICH_MEASURED(k)[1]);
        expect(readout(frames[1].state, 'measured')).toBe(String(Q_N));
        const v = vote(pts, order, k, 3);
        expect(answer(frames, 1)).toBe(className(v.winner));
        expect(frames[2].note).toContain(`so k-NN predicts ${className(v.winner)}`);
        for (let c = 0; c < 3; c++) expect(readout(frames[2].state, `votes${c}`)).toBe(String(v.votes[c]));
        const k2 = otherK(k);
        expect(answer(frames, 2)).toBe(className(predict(pts, q, k2)));
        expect(frames[3].note).toContain(`predicts ${className(predict(pts, q, k2))}`);
        expect(answer(frames, 3)).toBe(ALL_VOTE[0]);
        expect(frames[4].note).toContain('predicts A everywhere');
        const map = planeOf(frames[4].state).shapes.find((s) => s.kind === 'heatmap')!;
        expect(map.kind === 'heatmap' && map.values.every((c) => c === 0)).toBe(true);
        // The chart's first k bars are toned by class once the vote is shown, the rest neutral.
        const bars = planeOf(frames[2].state, 'dist').shapes.find((s) => s.kind === 'bars')!;
        if (bars.kind !== 'bars') throw new Error('no bars');
        bars.bars.forEach((b, j) => expect(b.tone !== undefined).toBe(j < k));
      }),
      { numRuns: 25 },
    );
  });

  it('the regions', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'regions', seed });
        const run = regionsRun(seed);
        expect(answer(frames, 0)).toBe(TRAIN_WRONG[0]);
        expect(readout(frames[1].state, 'train1')).toBe('0 of 121 (0%)');
        expect(answer(frames, 1)).toBe(SMOOTHER[0]);
        expect(readout(frames[2].state, 'edges15')).toBe(String(run.edges.many));
        expect(answer(frames, 2)).toBe(run.trainMistakes.many > 0 ? 'Yes' : 'No');
        expect(readout(frames[3].state, 'train15')).toBe(`${run.trainMistakes.many} of 121 (${fmt((100 * run.trainMistakes.many) / 121, 1)}%)`);
        expect(planeOf(frames[3].state, 'k15').shapes.filter((s) => s.id.startsWith('miss')).length).toBe(run.trainMistakes.many);
        expect(answer(frames, 3)).toBe(FEWER[1]);
        expect(readout(frames[4].state, 'test15')).toBe(`${run.testMistakes.many} of ${R_TEST} (${fmt((100 * run.testMistakes.many) / R_TEST, 1)}%)`);
        expect(planeOf(frames[4].state, 'k1').shapes.filter((s) => s.id.startsWith('t')).length).toBe(run.testMistakes.one);
        expect(answer(frames, 4)).toBe(MORE_OR_FEWER[1]);
        expect(readout(frames[5].state, 'testall')).toBe('300 of 600 (50%)');
        expect(planeOf(frames[5].state, 'dip').x.max).toBe(DIP_K + 1);
        expect(frames[5].note).toContain(`61 A to 60 B`);
        expect(CHART_KS.at(-1)).toBe(R_TRAIN);
        expect(CHART_KS).toContain(R_K);
      }),
      { numRuns: 8 },
    );
  }, LONG_MS);

  it('the rulers', () => {
    fc.assert(
      fc.property(coord, coord, (x, y) => {
        const q: Vec = [x, y];
        const frames = trace({ story: 'metric', q });
        const win = (r: Ruler) => className(metricVerdict(q, r).vote.winner);
        expect([0, 1, 2, 3].map((i) => answer(frames, i))).toEqual(['L2', 'L1', 'Linf', 'y3'].map((r) => win(r as Ruler)));
        (['L2', 'L1', 'Linf', 'y3'] as Ruler[]).forEach((r, j) => {
          expect(frames[j + 1].note).toMatch(new RegExp(`(so ${win(r)} wins|class ${win(r)}, breaks)`));
          expect(readout(frames[5].state, `win-${r}`)).toBe(win(r));
        });
      }),
      { numRuns: 40 },
    );
  });

  it('the dimensions', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'dimensions', seed });
        const runs = dimensionsRun(seed);
        expect(answer(frames, 0)).toBe(BIGGER[2]);
        expect(Number(readout(frames[1].state, 'ratio'))).toBeGreaterThan(Number(readout(frames[0].state, 'ratio')));
        expect(answer(frames, 1)).toBe(runs[2].ratio < 0.5 ? 'Yes' : 'No');
        expect(readout(frames[2].state, 'ratio')).toBe(fmt(runs[2].ratio, 2));
        expect(answer(frames, 2)).toBe(WHERE_BUNCHED[1]);
        const hist = planeOf(frames[3].state, 'hist').shapes.find((s) => s.kind === 'bars')!;
        if (hist.kind !== 'bars') throw new Error('no bars');
        expect(hist.bars.slice(0, BINS_UNDER(0.8)).every((b) => b.y === 0)).toBe(true);
      }),
      { numRuns: 15 },
    );
  });
});

/** How many of the 20 histogram bins lie below a fraction. */
const BINS_UNDER = (f: number) => Math.floor(f * 20);

describe('no frame gives its own question’s answer away', () => {
  const PHRASES: Record<string, string[]> = {
    [WHICH_MEASURED(5)[1]]: ['every training point', 'measuring them all', 'all 40 distances'],
    [ALL_VOTE[0]]: ['most training points', 'everywhere'],
    [TRAIN_WRONG[0]]: ['0 wrong', 'own nearest neighbour', 'distance 0'],
    [SMOOTHER[0]]: ['smooth', 'islands disappear'],
    [FEWER[1]]: ['fewer', 'makes fewer'],
    [BIGGER[2]]: ['bigger', 'up from'],
    [WHERE_BUNCHED[1]]: ['bunched', 'close to 1', 'between 0.'],
  };
  it('in its note or its readouts', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('query', 'regions', 'metric', 'dimensions'), seeds, coord, coord, fc.integer({ min: 1, max: K_MAX }), (story, seed, x, y, k) => {
        for (const f of trace(inputOf(story, seed, [x, y], k))) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const items = f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items : []));
          const shown = [f.note, ...items.map((it) => `${it.label} ${it.value}`)].join(' \n ').toLowerCase();
          const where = `${story} ${seed}: "${c.question}" (${said})`;
          if (said === 'Yes' || said === 'No') {
            // The Yes/No questions are about training mistakes at k = 15 and the nearest in 100 dimensions: neither is on show yet.
            expect(shown, where).not.toMatch(/training points wrong/);
            expect(items.some((it) => it.id === 'd' && it.value === '100'), where).toBe(false);
            continue;
          }
          if (/^[ABC]$/.test(said)) {
            // A class letter: the frame shows no vote or verdict for the case asked about.
            if (story === 'query') {
              const asked = Number(/k = (\d+)/.exec(c.question)![1]);
              expect(f.note, where).not.toContain(`k = ${asked} `);
              if (asked === k) expect(items.some((it) => it.id.startsWith('votes')) || /predicts/.test(f.note), where).toBe(false);
            } else {
              const asked: Ruler = /L2, but now y/.test(c.question) ? 'y3' : /Under L1/.test(c.question) ? 'L1' : /Under L∞/.test(c.question) ? 'Linf' : 'L2';
              expect(f.note.toLowerCase(), where).not.toContain(`under ${RULER_NAMES[asked].toLowerCase()} `);
              expect(readout(f.state, 'ruler') ?? '', where).not.toBe(RULER_NAMES[asked]);
            }
            continue;
          }
          if (said === MORE_OR_FEWER[1]) {
            expect(shown, where).not.toMatch(/k = 121: test|300 of 600/);
            continue;
          }
          for (const phrase of PHRASES[said] ?? [said]) expect(shown, `${where}: ${phrase}`).not.toContain(phrase.toLowerCase());
        }
      }),
      { numRuns: 30 },
    );
  }, LONG_MS);

  it('in any example label, plane label or the idea', () => {
    const words = ['every training point', 'most training points', 'none', 'smooth', 'jagged', 'fewer', 'bigger', 'bunched', 'close to 1', 'more', 'wins', 'majority', 'perfect'];
    const texts = [knn.content.idea, ...knn.input.examples.map((e) => e.label)];
    for (const ex of knn.input.examples)
      for (const f of trace(ex.make({ seed: 1, size: 0 }) as KnnInput)) for (const p of f.state.parts) if (p.kind === 'plane') texts.push(p.label);
    for (const t of texts) for (const w of words) expect(t.toLowerCase(), `${t}: ${w}`).not.toMatch(new RegExp(`\\b${w}\\b`));
    // None of the questions has a numeric answer, so no label can state one.
    for (const ex of knn.input.examples)
      for (const f of trace(ex.make({ seed: 1, size: 0 }) as KnnInput)) if (f.checkpoint) expect(numbersIn(f.checkpoint.choices[f.checkpoint.answer]).length).toBeLessThanOrEqual(1);
  });
});

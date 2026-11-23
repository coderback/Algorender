// Property tests for precision, recall and ROC (B7 of the math and ML path):
// the counts and rates match plain loops, the ROC curve's area is the share of
// (positive, negative) pairs in the right order, the claims the notes make
// hold on every seed, every question's answer is what the next frame shows,
// and no frame, label or caption gives an answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';
import { LONG_MS } from '@/testing/timing';
import {
  accuracyOf,
  apart,
  areaUnder,
  countsAt,
  fprOf,
  KIND_CHOICES,
  LAZY_CHOICES,
  MIX,
  MOVE_CHOICES,
  N_EACH,
  pairsOf,
  parseRoc,
  POINT_CHOICES,
  PR_CHOICES,
  PRECISION_CHOICES,
  precisionCurve,
  precisionDip,
  precisionOf,
  prPoints,
  RAISE_CHOICES,
  raised,
  recallOf,
  ROC_CHOICES,
  rocCurve,
  rocPoints,
  SAME_CHOICES,
  scoresFor,
  SWEEP,
  T_MAX,
  T_MIN,
  THRESHOLDS,
  type RocInput,
  type Scores,
  type Story,
} from './roc-curve';

const trace = (input: RocInput) => traceOf(rocCurve, input).frames;
const good = (frames: readonly Frame<PlotState>[]) => expectGoodPlotTrace(rocCurve, frames);
const answer = (frames: readonly Frame<PlotState>[], i: number) => {
  const c = frames[i].checkpoint;
  if (!c) throw new Error(`frame ${i} asks nothing`);
  return c.choices[c.answer];
};
const seeds = fc.integer({ min: 0, max: 1_000_000 });
const thresholds = fc.integer({ min: 2, max: 18 }).map((k) => k / 20);
const FRAMES: Record<Story, number> = { threshold: 7, roc: 14, imbalance: 6 };
const inputOf = (story: Story, seed: number, threshold = 0.5): RocInput => (story === 'roc' ? { story, seed } : { story, threshold, seed });
const SEEDS = Array.from({ length: 200 }, (_, k) => k * 7919 + 3);
const T_ALL = Array.from({ length: 17 }, (_, k) => (k + 2) / 20);
const f3 = (v: number) => fmt(v, 3);

function roundTrips(input: RocInput) {
  const custom = rocCurve.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** Counts by a plain loop with float comparisons. */
function loopCounts(s: Scores, t: number, weight = 1) {
  let tp = 0;
  let fp = 0;
  for (const v of s.pos) if (v >= t - 1e-9) tp++;
  for (const v of s.neg) if (v >= t - 1e-9) fp += weight;
  return { tp, fp, fn: s.pos.length - tp, tn: s.neg.length * weight - fp };
}

describe('roc-curve', () => {
  it('plays every example from several seeds, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of rocCurve.input.examples) {
      for (const seed of [0, 7, 12345]) {
        const input = ex.make({ seed, size: 0 }) as RocInput;
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[input.story]);
        const handles = frames.flatMap((f) => f.state.parts.flatMap((p) => (p.kind === 'plane' ? p.handles : [])));
        expect(handles.length > 0).toBe(input.story !== 'roc');
        for (const h of handles.slice(0, 1)) {
          for (const to of [[h.at[0] + h.step, 0], [h.at[0] - h.step, 0.4], [h.min[0], 0], [h.max[0], 0], [-3, 0], [9, 0], [0.62, 3]] as Vec[]) {
            const moved = rocCurve.input.drag!(input as never, h.id, to) as RocInput;
            const again = trace(moved);
            good(again);
            roundTrips(moved);
            expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
          }
        }
      }
    }
  });

  it('plays every story from any seed and threshold, with a fixed frame count and enough questions', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('threshold', 'roc', 'imbalance'), seeds, thresholds, (story, seed, t) => {
        const input = inputOf(story, seed, t);
        const frames = trace(input);
        good(frames);
        roundTrips(input);
        expect(frames.length).toBe(FRAMES[story]);
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(story === 'imbalance' ? 4 : 5);
      }),
      { numRuns: 40 },
    );
  });

  it('uses its seed: the same seed gives the same run, and new seeds new ones', () => {
    for (const ex of rocCurve.input.examples) {
      const a = JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as RocInput));
      expect(JSON.stringify(trace(ex.make({ seed: 3, size: 0 }) as RocInput))).toBe(a);
      expect(JSON.stringify(trace(ex.make({ seed: 4, size: 0 }) as RocInput))).not.toBe(a);
    }
  });

  it('refuses inputs outside the stories, and the handle moves only the threshold', () => {
    for (const text of ['sweep seed 3', 'roc', 'roc seed -1', 'roc seed 1.5', 'roc 0.5 seed 1', 'threshold seed 7', 'threshold 0.52 seed 7', 'threshold 0.05 seed 7', 'threshold 0.95 seed 7', 'imbalance 1 seed 7', 'imbalance 0.5 seed 99999999999'])
      expect(parseRoc(text), text).toHaveProperty('error');
    expect(parseRoc('threshold 0.35 seed 0')).toEqual({ value: { story: 'threshold', threshold: 0.35, seed: 0 } });
    expect(parseRoc('Imbalance, 0.9, seed 12')).toEqual({ value: { story: 'imbalance', threshold: 0.9, seed: 12 } });
    const roc: RocInput = { story: 'roc', seed: 1 };
    expect(rocCurve.input.drag!(roc as never, 'threshold', [0.3, 0])).toBe(roc);
    const th: RocInput = { story: 'threshold', threshold: 0.5, seed: 1 };
    expect(rocCurve.input.drag!(th as never, 'threshold', [0.63, 0])).toEqual({ ...th, threshold: 0.65 });
    expect(rocCurve.input.drag!(th as never, 'threshold', [-2, 0])).toEqual({ ...th, threshold: T_MIN });
    expect(rocCurve.input.drag!(th as never, 'threshold', [9, 0])).toEqual({ ...th, threshold: T_MAX });
    // The handle sits on the threshold line, at the input's own threshold.
    for (const t of [0.1, 0.35, 0.9]) {
      const plane = planeOf(trace({ story: 'threshold', threshold: t, seed: 1 })[1].state, 'scores');
      expect(plane.handles[0].at).toEqual([t, 0]);
      const line = plane.shapes.find((s) => s.id === 'threshold');
      expect(line?.kind === 'line' && line.through).toEqual([t, 0]);
    }
  });
});

describe('the maths against plain loops', () => {
  it('scores are hundredths in [0.01, 0.99], 40 a class, and the classes overlap', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const s = scoresFor(seed);
      expect([s.neg.length, s.pos.length]).toEqual([N_EACH, N_EACH]);
      for (const v of [...s.neg, ...s.pos]) {
        expect(v).toBeGreaterThanOrEqual(0.01);
        expect(v).toBeLessThanOrEqual(0.99);
        expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
      }
      expect(Math.max(...s.neg)).toBeGreaterThan(Math.min(...s.pos));
    }
  });

  it('counts and rates match a loop, at any threshold and weight', () => {
    fc.assert(
      fc.property(seeds, fc.integer({ min: 0, max: 100 }), fc.constantFrom(1, MIX), (seed, T, w) => {
        const s = scoresFor(seed);
        const c = countsAt(s, T / 100, w);
        expect(c).toEqual(loopCounts(s, T / 100, w));
        expect(c.tp + c.fn).toBe(N_EACH);
        expect(c.fp + c.tn).toBe(N_EACH * w);
        expect(recallOf(c)).toBe(c.tp / N_EACH);
        expect(fprOf(c)).toBeCloseTo(c.fp / (N_EACH * w), 12);
        expect(accuracyOf(c)).toBeCloseTo((c.tp + c.tn) / (N_EACH * (1 + w)), 12);
        // Weighting the negatives never moves the rates, only precision and accuracy.
        const one = countsAt(s, T / 100);
        expect(recallOf(c)).toBe(recallOf(one));
        expect(fprOf(c)).toBeCloseTo(fprOf(one), 12);
      }),
      { numRuns: 200 },
    );
  });

  it('the area under the ROC curve is the share of pairs in order, ties as half, by a sort as well as by every pair', () => {
    for (const seed of SEEDS) {
      const s = scoresFor(seed);
      const p = pairsOf(s);
      expect(areaUnder(rocPoints(s)), `seed ${seed}`).toBeCloseTo(p.auc, 12);
      expect(areaUnder(rocPoints(s, MIX))).toBeCloseTo(p.auc, 12);
      // By ranks (Mann–Whitney): sort everything, average the ranks of ties, sum the positives' ranks.
      const all = [...s.pos.map((v) => ({ v, pos: true })), ...s.neg.map((v) => ({ v, pos: false }))].sort((a, b) => a.v - b.v);
      const rank = new Array<number>(all.length);
      for (let i = 0; i < all.length; ) {
        let j = i;
        while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
        for (let k = i; k <= j; k++) rank[k] = (i + j) / 2 + 1;
        i = j + 1;
      }
      const sum = all.reduce((t, x, k) => t + (x.pos ? rank[k] : 0), 0);
      expect((sum - (N_EACH * (N_EACH + 1)) / 2) / (N_EACH * N_EACH)).toBeCloseTo(p.auc, 12);
    }
    // By hand: positives 0.8 and 0.4, negatives 0.4 and 0.2: wins (0.8, 0.4), (0.8, 0.2), (0.4, 0.2), one tie: 3.5 / 4.
    expect(pairsOf({ pos: [0.8, 0.4], neg: [0.4, 0.2] })).toEqual({ wins: 3, ties: 1, pairs: 4, auc: 0.875 });
    expect(areaUnder(rocPoints({ pos: [0.8, 0.4], neg: [0.4, 0.2] }))).toBe(0.875);
  });

  it('the curves: ROC from (0, 0) to (1, 1) never going down or left; precision and PR where something is flagged', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const s = scoresFor(seed);
      const roc = rocPoints(s);
      expect(roc[0]).toEqual([0, 0]);
      expect(roc.at(-1)).toEqual([1, 1]);
      for (let k = 1; k < roc.length; k++) {
        expect(roc[k][0]).toBeGreaterThanOrEqual(roc[k - 1][0]);
        expect(roc[k][1]).toBeGreaterThanOrEqual(roc[k - 1][1]);
      }
      expect(precisionCurve(s).at(0)).toEqual([0, 0.5]);
      for (const [r, p] of prPoints(s)) expect(r > 0 || p === 0).toBe(true);
      expect(THRESHOLDS.length).toBe(101);
    }
  });
});

describe('claims about random scores hold on every seed', () => {
  it('raising the threshold never raises recall or the false positive rate; at 0 recall is 1', { timeout: LONG_MS }, () => {
    for (const seed of SEEDS) {
      const s = scoresFor(seed);
      for (let T = 0; T < 100; T++) {
        const a = countsAt(s, T / 100);
        const b = countsAt(s, (T + 1) / 100);
        expect(recallOf(b)).toBeLessThanOrEqual(recallOf(a));
        expect(fprOf(b)).toBeLessThanOrEqual(fprOf(a));
      }
      const zero = countsAt(s, 0);
      expect([recallOf(zero), fprOf(zero), precisionOf(zero)]).toEqual([1, 1, 0.5]);
      const one = countsAt(s, 1);
      expect([one.tp, one.fp]).toEqual([0, 0]);
    }
  });

  it('precision drops somewhere as the threshold rises on almost every seed, and the note works one out when not', { timeout: LONG_MS }, () => {
    for (const seed of SEEDS) {
      const s = scoresFor(seed);
      const dip = precisionDip(s);
      expect(dip, `seed ${seed}`).not.toBeNull();
      expect(dip!.after).toBeLessThan(dip!.before);
      expect(precisionOf(countsAt(s, dip!.from))).toBe(dip!.before);
      expect(precisionOf(countsAt(s, dip!.to))).toBe(dip!.after);
      expect(dip!.pos).toBeGreaterThan(0);
    }
    // 124 seeds in the first 100,000 have no drop at a hundredth step; 3570 is the first.
    expect(precisionDip(scoresFor(3570))).toBeNull();
    const frames = trace({ story: 'threshold', threshold: 0.5, seed: 3570 });
    expect(frames[4].note).toContain('it happens never to drop, but it can: if 4 of 5 flags are right');
    expect(planeOf(frames[4].state, 'precision').shapes.some((x) => x.id === 'dip')).toBe(false);
    expect([4 / 5, 3 / 4]).toEqual([0.8, 0.75]);
    // A drop too small for 3 places is told with as many more as it needs, and every quoted drop reads as one.
    expect(apart(0.7962, 0.7958)).toEqual(['0.7962', '0.7958']);
    expect(apart(0.796, 0.783)).toEqual(['0.796', '0.783']);
    for (const seed of SEEDS) {
      const dip = precisionDip(scoresFor(seed))!;
      const [a, b] = apart(dip.before, dip.after);
      expect(Number(b)).toBeLessThan(Number(a));
    }
  });

  it('at 1 in 100: the lazy model is 99% right, the rates and the ROC curve don’t move, precision never rises', { timeout: LONG_MS }, () => {
    for (const seed of SEEDS) {
      const s = scoresFor(seed);
      expect(rocPoints(s, MIX)).toEqual(rocPoints(s));
      for (const t of T_ALL) {
        const a = countsAt(s, t);
        const b = countsAt(s, t, MIX);
        expect(recallOf(b)).toBe(recallOf(a));
        const pa = precisionOf(a);
        const pb = precisionOf(b);
        if (pa === null) expect(pb).toBeNull();
        else if (a.fp === 0) expect(pb).toBe(pa);
        else expect(pb!).toBeLessThan(pa);
      }
      // The PR curve at 1 in 100 sits on or under the balanced one, threshold by threshold.
      for (const t of THRESHOLDS) {
        const pa = precisionOf(countsAt(s, t));
        const pb = precisionOf(countsAt(s, t, MIX));
        if (pa !== null) expect(pb!).toBeLessThanOrEqual(pa);
      }
    }
    expect(accuracyOf({ tp: 0, fp: 0, fn: N_EACH, tn: N_EACH * MIX })).toBe(0.99);
  });
});

describe('every question’s answer is what the next frame shows', () => {
  it('the threshold', () => {
    fc.assert(
      fc.property(seeds, thresholds, (seed, t) => {
        const frames = trace({ story: 'threshold', threshold: t, seed });
        const s = scoresFor(seed);
        const c = countsAt(s, t);
        expect(answer(frames, 0)).toBe(KIND_CHOICES[2]);
        expect(frames[1].note).toContain('false negative (FN)');
        expect(answer(frames, 1)).toBe(f3(recallOf(c)));
        expect(readout(frames[2].state, 'recall')).toBe(answer(frames, 1));
        expect(readout(frames[1].state, 'recall')).toBeUndefined();
        expect(answer(frames, 2)).toBe(RAISE_CHOICES[1]);
        const c2 = countsAt(s, raised(t));
        expect(recallOf(c2)).toBeLessThanOrEqual(recallOf(c));
        expect(readout(frames[3].state, 'recall')).toBe(f3(recallOf(c2)));
        expect(frames[3].note).toContain('can only shrink or stay put');
        expect(answer(frames, 3)).toBe(PRECISION_CHOICES[1]);
        expect(readout(frames[3].state, 'precision')).toBeUndefined();
        // About 1 seed in 800 has no drop at a hundredth step: the note then works one out by hand.
        if (precisionDip(s)) {
          expect(frames[4].note).toMatch(/precision drops from [\d.]+ to [\d.]+ \(marked\)/);
          expect(planeOf(frames[4].state, 'precision').shapes.some((x) => x.id === 'dip' && x.kind === 'point' && x.mark === 'reject')).toBe(true);
        } else expect(frames[4].note).toContain('precision falls from 0.8 to 0.75');
        expect(answer(frames, 4)).toBe('1');
        expect(readout(frames[5].state, 'recall')).toBe('1');
        expect(frames[6].checkpoint).toBeUndefined();
      }),
      { numRuns: 30 },
    );
  });

  it('the ROC curve', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const frames = trace({ story: 'roc', seed });
        const s = scoresFor(seed);
        expect(answer(frames, 0)).toBe(POINT_CHOICES[0]);
        const at1 = planeOf(frames[1].state, 'roc').shapes.find((x) => x.id === 'now');
        expect(at1?.kind === 'point' && at1.at).toEqual([0, 0]);
        expect(answer(frames, 1)).toBe(MOVE_CHOICES[0]);
        // The point lands where the question said, at t = 0.5.
        const k = SWEEP.indexOf(0.6) + 1;
        const c = countsAt(s, 0.5);
        expect(answer(frames, k)).toBe(`(${f3(fprOf(c))}, ${f3(recallOf(c))})`);
        expect(readout(frames[k + 1].state, 'fpr')).toBe(f3(fprOf(c)));
        expect(readout(frames[k + 1].state, 'recall')).toBe(f3(recallOf(c)));
        const last = SWEEP.length;
        const end = planeOf(frames[last].state, 'roc').shapes.find((x) => x.id === 'now');
        expect(end?.kind === 'point' && end.at).toEqual([1, 1]);
        expect(answer(frames, last)).toBe('0.5');
        expect(readout(frames[last + 1].state, 'guess')).toBe('0.5');
        const p = pairsOf(s);
        // The pairs question gives the wins and ties and asks for the share; the area is shown only after it.
        expect(frames[last + 1].checkpoint!.question).toContain(`In ${p.wins} of them the positive scores higher, and ${p.ties} are ties`);
        expect(answer(frames, last + 1)).toBe(f3(p.auc));
        expect(readout(frames[last + 1].state, 'auc')).toBeUndefined();
        expect(frames[last + 1].note).not.toContain(f3(p.auc));
        expect(readout(frames[last + 2].state, 'share')).toBe(readout(frames[last + 2].state, 'auc'));
        expect(readout(frames[last + 2].state, 'auc')).toBe(f3(p.auc));
        expect(areaUnder(rocPoints(s))).toBeCloseTo(p.auc, 12);
        expect(frames.filter((f) => f.checkpoint).length).toBe(5);
      }),
      { numRuns: 30 },
    );
  });

  it('one positive in a hundred', () => {
    fc.assert(
      fc.property(seeds, thresholds, (seed, t) => {
        const frames = trace({ story: 'imbalance', threshold: t, seed });
        const s = scoresFor(seed);
        expect(answer(frames, 0)).toBe(LAZY_CHOICES[3]);
        expect(readout(frames[1].state, 'accuracy')).toBe('0.99');
        expect(readout(frames[1].state, 'recall')).toBe('0');
        expect(answer(frames, 1)).toBe(SAME_CHOICES[1]);
        const c1 = countsAt(s, t);
        const c99 = countsAt(s, t, MIX);
        expect(readout(frames[2].state, 'recall')).toBe(f3(recallOf(c1)));
        expect(readout(frames[2].state, 'fpr')).toBe(f3(fprOf(c1)));
        expect(readout(frames[2].state, 'precision')).toBeUndefined();
        if (precisionOf(c99) !== null) {
          expect(answer(frames, 2)).toBe(f3(precisionOf(c99)!));
          expect(readout(frames[3].state, 'p99')).toBe(answer(frames, 2));
        } else expect(frames[2].checkpoint).toBeUndefined();
        expect(answer(frames, 3)).toBe(ROC_CHOICES[1]);
        expect(readout(frames[4].state, 'auc1')).toBe(readout(frames[4].state, 'auc99'));
        expect(rocPoints(s, MIX)).toEqual(rocPoints(s));
        expect(answer(frames, 4)).toBe(PR_CHOICES[0]);
        expect(frames[5].checkpoint).toBeUndefined();
      }),
      { numRuns: 30 },
    );
  });
});

describe('no frame, label or caption gives an answer away', () => {
  const PHRASES: Record<string, string[]> = {
    [KIND_CHOICES[2]]: ['false negative'],
    [RAISE_CHOICES[1]]: ['can only fall', 'only shrink', 'can only shrink', 'never rise'],
    [PRECISION_CHOICES[1]]: ['can fall', 'drops', 'falls', 'precision fell'],
    [POINT_CHOICES[0]]: ['(0, 0)'],
    [MOVE_CHOICES[0]]: ['only climbs', 'never fall'],
    [LAZY_CHOICES[3]]: ['99%', '0.99'],
    [SAME_CHOICES[1]]: ['can’t move', "can't move", 'is still', 'unchanged'],
    [ROC_CHOICES[1]]: ['same curve', 'exactly the same', 'never touches'],
    [PR_CHOICES[0]]: ['is lower', 'lower when'],
    '1': ['recall is 1', 'recall 1'],
    '0.5': ['half the unit square', '0.5'],
  };
  const textOf = (f: Frame<PlotState>) =>
    [f.note, ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => it.value) : p.kind === 'plane' ? p.shapes.flatMap((s) => (s.kind === 'label' ? [s.text] : [])) : []))].join(' \n ').toLowerCase();

  it('in its own note, readouts or plane labels', () => {
    fc.assert(
      fc.property(fc.constantFrom<Story>('threshold', 'roc', 'imbalance'), seeds, thresholds, (story, seed, t) => {
        for (const f of trace(inputOf(story, seed, t))) {
          const c = f.checkpoint;
          if (!c) continue;
          const said = c.choices[c.answer];
          const where = `${story} ${seed} ${t}: "${c.question}" (${said})`;
          const shown = textOf(f);
          const phrases = PHRASES[said];
          if (phrases) {
            for (const phrase of phrases) {
              const esc = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              expect(shown, where).not.toMatch(new RegExp(`(?<![\\d.,])${esc}(?![\\d])`));
            }
          } else if (/^[\d.]+$/.test(said)) {
            // A rate the question asks for: the frame names its counts and other rates, never this one (its own
            // readout is absent, checked above). It can equal a count, another rate, the threshold or a number in
            // the question by coincidence, which gives nothing away.
            const known = [t, ...numbersIn(c.question), ...f.state.parts.flatMap((p) => (p.kind === 'readouts' ? p.items.map((it) => Number(it.value)) : []))];
            if (!known.includes(Number(said))) expect(numbersIn(shown), where).not.toContain(Number(said));
          } else if (said.startsWith('(')) {
            expect(shown, where).not.toContain(said);
          } else {
            // The pair count: the frame shows only the AUC, not the count.
            expect(shown, where).not.toContain(said);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('in an example label, a plane or picture label, a legend row, or the idea', () => {
    const answers = new Set<string>();
    for (const ex of rocCurve.input.examples)
      for (const seed of [1, 7, 42])
        for (const f of trace(ex.make({ seed, size: 0 }) as RocInput)) if (f.checkpoint) answers.add(f.checkpoint.choices[f.checkpoint.answer]);
    const labels = new Set<string>();
    for (const ex of rocCurve.input.examples) {
      labels.add(ex.label);
      for (const f of trace(ex.make({ seed: 7, size: 0 }) as RocInput)) for (const p of f.state.parts) labels.add(p.label);
    }
    // The legend stays on screen in Predict mode too.
    const legend = rocCurve.legend.map((row) => (typeof row === 'string' ? row : 'label' in row ? row.label : row.neutral));
    expect(legend.length).toBeGreaterThan(4);
    for (const text of [...labels, ...legend, rocCurve.content.idea]) {
      const lower = text.toLowerCase();
      for (const said of answers) {
        if (/[a-z]{3,}/i.test(said)) expect(lower.includes(said.toLowerCase()), `"${text}" says ${said}`).toBe(false);
        // A threshold the panel is named after ("At t = 0.5") is the input, not an answer.
        else if (said.length > 1) expect(text.replace(/t = [\d.]+/g, '').includes(said), `"${text}" says ${said}`).toBe(false);
      }
      for (const phrase of ['false negative', '99%', 'the same', 'never', 'can fall', 'drops', 'falls', 'lower', 'unchanged', '(0, 0)', 'up or right']) expect(lower, `"${text}"`).not.toContain(phrase);
    }
  });
});

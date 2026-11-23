import { defineAlgorithm } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round, snap } from '@/viz/plot/geometry';
import type { Axis, Bar, ImagePart, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Precision, recall and ROC. A classifier gives every example a score between
// 0 and 1, its probability that the example is positive; a threshold t turns
// scores into answers (flag a score of t or more). Each answer is one of four
// kinds, true or false positive or negative, and their counts give recall (the
// share of positives found), the false positive rate (the share of negatives
// flagged), precision (the share of flags that are right) and accuracy.
// Sweeping t from high to low traces the ROC curve; the area under it is the
// chance that a random positive outscores a random negative. When positives
// are rare, accuracy and the ROC curve can look fine while most flags are
// false: precision shows it.

// ───────────────────────────── the scores ─────────────────────────────

/** Positives and negatives in the balanced data. */
export const N_EACH = 40;
export const NEG_MEAN = 0.35;
export const POS_MEAN = 0.65;
export const SPREAD = 0.15;
/** At 1 in 100, each negative stands for this many. */
export const MIX = 99;

export type Scores = { neg: readonly number[]; pos: readonly number[] };

/**
 * 40 negatives' and 40 positives' scores, in hundredths from 0.01 to 0.99:
 * each is its class's mean plus 0.15 times an Irwin–Hall draw (four uniforms,
 * centred and scaled to spread 1), so the two piles overlap. Pure arithmetic,
 * so every engine agrees.
 */
export function scoresFor(seed: number): Scores {
  const u = createRng(seed);
  const draw = (mean: number) => {
    const z = (u() + u() + u() + u() - 2) * Math.sqrt(3);
    return Math.min(99, Math.max(1, Math.round((mean + SPREAD * z) * 100))) / 100;
  };
  const neg = Array.from({ length: N_EACH }, () => draw(NEG_MEAN));
  const pos = Array.from({ length: N_EACH }, () => draw(POS_MEAN));
  return { neg, pos };
}

/** A score or threshold in whole hundredths, so comparisons are exact. */
const hund = (v: number) => Math.round(v * 100);

// ───────────────────────────── the four counts ─────────────────────────────

export type Counts = { tp: number; fp: number; fn: number; tn: number };

/** The four counts at threshold t (flag a score ≥ t), each negative counting `weight` times. */
export function countsAt(s: Scores, t: number, weight = 1): Counts {
  const T = hund(t);
  const tp = s.pos.filter((v) => hund(v) >= T).length;
  const fp = s.neg.filter((v) => hund(v) >= T).length * weight;
  return { tp, fp, fn: s.pos.length - tp, tn: s.neg.length * weight - fp };
}

export const recallOf = (c: Counts) => c.tp / (c.tp + c.fn);
export const fprOf = (c: Counts) => c.fp / (c.fp + c.tn);
/** Null when nothing is flagged: there are no flags to be right about. */
export const precisionOf = (c: Counts) => (c.tp + c.fp === 0 ? null : c.tp / (c.tp + c.fp));
export const accuracyOf = (c: Counts) => (c.tp + c.tn) / (c.tp + c.fp + c.fn + c.tn);

/** Every threshold the curves use: each hundredth from 1 down to 0. */
export const THRESHOLDS: readonly number[] = Array.from({ length: 101 }, (_, k) => (100 - k) / 100);

const dedupe = (points: Vec[]) => points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);

/** The ROC curve: (false positive rate, recall) at every threshold from 1 down to `down`. */
export function rocPoints(s: Scores, weight = 1, down = 0): Vec[] {
  return dedupe(THRESHOLDS.filter((t) => hund(t) >= hund(down)).map((t) => {
    const c = countsAt(s, t, weight);
    return [fprOf(c), recallOf(c)] as Vec;
  }));
}

/** The area under a curve through `points` (x never decreasing): a trapezoid per piece. */
export function areaUnder(points: readonly Vec[]): number {
  let area = 0;
  for (let k = 1; k < points.length; k++) area += ((points[k][0] - points[k - 1][0]) * (points[k][1] + points[k - 1][1])) / 2;
  return area;
}

export type Pairs = { wins: number; ties: number; pairs: number; auc: number };

/** Every (positive, negative) pair counted out: where the positive scores higher, where they tie, and the share with ties as half. */
export function pairsOf(s: Scores): Pairs {
  let wins = 0;
  let ties = 0;
  for (const p of s.pos)
    for (const n of s.neg) {
      if (hund(p) > hund(n)) wins++;
      else if (hund(p) === hund(n)) ties++;
    }
  const pairs = s.pos.length * s.neg.length;
  return { wins, ties, pairs, auc: (wins + ties / 2) / pairs };
}

/** The precision–recall curve: (recall, precision) at every threshold that flags something. */
export function prPoints(s: Scores, weight = 1): Vec[] {
  return dedupe(
    THRESHOLDS.flatMap((t) => {
      const c = countsAt(s, t, weight);
      const p = precisionOf(c);
      return p === null ? [] : [[recallOf(c), p] as Vec];
    }),
  );
}

/** Precision at every threshold that flags something: (t, precision). */
export function precisionCurve(s: Scores): Vec[] {
  return [...THRESHOLDS].reverse().flatMap((t) => {
    const p = precisionOf(countsAt(s, t));
    return p === null ? [] : [[t, p] as Vec];
  });
}

export type Dip = { from: number; to: number; before: number; after: number; pos: number; neg: number };

/**
 * The biggest fall in precision when the threshold rises by 0.01: from t to
 * t + 0.01 it unflags the `pos` positives and `neg` negatives scoring exactly
 * t. Null when precision never falls.
 */
export function precisionDip(s: Scores): Dip | null {
  let best: Dip | null = null;
  for (let T = 0; T < 100; T++) {
    const a = precisionOf(countsAt(s, T / 100));
    const b = precisionOf(countsAt(s, (T + 1) / 100));
    if (a === null || b === null || b >= a - 1e-12) continue;
    if (!best || a - b > best.before - best.after) {
      best = { from: T / 100, to: (T + 1) / 100, before: a, after: b, pos: s.pos.filter((v) => hund(v) === T).length, neg: s.neg.filter((v) => hund(v) === T).length };
    }
  }
  return best;
}

/** How many of a class's scores lie in [lo, hi] (hundredths, both ends included). */
const between = (vs: readonly number[], lo: number, hi: number) => vs.filter((v) => hund(v) >= hund(lo) && hund(v) <= hund(hi)).length;

/** The threshold the threshold story raises to. */
export const raised = (t: number) => Math.min(1, round(t + 0.2, 2));

// ───────────────────────────── input ─────────────────────────────

export type RocInput = { story: 'threshold'; threshold: number; seed: number } | { story: 'roc'; seed: number } | { story: 'imbalance'; threshold: number; seed: number };
export type Story = RocInput['story'];
const STORIES: Story[] = ['threshold', 'roc', 'imbalance'];
/** The threshold handle's range and step. */
export const T_MIN = 0.1;
export const T_MAX = 0.9;
export const T_STEP = 0.05;

const pseudocode = [
  'scores s, labels y, threshold t',
  'flag positive when s ≥ t',
  'count TP, FP, FN, TN',
  'recall = TP / (TP + FN)',
  'FPR = FP / (FP + TN)',
  'precision = TP / (TP + FP)',
  'accuracy = (TP + TN) / n',
  'sweep t down: plot (FPR, recall)',
  'AUC = area under that curve',
];

// ───────────────────────────── drawing helpers ─────────────────────────────

const BIN = 5; // hundredths
const BINS = 100 / BIN;
const f3 = (v: number) => fmt(v, 3);
const pct = (v: number) => `${fmt(v * 100, 1)}%`;
const r2 = (p: Vec): Vec => [round(p[0], 2), round(p[1], 2)];

/** How many of the scores fall in each bin of 0.05 (the last holds 0.95 to 0.99). */
function binCounts(vs: readonly number[]): number[] {
  const out = new Array<number>(BINS).fill(0);
  for (const v of vs) out[Math.min(BINS - 1, Math.floor(hund(v) / BIN))]++;
  return out;
}

/** A symmetric count axis with named ticks (counts below the axis are written as positive numbers). */
function countAxis(top: number, label: string): Axis {
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => top / s <= 3) ?? 1000;
  const max = Math.ceil((top * 1.3) / step) * step;
  const ticks: { at: number; label: string }[] = [];
  for (let k = -Math.floor(max / step); k <= Math.floor(max / step); k++) ticks.push({ at: k * step, label: String(Math.abs(k * step)) });
  return { min: -max, max, label, ticks };
}

type HistOptions = { t: number | null; weight?: number; handle?: boolean; lineLabel?: string; quadrants?: boolean; label: string; marked?: number };

/** The two piles of scores: positives up from the axis, negatives down, the threshold line and the four counts. */
function histogram(s: Scores, o: HistOptions): PlanePart {
  const w = o.weight ?? 1;
  const pos = binCounts(s.pos);
  const neg = binCounts(s.neg).map((n) => n * w);
  const y = countAxis(Math.max(...pos, ...neg), 'count');
  const top = y.max;
  const bars = (counts: number[], sign: 1 | -1, tone: 1 | 2, id: string): Bar[] =>
    counts.flatMap((n, k) => (n === 0 ? [] : [{ id: `${id}${k}`, x0: (k * BIN) / 100, x1: ((k + 1) * BIN) / 100, y: sign * n, tone }]));
  const shapes: Shape[] = [{ kind: 'bars', id: 'pos', bars: bars(pos, 1, 1, 'p') }, { kind: 'bars', id: 'neg', bars: bars(neg, -1, 2, 'n') }];
  shapes.push({ kind: 'label', id: 'lpos', at: [0.08, round(top * 0.55, 2)], text: 'positives' }, { kind: 'label', id: 'lneg', at: [0.08, round(-top * 0.9, 2)], text: 'negatives' });
  if (o.t !== null) {
    shapes.push({ kind: 'line', id: 'threshold', through: [o.t, 0], dir: [0, 1], mark: 'key', label: o.lineLabel ?? `t = ${fmt(o.t)}` });
    if (o.quadrants) {
      const c = countsAt(s, o.t, w);
      const xr = round(Math.min(0.9, Math.max(o.t + 0.12, (o.t + 1) / 2)), 2);
      const xl = round(Math.max(0.3, o.t / 2), 2);
      shapes.push(
        { kind: 'label', id: 'qtp', at: [xr, round(top * 0.62, 2)], text: `TP ${c.tp}` },
        { kind: 'label', id: 'qfn', at: [xl, round(top * 0.62, 2)], text: `FN ${c.fn}` },
        { kind: 'label', id: 'qfp', at: [xr, round(-top * 0.62, 2)], text: `FP ${c.fp}` },
        { kind: 'label', id: 'qtn', at: [xl, round(-top * 0.62, 2)], text: `TN ${c.tn}` },
      );
    }
  }
  return {
    kind: 'plane',
    id: 'scores',
    label: o.label,
    x: { min: 0, max: 1, label: 'score' },
    y,
    equal: false,
    shapes,
    handles: o.handle && o.t !== null ? [{ id: 'threshold', at: [o.t, 0], label: 'threshold', mark: 'key', step: T_STEP, min: [T_MIN, 0], max: [T_MAX, 0] }] : [],
  };
}

/** The confusion matrix as a 2×2 grid: rows the truth, columns the answer; right answers in one hue, wrong in the other, by their row's share. */
function confusion(c: Counts, label = 'Confusion matrix. Rows: really positive, really negative. Columns: flagged, not flagged'): ImagePart {
  const P = c.tp + c.fn;
  const N = c.fp + c.tn;
  return {
    kind: 'image',
    id: 'confusion',
    label,
    width: 2,
    height: 2,
    pixels: [round(c.tp / P, 2), -round(c.fn / P, 2), -round(c.fp / N, 2), round(c.tn / N, 2)],
    scale: 'signed',
    values: [`TP ${c.tp}`, `FN ${c.fn}`, `FP ${c.fp}`, `TN ${c.tn}`],
    size: 150,
    matrix: true,
  };
}

const countReadouts = (c: Counts): Readout[] => [
  { id: 'tp', label: 'true positives TP', value: String(c.tp) },
  { id: 'fn', label: 'false negatives FN', value: String(c.fn) },
  { id: 'fp', label: 'false positives FP', value: String(c.fp) },
  { id: 'tn', label: 'true negatives TN', value: String(c.tn) },
];

const precisionText = (c: Counts) => {
  const p = precisionOf(c);
  return p === null ? 'none flagged' : f3(p);
};

type Rate = 'recall' | 'fpr' | 'precision' | 'accuracy';
const rateReadouts = (c: Counts, which: readonly Rate[]): Readout[] =>
  which.map((r) =>
    r === 'recall'
      ? { id: 'recall', label: 'recall TP ÷ (TP + FN)', value: f3(recallOf(c)) }
      : r === 'fpr'
        ? { id: 'fpr', label: 'false positive rate FP ÷ (FP + TN)', value: f3(fprOf(c)) }
        : r === 'precision'
          ? { id: 'precision', label: 'precision TP ÷ (TP + FP)', value: precisionText(c) }
          : { id: 'accuracy', label: 'accuracy (TP + TN) ÷ n', value: f3(accuracyOf(c)) },
  );

const readouts = (items: Readout[], label = 'Counts and rates'): PlotPart => ({ kind: 'readouts', id: 'readouts', label, items });

const UNIT: Axis = { min: 0, max: 1 };

/** The ROC plane: the guessing diagonal, the curve so far, its area, and the current point. */
function rocPlane(o: { curves: { id: string; points: readonly Vec[]; tone: 3 | 4; dashed?: boolean; label?: string }[]; now?: { at: Vec; label: string } | null; fill?: readonly Vec[] | null; label: string }): PlanePart {
  const shapes: Shape[] = [{ kind: 'path', id: 'diagonal', points: [[0, 0], [1, 1]], dashed: true, faint: true }, { kind: 'label', id: 'lguess', at: [0.78, 0.6], text: 'guessing' }];
  if (o.fill && o.fill.length > 1) shapes.push({ kind: 'path', id: 'area', points: [...o.fill.map(r2), [1, 0], [0, 0]], closed: true, fill: true, fillOpacity: 0.28, tone: 3 });
  for (const c of o.curves) {
    if (c.points.length > 1) shapes.push({ kind: 'path', id: c.id, points: c.points.map(r2), tone: c.tone, ...(c.dashed ? { dashed: true } : {}) });
    if (c.label) shapes.push({ kind: 'label', id: `l${c.id}`, at: c.tone === 3 ? [0.3, 0.97] : [0.3, 0.89], text: c.label });
  }
  if (o.now) shapes.push({ kind: 'point', id: 'now', at: r2(o.now.at), mark: 'key', size: 'lg', label: o.now.label });
  return { kind: 'plane', id: 'roc', label: o.label, x: { ...UNIT, label: 'false positive rate' }, y: { ...UNIT, label: 'recall' }, equal: true, shapes, handles: [] };
}

/** Where a curve's label goes: just above its point nearest recall 0.3. */
function labelAt(points: readonly Vec[], x: number): Vec {
  const p = points.reduce((best, q) => (Math.abs(q[0] - x) < Math.abs(best[0] - x) ? q : best), points[0]);
  return [round(p[0], 2), round(Math.min(0.97, p[1] + 0.07), 2)];
}

type FrameOptions = Omit<Parameters<typeof plotFrame>[1], 'stats'>;
const frame = (tried: number, parts: PlotPart[], o: FrameOptions) => plotFrame(parts, { ...o, stats: { thresholds: tried } });
const varsOf = (t: number, c: Counts): Record<string, number> => ({ t, TP: c.tp, FP: c.fp, FN: c.fn, TN: c.tn });
/** Two values to as few places (3 or more) as tells them apart. */
export function apart(a: number, b: number): [string, string] {
  let d = 3;
  while (d < 8 && fmt(a, d) === fmt(b, d)) d++;
  return [fmt(a, d), fmt(b, d)];
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "3 positives", "1 positive" or "no positives". */
const some = (n: number, one: string) => (n === 0 ? `no ${one}s` : plural(n, one));
/** How a point moves: "3/40 up and 1/40 across". */
const moves = (up: number, across: number) => [up ? `${up}/${N_EACH} up` : '', across ? `${across}/${N_EACH} across` : ''].filter(Boolean).join(' and ');

// ───────────────────────────── story 1: the threshold ─────────────────────────────

export const KIND_CHOICES = ['A true positive', 'A false positive', 'A false negative', 'A true negative'];
export const RAISE_CHOICES = ['Rise or stay the same', 'Fall or stay the same', 'Either: it depends on the scores'];
export const PRECISION_CHOICES = ['Yes: it never falls', 'No: it can fall'];

function* thresholdStory(t: number, seed: number): Generator<Frame<PlotState>> {
  const s = scoresFor(seed);
  const n = 2 * N_EACH;
  const c = countsAt(s, t);
  const r = raised(t);
  const c2 = countsAt(s, r);
  const prec = precisionOf(c);
  const dip = precisionDip(s);
  const curve = precisionCurve(s);
  const all = countsAt(s, 0);
  const SCORES = 'Scores: real positives above the axis, real negatives below';

  const precisionPlane = (at: number): PlanePart => {
    const p = precisionOf(countsAt(s, at));
    // The y-axis names the curve; a label of its own would sit on the axis label, top left.
    const shapes: Shape[] = [{ kind: 'path', id: 'prec', points: curve.map(r2), tone: 3 }];
    if (dip) shapes.push({ kind: 'point', id: 'dip', at: r2([dip.to, dip.after]), mark: 'reject', size: 'md', label: 'falls' });
    if (p !== null) shapes.push({ kind: 'point', id: 'now', at: r2([at, p]), mark: 'key', size: 'lg' });
    return { kind: 'plane', id: 'precision', label: 'Precision at every threshold', x: { ...UNIT, label: 'threshold t' }, y: { ...UNIT, label: 'precision' }, equal: false, shapes, handles: [] };
  };

  // 0: the scores, no threshold yet.
  yield frame(0, [histogram(s, { t: null, label: SCORES }), readouts([{ id: 'pos', label: 'real positives', value: String(N_EACH), tone: 1 }, { id: 'neg', label: 'real negatives', value: String(N_EACH), tone: 2 }], 'The examples')], {
    line: 0,
    note: `A classifier has given each of ${n} examples a score between 0 and 1: how likely it thinks the example is positive (say, spam). The ${N_EACH} real positives are drawn above the axis and the ${N_EACH} real negatives below, in bins of 0.05. The piles overlap: no cut separates them perfectly. To turn scores into answers, pick a threshold t and flag every score of t or more as positive. A flagged example is a true positive (TP) if it really is positive, and a false positive (FP) if it isn't.`,
    vars: {},
    checkpoint: askInOrder('A real positive that scores below the threshold isn’t flagged. Which kind of answer is it?', KIND_CHOICES, KIND_CHOICES[2]),
  });

  // 1: the threshold at t, and the four counts.
  const recallWrong = [prec === null ? null : f3(prec), f3(c.tp / n), f3(c.fn / N_EACH)].filter((v): v is string => v !== null);
  yield frame(1, [histogram(s, { t, handle: true, quadrants: true, label: `${SCORES}; flagged right of the line` }), confusion(c), readouts(countReadouts(c))], {
    line: 2,
    note: `At t = ${fmt(t)}, every score of ${fmt(t)} or more is flagged: everything right of the line. A real positive left of it is missed, a false negative (FN): positive, but the answer said negative. A real negative left of it is a true negative (TN). Above the axis TP = ${c.tp} and FN = ${c.fn}; below it FP = ${c.fp} and TN = ${c.tn}. The four counts in a 2×2 table are the confusion matrix: ${c.tp + c.tn} of the ${n} answers are right.`,
    vars: varsOf(t, c),
    checkpoint: ask(`Recall is the share of the real positives that get flagged: TP ÷ (TP + FN). What is it at t = ${fmt(t)}?`, f3(recallOf(c)), recallWrong),
  });

  // 2: the rates at t.
  yield frame(1, [histogram(s, { t, handle: true, quadrants: true, label: `${SCORES}; flagged right of the line` }), confusion(c), readouts([...countReadouts(c), ...rateReadouts(c, ['recall', 'fpr', 'precision', 'accuracy'])])], {
    line: 5,
    note: `Recall = ${c.tp} ÷ ${c.tp + c.fn} = ${f3(recallOf(c))}: the classifier finds ${pct(recallOf(c))} of the positives. Its mirror image for the negatives is the false positive rate, FP ÷ (FP + TN) = ${f3(fprOf(c))}: the share of negatives wrongly flagged. Precision asks the other way round: of the ${c.tp + c.fp} flagged, how many are really positive? ${
      prec === null ? 'Nothing is flagged, so there is nothing to be precise about.' : `TP ÷ (TP + FP) = ${f3(prec)}.`
    } Accuracy, the share of all ${n} answers that are right, is ${f3(accuracyOf(c))}.`,
    vars: varsOf(t, c),
    checkpoint: askInOrder(`Raise the threshold to ${fmt(r)}. What can recall do?`, RAISE_CHOICES, RAISE_CHOICES[1]),
  });

  // 3: the threshold raised.
  yield frame(2, [histogram(s, { t: r, quadrants: true, label: `${SCORES}; the threshold raised to ${fmt(r)}` }), confusion(c2), readouts([...countReadouts(c2), ...rateReadouts(c2, ['recall', 'fpr'])])], {
    line: 3,
    note: `At t = ${fmt(r)}, recall is ${f3(recallOf(c2))} (it was ${f3(recallOf(c))}) and the false positive rate ${f3(fprOf(c2))} (it was ${f3(fprOf(c))}). Raising the threshold never flags anything new: it only unflags the scores from ${fmt(t)} up to just below ${fmt(r)}. Everything flagged at ${fmt(r)} was flagged at ${fmt(t)} too, so TP and FP can only shrink or stay put, and recall and the false positive rate with them. That is the trade: fewer false alarms, more misses.`,
    vars: varsOf(r, c2),
    checkpoint: askInOrder('When the threshold rises, is precision sure not to drop?', PRECISION_CHOICES, PRECISION_CHOICES[1]),
  });

  // 4: precision at every threshold.
  const dipNote = dip
    ? `But not always: raising t from ${fmt(dip.from)} to ${fmt(dip.to)} unflags the examples scoring exactly ${fmt(dip.from)}, ${some(dip.pos, 'positive')} and ${some(dip.neg, 'negative')}, so precision drops from ${apart(dip.before, dip.after).join(' to ')} (marked): the flags lost were more often right than the flags kept.`
    : 'On these scores it happens never to drop, but it can: if 4 of 5 flags are right and a rise in t unflags one of the right ones, 3 of the 4 left are right, and precision falls from 0.8 to 0.75.';
  yield frame(101, [histogram(s, { t, handle: true, quadrants: true, label: `${SCORES}; flagged right of the line` }), precisionPlane(t), readouts(rateReadouts(c, ['recall', 'precision']), `At t = ${fmt(t)}`)], {
    line: 5,
    note: `Precision at every threshold from 0 to 1, in steps of 0.01. Mostly it climbs as t rises, because the flags left are the most confident ones. ${dipNote} Precision is a share of the flags, and both its top and its bottom shrink as t rises.`,
    vars: varsOf(t, c),
    checkpoint: ask('Lower the threshold all the way to 0. What is recall then?', '1', ['0', '0.5']),
  });

  // 5: the lowest threshold.
  yield frame(101, [histogram(s, { t: 0, quadrants: true, label: `${SCORES}; everything flagged at t = 0` }), precisionPlane(0), readouts([...countReadouts(all), ...rateReadouts(all, ['recall', 'fpr', 'precision', 'accuracy'])], 'At t = 0')], {
    line: 1,
    note: `At t = 0 every score is flagged. All ${N_EACH} positives are found, so recall is 1, but every negative is flagged too: the false positive rate is 1 as well, and precision is just the share of positives among everyone, ${N_EACH} ÷ ${n} = ${f3(precisionOf(all)!)}. Recall alone is easy to max out. It means something only beside the false positive rate or precision.`,
    vars: varsOf(0, all),
  });

  // 6: back at t: the trade-off.
  yield frame(101, [histogram(s, { t, handle: true, quadrants: true, label: `${SCORES}; flagged right of the line` }), precisionPlane(t), confusion(c), readouts([...rateReadouts(c, ['recall', 'fpr', 'precision', 'accuracy'])], `At t = ${fmt(t)}`)], {
    line: 1,
    note: `Back at t = ${fmt(t)}: recall ${f3(recallOf(c))}, false positive rate ${f3(fprOf(c))}, precision ${precisionText(c)}. Drag the threshold. Lower, the classifier finds more positives and raises more false alarms; higher, the reverse. No threshold is right in general: it depends on what each mistake costs. A missed tumour is worse than a second scan, so a screening test sits low; a spam filter that hides a real email does more harm than one that lets a spam through, so it sits high. A model's default of 0.5 is just a default.`,
    vars: varsOf(t, c),
  });
}

// ───────────────────────────── story 2: the ROC curve ─────────────────────────────

export const POINT_CHOICES = ['(0, 0)', '(0, 1)', '(1, 0)', '(1, 1)'];
export const MOVE_CHOICES = ['Up or right, never down or left', 'Down or left, never up or right', 'Any way, depending on the scores'];
/** The sweep's thresholds, and the one before which it asks where the point will land. */
export const SWEEP = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];
export const ASK_BEFORE = 0.5;

function* rocStory(seed: number): Generator<Frame<PlotState>> {
  const s = scoresFor(seed);
  const full = rocPoints(s);
  // The area under `full`, counted exactly by pairs: summed as strips it can differ in the last bit and round the other way.
  const auc = pairsOf(s).auc;
  const pairs = pairsOf(s);
  const SCORES = 'Scores: real positives above the axis, real negatives below';
  const roc = (down: number | null, fill = false) =>
    rocPlane({
      label: 'The ROC curve: recall against the false positive rate',
      curves: down === null ? [] : [{ id: 'curve', points: rocPoints(s, 1, down), tone: 3 }],
      now: down === null ? null : { at: [fprOf(countsAt(s, down)), recallOf(countsAt(s, down))], label: `t = ${fmt(down)}` },
      fill: fill ? full : null,
    });
  const tried = (down: number) => 101 - hund(down);

  // 0: the empty plane.
  yield frame(0, [histogram(s, { t: null, label: SCORES }), roc(null)], {
    line: 7,
    note: `Now sweep the threshold from 1 down to 0, and at each threshold plot one point: its false positive rate across and its recall up. Those points join into the ROC curve (the name comes from radar, a "receiver operating characteristic"). The dashed diagonal is a classifier that guesses: flagging a random share of everything, it finds on average that share of the positives and that share of the negatives.`,
    vars: {},
    checkpoint: askInOrder('At t = 1, above every score here, where is the point?', POINT_CHOICES, POINT_CHOICES[0]),
  });

  // 1…: the sweep.
  for (let k = 0; k < SWEEP.length; k++) {
    const t = SWEEP[k];
    const c = countsAt(s, t);
    const at: Vec = [fprOf(c), recallOf(c)];
    let note: string;
    let checkpoint;
    if (k === 0) {
      note = `At t = 1 nothing is flagged: no true positives and no false positives, so recall and the false positive rate are both 0. The curve starts in the corner (0, 0).`;
      checkpoint = askInOrder('Lower the threshold. Which way can the point move?', MOVE_CHOICES, MOVE_CHOICES[0]);
    } else {
      const prev = SWEEP[k - 1];
      const dp = between(s.pos, t, prev - 0.01);
      const dn = between(s.neg, t, prev - 0.01);
      note = `${
        dp + dn === 0
          ? `t = ${fmt(t)} flags nothing new: no score lies from ${fmt(t)} to ${fmt(prev - 0.01)}, so the point stays at (${f3(at[0])}, ${f3(at[1])}).`
          : `t = ${fmt(t)} newly flags ${some(dp, 'positive')} and ${some(dn, 'negative')}, the scores from ${fmt(t)} to ${fmt(prev - 0.01)}, so the point moves ${moves(dp, dn)}, to (${f3(at[0])}, ${f3(at[1])}).`
      }${
        k === 1 ? ' Lowering the threshold only ever adds flags, so recall and the false positive rate never fall: the curve only climbs and moves right.' : ''
      }${t === 0 ? ` At t = 0 everything is flagged, (1, 1): the curve always ends in that corner.` : ''}`;
      if (Math.abs(t - (ASK_BEFORE + 0.1)) < 1e-9) {
        const next = countsAt(s, ASK_BEFORE);
        const np = between(s.pos, ASK_BEFORE, t - 0.01);
        const nn = between(s.neg, ASK_BEFORE, t - 0.01);
        const v = (x: number, y: number) => `(${f3(x)}, ${f3(y)})`;
        checkpoint = ask(
          `Lowering t to ${fmt(ASK_BEFORE)} newly flags ${some(np, 'positive')} and ${some(nn, 'negative')}, the scores from ${fmt(ASK_BEFORE)} to ${fmt(t - 0.01)}. Where does the point land?`,
          v(fprOf(next), recallOf(next)),
          [v(recallOf(next), fprOf(next)), v(at[0] + np / N_EACH, at[1] + nn / N_EACH), v(at[0] + nn / (2 * N_EACH), at[1] + np / (2 * N_EACH))],
        );
      }
      if (t === 0) checkpoint = ask('The guessing diagonal runs from (0, 0) to (1, 1). What area lies under it, inside the unit square?', '0.5', ['0.25', '1']);
    }
    yield frame(tried(t), [histogram(s, { t, lineLabel: `t = ${fmt(t)}`, label: `${SCORES}; flagged right of the line` }), roc(t), readouts([...rateReadouts(c, ['fpr', 'recall'])], `At t = ${fmt(t)}`)], {
      line: 7,
      note,
      vars: varsOf(t, c),
      ...(checkpoint ? { checkpoint } : {}),
    });
  }

  // The area under the curve.
  const all = countsAt(s, 0);
  yield frame(101, [histogram(s, { t: null, label: SCORES }), roc(0, true), readouts([{ id: 'guess', label: 'area under the diagonal', value: '0.5' }])], {
    line: 8,
    note: `Under the diagonal lies half the unit square, 0.5: a guesser's score. The shaded area under the ROC curve is its AUC, worked out as a strip for each piece of the curve. A perfect classifier would climb straight up to (0, 1) before moving right, for an area of 1. The area sums up every threshold at once, so it measures how well the scores rank the examples, not how good any one threshold is.`,
    vars: varsOf(0, all),
    checkpoint: ask(
      `Pair every positive with every negative: ${N_EACH} × ${N_EACH} = ${pairs.pairs} pairs. In ${pairs.wins} of them the positive scores higher, and ${pairs.ties} are ties. What share of the pairs does the positive win, counting a tie as half a win?`,
      f3(pairs.auc),
      [f3(pairs.wins / pairs.pairs), f3((pairs.wins + pairs.ties) / pairs.pairs), f3(1 - pairs.auc)],
    ),
  });

  // Pairs.
  yield frame(101, [histogram(s, { t: null, label: SCORES }), roc(0, true), readouts([
    { id: 'wins', label: 'pairs where the positive scores higher', value: String(pairs.wins) },
    { id: 'ties', label: 'pairs that tie', value: String(pairs.ties) },
    { id: 'share', label: `(wins + ties ÷ 2) ÷ ${pairs.pairs}`, value: f3(pairs.auc) },
    { id: 'auc', label: 'area under the ROC curve (AUC)', value: f3(auc), tone: 3 },
  ])], {
    line: 8,
    note: `${pairs.wins} of the ${pairs.pairs} pairs have the positive scoring higher and ${pairs.ties} tie. Counting each tie as half, ${fmt(pairs.wins + pairs.ties / 2, 1)} ÷ ${pairs.pairs} = ${f3(pairs.auc)}, and the shaded area is ${f3(auc)}: the AUC exactly. That is what the area means: the chance that a random positive scores above a random negative. Why? Each positive the sweep passes lifts the curve by 1/${N_EACH}, at a false positive rate equal to the share of negatives scoring above it. The strip of area under that lift, out to the right edge, is 1/${N_EACH} tall and as wide as the share of negatives the positive outscores. A positive tied with a negative makes the curve step up and across at once, along a diagonal, so its strip loses a triangle: half of that pair. Add up a strip per positive and you have counted every pair it wins, ties as half. A guesser wins half the pairs; a perfect ranking wins them all.`,
    vars: { AUC: round(auc, 3), pairs: pairs.pairs },
  });
}

// ───────────────────────────── story 3: one positive in a hundred ─────────────────────────────

export const LAZY_CHOICES = ['1%', '50%', '90%', '99%'];
export const SAME_CHOICES = ['Both fall', 'They stay the same', 'Both rise'];
export const ROC_CHOICES = ['Lower: worse', 'Exactly the same', 'Higher: better'];
export const PR_CHOICES = ['Lower than the balanced one', 'The same', 'Higher than the balanced one'];

function* imbalanceStory(t: number, seed: number): Generator<Frame<PlotState>> {
  const s = scoresFor(seed);
  const c1 = countsAt(s, t);
  const c99 = countsAt(s, t, MIX);
  const lazy: Counts = { tp: 0, fp: 0, fn: N_EACH, tn: N_EACH * MIX };
  const total = N_EACH * (MIX + 1);
  const p1 = precisionOf(c1);
  const p99 = precisionOf(c99);
  const SCORES = 'Scores: real positives above the axis, real negatives below';
  const RARE = `Scores when 1 in 100 is positive: ${N_EACH} positives above the axis (barely visible), ${N_EACH * MIX} negatives below`;
  const balanced = (o: Omit<HistOptions, 'label'>) => histogram(s, { ...o, label: SCORES });
  const rare = (o: Omit<HistOptions, 'label' | 'weight'>) => histogram(s, { ...o, weight: MIX, label: RARE });
  const roc1 = rocPoints(s);
  // The area under either curve (they are the same curve), counted exactly by pairs.
  const auc = pairsOf(s).auc;

  // 0: balanced, at t.
  yield frame(1, [balanced({ t, handle: true, quadrants: true }), confusion(c1), readouts([...countReadouts(c1), ...rateReadouts(c1, ['recall', 'fpr', 'precision', 'accuracy'])], 'Half the examples positive')], {
    line: 6,
    note: `The classifier at t = ${fmt(t)} on ${N_EACH} positives and ${N_EACH} negatives: recall ${f3(recallOf(c1))}, precision ${precisionText(c1)}, accuracy ${f3(accuracyOf(c1))}. In many real problems positives are rare: fraud, a rare disease, a faulty part. Keep the ${N_EACH} positives, and count each negative ${MIX} times, itself and ${MIX - 1} copies scoring just as it does: ${N_EACH} positives among ${total} examples, 1 in 100.`,
    vars: varsOf(t, c1),
    checkpoint: askInOrder('A lazy model flags nothing: it says negative to everyone. What is its accuracy when 1 in 100 is positive?', LAZY_CHOICES, LAZY_CHOICES[3]),
  });

  // 1: the lazy model at 1 in 100.
  yield frame(2, [rare({ t: 1, lineLabel: 'flags nothing', quadrants: true }), confusion(lazy), readouts([...countReadouts(lazy), ...rateReadouts(lazy, ['recall', 'accuracy'])], 'Flag nothing, 1 in 100 positive')], {
    line: 6,
    note: `Flagging nothing, the lazy model is right about all ${lazy.tn} negatives and wrong about all ${N_EACH} positives: accuracy ${lazy.tn} ÷ ${total} = ${pct(accuracyOf(lazy))}, and recall 0. It finds nothing at all. When one class is rare, accuracy mostly measures the common one.`,
    vars: varsOf(1, lazy),
    checkpoint: askInOrder(`Back to the real classifier at t = ${fmt(t)}. When 1 in 100 is positive, what happens to its recall and its false positive rate?`, SAME_CHOICES, SAME_CHOICES[1]),
  });

  // 2: the classifier at 1 in 100.
  const right99 = c99.tp + c99.tn;
  const versus = right99 < lazy.tn ? 'below' : right99 === lazy.tn ? 'level with' : 'above';
  // When everything is flagged, accuracy is precision (both TP ÷ n): leave it out, since precision is asked here.
  const shown: Rate[] = c99.fn + c99.tn === 0 ? ['recall', 'fpr'] : ['recall', 'fpr', 'accuracy'];
  yield frame(2, [rare({ t, handle: true, quadrants: true }), confusion(c99), readouts([...countReadouts(c99), ...rateReadouts(c99, shown)], '1 in 100 positive')], {
    line: 4,
    note: `Recall is a share of the positives and the false positive rate a share of the negatives: each looks inside one class, so the mix can't move them. Recall is still ${f3(recallOf(c99))} and the false positive rate ${f3(fprOf(c99))}, but ${plural(c1.fp, 'flagged negative')} became ${c99.fp}.${
      c99.fn + c99.tn === 0 ? ` Everything is flagged at t = ${fmt(t)}.` : ` Accuracy is now ${pct(accuracyOf(c99))}, ${versus} the lazy model's ${pct(accuracyOf(lazy))}.`
    }`,
    vars: varsOf(t, c99),
    ...(p99 === null || p1 === null
      ? {}
      : { checkpoint: ask('Precision is TP ÷ (TP + FP). What is it now?', f3(p99), [f3(p1), f3(recallOf(c99)), f3(c99.tp / (c99.tp + c99.fp + c99.fn))]) }),
  });

  // 3: precision collapses.
  const precisionNote =
    p99 === null || p1 === null
      ? `Nothing is flagged at t = ${fmt(t)}, so precision has nothing to measure at either mix; drag the threshold lower.`
      : c1.fp === 0
        ? `No negative is flagged at t = ${fmt(t)}, so precision stays ${f3(p99)} at either mix. Lower the threshold until one is, and at 1 in 100 it counts ${MIX} times.`
        : `Precision falls from ${f3(p1)} to ${f3(p99)}: of the ${c99.tp + c99.fp} flagged, only ${c99.tp} are positive. The false positive rate is unchanged, but ${MIX} times as many negatives make ${MIX} times as many false alarms, and they swamp the true positives. It is Bayes' rule again: when a condition is rare, even a small false alarm rate applied to everyone else outnumbers the true finds.`;
  yield frame(2, [rare({ t, handle: true, quadrants: true }), confusion(c99), readouts([
    { id: 'p1', label: 'precision, half positive', value: precisionText(c1), tone: 3 },
    { id: 'p99', label: 'precision, 1 in 100 positive', value: precisionText(c99), tone: 4 },
    ...rateReadouts(c99, ['recall', 'fpr']),
  ], 'Precision at both mixes')], {
    line: 5,
    note: precisionNote,
    vars: varsOf(t, c99),
    checkpoint: askInOrder('The ROC curve plots recall against the false positive rate. When 1 in 100 is positive, how does it compare with the balanced one?', ROC_CHOICES, ROC_CHOICES[1]),
  });

  // 4: the ROC curves.
  const roc99 = rocPoints(s, MIX);
  yield frame(101, [rare({ t, handle: true }), rocPlane({ label: 'ROC curves: half positive, and 1 in 100', curves: [{ id: 'roc1', points: roc1, tone: 3, label: 'half positive' }, { id: 'roc99', points: roc99, tone: 4, dashed: true, label: '1 in 100 (dashed)' }], now: { at: [fprOf(c99), recallOf(c99)], label: `t = ${fmt(t)}` } }), readouts([
    { id: 'auc1', label: 'AUC, half positive', value: f3(auc), tone: 3 },
    { id: 'auc99', label: 'AUC, 1 in 100 positive', value: f3(auc), tone: 4 },
  ], 'Areas under the ROC curves')], {
    line: 7,
    note: `Exactly the same curve, with the same AUC, ${f3(auc)}: every point is a pair of within-class shares, and copying each negative ${MIX} times leaves every share exactly as it was. (New negatives drawn from the same classifier would wobble the curve a little, but leave it the same on average.) That is the ROC curve's strength, since it describes the scores whatever the mix, and its blind spot: it can look fine while most flags are false. To see the flags, plot precision against recall instead.`,
    vars: { t, AUC: round(auc, 3) },
    checkpoint: askInOrder('The precision–recall curve plots precision against recall, one point per threshold. When 1 in 100 is positive, where will it sit?', PR_CHOICES, PR_CHOICES[0]),
  });

  // 5: the precision–recall curves.
  const pr1 = prPoints(s);
  const pr99 = prPoints(s, MIX);
  yield frame(101, [rare({ t, handle: true }), {
    kind: 'plane',
    id: 'pr',
    label: 'Precision–recall curves: half positive, and 1 in 100',
    x: { ...UNIT, label: 'recall' },
    y: { ...UNIT, label: 'precision' },
    equal: true,
    shapes: [
      { kind: 'path', id: 'pr1', points: pr1.map(r2), tone: 3 },
      { kind: 'path', id: 'pr99', points: pr99.map(r2), tone: 4, dashed: true },
      { kind: 'label', id: 'lpr1', at: labelAt(pr1, 0.3), text: 'half positive' },
      { kind: 'label', id: 'lpr99', at: labelAt(pr99, 0.3), text: '1 in 100' },
      ...(p1 === null || p99 === null
        ? []
        : ([
            { kind: 'point', id: 'now1', at: r2([recallOf(c1), p1]), mark: 'key', size: 'md' },
            { kind: 'point', id: 'now99', at: r2([recallOf(c99), p99]), mark: 'key', size: 'md', label: `t = ${fmt(t)}` },
          ] as Shape[])),
    ],
    handles: [],
  }, readouts([
    { id: 'p1', label: 'precision, half positive', value: precisionText(c1), tone: 3 },
    { id: 'p99', label: 'precision, 1 in 100 positive', value: precisionText(c99), tone: 4 },
    { id: 'recall', label: 'recall, either mix', value: f3(recallOf(c1)) },
  ], `At t = ${fmt(t)}`)], {
    line: 5,
    note: `At every threshold that flags a negative, precision is lower when positives are rare${p1 === null || p99 === null ? '' : `: at t = ${fmt(t)}, recall ${f3(recallOf(c1))} comes with precision ${f3(p1)} at half positive and ${f3(p99)} at 1 in 100`}. The precision–recall curve shows what accuracy and the ROC curve hide. When positives are rare, judge a classifier by its precision and recall at the threshold you will use, not by accuracy.`,
    vars: varsOf(t, c99),
  });
}

function* run(input: RocInput): Generator<Frame<PlotState>> {
  if (input.story === 'threshold') yield* thresholdStory(input.threshold, input.seed);
  else if (input.story === 'roc') yield* rocStory(input.seed);
  else yield* imbalanceStory(input.threshold, input.seed);
}

// ───────────────────────────── custom text and drags ─────────────────────────────

const MAX_SEED = 4294967295;
const okSeed = (s: number) => Number.isInteger(s) && s >= 0 && s <= MAX_SEED;
const okThreshold = (t: number) => t >= T_MIN - 1e-9 && t <= T_MAX + 1e-9 && Math.abs(t / T_STEP - Math.round(t / T_STEP)) < 1e-9;

export function parseRoc(text: string): { value: RocInput } | { error: string } {
  const story = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0] as Story;
  const xs = numbersIn(text);
  if (!STORIES.includes(story)) return { error: 'Start with threshold, roc or imbalance, e.g. threshold 0.5 seed 7, or roc seed 7.' };
  if (story === 'roc') {
    if (xs.length !== 1 || !okSeed(xs[0])) return { error: 'Give one seed, a whole number 0 or more, e.g. roc seed 7.' };
    return { value: { story, seed: xs[0] } };
  }
  if (xs.length !== 2) return { error: `Give the threshold and a seed, e.g. ${story} 0.5 seed 7.` };
  const [threshold, seed] = xs;
  if (!okThreshold(threshold)) return { error: `The threshold is from ${T_MIN} to ${T_MAX} in steps of ${T_STEP}.` };
  if (!okSeed(seed)) return { error: 'The seed is a whole number, 0 or more.' };
  return { value: { story, threshold: round(threshold, 2), seed } };
}

export function formatRoc(input: RocInput): string {
  return input.story === 'roc' ? `roc seed ${input.seed}` : `${input.story} ${input.threshold} seed ${input.seed}`;
}

export function dragRoc(input: RocInput, _handle: string, to: Vec): RocInput {
  if (input.story === 'roc') return input;
  return { ...input, threshold: snap(to[0], T_STEP, T_MIN, T_MAX) };
}

const example = (id: string, label: string, make: (seed: number) => RocInput) => ({ id, label, make: ({ seed }: { seed: number }) => make(seed), sized: false });

export const rocCurve = defineAlgorithm<RocInput, PlotState>({
  kind: 'algorithm',
  slug: 'roc-curve',
  view: 'plot',
  input: {
    examples: [
      example('threshold', 'Move the threshold: four kinds of answer', (seed) => ({ story: 'threshold', threshold: 0.5, seed })),
      example('roc', 'Sweep the threshold: the ROC curve', (seed) => ({ story: 'roc', seed })),
      example('imbalance', 'When positives are rare', (seed) => ({ story: 'imbalance', threshold: 0.5, seed })),
    ],
    custom: {
      label: 'threshold or imbalance with a threshold (0.1 to 0.9, steps of 0.05) and a seed; roc with a seed',
      placeholder: 'e.g. threshold 0.5 seed 7, or roc seed 7',
      parse: parseRoc,
      format: formatRoc,
    },
    drag: dragRoc,
  },
  pseudocode,
  stats: [{ key: 'thresholds', label: 'Thresholds tried' }],
  legend: [
    { neutral: 'Axes; the dashed guessing diagonal' },
    { mark: 'key', label: 'The threshold you drag, and the point it gives on a curve' },
    { mark: 'reject', label: 'A point on the precision chart the narration points out' },
    { tone: 1, label: 'Real positives (bars above the axis)' },
    { tone: 2, label: 'Real negatives (bars below the axis)' },
    { tone: 3, label: 'The curves and the area under the ROC curve, half positive' },
    { tone: 4, label: 'The curves when 1 in 100 is positive' },
  ],
  run,
  content: {
    idea: 'A classifier scores each example, and a threshold turns the scores into yes or no. Counting the four kinds of answer, true and false positives and negatives, gives recall, precision and the false positive rate; sweeping the threshold traces the ROC curve, and the area under it measures how well the scores rank positives above negatives.',
    invariant: 'Raising the threshold only unflags: recall and the false positive rate never rise, though precision can go either way. The area under the ROC curve is the share of (positive, negative) pairs the scores put in the right order, ties counted as half, and it does not change with the mix of classes; precision does.',
    whenToUse: 'Whenever a classifier’s yes/no answers matter: pick the threshold from what each mistake costs, compare models by AUC when the ranking is what counts, and report precision and recall (not accuracy) when one class is rare, as in fraud, disease screening or spam.',
    traits: [
      { label: 'Recall and precision trade off through the threshold', good: null },
      { label: 'AUC sums up every threshold at once', good: true },
      { label: 'Accuracy misleads when one class is rare', good: false },
      { label: 'Same seed, same scores', good: null },
    ],
    experiments: [
      { example: 'threshold', prompt: 'Drag the threshold from 0.1 to 0.9. Which counts shrink and which grow? Watch precision: does it ever drop as the threshold rises?' },
      { example: 'roc', prompt: 'Press New values a few times. Does the AUC always match the share of pairs the positive wins?' },
      { example: 'imbalance', prompt: 'Drag the threshold. At 1 in 100, how high must it go before most flags are right, and what does recall pay for it?' },
    ],
  },
});

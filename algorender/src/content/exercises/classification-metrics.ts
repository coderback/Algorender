// Precision, recall and ROC as code (B7 of the math and ML path): count a
// classifier's four kinds of answer at a threshold, and work out the area
// under the ROC curve from one sort of the scores, as the share of
// (positive, negative) pairs the scores put in the right order.
//
// Scores are hundredths and the sums are whole or half numbers, so Python and
// JavaScript make exactly the same numbers.

import { pairsOf, scoresFor } from '@/algorithms/ml/roc-curve';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
const near = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 1e-12;
const fmt = (v: number, digits = 4) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const listOf = (vs: readonly number[]) => `[${vs.join(', ')}]`;
const strip = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

/** The visualiser's 80 scores from a seed, negatives first, with their labels (1 positive, 0 negative). */
export function fromVisualiser(seed: number): { scores: number[]; labels: number[] } {
  const s = scoresFor(seed);
  return { scores: [...s.neg, ...s.pos], labels: [...s.neg.map(() => 0), ...s.pos.map(() => 1)] };
}

// ───────────────────────────── 1. confusion ─────────────────────────────

export type ConfusionInput = { scores: number[]; labels: number[]; threshold: number };

/**
 * [TP, FP, FN, TN] at the threshold, the right way and the usual slips, each
 * as the code that makes it would count:
 * - strict: flagged when the score is above the threshold (>), so a score
 *   exactly at it is missed.
 * - swap: false positives and false negatives in each other's places.
 * - flip-labels: label 0 read as the positive class.
 * - flip-flag: flagged when the score is below the threshold.
 * - wrong-cell: every unflagged example counted as a true negative.
 */
export type ConfusionSlip = 'strict' | 'swap' | 'flip-labels' | 'flip-flag' | 'wrong-cell';

export function confusionOf({ scores, labels, threshold }: ConfusionInput, slip?: ConfusionSlip): number[] {
  const counts = [0, 0, 0, 0];
  scores.forEach((s, i) => {
    let flagged = slip === 'strict' ? s > threshold : s >= threshold;
    if (slip === 'flip-flag') flagged = !flagged;
    const positive = slip === 'flip-labels' ? labels[i] === 0 : labels[i] === 1;
    if (flagged && positive) counts[0]++;
    else if (flagged) counts[1]++;
    else if (positive) counts[slip === 'wrong-cell' ? 3 : 2]++;
    else counts[3]++;
  });
  return slip === 'swap' ? [counts[0], counts[2], counts[1], counts[3]] : counts;
}

function checkConfusion(input: ConfusionInput, result: RunResult): Verdict {
  if (result.error) return crashed(result)!;
  const got = result.returned;
  const n = input.scores.length;
  if (!isNumbers(got) || got.length !== 4) return { pass: false, message: 'Return the four counts as a list: [TP, FP, FN, TN], in that order (counts itself).' };
  const want = confusionOf(input);
  const same = (a: readonly number[], b: readonly number[]) => a.every((v, k) => v === b[k]);
  if (same(got, want)) {
    const [tp, fp, fn, tn] = want;
    const recall = tp + fn ? `recall ${tp}/${tp + fn} = ${fmt(tp / (tp + fn), 3)}` : 'no real positives, so no recall';
    const precision = tp + fp ? `precision ${tp}/${tp + fp} = ${fmt(tp / (tp + fp), 3)}` : 'nothing flagged, so no precision';
    return { pass: true, message: `TP ${tp}, FP ${fp}, FN ${fn}, TN ${tn} at threshold ${input.threshold}: ${recall}, ${precision}.` };
  }
  const is = (slip: ConfusionSlip) => same(got, confusionOf(input, slip));
  if (is('strict')) {
    const at = input.scores.filter((s) => s === input.threshold).length;
    return { pass: false, message: `${at === 1 ? 'One score is' : `${at} scores are`} exactly ${input.threshold}, the threshold, and you didn’t flag ${at === 1 ? 'it' : 'them'}. The rule is to flag a score of the threshold or more: score >= threshold, not >.` };
  }
  if (is('swap')) return { pass: false, message: `Your false positives and false negatives are swapped: you returned FP ${got[1]} and FN ${got[2]}, but FP (flagged, really negative) is ${want[1]} and FN (missed, really positive) is ${want[2]}. A false positive is a false alarm; a false negative is a miss.` };
  if (is('flip-labels')) return { pass: false, message: 'You read the labels the wrong way round: label 1 is a positive, label 0 a negative. A flagged example with label 1 is a true positive.' };
  if (is('flip-flag')) return { pass: false, message: 'You flagged the scores below the threshold. A score is a probability of positive, so flag the high ones: score >= threshold.' };
  if (is('wrong-cell')) return { pass: false, message: `No false negatives at all, and ${got[3]} true negatives: you counted every unflagged example as a true negative. A real positive that isn’t flagged is a miss, a false negative: counts[2]. Only unflagged negatives are true negatives.` };
  const total = got.reduce((t, v) => t + v, 0);
  if (total !== n) return { pass: false, message: `Your four counts add up to ${total}, but there are ${n} examples. Each example goes into exactly one of the four cells.` };
  return { pass: false, message: `At threshold ${input.threshold} the counts are ${listOf(want)}, but you returned ${listOf(got)}. For each i: flagged = scores[i] >= threshold; then TP if flagged and labels[i] is 1, FP if flagged and 0, FN if not flagged and 1, TN if neither.` };
}

const CONFUSION_BLANKS_PY = `def confusion(scores, labels, threshold):
    counts = array([0, 0, 0, 0])  # TP, FP, FN, TN
    for i in range(len(scores)):
        flagged = «1:scores[i] >= threshold»
        if flagged and «2:labels[i] == 1»:
            counts[0] += 1
        elif flagged:
            counts[«3:1»] += 1
        elif labels[i] == 1:
            counts[«4:2»] += 1
        else:
            counts[3] += 1
    return counts
`;
const CONFUSION_BLANKS_JS = `function confusion(scores, labels, threshold) {
  const counts = array([0, 0, 0, 0]); // TP, FP, FN, TN
  for (let i = 0; i < scores.length; i++) {
    const flagged = «1:scores[i] >= threshold»;
    if (flagged && «2:labels[i] === 1») {
      counts[0] += 1;
    } else if (flagged) {
      counts[«3:1»] += 1;
    } else if (labels[i] === 1) {
      counts[«4:2»] += 1;
    } else {
      counts[3] += 1;
    }
  }
  return counts;
}
`;
const CONFUSION_STARTER_PY = `def confusion(scores, labels, threshold):
    counts = array([0, 0, 0, 0])  # TP, FP, FN, TN
    # For each example, flag it when its score is the threshold or more.
    # Add 1 to the right cell: TP if flagged and really positive (label 1),
    # FP if flagged and really negative, FN if not flagged and really
    # positive, TN if neither.
    return counts
`;
const CONFUSION_STARTER_JS = `function confusion(scores, labels, threshold) {
  const counts = array([0, 0, 0, 0]); // TP, FP, FN, TN
  // For each example, flag it when its score is the threshold or more.
  // Add 1 to the right cell: TP if flagged and really positive (label 1),
  // FP if flagged and really negative, FN if not flagged and really
  // positive, TN if neither.
  return counts;
}
`;
const confusionTs = (js: string) =>
  js
    .replace('function confusion(scores, labels, threshold) {', 'function confusion(scores: number[], labels: number[], threshold: number): number[] {')
    .replace('const counts = array(', 'const counts: number[] = array(');

const confusionArgs = ({ scores, labels, threshold }: ConfusionInput): Arg[] => [
  { kind: 'value', name: 'scores', value: scores },
  { kind: 'value', name: 'labels', value: labels },
  { kind: 'value', name: 'threshold', value: threshold },
];

/** Seven made-up examples, two of them scoring exactly the threshold. */
export const SEVEN: ConfusionInput = { scores: [0.9, 0.8, 0.7, 0.5, 0.5, 0.3, 0.1], labels: [1, 1, 0, 1, 0, 1, 0], threshold: 0.5 };
const seven = fromVisualiser(7);

export const CONFUSION_TESTS: { name: string; input: ConfusionInput }[] = [
  { name: 'seven made-up examples, two scoring exactly the threshold', input: SEVEN },
  { name: 'the visualiser’s 80 scores from seed 7, threshold 0.5', input: { ...seven, threshold: 0.5 } },
  { name: 'the same scores, threshold 0.65', input: { ...seven, threshold: 0.65 } },
  { name: 'threshold 0: everything flagged', input: { ...seven, threshold: 0 } },
  { name: 'threshold 1: nothing flagged', input: { ...seven, threshold: 1 } },
  { name: 'a mix of classes in no order', input: { scores: [0.2, 0.85, 0.4, 0.4, 0.95, 0.6, 0.05, 0.6], labels: [1, 1, 0, 1, 0, 0, 0, 1], threshold: 0.4 } },
];

const confusionExercise: Exercise<ConfusionInput> = {
  slug: 'confusion',
  title: 'Count a confusion matrix',
  kind: 'write',
  visualiser: 'roc-curve',
  summary: 'Flag every score at or above a threshold, and count the true positives, false positives, false negatives and true negatives.',
  task: [
    'A classifier has scored some examples between 0 and 1: `scores[i]` is how likely it thinks example i is positive, and `labels[i]` is the truth, 1 for a positive and 0 for a negative. Write `confusion(scores, labels, threshold)`, which returns the four counts `[TP, FP, FN, TN]` at the threshold.',
    'Flag an example when its score is the threshold or more. A flagged positive is a true positive (TP), a flagged negative a false positive (FP), an unflagged positive a false negative (FN) and an unflagged negative a true negative (TN).',
    'Count into `counts`, which the run draws, adding 1 to one of its four cells for each example.',
  ],
  entry: { python: 'confusion', js: 'confusion' },
  args: confusionArgs,
  starter: { python: CONFUSION_STARTER_PY, javascript: CONFUSION_STARTER_JS, typescript: confusionTs(CONFUSION_STARTER_JS) },
  solution: { python: strip(CONFUSION_BLANKS_PY), javascript: strip(CONFUSION_BLANKS_JS), typescript: confusionTs(strip(CONFUSION_BLANKS_JS)) },
  blanks: { python: CONFUSION_BLANKS_PY, javascript: CONFUSION_BLANKS_JS, typescript: confusionTs(CONFUSION_BLANKS_JS) },
  fades: [[3, 4], [1, 3, 4], [1, 2, 3, 4]],
  distractors: {
    python: ['        flagged = scores[i] > threshold', '        elif labels[i] == 0:'],
    javascript: ['    const flagged = scores[i] > threshold;', '    } else if (labels[i] === 0) {'],
    typescript: ['    const flagged = scores[i] > threshold;', '    } else if (labels[i] === 0) {'],
  },
  examples: [
    { id: 'seven', label: 'Seven made-up examples, threshold 0.5', input: SEVEN },
    { id: 'eighty', label: 'The visualiser’s 80 scores, threshold 0.5', input: CONFUSION_TESTS[1].input },
  ],
  tests: CONFUSION_TESTS,
  check: checkConfusion,
  markSortedAtEnd: false,
  pointers: [],
  hints: [
    'Loop i over the examples and work out flagged = scores[i] >= threshold first: the four cases are then flagged or not, label 1 or 0.',
    'An if/elif chain does it: if flagged and labels[i] == 1, it is a TP (counts[0]); elif flagged, an FP (counts[1]); elif labels[i] == 1, an FN (counts[2]); else a TN (counts[3]).',
    'A score exactly equal to the threshold is flagged: use >=, not >.',
  ],
  legend: [
    { neutral: 'The four counts: TP, FP, FN, TN' },
    { mark: 'write', label: 'The count just added to' },
  ],
};

// ───────────────────────────── 2. auc ─────────────────────────────

export type AucInput = { scores: number[]; labels: number[] };

/**
 * The area under the ROC curve from one sort: the share of (positive,
 * negative) pairs where the positive scores higher, a tie counting half; and
 * the usual slips:
 * - ties-win / ties-lose: a tie counted as a whole pair won, or as none.
 * - ignore-ties: no groups, so a tied negative counts as below a positive
 *   only when the sort happened to put it first.
 * - all-pairs: divided by every pair of examples, n(n − 1)/2.
 * - squared: divided by n².
 * - inverted: the pairs where the negative scores higher (1 − AUC).
 */
export type AucSlip = 'ties-win' | 'ties-lose' | 'ignore-ties' | 'all-pairs' | 'squared' | 'inverted';

export function aucOf({ scores, labels }: AucInput, slip?: AucSlip): number {
  const n = scores.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const positives = labels.reduce((t, y) => t + y, 0);
  const negatives = n - positives;
  let wins = 0;
  let below = 0;
  if (slip === 'ignore-ties') {
    for (const i of order) {
      if (labels[i] === 1) wins += below;
      else below++;
    }
  } else {
    for (let start = 0; start < n; ) {
      let end = start;
      while (end + 1 < n && scores[order[end + 1]] === scores[order[start]]) end++;
      let pos = 0;
      let neg = 0;
      for (let k = start; k <= end; k++) {
        if (labels[order[k]] === 1) pos++;
        else neg++;
      }
      wins += pos * (below + (slip === 'ties-win' ? neg : slip === 'ties-lose' ? 0 : neg / 2));
      below += neg;
      start = end + 1;
    }
  }
  const auc = wins / (slip === 'all-pairs' ? (n * (n - 1)) / 2 : slip === 'squared' ? n * n : positives * negatives);
  return slip === 'inverted' ? 1 - auc : auc;
}

/** The 1,200 scores of the big test: the visualiser's scores from 15 seeds, 600 of each class. */
export const BIG: AucInput = (() => {
  const scores: number[] = [];
  const labels: number[] = [];
  for (let k = 0; k < 15; k++) {
    const s = fromVisualiser(101 + k);
    scores.push(...s.scores);
    labels.push(...s.labels);
  }
  return { scores, labels };
})();

function checkAuc(input: AucInput, result: RunResult): Verdict {
  const n = input.scores.length;
  const positives = input.labels.reduce((t, y) => t + y, 0);
  const negatives = n - positives;
  if (result.error && (result.error.kind === 'limit' || result.error.kind === 'timeout')) {
    if (n >= 1000)
      return {
        pass: false,
        message: `Stopped at the step limit on ${n.toLocaleString('en')} scores. Comparing every positive with every negative is ${positives} × ${negatives} = ${(positives * negatives).toLocaleString('en')} pairs, too many steps. Sort the scores once and walk up them, keeping count of the negatives passed so far: each positive then beats all of those at once.`,
      };
    return { pass: false, message: 'Your loop never ended. In the walk up the sorted scores, move start on to end + 1 after each group of equal scores.' };
  }
  if (result.error) return crashed(result)!;
  const got = result.returned;
  if (typeof got !== 'number') return { pass: false, message: 'Return the area as one number between 0 and 1: wins / (positives × negatives).' };
  const want = aucOf(input);
  if (near(got, want)) {
    const p = pairsOf({ pos: input.scores.filter((_, i) => input.labels[i] === 1), neg: input.scores.filter((_, i) => input.labels[i] === 0) });
    return { pass: true, message: `AUC = ${fmt(want)}: of the ${positives} × ${negatives} = ${p.pairs} pairs, the positive scores higher in ${p.wins} and ${p.ties} tie, so (${p.wins} + ${p.ties}/2) / ${p.pairs}.` };
  }
  const is = (slip: AucSlip) => near(got, aucOf(input, slip));
  if (is('ties-win')) return { pass: false, message: 'You counted a tie as a pair won. When a positive and a negative score the same, the scores can’t tell them apart: count the pair as half, neg / 2 for the tied negatives.' };
  if (is('ties-lose')) return { pass: false, message: 'You counted a tie as no pair won. When a positive and a negative score the same, the scores can’t tell them apart, so the pair counts half: add neg / 2 for the negatives tied with each positive.' };
  if (is('ignore-ties')) return { pass: false, message: 'Your answer depends on which of some equal scores the sort put first: a positive gets credit for a tied negative only if it came earlier. Walk up the scores a group of equal scores at a time, and count the group’s negatives as half for each positive in it.' };
  if (is('inverted')) return { pass: false, message: `You returned ${fmt(got)}, which is 1 − AUC: the share of pairs where the negative scores higher. Count, for each positive, the negatives scoring below it.` };
  if (is('all-pairs')) return { pass: false, message: `You divided by every pair of examples, ${n} × ${n - 1} / 2. Only (positive, negative) pairs count: divide by positives × negatives = ${positives * negatives}.` };
  if (is('squared')) return { pass: false, message: `You divided by n × n = ${n * n}. Only (positive, negative) pairs count: divide by positives × negatives = ${positives * negatives}.` };
  if (got < 0 || got > 1) return { pass: false, message: `${fmt(got)} isn’t a share of pairs: it must be between 0 and 1. Divide the pairs won by positives × negatives = ${positives * negatives}.` };
  return { pass: false, message: `The AUC is ${fmt(want)}, but you returned ${fmt(got)}. Walk up the sorted scores a group of equal scores at a time: each positive in a group wins against every negative below the group and half of the group’s negatives.` };
}

const AUC_BLANKS_PY = `def auc(scores, labels):
    n = len(scores)
    order = sorted(range(n), key=lambda i: scores[i])
    ranked = array([labels[i] for i in order])
    positives = sum(labels)
    negatives = n - positives
    wins = 0
    below = 0
    start = 0
    while start < n:
        end = start
        while end + 1 < n and scores[order[end + 1]] == scores[order[start]]:
            end += 1
        pos = 0
        neg = 0
        for k in range(start, end + 1):
            if ranked[k] == 1:
                pos += 1
            else:
                neg += 1
        wins += «1:pos * (below + neg / 2)»
        below += «2:neg»
        start = «3:end + 1»
    return wins / «4:(positives * negatives)»
`;
const AUC_BLANKS_JS = `function auc(scores, labels) {
  const n = scores.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranked = array(order.map((i) => labels[i]));
  let positives = 0;
  for (const y of labels) positives += y;
  const negatives = n - positives;
  let wins = 0;
  let below = 0;
  let start = 0;
  while (start < n) {
    let end = start;
    while (end + 1 < n && scores[order[end + 1]] === scores[order[start]]) {
      end += 1;
    }
    let pos = 0;
    let neg = 0;
    for (let k = start; k <= end; k++) {
      if (ranked[k] === 1) {
        pos += 1;
      } else {
        neg += 1;
      }
    }
    wins += «1:pos * (below + neg / 2)»;
    below += «2:neg»;
    start = «3:end + 1»;
  }
  return wins / «4:(positives * negatives)»;
}
`;
const AUC_STARTER_PY = `def auc(scores, labels):
    n = len(scores)
    # The indices sorted by score, lowest first, and the labels in that order.
    order = sorted(range(n), key=lambda i: scores[i])
    ranked = array([labels[i] for i in order])
    positives = sum(labels)
    negatives = n - positives
    wins = 0
    # Walk up ranked a group of equal scores at a time, keeping below, the
    # negatives passed so far. Each positive in a group beats every negative
    # below the group, and ties with the group's negatives, which count half.
    # Add what each group's positives win to wins.
    return wins / (positives * negatives)
`;
const AUC_STARTER_JS = `function auc(scores, labels) {
  const n = scores.length;
  // The indices sorted by score, lowest first, and the labels in that order.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranked = array(order.map((i) => labels[i]));
  let positives = 0;
  for (const y of labels) positives += y;
  const negatives = n - positives;
  let wins = 0;
  // Walk up ranked a group of equal scores at a time, keeping below, the
  // negatives passed so far. Each positive in a group beats every negative
  // below the group, and ties with the group's negatives, which count half.
  // Add what each group's positives win to wins.
  return wins / (positives * negatives);
}
`;
const aucTs = (js: string) =>
  js
    .replace('function auc(scores, labels) {', 'function auc(scores: number[], labels: number[]): number {')
    .replace('const ranked = array(', 'const ranked: number[] = array(');

const aucArgs = ({ scores, labels }: AucInput): Arg[] => [
  { kind: 'value', name: 'scores', value: scores },
  { kind: 'value', name: 'labels', value: labels },
];

/** Two positives (0.8, 0.4) and two negatives (0.4, 0.2): 3 pairs won and a tie, 3.5 of 4. */
export const FOUR: AucInput = { scores: [0.8, 0.4, 0.4, 0.2], labels: [1, 1, 0, 0] };
/** Nine scores and two ties: a negative listed before a positive at 0.6, a positive before two negatives at 0.4. */
export const NINE: AucInput = { scores: [0.3, 0.9, 0.6, 0.6, 0.4, 0.75, 0.4, 0.4, 0.1], labels: [0, 1, 0, 1, 1, 0, 0, 0, 0] };

export const AUC_TESTS: { name: string; input: AucInput }[] = [
  { name: 'two positives and two negatives, one tie', input: FOUR },
  { name: 'nine scores, two ties', input: NINE },
  { name: 'a perfect ranking', input: { scores: [0.1, 0.2, 0.3, 0.7, 0.8, 0.9], labels: [0, 0, 0, 1, 1, 1] } },
  { name: 'every positive below every negative', input: { scores: [0.9, 0.8, 0.2, 0.1], labels: [0, 0, 1, 1] } },
  { name: 'every score the same', input: { scores: [0.5, 0.5, 0.5, 0.5, 0.5], labels: [1, 0, 0, 1, 0] } },
  { name: 'the visualiser’s 80 scores from seed 7', input: { scores: seven.scores, labels: seven.labels } },
  { name: '1,200 scores (too many pairs to compare one by one)', input: BIG },
];

const aucExercise: Exercise<AucInput> = {
  slug: 'auc',
  title: 'The area under the ROC curve, by sorting',
  kind: 'write',
  visualiser: 'roc-curve',
  summary: 'Work out the AUC as the share of (positive, negative) pairs the scores put in the right order, ties as half, with one sort instead of a comparison per pair.',
  task: [
    'The area under the ROC curve (AUC) is the share of (positive, negative) pairs where the positive scores higher, a tie counting as half a pair. Write `auc(scores, labels)`, where `labels[i]` is 1 for a positive and 0 for a negative.',
    'Comparing every positive with every negative works, but 600 positives and 600 negatives make 360,000 pairs, and one judged test has that many: too many steps. Sort instead. The starter sorts the indices by score, lowest first, and puts the labels in that order in `ranked`. Walk up `ranked` a group of equal scores at a time, keeping `below`, how many negatives you have passed. Every positive in a group beats all `below` negatives, and ties with the group’s own negatives, which count half each.',
    'Return the pairs won divided by positives × negatives.',
  ],
  entry: { python: 'auc', js: 'auc' },
  args: aucArgs,
  starter: { python: AUC_STARTER_PY, javascript: AUC_STARTER_JS, typescript: aucTs(AUC_STARTER_JS) },
  solution: { python: strip(AUC_BLANKS_PY), javascript: strip(AUC_BLANKS_JS), typescript: aucTs(strip(AUC_BLANKS_JS)) },
  blanks: { python: AUC_BLANKS_PY, javascript: AUC_BLANKS_JS, typescript: aucTs(AUC_BLANKS_JS) },
  fades: [[4], [1, 4], [1, 2, 3, 4]],
  distractors: {
    python: ['        wins += pos * (below + neg)', '    return wins / (n * n)'],
    javascript: ['    wins += pos * (below + neg);', '  return wins / (n * n);'],
    typescript: ['    wins += pos * (below + neg);', '  return wins / (n * n);'],
  },
  examples: [
    { id: 'four', label: 'Two positives, two negatives, one tie', input: FOUR },
    { id: 'nine', label: 'Nine scores, two ties', input: NINE },
  ],
  tests: AUC_TESTS,
  check: checkAuc,
  markSortedAtEnd: false,
  pointers: ['start', 'end', 'k'],
  hints: [
    'Before the loop, wins = 0, below = 0 and start = 0. While start < n: move end forward from start while the next score equals scores[order[start]], so start..end is one group of equal scores.',
    'Count the group’s positives (pos) and negatives (neg) from ranked[start] to ranked[end]. Each positive wins below pairs outright and half of the neg tied ones: wins += pos * (below + neg / 2).',
    'Then below += neg, since those negatives are now below everything still to come, and start = end + 1. Finally return wins / (positives * negatives).',
  ],
  legend: [
    { neutral: 'Labels in order of score, lowest first: 1 positive, 0 negative' },
    { mark: 'compare', label: 'A label being read' },
  ],
};

export const classificationMetricsExercises: Exercise[] = [confusionExercise, aucExercise];

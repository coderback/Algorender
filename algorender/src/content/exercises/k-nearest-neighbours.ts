// k-nearest neighbours as code (B7 of the math and ML path): measure every
// training point's squared distance to the query into an array(), take the k
// nearest (a tie in distance going to the lower index), count their classes
// into a second array(), and return the class with the most votes (a tie in
// the vote going to the tied class whose member is nearest).
//
// The tests' coordinates are tenths, and every squared distance is worked out
// the same way in both languages, so Python and JavaScript write the same
// numbers to the last bit.

import { METRIC_POINTS, queryData } from '@/algorithms/ml/k-nearest-neighbours';
import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, stripBlanks, type Exercise, type Verdict } from './shared';

export type KnnInput = { points: number[][]; labels: number[]; query: number[]; k: number };

/**
 * k-NN's prediction worked out the right way, and the usual slips as the code
 * that makes them would run, so a wrong answer can be named:
 * - farthest: the k farthest points vote (sorted the wrong way round).
 * - k-plus-one, k-minus-one: one neighbour too many or too few.
 * - skip-zero: a training point at the query's own spot left out, as if it were the query itself.
 * - first-k: the first k points in the list vote, not the k nearest.
 * - ties-high: equal distances go to the higher index.
 * - smallest-label: a tied vote goes to the smallest label (votes.index(best)), not the nearest member's class.
 * - manhattan: |dx| + |dy| instead of the straight line.
 */
export type KnnSlip = 'farthest' | 'k-plus-one' | 'k-minus-one' | 'skip-zero' | 'first-k' | 'ties-high' | 'smallest-label' | 'manhattan';

export type KnnRun = { dist: number[]; order: number[]; nearest: number[]; votes: number[]; prediction: number | null };

export function knnPredict({ points, labels, query, k }: KnnInput, slip?: KnnSlip): KnnRun {
  const dist = points.map(([x, y]) => {
    const dx = x - query[0];
    const dy = y - query[1];
    return slip === 'manhattan' ? Math.abs(dx) + Math.abs(dy) : dx * dx + dy * dy;
  });
  const indices = points.map((_, i) => i);
  const order =
    slip === 'farthest'
      ? [...indices].sort((a, b) => dist[b] - dist[a] || a - b)
      : slip === 'ties-high'
        ? [...indices].sort((a, b) => dist[a] - dist[b] || b - a)
        : [...indices].sort((a, b) => dist[a] - dist[b] || a - b);
  const kept = slip === 'skip-zero' ? order.filter((i) => dist[i] !== 0) : order;
  const count = slip === 'k-plus-one' ? k + 1 : slip === 'k-minus-one' ? k - 1 : k;
  const nearest = slip === 'first-k' ? indices.slice(0, k) : kept.slice(0, count);
  const votes = Array.from({ length: Math.max(...labels) + 1 }, () => 0);
  for (const i of nearest) votes[labels[i]] += 1;
  const best = Math.max(...votes);
  const prediction = slip === 'smallest-label' ? votes.indexOf(best) : (nearest.map((i) => labels[i]).find((l) => votes[l] === best) ?? null);
  return { dist, order, nearest, votes, prediction };
}

/** The learner's visual array `name` at the end of the run. */
function finalArray(result: RunResult, name: string): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  return made && made.kind === 'array' ? (result.arrays[made.array] ?? null) : null;
}

const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => close(v, b[i]));
const sameInts = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const fmt = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const list = (vs: readonly number[]) => `[${vs.map(fmt).join(', ')}]`;
const andList = (vs: readonly (string | number)[]) => (vs.length < 2 ? vs.join('') : `${vs.slice(0, -1).join(', ')} and ${vs.at(-1)}`);

const VOTE_SLIPS: { slip: KnnSlip; message: (input: KnnInput, want: KnnRun) => string }[] = [
  {
    slip: 'k-plus-one',
    message: ({ k }) => `Your votes add up to ${k + 1}, but only the ${k} nearest vote: one neighbour too many. Take the first k of the order, order[:k] (order.slice(0, k) in JavaScript), which stops just before index k.`,
  },
  {
    slip: 'k-minus-one',
    message: ({ k }) => `Your votes add up to ${k - 1}, but ${k} neighbours vote, one each. Take the first k of the order, order[:k] (order.slice(0, k) in JavaScript): indices 0 to k − 1, which is k of them; then add 1 to votes[labels[i]] for each.`,
  },
  {
    slip: 'farthest',
    message: ({ k }) => `Your votes come from the ${k} farthest points: the order runs from the biggest distance down. Sort the indices from the smallest dist[i] up, so the nearest come first.`,
  },
  {
    slip: 'first-k',
    message: ({ k }) => `Your votes come from the first ${k} points in the list, not the ${k} nearest. Sort the indices by dist[i] first, then take the first ${k} of that order.`,
  },
  {
    slip: 'skip-zero',
    message: (_, want) =>
      `A training point sits exactly on the query here, at distance 0 (point ${want.order[0]}), and you left it out. It isn't the query: it is a training point, the nearest one of all, and it gets its vote.`,
  },
  {
    slip: 'ties-high',
    message: () => 'Two points are the same distance from the query, and you took the later one. The task breaks a tie in distance in favour of the lower index: a stable sort (sorted in Python, sort in JavaScript) keeps them in index order.',
  },
];

function checkKnn(input: KnnInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const { points, k } = input;
  const want = knnPredict(input);
  const dist = finalArray(result, 'dist');
  if (!dist) return { pass: false, message: 'Make the array of distances first: dist = array(len(points)) (array(points.length) in JavaScript), then write each point’s squared distance into dist[i].' };
  if (dist.length !== points.length) return { pass: false, message: `dist has ${dist.length} cells but there are ${points.length} points: one cell per training point.` };
  if (!sameNumbers(dist, want.dist) && !sameNumbers(dist, want.dist.map(Math.sqrt))) {
    if (dist.every((v) => v === 0)) return { pass: false, message: 'dist is still all 0: for each point i, work out dx = points[i][0] − query[0] and dy = points[i][1] − query[1], and write dx * dx + dy * dy into dist[i].' };
    if (sameNumbers(dist, knnPredict(input, 'manhattan').dist))
      return { pass: false, message: 'You measured |dx| + |dy|, the city-block distance (L1). The task asks for the straight line: write the squared distance dx * dx + dy * dy, which puts the points in the same order as the distance itself.' };
    const i = dist.findIndex((v, j) => !close(v, want.dist[j]));
    return { pass: false, message: `dist[${i}] should be ${fmt(want.dist[i])}: point ${i} is ${list(points[i])}, so dx = ${fmt(points[i][0] - input.query[0])} and dy = ${fmt(points[i][1] - input.query[1])}, and dx * dx + dy * dy = ${fmt(want.dist[i])}. Yours is ${fmt(dist[i])}.` };
  }
  const votes = finalArray(result, 'votes');
  if (!votes) return { pass: false, message: 'Make the array of votes: votes = array(max(labels) + 1) (array(Math.max(...labels) + 1) in JavaScript), one cell per class, and add 1 to votes[labels[i]] for each of the k nearest.' };
  if (votes.length !== want.votes.length) return { pass: false, message: `votes has ${votes.length} cells, but the labels run from 0 to ${want.votes.length - 1}: make it max(labels) + 1 long, one cell per class.` };
  const got = result.returned;
  const nearestText = `${andList(want.nearest)} (squared distances ${andList(want.nearest.map((i) => fmt(want.dist[i])))})`;
  if (sameInts(votes, want.votes)) {
    if (got === want.prediction) {
      const tie = want.votes.filter((v) => v === Math.max(...want.votes)).length > 1;
      return {
        pass: true,
        message: `The ${k} nearest are points ${nearestText}, with votes ${list(want.votes)}${tie ? `: a tie, which goes to class ${want.prediction}, whose member is nearer` : ''}. k-NN predicts class ${want.prediction}.`,
      };
    }
    if (got === knnPredict(input, 'smallest-label').prediction)
      return {
        pass: false,
        message: `The vote is a tie, ${list(want.votes)}, and you returned the smallest tied label, ${got} (votes.index(best) finds the first cell holding best). The task gives a tie to the tied class whose member is nearest: go through the k nearest in order and return the label of the first one whose class has best votes, here ${want.prediction}.`,
      };
    return { pass: false, message: `The votes are right, ${list(want.votes)}, but you returned ${JSON.stringify(got)}. Return the class with the most votes${want.votes.filter((v) => v === Math.max(...want.votes)).length > 1 ? ', a tie going to the class of the nearest tied point' : ''}: ${want.prediction}.` };
  }
  const matches = VOTE_SLIPS.filter(({ slip }) => sameInts(votes, knnPredict(input, slip).votes));
  if (matches.length === 1) return { pass: false, message: matches[0].message(input, want) };
  return { pass: false, message: `votes should count the classes of the ${k} nearest points, ${nearestText}: ${list(want.votes)}. Yours is ${list(votes)}. Sort the indices by dist[i], smallest first (a tie in distance to the lower index), and take the first ${k}.` };
}

const KNN_BLANKS_PY = `def knn_predict(points, labels, query, k):
    dist = array(len(points))
    for i in range(len(points)):
        dx = points[i][0] - query[0]
        dy = points[i][1] - query[1]
        dist[i] = «1:dx * dx + dy * dy»
    order = sorted(range(len(points)), key=lambda i: «2:dist[i]»)
    nearest = «3:order[:k]»
    votes = array(max(labels) + 1)
    for i in nearest:
        votes[labels[i]] = «4:votes[labels[i]] + 1»
    best = max(votes)
    for i in nearest:
        if «5:votes[labels[i]] == best»:
            return labels[i]
`;
const KNN_BLANKS_JS = `function knnPredict(points, labels, query, k) {
  const dist = array(points.length);
  for (let i = 0; i < points.length; i++) {
    const dx = points[i][0] - query[0];
    const dy = points[i][1] - query[1];
    dist[i] = «1:dx * dx + dy * dy»;
  }
  const order = points.map((_, i) => i).sort((a, b) => «2:dist[a] - dist[b]»);
  const nearest = «3:order.slice(0, k)»;
  const votes = array(Math.max(...labels) + 1);
  for (const i of nearest) {
    votes[labels[i]] = «4:votes[labels[i]] + 1»;
  }
  const best = Math.max(...votes);
  for (const i of nearest) {
    if («5:votes[labels[i]] === best») return labels[i];
  }
}
`;
const KNN_STARTER_PY = `def knn_predict(points, labels, query, k):
    dist = array(len(points))
    # 1. For each point i, write its squared distance to the query,
    #    dx * dx + dy * dy, into dist[i].
    # 2. List the indices from nearest to farthest (a tie in distance
    #    to the lower index), and keep the first k.
    votes = array(max(labels) + 1)
    # 3. Add 1 to votes[labels[i]] for each of the k nearest.
    # 4. Return the class with the most votes; if classes tie, the class
    #    of the nearest point among them.
    return 0
`;
const KNN_STARTER_JS = `function knnPredict(points, labels, query, k) {
  const dist = array(points.length);
  // 1. For each point i, write its squared distance to the query,
  //    dx * dx + dy * dy, into dist[i].
  // 2. List the indices from nearest to farthest (a tie in distance
  //    to the lower index), and keep the first k.
  const votes = array(Math.max(...labels) + 1);
  // 3. Add 1 to votes[labels[i]] for each of the k nearest.
  // 4. Return the class with the most votes; if classes tie, the class
  //    of the nearest point among them.
  return 0;
}
`;
const knnTs = (js: string) =>
  js
    .replace('function knnPredict(points, labels, query, k) {', 'function knnPredict(points: number[][], labels: number[], query: number[], k: number): number {')
    .replace('const dist = array(', 'const dist: number[] = array(')
    .replace('const votes = array(', 'const votes: number[] = array(')
    .replace('points.map((_, i) => i)', 'points.map((_: number[], i: number) => i)')
    .replace('.sort((a, b) =>', '.sort((a: number, b: number) =>')
    .replace(/  }\n}\n$/, '  }\n  return -1;\n}\n');

const knnArgs = ({ points, labels, query, k }: KnnInput): Arg[] => [
  { kind: 'value', name: 'points', value: points },
  { kind: 'value', name: 'labels', value: labels },
  { kind: 'value', name: 'query', value: query },
  { kind: 'value', name: 'k', value: k },
];

const fromModule = (points: readonly { x: number; y: number; label: number }[], query: number[], k: number): KnnInput => ({
  points: points.map((p) => [p.x, p.y]),
  labels: points.map((p) => p.label),
  query,
  k,
});

/** The lesson's worked example: six points of two classes around the query (3, 3). */
export const SMALL: KnnInput = {
  points: [
    [1, 2],
    [2, 4],
    [4, 4],
    [5, 2],
    [3, 1],
    [1, 5],
  ],
  labels: [0, 0, 1, 1, 1, 0],
  query: [3, 3],
  k: 3,
};

export const KNN_TESTS: { name: string; input: KnnInput }[] = [
  { name: 'six points, two classes, k = 3', input: SMALL },
  {
    name: 'a tied vote: the nearer class wins, not the smaller label',
    input: { points: [[0.5, 0], [1, 0.5], [0, 1.2], [-1, -0.8], [2, 2], [-2.5, 0.4]], labels: [2, 0, 0, 2, 1, 1], query: [0, 0], k: 4 },
  },
  { name: 'k = 1: the single nearest point decides', input: { points: [[1, 1], [2, 0.5], [-0.4, 0.3], [0.6, -0.7], [3, 3]], labels: [0, 1, 1, 0, 0], query: [0, 0], k: 1 } },
  {
    name: 'a training point exactly at the query',
    input: { points: [[1, 1], [0.5, 0.5], [1.5, 1], [1, 1.6], [0.2, 1.1], [2, 2.2]], labels: [1, 0, 0, 0, 1, 1], query: [1, 1], k: 3 },
  },
  {
    name: 'two points equally far at the edge: the lower index is nearer',
    input: { points: [[1, 0], [0, 1], [-1, 0], [0, -1.5], [2, 2], [-2, -2]], labels: [1, 1, 0, 0, 0, 0], query: [0, 0], k: 2 },
  },
  { name: 'the visualiser’s 16 points and three rulers, k = 3', input: fromModule(METRIC_POINTS, [0, 0], 3) },
  { name: 'the visualiser’s 40 points from seed 7, k = 5', input: fromModule(queryData(7), [0, 0], 5) },
  { name: 'every point votes: k = 7 of 7', input: { points: [[0, 0], [1, 1], [-1, 1], [2, -1], [0.5, 0.3], [-2, -2], [1.5, 0]], labels: [1, 0, 1, 0, 0, 1, 0], query: [0.2, 0.1], k: 7 } },
];

const knnExercise: Exercise<KnnInput> = {
  slug: 'knn-predict',
  title: 'Predict with k nearest neighbours',
  kind: 'write',
  visualiser: 'k-nearest-neighbours',
  summary: 'Measure every training point’s distance to a query, take the k nearest, and let them vote on its class.',
  task: [
    'Write `knn_predict(points, labels, query, k)` (`knnPredict` in JavaScript and TypeScript). `points` is a list of training points, each `[x, y]`; `labels[i]` is point i’s class, a whole number 0, 1, 2, …; `query` is the new point `[x, y]`. Return the class k-NN predicts for it.',
    'First, for each point i, write its squared straight-line distance to the query into `dist[i]`: with dx = x − query x and dy = y − query y, that is dx·dx + dy·dy. The square root would put the points in the same order, so it can be left out.',
    'Then list the indices from nearest to farthest. Two points the same distance away go in index order, lower first. Keep the first `k`: the k nearest.',
    'Count the k nearest’s classes in `votes`, one cell per class, and return the class with the most votes. If two or more classes tie for the most, return the class of the nearest point among them.',
  ],
  entry: { python: 'knn_predict', js: 'knnPredict' },
  args: knnArgs,
  starter: { python: KNN_STARTER_PY, javascript: KNN_STARTER_JS, typescript: knnTs(KNN_STARTER_JS) },
  solution: { python: stripBlanks(KNN_BLANKS_PY), javascript: stripBlanks(KNN_BLANKS_JS), typescript: knnTs(stripBlanks(KNN_BLANKS_JS)) },
  blanks: { python: KNN_BLANKS_PY, javascript: KNN_BLANKS_JS, typescript: knnTs(KNN_BLANKS_JS) },
  fades: [[3], [1, 3, 4], [1, 2, 3, 4, 5]],
  distractors: {
    python: ['    order = sorted(range(len(points)), key=lambda i: -dist[i])', '    nearest = order[:k + 1]'],
    javascript: ['  const order = points.map((_, i) => i).sort((a, b) => dist[b] - dist[a]);', '  const nearest = order.slice(0, k + 1);'],
    typescript: ['  const order = points.map((_: number[], i: number) => i).sort((a: number, b: number) => dist[b] - dist[a]);', '  const nearest = order.slice(0, k + 1);'],
  },
  examples: [
    { id: 'small', label: 'Six points, two classes, k = 3', input: SMALL },
    { id: 'rulers', label: 'The visualiser’s 16 points, k = 3', input: KNN_TESTS[5].input },
  ],
  tests: KNN_TESTS,
  check: checkKnn,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'dx = points[i][0] - query[0] and dy = points[i][1] - query[1]; then dist[i] = dx * dx + dy * dy.',
    'In Python, `sorted(range(len(points)), key=lambda i: dist[i])` lists the indices from nearest to farthest, and a tie keeps index order. In JavaScript, `points.map((_, i) => i).sort((a, b) => dist[a] - dist[b])` does the same. Keep the first k: `order[:k]`, or `order.slice(0, k)`.',
    'For each i in the k nearest, add 1 to votes[labels[i]]. Then best = the largest vote; go through the k nearest again, nearest first, and return the label of the first point whose class has best votes. That settles a tie in favour of the nearest.',
  ],
  legend: [
    { neutral: 'A squared distance, or a class’s votes' },
    { mark: 'write', label: 'The cell just written' },
  ],
};

export const knnExercises: Exercise[] = [knnExercise];

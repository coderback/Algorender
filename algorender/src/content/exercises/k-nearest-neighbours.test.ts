// B7's k-NN exercise names the usual mistakes: each wrong answer below is a
// slip a learner really makes, and its verdict must say what it was. Most run
// in JavaScript; Python runs the solution (which must write the same
// distances as JavaScript, to the last bit) and some of the slips.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { byDistance, METRIC_POINTS, predict, queryData, vote } from '@/algorithms/ml/k-nearest-neighbours';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';
import { KNN_TESTS, knnPredict, SMALL, type KnnSlip } from './k-nearest-neighbours';

const SLUG = 'knn-predict';
let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(code: string, test = 0, language: Language = 'javascript'): RunResult {
  const exercise = getExercise(SLUG)!;
  const request = testRequest(exercise, language, code, exercise.tests[test].input);
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

function verdict(code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(SLUG)!;
  return exercise.check(exercise.tests[test].input, run(code, test, language));
}

const swap = (from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(SLUG)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

const arrayOf = (result: RunResult, name: string) => {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  return made && made.kind === 'array' ? result.arrays[made.array] : undefined;
};

/** Which test (by index) each slip is named on. */
const NAMED_ON: Record<Exclude<KnnSlip, 'manhattan'>, number> = {
  farthest: 1,
  'k-plus-one': 0,
  'k-minus-one': 0,
  'skip-zero': 3,
  'first-k': 5,
  'ties-high': 4,
  'smallest-label': 1,
};

describe('the reference', () => {
  it('agrees with the visualiser on every test', () => {
    for (const { input } of KNN_TESTS) {
      const points = input.points.map(([x, y], i) => ({ x, y, label: input.labels[i] }));
      const want = knnPredict(input);
      expect(want.prediction).toBe(predict(points, input.query as [number, number], input.k));
      expect(want.nearest).toEqual(byDistance(points, input.query as [number, number]).slice(0, input.k).map((n) => n.i));
      expect(want.votes).toEqual(vote(points, byDistance(points, input.query as [number, number]), input.k, want.votes.length).votes);
    }
    expect(KNN_TESTS[5].input.points.length).toBe(METRIC_POINTS.length);
    expect(KNN_TESTS[6].input.points.length).toBe(queryData(7).length);
  });

  it('works the lesson’s small example', () => {
    const r = knnPredict(SMALL);
    expect(r.dist).toEqual([5, 2, 2, 5, 4, 8]);
    expect(r.order).toEqual([1, 2, 4, 0, 3, 5]);
    expect(r.votes).toEqual([1, 2]);
    expect(r.prediction).toBe(1);
  });

  it('every slip changes the votes or the answer on the test that names it, and only that slip does', () => {
    for (const [slip, test] of Object.entries(NAMED_ON) as [KnnSlip, number][]) {
      const input = KNN_TESTS[test].input;
      const right = knnPredict(input);
      const wrong = knnPredict(input, slip);
      expect(`${wrong.votes}|${wrong.prediction}`, slip).not.toBe(`${right.votes}|${right.prediction}`);
      if (slip === 'smallest-label') continue;
      const twins = (Object.keys(NAMED_ON) as KnnSlip[]).filter((o) => o !== slip && `${knnPredict(input, o).votes}` === `${wrong.votes}`);
      expect(twins, slip).toEqual([]);
    }
    // The tied vote goes to the nearer member's class, the larger label.
    expect(knnPredict(KNN_TESTS[1].input).votes).toEqual([2, 0, 2]);
    expect([knnPredict(KNN_TESTS[1].input).prediction, knnPredict(KNN_TESTS[1].input, 'smallest-label').prediction]).toEqual([2, 0]);
  });
});

describe('B7’s k-NN exercise explains the usual mistakes', () => {
  it('every solution passes every test', () => {
    const exercise = getExercise(SLUG)!;
    expect(exercise.visualiser).toBe('k-nearest-neighbours');
    exercise.tests.forEach((_, i) => expect(verdict(exercise.solution.javascript, i), `test ${i}`).toMatchObject({ pass: true }));
    exercise.tests.forEach((_, i) => expect(verdict(exercise.solution.typescript, i, 'typescript'), `test ${i} ts`).toMatchObject({ pass: true }));
  });

  it('names the distance slips', () => {
    expect(verdict(getExercise(SLUG)!.starter.javascript).message).toMatch(/dist is still all 0/);
    expect(verdict(swap('    dist[i] = dx * dx + dy * dy;\n', '')).message).toMatch(/dist is still all 0/);
    expect(verdict(swap('dist[i] = dx * dx + dy * dy;', 'dist[i] = Math.abs(dx) + Math.abs(dy);')).message).toMatch(/city-block distance/);
    expect(verdict(swap('dist[i] = dx * dx + dy * dy;', 'dist[i] = dx * dx + dy;')).message).toMatch(/dist\[\d\] should be/);
    // The distance itself, square root and all, is fine too.
    for (let t = 0; t < KNN_TESTS.length; t++) expect(verdict(swap('dist[i] = dx * dx + dy * dy;', 'dist[i] = Math.sqrt(dx * dx + dy * dy);'), t)).toMatchObject({ pass: true });
  });

  it('names the neighbour slips', () => {
    expect(verdict(swap('dist[a] - dist[b]', 'dist[b] - dist[a]'), NAMED_ON.farthest).message).toMatch(/farthest points/);
    expect(verdict(swap('order.slice(0, k)', 'order.slice(0, k + 1)'), NAMED_ON['k-plus-one']).message).toMatch(/one neighbour too many/);
    expect(verdict(swap('order.slice(0, k)', 'order.slice(0, k - 1)'), NAMED_ON['k-minus-one']).message).toMatch(/add up to 2, but 3 neighbours vote/);
    expect(verdict(swap('order.slice(0, k)', 'order.filter((i) => dist[i] !== 0).slice(0, k)'), NAMED_ON['skip-zero']).message).toMatch(/exactly on the query/);
    expect(verdict(swap('const nearest = order.slice(0, k);', 'const nearest = points.map((_, i) => i).slice(0, k);'), NAMED_ON['first-k']).message).toMatch(/first 3 points in the list/);
    expect(verdict(swap('dist[a] - dist[b]', 'dist[a] - dist[b] || b - a'), NAMED_ON['ties-high']).message).toMatch(/took the later one/);
    // k − 1 with k = 1: nobody votes.
    expect(verdict(swap('order.slice(0, k)', 'order.slice(0, k - 1)'), 2).message).toMatch(/add up to 0/);
  });

  it('names the vote slips', () => {
    const smallest = swap('  for (const i of nearest) {\n    if (votes[labels[i]] === best) return labels[i];\n  }\n', '  return votes.indexOf(best);\n');
    expect(verdict(smallest, NAMED_ON['smallest-label']).message).toMatch(/smallest tied label, 0/);
    // Without a tie, the smallest label with the most votes is the right answer.
    expect(verdict(smallest, 0)).toMatchObject({ pass: true });
    expect(verdict(swap('votes[labels[i]] = votes[labels[i]] + 1;', 'votes[labels[i]] = 1;'), 0).message).toMatch(/add up to 2, but 3 neighbours vote, one each/);
    expect(verdict(swap('if (votes[labels[i]] === best) return labels[i];', 'if (votes[labels[i]] === best) return i;'), 0).message).toMatch(/votes are right/);
    expect(verdict(swap('    votes[labels[i]] = votes[labels[i]] + 1;\n', '')).message).toMatch(/votes should count/);
  });

  it('in Python: the same distances to the last bit, the same answers, and the same slips named', () => {
    const exercise = getExercise(SLUG)!;
    exercise.tests.forEach((_, i) => {
      const py = run(exercise.solution.python, i, 'python');
      const js = run(exercise.solution.javascript, i);
      expect(exercise.check(exercise.tests[i].input, py), `test ${i}`).toMatchObject({ pass: true });
      expect(py.returned).toEqual(js.returned);
      expect(arrayOf(py, 'dist')).toEqual(arrayOf(js, 'dist'));
      expect(arrayOf(py, 'votes')).toEqual(arrayOf(js, 'votes'));
    });
    const py = (from: string, to: string, test = 0) => verdict(swap(from, to, 'python'), test, 'python').message;
    expect(verdict(exercise.starter.python, 0, 'python').message).toMatch(/dist is still all 0/);
    expect(py('key=lambda i: dist[i]', 'key=lambda i: -dist[i]', NAMED_ON.farthest)).toMatch(/farthest points/);
    expect(py('dist[i] = dx * dx + dy * dy', 'dist[i] = abs(dx) + abs(dy)')).toMatch(/city-block distance/);
    expect(py('nearest = order[:k]', 'nearest = order[:k + 1]')).toMatch(/one neighbour too many/);
    expect(py('    for i in nearest:\n        if votes[labels[i]] == best:\n            return labels[i]\n', '    return votes.index(best)\n', NAMED_ON['smallest-label'])).toMatch(/smallest tied label/);
  });
});

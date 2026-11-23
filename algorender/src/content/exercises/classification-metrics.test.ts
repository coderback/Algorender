// B7's classification exercises name the usual mistakes: each wrong answer
// below is a slip a learner really makes, and its verdict must say what it
// was. Most run in JavaScript; Python runs the solutions (which must agree
// with JavaScript to the last bit) and some of the slips. A comparison per
// pair can't finish the 1,200-score test inside the step limit, and says so.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { countsAt, pairsOf, scoresFor } from '@/algorithms/ml/roc-curve';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { LONG_MS } from '@/testing/timing';
import { getExercise, testRequest } from '.';
import { AUC_TESTS, aucOf, BIG, CONFUSION_TESTS, confusionOf, FOUR, fromVisualiser, SEVEN, type AucSlip, type ConfusionSlip } from './classification-metrics';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(slug: string, code: string, test = 0, language: Language = 'javascript'): RunResult {
  const exercise = getExercise(slug)!;
  const request = testRequest(exercise, language, code, exercise.tests[test].input);
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

function verdict(slug: string, code: string, test = 0, language: Language = 'javascript') {
  const exercise = getExercise(slug)!;
  return exercise.check(exercise.tests[test].input, run(slug, code, test, language));
}

const swap = (slug: string, from: string, to: string, language: Language = 'javascript') => {
  const code = getExercise(slug)!.solution[language];
  expect(code).toContain(from);
  return code.split(from).join(to);
};

const BIG_TEST = AUC_TESTS.findIndex((t) => t.input === BIG);

describe('the reference maths', () => {
  it('counts the four kinds of answer as the visualiser does, and every slip counts differently', () => {
    for (const seed of [1, 7, 42])
      for (const t of [0, 0.3, 0.5, 0.65, 1]) {
        const c = countsAt(scoresFor(seed), t);
        expect(confusionOf({ ...fromVisualiser(seed), threshold: t })).toEqual([c.tp, c.fp, c.fn, c.tn]);
      }
    expect(confusionOf(SEVEN)).toEqual([3, 2, 1, 1]);
    const slips: ConfusionSlip[] = ['strict', 'swap', 'flip-labels', 'flip-flag', 'wrong-cell'];
    const all = [confusionOf(SEVEN), ...slips.map((s) => confusionOf(SEVEN, s))].map((c) => c.join());
    expect(new Set(all).size).toBe(all.length);
  });

  it('the AUC by sorting is the share of pairs won, and every slip differs', () => {
    for (const { input } of AUC_TESTS) {
      const pos = input.scores.filter((_, i) => input.labels[i] === 1);
      const neg = input.scores.filter((_, i) => input.labels[i] === 0);
      expect(aucOf(input)).toBeCloseTo(pairsOf({ pos, neg }).auc, 12);
    }
    expect(aucOf(FOUR)).toBe(0.875);
    expect(BIG.scores.length).toBe(1200);
    expect(BIG.labels.filter((y) => y === 1).length).toBe(600);
    const slips: AucSlip[] = ['ties-win', 'ties-lose', 'ignore-ties', 'all-pairs', 'squared', 'inverted'];
    const values = [aucOf(BIG), ...slips.map((s) => aucOf(BIG, s))];
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('B7’s classification exercises explain the usual mistakes', () => {
  it('every solution passes every test', { timeout: LONG_MS }, () => {
    for (const slug of ['confusion', 'auc']) {
      const exercise = getExercise(slug)!;
      expect(exercise.visualiser).toBe('roc-curve');
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.javascript, i), `${slug} ${i}`).toMatchObject({ pass: true }));
      exercise.tests.forEach((_, i) => expect(verdict(slug, exercise.solution.typescript, i, 'typescript'), `${slug} ${i} ts`).toMatchObject({ pass: true }));
    }
  });

  it('confusion: ≥, the swapped cells, the labels, the direction, the wrong cell', () => {
    const slug = 'confusion';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).pass).toBe(false);
    expect(verdict(slug, swap(slug, 'scores[i] >= threshold', 'scores[i] > threshold')).message).toMatch(/exactly 0.5, the threshold/);
    expect(verdict(slug, swap(slug, 'counts[1] += 1;', 'counts[9] = 0;').replace('counts[2] += 1;', 'counts[1] += 1;').replace('counts[9] = 0;', 'counts[2] += 1;'), 1).message).toMatch(/false positives and false negatives are swapped/);
    expect(verdict(slug, swap(slug, 'labels[i] === 1', 'labels[i] === 0'), 1).message).toMatch(/labels the wrong way round/);
    expect(verdict(slug, swap(slug, 'scores[i] >= threshold', 'scores[i] < threshold'), 1).message).toMatch(/below the threshold/);
    expect(verdict(slug, swap(slug, 'counts[2] += 1;', 'counts[3] += 1;'), 1).message).toMatch(/every unflagged example as a true negative/);
    expect(verdict(slug, swap(slug, '    } else {\n      counts[3] += 1;\n    }\n', '    }\n'), 1).message).toMatch(/add up to 49, but there are 80/);
    expect(verdict(slug, swap(slug, 'return counts;', 'return [counts[0], counts[1]];')).message).toMatch(/four counts as a list/);
  });

  it('auc: ties, the pairs to divide by, the direction, and a comparison per pair', { timeout: LONG_MS }, () => {
    const slug = 'auc';
    expect(verdict(slug, getExercise(slug)!.starter.javascript).pass).toBe(false);
    expect(verdict(slug, swap(slug, 'wins += pos * (below + neg / 2);', 'wins += pos * (below + neg);')).message).toMatch(/tie as a pair won/);
    expect(verdict(slug, swap(slug, 'wins += pos * (below + neg / 2);', 'wins += pos * below;')).message).toMatch(/tie as no pair won/);
    expect(verdict(slug, swap(slug, 'return wins / (positives * negatives);', 'return wins / (n * (n - 1) / 2);')).message).toMatch(/every pair of examples, 4 × 3 \/ 2/);
    expect(verdict(slug, swap(slug, 'return wins / (positives * negatives);', 'return wins / (n * n);')).message).toMatch(/n × n = 16/);
    expect(verdict(slug, swap(slug, 'return wins / (positives * negatives);', 'return 1 - wins / (positives * negatives);')).message).toMatch(/1 − AUC/);
    // No groups: one label at a time, so a tie goes whichever way the sort put it.
    const oneByOne = swap(
      slug,
      `  while (start < n) {
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
    wins += pos * (below + neg / 2);
    below += neg;
    start = end + 1;
  }`,
      `  for (let k = 0; k < n; k++) {
    if (ranked[k] === 1) wins += below;
    else below += 1;
  }`,
    );
    const nine = AUC_TESTS.findIndex((t) => t.name.startsWith('nine'));
    expect(aucOf(AUC_TESTS[nine].input, 'ignore-ties')).not.toBe(aucOf(AUC_TESTS[nine].input, 'ties-lose'));
    expect(verdict(slug, oneByOne, nine).message).toMatch(/which of some equal scores the sort put first/);
    // Every pair, one by one: right on small tests, out of steps on 1,200 scores.
    const pairs = `function auc(scores, labels) {
  let wins = 0;
  let pairs = 0;
  for (let i = 0; i < scores.length; i++) {
    if (labels[i] !== 1) continue;
    for (let j = 0; j < scores.length; j++) {
      if (labels[j] !== 0) continue;
      pairs += 1;
      if (scores[i] > scores[j]) wins += 1;
      else if (scores[i] === scores[j]) wins += 0.5;
    }
  }
  return wins / pairs;
}
`;
    expect(verdict(slug, pairs, 0)).toMatchObject({ pass: true });
    expect(verdict(slug, pairs, BIG_TEST).message).toMatch(/step limit on 1,200 scores.*600 × 600 = 360,000 pairs/);
  });

  it('in Python: the same numbers to the last bit, the same slips named, and a pair loop out of steps', { timeout: LONG_MS }, () => {
    for (const slug of ['confusion', 'auc']) {
      const exercise = getExercise(slug)!;
      exercise.tests.forEach((_, i) => {
        const py = run(slug, exercise.solution.python, i, 'python');
        expect(exercise.check(exercise.tests[i].input, py), `${slug} ${i}`).toMatchObject({ pass: true });
        expect(py.returned).toEqual(run(slug, exercise.solution.javascript, i).returned);
      });
    }
    const py = (slug: string, from: string, to: string, test = 0) => verdict(slug, swap(slug, from, to, 'python'), test, 'python').message;
    expect(py('confusion', 'scores[i] >= threshold', 'scores[i] > threshold')).toMatch(/exactly 0.5/);
    expect(py('auc', 'wins += pos * (below + neg / 2)', 'wins += pos * (below + neg)')).toMatch(/tie as a pair won/);
    expect(py('auc', 'return wins / (positives * negatives)', 'return 1 - wins / (positives * negatives)')).toMatch(/1 − AUC/);
    const pairs = `def auc(scores, labels):
    wins = 0
    pairs = 0
    for i in range(len(scores)):
        if labels[i] != 1:
            continue
        for j in range(len(scores)):
            if labels[j] != 0:
                continue
            pairs += 1
            if scores[i] > scores[j]:
                wins += 1
            elif scores[i] == scores[j]:
                wins += 0.5
    return wins / pairs
`;
    expect(verdict('auc', pairs, 0, 'python')).toMatchObject({ pass: true });
    expect(verdict('auc', pairs, BIG_TEST, 'python').message).toMatch(/step limit on 1,200 scores/);
  });

  it('the tests cover the edges: a score at the threshold, everything and nothing flagged, ties, and the big one', () => {
    expect(SEVEN.scores.filter((s) => s === SEVEN.threshold).length).toBe(2);
    expect(CONFUSION_TESTS.map((t) => t.input.threshold)).toContain(0);
    expect(CONFUSION_TESTS.map((t) => t.input.threshold)).toContain(1);
    expect(BIG_TEST).toBeGreaterThanOrEqual(0);
  });
});

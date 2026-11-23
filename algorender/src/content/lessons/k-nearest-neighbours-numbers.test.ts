// B7 of the math and ML path, "k-nearest neighbours": every number the lesson
// quotes is measured here from the code that draws it (the
// k-nearest-neighbours visualiser and the knn-predict exercise), and must
// appear in the lesson exactly as written. The embeds are checked too: each
// preset exists with its seed, the prediction challenge asks at least its
// goal, the lesson embeds its one exercise, and it links only lessons it
// builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  byDistance,
  CHART_KS,
  className,
  countClasses,
  dimensionsRun,
  kNearestNeighbours as knn,
  METRIC_POINTS,
  metricVerdict,
  predict,
  queryData,
  regionsRun,
  vote,
  type KnnInput,
} from '@/algorithms/ml/k-nearest-neighbours';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { knnPredict, SMALL } from '@/content/exercises/k-nearest-neighbours';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./k-nearest-neighbours.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string, seed: number) => {
  const ex = knn.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`k-nearest-neighbours has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as KnnInput;
};
const framesOf = (preset: string, seed: number) => traceOf(knn, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use (the rulers story has fixed points and ignores its seed). */
const SEEDS = { query: 3, regions: 3, metric: 1, dimensions: 3 } as const;
const tag = (preset: string) => body.match(new RegExp(`<(Explore|PredictChallenge) slug="k-nearest-neighbours" settings=\\{\\{ preset: '${preset}'[^>]*/>`))![0];

describe('k-nearest-neighbours embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['query', 'regions', 'metric', 'dimensions']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['regions', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('k-nearest-neighbours');
      expect(e.seed).toBe(SEEDS[e.preset as keyof typeof SEEDS]);
      const frames = framesOf(e.preset, e.seed);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['knn-predict']);
    expect(getExercise('knn-predict')?.visualiser).toBe('k-nearest-neighbours');
  });

  it('links only lessons on what it builds on', () => {
    const { concepts } = loadConcepts();
    const before = new Set<string>();
    const walk = (id: string) => {
      for (const p of concepts.find((c) => c.id === id)?.prereqs ?? []) {
        if (!before.has(p)) {
          before.add(p);
          walk(p);
        }
      }
    };
    walk('k-nearest-neighbours');
    const linked = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(new Set(linked)).toEqual(new Set(['supervised-learning', 'norms-distances']));
    for (const target of linked) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the embeds’ answers away before them: lead-ins, captions and example labels', () => {
    // The query widget asks which points are measured, the k = 5 and k = 1 votes, and what k = 40 predicts.
    const toQuery = body.slice(0, body.indexOf(tag('query')) + tag('query').length);
    for (const v of ['every training point', 'all 40', 'predicts C', 'predicts A', 'most training points', 'everywhere']) expect(toQuery, v).not.toContain(v);
    // The challenge asks about training mistakes, jaggedness and test mistakes.
    const toChallenge = body.slice(body.indexOf('Now a harder data set'), body.indexOf('<PredictChallenge'));
    for (const v of ['none', 'no achievement', 'distance 0', 'smooth', 'island', 'fewer', '194', '79', '146', '119', '300', 'worse']) expect(toChallenge.toLowerCase(), v).not.toContain(v);
    // The rulers widget asks who wins under each ruler.
    const toRulers = body.slice(body.indexOf('Which ruler? And in which units?'), body.indexOf(tag('metric')) + tag('metric').length);
    for (const v of ['wins', '1.1 away', '1.33', '1.45', '0.9', 'C at', 'B at', 'A at']) expect(toRulers, v).not.toContain(v);
    // The dimensions widget asks whether nearest ÷ farthest grows and where the distances bunch.
    const toDims = body.slice(body.indexOf('Distances in many dimensions'), body.indexOf(tag('dimensions')) + tag('dimensions').length);
    for (const v of ['bunch', 'grows', 'bigger', 'close to 1', 'about as far', '0.91', '0.77', 'curse']) expect(toDims, v).not.toContain(v);
    for (const ex of knn.input.examples) {
      for (const f of framesOf(ex.id, 1)) {
        const c = f.checkpoint;
        if (!c) continue;
        const said = c.choices[c.answer];
        // A label may name every choice (k = 1 against k = 15), just not the answer alone.
        const names = (t: string) => ex.label.toLowerCase().includes(t.toLowerCase());
        if (said.length > 3) expect(names(said) && c.choices.every((o) => o === said || !names(o)), `${ex.id}: ${said}`).toBe(false);
      }
      for (const v of ['smooth', 'jagged', 'fewer', 'bunch', 'wins', 'perfect', 'every']) expect(ex.label.toLowerCase()).not.toContain(v);
    }
  });

  it('spreads its right answers over the choices', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const answers = [...quiz.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(7);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('k-nearest-neighbours quotes: one query', () => {
  const pts = queryData(SEEDS.query);
  const order = byDistance(pts, [0, 0]);

  it('quotes the data, the vote of the 5 nearest, the nearest alone and every point', () => {
    expect(countClasses(pts, 3)).toEqual([14, 13, 13]);
    expect(body).toContain('Here are 40 training points in three blobs, 14 of class A and 13 each of B and C, and a query point $q$ at $(0, 0)$');
    expect(inputOf('query', SEEDS.query)).toEqual({ story: 'query', q: [0, 0], k: 5, seed: 3 });
    const v5 = vote(pts, order, 5, 3);
    expect([fmt(order[4].d, 2), v5.votes, v5.tied, className(v5.winner)]).toEqual(['1.18', [2, 0, 3], false, 'C']);
    expect(body).toContain('The 5 nearest lie inside a circle of radius 1.18 around $q$, and they vote 3 for C and 2 for A, so k-NN predicts C');
    expect([className(pts[order[0].i].label), fmt(order[0].d, 2)]).toEqual(['A', '1.01']);
    expect(body).toContain('With $k = 1$ only the nearest point votes, an A point 1.01 away, so $k = 1$ predicts A');
    expect(predict(pts, [0, 0], 40)).toBe(0);
    expect(body).toContain('With $k = 40$ every point votes wherever $q$ is, always 14 A, 13 B and 13 C, so the prediction is A everywhere');
    expect(body).toContain('Plain k-NN can\'t know which 5 points are nearest without measuring them all');
    expect(body).toContain('Plain k-NN measures the distance to every training point for every prediction');
    const frames = framesOf('query', SEEDS.query);
    expect(frames[2].note).toContain('Their votes: 3 C, 2 A. C has the most');
    expect(frames[3].note).toContain('class A, 1.01 away');
  });
});

describe('k-nearest-neighbours quotes: k = 1 against k = 15', () => {
  const run = regionsRun(SEEDS.regions);
  const at = (k: number) => run.curve.test[CHART_KS.indexOf(k)];

  it('describes the data', () => {
    expect([run.train.length, run.test.length, countClasses(run.train, 2)]).toEqual([121, 600, [61, 60]]);
    expect(body).toContain('121 training points of two classes in four overlapping clouds, class A top right and bottom left');
    expect(body).toContain('Another 600 points from the same clouds are kept aside as a test set');
  });

  it('quotes the training score and the test mistakes', () => {
    expect(run.trainMistakes.one).toBe(0);
    expect(new Set(run.train.map((p) => `${p.x},${p.y}`)).size).toBe(121);
    expect(body).toContain("$k = 1$'s perfect training score is no achievement");
    expect(body).toContain('as long as no two training points sit at the same spot with different labels');
    expect(body).toContain('The memoriser in learning from examples was exactly this, $k = 1$ on a single feature');
    expect([run.testMistakes.one, run.testMistakes.many]).toEqual([146, 119]);
    expect(body).toContain('146 wrong for $k = 1$ against 119 for $k = 15$');
  });

  it('quotes the curve and explains the overshoot', () => {
    const lowest = Math.min(...run.curve.test);
    expect([lowest, CHART_KS[run.curve.test.indexOf(lowest)]]).toEqual([112, 19]);
    expect(body).toContain('Test mistakes fall, with some wobble, to 112 at $k = 19$, then climb past about $k = 61$');
    // Up to 61 the test mistakes stay within 20 of the lowest (from k = 5); from 63 on they climb far past it.
    for (const k of CHART_KS.filter((k) => k >= 5 && k <= 61)) expect(at(k) - lowest, `k = ${k}`).toBeLessThanOrEqual(20);
    expect(at(63) - lowest).toBeGreaterThan(30);
    // About 30 training points in each quarter of the plane.
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = run.train.filter((p) => Math.sign(p.x) === sx && Math.sign(p.y) === sy).length;
      expect(n).toBeGreaterThanOrEqual(22);
      expect(n).toBeLessThanOrEqual(38);
    }
    const past = run.curve.test.slice(CHART_KS.indexOf(61), -1);
    const worst = Math.max(...past);
    expect([worst, CHART_KS[CHART_KS.indexOf(61) + past.indexOf(worst)]]).toEqual([455, 97]);
    expect(body).toContain('at $k = 97$ the model gets 455 of the 600 wrong, worse than guessing');
    expect([run.testMistakes.all, countClasses(run.train, 2)]).toEqual([300, [61, 60]]);
    expect(body).toContain('every query gets the same vote, 61 A to 60 B, and the model predicts A everywhere: 300 wrong, exactly half');
    expect(run.curve.train[0]).toBe(0);
    const frames = framesOf('regions', SEEDS.regions);
    expect(frames[5].note).toContain('the fewest come at k = 19');
    expect(frames[5].note).toContain('at k = 97, 455 of the 600 test points are wrong');
    expect(frames[5].note).toContain('61 A to 60 B');
  });
});

describe('k-nearest-neighbours quotes: the code', () => {
  it('works the six points by hand', () => {
    expect(SMALL.points).toEqual([[1, 2], [2, 4], [4, 4], [5, 2], [3, 1], [1, 5]]);
    expect(SMALL.labels).toEqual([0, 0, 1, 1, 1, 0]);
    expect([SMALL.query, SMALL.k]).toEqual([[3, 3], 3]);
    expect(body).toContain('1. $(1, 2)$, class 0 2. $(2, 4)$, class 0 3. $(4, 4)$, class 1 4. $(5, 2)$, class 1 5. $(3, 1)$, class 1 6. $(1, 5)$, class 0');
    const r = knnPredict(SMALL);
    expect(r.dist).toEqual([5, 2, 2, 5, 4, 8]);
    expect(body).toContain('For point 1 it is $(1 - 3)^2 + (2 - 3)^2 = 4 + 1 = 5$; for the six points in turn, the squared distances are 5, 2, 2, 5, 4 and 8');
    expect(r.nearest).toEqual([1, 2, 4]);
    expect(body).toContain('The three nearest are points 2 and 3, both at 2, and point 5, at 4');
    expect([r.votes, r.prediction]).toEqual([[1, 2], 1]);
    expect(body).toContain('They vote one for class 0 and two for class 1, so the prediction is class 1');
    // With k = 1, points 2 and 3 tie and the earlier one decides.
    expect(knnPredict({ ...SMALL, k: 1 }).nearest).toEqual([1]);
    expect(body).toContain('points 2 and 3 tie at 2, so with $k = 1$ point 2 would decide');
    expect(getExercise('knn-predict')!.examples[0].input).toBe(SMALL);
  });
});

describe('k-nearest-neighbours quotes: rulers and units', () => {
  it('quotes the three nearest under each ruler', () => {
    expect(METRIC_POINTS.length).toBe(16);
    expect(body).toContain('Below are 16 training points of three classes and a query at $(0, 0)$, with $k = 3$');
    const near = (r: 'L2' | 'L1' | 'Linf' | 'y3') => {
      const v = metricVerdict([0, 0], r);
      return { who: v.order.slice(0, 3).map((n) => `${className(METRIC_POINTS[n.i].label)} (${METRIC_POINTS[n.i].x}, ${METRIC_POINTS[n.i].y}) ${fmt(n.d, 2)}`), wins: className(v.vote.winner) };
    };
    expect(near('L2')).toEqual({ who: ['C (1, 0.45) 1.1', 'A (0.8, 0.9) 1.2', 'C (-0.45, 1.25) 1.33'], wins: 'C' });
    expect(fmt(metricVerdict([0, 0], 'L2').order[3].d, 2)).toBe('1.48');
    expect(body).toContain('Under L2, the 3 nearest are C at $(1, 0.45)$, 1.1 away, A at $(0.8, 0.9)$, 1.2 away, and C at $(-0.45, 1.25)$, 1.33 away: C wins; the next is 1.48 away');
    expect(near('L1')).toEqual({ who: ['C (1, 0.45) 1.45', 'B (1.5, 0) 1.5', 'B (0, -1.5) 1.5'], wins: 'B' });
    expect(body).toContain('Under L1 the C point at $(1, 0.45)$ is 1.45 away, and the two B points on the axes, $(1.5, 0)$ and $(0, -1.5)$, are 1.5: B wins');
    expect(near('Linf')).toEqual({ who: ['A (0.8, 0.9) 0.9', 'C (1, 0.45) 1', 'A (-1.05, -1.05) 1.05'], wins: 'A' });
    expect(body).toContain('the A points on the diagonals are nearest, $(0.8, 0.9)$ at 0.9 and $(-1.05, -1.05)$ at 1.05, with the C point at $(1, 0.45)$ at 1 between them: A wins');
    expect(near('y3')).toEqual({ who: ['B (1.5, 0) 1.5', 'C (1, 0.45) 1.68', 'B (-1.9, 0.1) 1.92'], wins: 'B' });
    expect(body).toContain('the 3 nearest are B at 1.5, C at 1.68 and B at $(-1.9, 0.1)$, 1.92 away, so B wins');
    expect(body).toContain('counting $y$ three times over turned an L2 prediction of C into B');
    // The scaling advice matches the visualiser's.
    expect(body).toContain('subtract its smallest value and divide by its range, largest minus smallest, so every feature runs from 0 to 1');
    expect(framesOf('metric', SEEDS.metric)[5].note).toContain("subtracting each feature's smallest value and dividing by its range");
  });
});

describe('k-nearest-neighbours quotes: many dimensions', () => {
  it('quotes the nearest and farthest in 2, 10, 100 and 1000 dimensions', () => {
    const [two, ten, hundred, thousand] = dimensionsRun(SEEDS.dimensions);
    expect([fmt(two.near, 3), fmt(two.far, 3), fmt(two.ratio, 2)]).toEqual(['0.036', '0.898', '0.04']);
    expect(body).toContain('In 2 dimensions the nearest point is 0.036 from $q$ and the farthest 0.898: nearest ÷ farthest is 0.04');
    expect([fmt(ten.near, 3), fmt(ten.far, 3), fmt(ten.ratio, 2)]).toEqual(['0.572', '1.798', '0.32']);
    expect(body).toContain('In 10 dimensions the nearest is 0.572 away and the farthest 1.798, a ratio of 0.32');
    expect(fmt(hundred.ratio, 2)).toBe('0.77');
    expect([fmt(thousand.near, 3), fmt(thousand.far, 3), fmt(thousand.ratio, 2)]).toEqual(['12.41', '13.68', '0.91']);
    expect(body).toContain('In 100 dimensions it is 0.77, and in 1000 dimensions, with the nearest 12.41 away and the farthest 13.68, it is 0.91');
    expect(body).toContain('as nearest ÷ farthest rose from 0.04 in 2 dimensions to 0.91 in 1000');
    expect(28 * 28).toBe(784);
    expect(body).toContain('an image of 28 × 28 pixels has 784');
    const frames = framesOf('dimensions', SEEDS.dimensions);
    expect(frames[0].note).toContain('nearest ÷ farthest is 0.04');
  });
});

describe('k-nearest-neighbours: quiz and probes', () => {
  it('checks the quiz', () => {
    // P is 3 to the right, Q 2 right and 2 up: L1 3 against 4, L2 3 against √8.
    expect([3 + 0, 2 + 2, fmt(Math.sqrt(8), 2)]).toEqual([3, 4, '2.83']);
    expect(body).toContain('choices: [\'7\', \'10,000\', \'1\', \'70,000\']');
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(where);
    for (const n of ['5,000', '31%', '12%', '22%', '250', '160', '90', '75', '400', '14%', '27%', '1,000 to 4,000', 'kilograms', '500 columns', '0.97']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    const lessonText = text.slice(0, text.indexOf('<Quiz'));
    for (const n of ['10,000', '70,000', '50,000', '100,000', '1.5 to 2.0', '4 of class X']) expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
  });
});

describe('k-nearest-neighbours: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('k-nearest-neighbours', source);
    expect(mistakes.map((m) => m.id)).toEqual(['k-one-is-perfect', 'bigger-k-always-better', 'units-dont-matter', 'more-features-help']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('k-nearest-neighbours', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(7);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('k-nearest-neighbours', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'do', 'see', 'see', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3200);
    expect(total).toBeLessThanOrEqual(3900);
    expect(source).not.toContain('—');
  });
});

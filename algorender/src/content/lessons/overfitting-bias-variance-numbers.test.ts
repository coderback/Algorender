// B7 of the math and ML path, "Overfitting, validation and bias–variance":
// every number the lesson quotes is measured here from the code that draws it
// (the overfitting visualiser and its exercises), and must appear in the
// lesson exactly as written. The embeds are checked too: each preset exists
// (with its seed where it takes one), the prediction challenge asks at least
// its goal, the lesson embeds its one exercise and links the other, and it
// links only lessons it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  argmin,
  BEST,
  BV_BEST,
  cvErrors,
  err,
  exactSpread,
  fitPoly,
  foldRound,
  HIGH,
  isU,
  kFold,
  LOW,
  N_POOL,
  NOISE,
  overfitting,
  polyFeatures,
  POOL,
  resample,
  SETS,
  spreadOf,
  TEST,
  TEST_ERR,
  totalOf,
  TRAIN,
  TRAIN_ERR,
  TRAIN_X,
  TRUE_CURVE,
  trueError,
  FITS,
  VALID,
  VALID_ERR,
  type OverfitInput,
} from '@/algorithms/ml/overfitting';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { featureRows, FEATURE_TESTS } from '@/content/exercises/overfitting';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./overfitting-bias-variance.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string, seed: number) => {
  const ex = overfitting.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`overfitting has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as OverfitInput;
};
const framesOf = (preset: string, seed = 0) => traceOf(overfitting, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use; the presets without one ignore it. */
const SEEDS: Record<string, number | null> = { degree: null, 'bias-variance': 7, 'k-fold': null };

describe('overfitting-bias-variance embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, seed: (\d+))? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['degree', 'bias-variance', 'k-fold']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['degree', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('overfitting');
      expect(e.seed).toBe(SEEDS[e.preset]);
      const frames = framesOf(e.preset, e.seed ?? 0);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
      // A preset without a seed plays the same from any seed.
      if (e.seed === null) expect(JSON.stringify(framesOf(e.preset, 1))).toBe(JSON.stringify(framesOf(e.preset, 2)));
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['k-fold']);
    expect(getExercise('k-fold')?.visualiser).toBe('overfitting');
    expect(source).toContain('[the powers of x](/code/poly-features)');
    expect(getExercise('poly-features')?.visualiser).toBe('overfitting');
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
    walk('overfitting-bias-variance');
    const linked = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(linked.length).toBeGreaterThanOrEqual(4);
    for (const target of linked) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(0, body.indexOf('<PredictChallenge'));
    for (const v of ['0.0546', '0.606', '0.0308', ' U', 'at least as well', 'never rises', 'degree 3 has', 'flatter', 'threads through', 'exactly 0', 'lowest at']) expect(before, v).not.toContain(v);
    expect(before).not.toMatch(/training error (falls|can only|never)/i);
  });

  it('gives none of the other embeds’ answers away: captions, lead-ins and example labels', () => {
    const tag = (preset: string) => body.match(new RegExp(`<Explore slug="overfitting" settings=\\{\\{ preset: '${preset}'[^>]*/>`))![0];
    const bias = body.slice(body.indexOf('Bias and variance: twenty training sets'), body.indexOf(tag('bias-variance')));
    for (const v of ['cancel', 'bunch', 'misses', 'fan out', 'closer', 'degree 3']) {
      expect(bias, v).not.toContain(v);
      expect(tag('bias-variance'), v).not.toContain(v);
    }
    const kfold = body.slice(body.indexOf('k-fold cross-validation, in the widget'), body.indexOf(tag('k-fold')));
    for (const v of ['16', 'once', '50', 'all 20', 'refit', 'degree 3']) {
      expect(kfold, v).not.toContain(v);
      expect(tag('k-fold'), v).not.toContain(v);
    }
    for (const ex of overfitting.input.examples) {
      for (const f of framesOf(ex.id, 1)) {
        const c = f.checkpoint;
        if (!c) continue;
        const said = c.choices[c.answer];
        if (said.length > 3) expect(ex.label.toLowerCase(), `${ex.id}: ${said}`).not.toContain(said.toLowerCase());
      }
      for (const v of ['lower', 'higher', 'u-shape', 'cancel', 'once', 'degree 3']) expect(ex.label.toLowerCase()).not.toContain(v);
    }
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(16);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('overfitting-bias-variance quotes: the data and the features', () => {
  it('describes the data as the code makes them', () => {
    expect(TRUE_CURVE).toBe('y = sin(2.5x) + 0.6x² − 0.3');
    expect(body).toContain('y = \\sin(2.5x) + 0.6x^2 - 0.3');
    expect([TRAIN.length, VALID.length, TEST.length, N_POOL]).toEqual([10, 40, 40, 20]);
    expect(TRAIN_X[0]).toBe(-1);
    expect(TRAIN_X[9]).toBe(1);
    expect(body).toContain('The training set is 10 points whose $x$ values are evenly spread from $-1$ to $1$. The validation set is 40 more points');
    expect(body).toContain('40 for validation and 40 for testing, each four times the training set');
    expect([fmt(NOISE, 1), fmt(NOISE * NOISE, 2)]).toEqual(['0.2', '0.04']);
    expect(body).toContain('typically about 0.2 up or down, and its average square is 0.04');
  });

  it('works the features of x = −0.5', () => {
    expect(polyFeatures([-0.5], 3)[0]).toEqual([1, -0.5, 0.25, -0.125]);
    expect(featureRows(FEATURE_TESTS[0].input)[1]).toEqual([1, -0.5, 0.25, -0.125]);
    expect(body).toContain('For $x = -0.5$ the row is $[1, -0.5, 0.25, -0.125]$');
  });
});

describe('overfitting-bias-variance quotes: training against validation error', () => {
  it('quotes the errors degree by degree', () => {
    expect([err(TRAIN_ERR[1]), err(TRAIN_ERR[3])]).toEqual(['0.23', '0.0546']);
    expect(body).toContain("The line's training error is 0.23 and degree 3's is 0.0546");
    expect(TRAIN_ERR.map(err).join(', ')).toBe('0.676, 0.23, 0.156, 0.0546, 0.0497, 0.0452, 0.0322, 0.00544, 0.00542, 0');
    expect(body).toContain('For degrees 0 to 9 it is 0.676, 0.23, 0.156, 0.0546, 0.0497, 0.0452, 0.0322, 0.00544, 0.00542 and 0');
    expect(TRAIN_ERR[9]).toBeLessThan(1e-20);
    expect(VALID_ERR.map(err).join(', ')).toBe('0.743, 0.156, 0.118, 0.0308, 0.0354, 0.041, 0.0718, 0.134, 0.137, 0.606');
    expect(body).toContain('The validation error tells another story: 0.743, 0.156, 0.118, 0.0308, 0.0354, 0.041, 0.0718, 0.134, 0.137 and 0.606');
    expect(isU(VALID_ERR)).toBe(true);
    expect(BEST).toBe(3);
    expect(Math.round(VALID_ERR[9] / VALID_ERR[3])).toBe(20);
    expect(body).toContain("degree 9's 0.606 is about 20 times degree 3's 0.0308");
    // The challenge's frames say the same.
    const frames = framesOf('degree');
    expect(frames[1].note).toContain('training error 0.0546');
    expect(frames[3].note).toContain('about 20 times');
  });

  it('quotes the test set', () => {
    expect(err(TEST_ERR)).toBe('0.0421');
    expect(TEST_ERR).toBeGreaterThan(VALID_ERR[BEST]);
    expect(body).toContain('degree 3 scores 0.0421 there, worse than its winning score');
    expect(err(trueError(FITS[3]))).toBe('0.0439');
    for (let d = 1; d <= 5; d++) expect(VALID_ERR[d], `degree ${d}`).toBeLessThan(trueError(FITS[d]));
    expect(VALID_ERR[6]).toBeGreaterThan(trueError(FITS[6]));
    expect(TEST_ERR).toBeLessThan(trueError(FITS[3]));
    // Degree 3 is truly the best, so the validation points didn't pick the wrong degree.
    expect(FITS.map(trueError).indexOf(Math.min(...FITS.map(trueError)))).toBe(3);
    expect(body).toContain("degree 3's average error on new points is 0.0439, and degrees 1 to 5 all score below their true errors on these 40 validation points");
    expect(body).not.toContain('That is no accident');
    expect(framesOf('degree')[6].note).toContain('scores 0.0421');
    expect(framesOf('degree')[6].note).toContain('its average error on new points is 0.0439');
    expect(framesOf('degree')[6].note).not.toMatch(/flatters it./);
  });
});

describe('overfitting-bias-variance quotes: bias and variance', () => {
  const sets = resample(SEEDS['bias-variance']!);
  const low = spreadOf(sets.map((ys) => fitPoly(TRAIN_X, ys, LOW)));
  const high = spreadOf(sets.map((ys) => fitPoly(TRAIN_X, ys, HIGH)));

  it('quotes the twenty training sets from seed 7', () => {
    expect([SETS, LOW, HIGH]).toEqual([20, 1, 9]);
    expect([fmt(low.bias2, 3), fmt(low.variance, 3), fmt(high.variance, 3), fmt(high.bias2, 3)]).toEqual(['0.131', '0.006', '0.178', '0.005']);
    expect(body).toContain('That is the **bias²** (bias squared), here 0.131 for the lines');
    expect(body).toContain('That is the **variance**, 0.006 for the lines');
    expect(body).toContain("at each $x$, average the twenty fits' squared distances from their average, then average that over $x$");
    expect(body).toContain('widest near the ends: variance 0.178');
    expect(body).toContain('averaged they nearly cancel: bias² 0.005');
    const frames = framesOf('bias-variance', 7);
    expect(frames[1].note).toContain('here 0.131');
    expect(frames[2].note).toContain('Their variance is 0.178');
  });

  it('quotes the exact trade-off', () => {
    expect(fmt(NOISE * NOISE, 2)).toBe('0.04');
    expect(body).toContain('averaged over every training set the model might have been fitted to and over every new point. The last term, here 0.04');
    expect(BV_BEST).toBe(3);
    expect([fmt(exactSpread(3).bias2, 4), fmt(exactSpread(3).variance, 4), fmt(totalOf(3), 4)]).toEqual(['0.0009', '0.0135', '0.0144']);
    expect(body).toContain('Their sum is smallest at degree 3: bias² 0.0009 plus variance 0.0135 makes 0.0144');
    expect(fmt(totalOf(3) + NOISE * NOISE, 4)).toBe('0.0544');
    expect(body).toContain("Add the noise's 0.04 and degree 3 should average about 0.0544 on new points");
    expect(fmt(exactSpread(9).variance, 3)).toBe('0.246');
    expect(body).toContain("while degree 9's variance alone is 0.246");
    expect(body).toContain('0.0308 for degree 3 and 0.606 for degree 9');
  });
});

describe('overfitting-bias-variance quotes: k-fold cross-validation', () => {
  it('quotes the five folds of 20 points', () => {
    const folds = kFold(N_POOL, 5);
    expect(folds.map((f) => f.length)).toEqual([4, 4, 4, 4, 4]);
    expect(body).toContain('cut into 5 folds of 4 consecutive points. Model 1 is fitted to the 16 points outside fold 1');
    const first = foldRound(5, 0, 3);
    expect(first.train.length).toBe(16);
    expect(err(first.errors.reduce((s, e) => s + e, 0) / 4)).toBe('0.0807');
    expect(body).toContain('at degree 3 its MSE there is 0.0807');
    const cv = cvErrors(5);
    expect(err(cv[3])).toBe('0.035');
    expect(body).toContain('the **cross-validated error**, 0.035 for degree 3');
    expect(isU(cv)).toBe(true);
    expect(cv.indexOf(Math.min(...cv))).toBe(3);
    expect(body).toContain('Doing that for every degree from 0 to 9 takes 50 fitted curves, 5 for each degree. The cross-validated errors make the same U as before, lowest at degree 3');
    expect(body).toContain('the final model is degree 3 fitted to all 20 points');
    // The score is noisy with 20 points: other k pick other degrees.
    const ten = cvErrors(10);
    expect([argmin(ten), argmin(cvErrors(2))]).toEqual([8, 4]);
    expect(isU(ten)).toBe(false);
    expect(ten[7]).toBeGreaterThan(2 * ten[8]);
    expect(ten[9]).toBeGreaterThan(2 * ten[8]);
    expect(body).toContain("Type k-fold 10 into the widget's input and the lowest score is degree 8's, an isolated dip between much worse neighbours; k-fold 2 picks degree 4");
    const tenFrames = traceOf(overfitting, { story: 'k-fold', k: 10 }).frames;
    expect(tenFrames[3].note).toContain('lucky dip');
    expect(tenFrames[4].note).toContain('safer choice');
    expect(POOL.length).toBe(20);
    const frames = framesOf('k-fold');
    expect(frames[1].note).toContain('mean squared error 0.0807');
    expect(frames[2].note).toContain('0.035');
    expect(frames[3].note).toContain('The same U as before');
  });

  it('quotes the exercise’s example', () => {
    expect(kFold(10, 4)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7], [8, 9]]);
    expect(body).toContain('With 10 points in 4 folds that is sizes 3, 3, 2 and 2: $[0, 1, 2]$, $[3, 4, 5]$, $[6, 7]$ and $[8, 9]$');
    expect(getExercise('k-fold')!.examples[0].input).toEqual({ n: 10, k: 4 });
  });
});

describe('overfitting-bias-variance: quiz and probes', () => {
  it('checks the quiz', () => {
    expect([200 / 5, 200 - 200 / 5]).toEqual([40, 160]);
    expect(kFold(100, 8).map((f) => f.length)).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);
    expect([Math.floor(100 / 8), 100 % 8]).toEqual([12, 4]);
    // Q3: the lowest of 0.9, 0.4, 0.15, 0.17, 0.3, 0.8 is degree 2's.
    expect([0.9, 0.4, 0.15, 0.17, 0.3, 0.8].indexOf(0.15)).toBe(2);
    // Q1: only degree 3's 0.25 rises above the degree before it.
    const reported = [0.3, 0.22, 0.25, 0.1, 0.08];
    expect(reported.map((v, i) => i > 0 && v > reported[i - 1])).toEqual([false, false, true, false, false]);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const probe = [0.42, 0.19, 0.12, 0.14, 0.26, 0.39];
    expect(probe.indexOf(Math.min(...probe)) + 1).toBe(3);
    expect(10 * 4).toBe(40);
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(where);
    for (const n of ['0.42', '0.19', '0.12', '0.14', '0.26', '0.39', '30 settings', '10-fold', '4 settings']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
  });
});

describe('overfitting-bias-variance: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('overfitting-bias-variance', source);
    expect(mistakes.map((m) => m.id)).toEqual(['more-flexible-better', 'choose-on-test', 'more-data-shrinks-bias', 'kfold-one-model']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('overfitting-bias-variance', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(8);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('overfitting-bias-variance', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'see', 'do', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3000);
    // Raised from 4,000 for the review's additions (bias vs the weight b, the test set's luck, CV noise, more data and bias).
    expect(total).toBeLessThanOrEqual(4200);
    expect(source).not.toContain('—');
  });
});

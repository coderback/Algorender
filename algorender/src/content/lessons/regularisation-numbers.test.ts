// B7 of the math and ML path, "Regularisation: ridge, lasso and priors": every
// number the lesson quotes is measured here from the code that draws it (the
// regularisation visualiser and the ridge exercise), and must appear in the
// lesson exactly as written. The embeds are checked too: each preset exists,
// the prediction challenge asks at least its goal, the lesson embeds its one
// exercise, links only lessons it builds on, and gives no widget's answers
// away before it.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  A2,
  B2,
  biggest,
  CURVE_FITS,
  curvePenalty,
  DEGREE,
  LASSO_ALL_ZERO,
  LASSO_W2_ZERO,
  lassoWeights,
  LEAST_SQUARES,
  l2,
  meanOf,
  nearestOnCircle,
  powers,
  shareOf,
  regularisation,
  ridgeWeights,
  S_MIN,
  TRAIN,
  trainingError,
  VALIDATION,
  X2,
  type RegInput,
} from '@/algorithms/ml/regularisation';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { ridgeMatrix, ridgeOf, RIDGE_TESTS, TWINS } from '@/content/exercises/regularisation';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./regularisation.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
/** fmt with an ASCII minus, as the lesson writes numbers inside math. */
const tex = (v: number, digits = 2) => fmt(v, digits).replace('−', '-');
const texVec = (v: readonly number[]) => `(${tex(v[0])}, ${tex(v[1])})`;

const inputOf = (preset: string) => {
  const ex = regularisation.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`regularisation has no example ${preset}`);
  return ex.make({ seed: 1, size: 0 }) as RegInput;
};
const framesOf = (preset: string) => traceOf(regularisation, inputOf(preset)).frames;
const fit = (lam: number) => CURVE_FITS.find((f) => f.lam === lam)!;
const E3 = (v: number) => fmt(v, 3);

describe('regularisation embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, seed: (\d+))?(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['curve', 'ridge', 'lasso']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['lasso', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('regularisation');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links M1’s solve', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['ridge-regression']);
    expect(getExercise('ridge-regression')?.visualiser).toBe('regularisation');
    expect(source).toContain('[solve Ax = b](/code/solve-system)');
    expect(getExercise('solve-system')).toBeDefined();
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
    walk('regularisation');
    const linked = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(linked).toEqual(['overfitting-bias-variance', 'norms-distances', 'contour-maps', 'linear-regression', 'dot-product']);
    for (const target of linked) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of a widget’s answers away before it', () => {
    const at = (s: string) => body.indexOf(s);
    const curveLead = body.slice(0, at("preset: 'curve'"));
    for (const v of ['a lot', 'rises', 'rose', 'goes up', 'flat', 'mean of the', 'U', '0.288', '0.089', '0.299', '0.605']) expect(curveLead, v).not.toMatch(new RegExp(`(?<![\\w.])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`));
    const ridgeLead = body.slice(at('Two weights: a bowl and a circle'), at("preset: 'ridge'"));
    for (const v of ['touch', 'diamond', 'never', 'nearest', 'share', 'lean', 'straight line', '14.15', '(1.6, 1.2)']) expect(ridgeLead, v).not.toContain(v);
    const beforeChallenge = body.slice(0, at('<PredictChallenge'));
    for (const v of ['diamond', 'corner', 'exactly 0', 'exactly to 0', '86.18', '156', '(0.44, 0)', '0.99', 'Laplace', 'selects']) expect(beforeChallenge, v).not.toContain(v);
    // The lasso lead-in asks which weight falls further without saying.
    const lassoLead = body.slice(at('Your turn: lasso'), at('<PredictChallenge'));
    for (const v of ['w_2$ falls', 'w_2$ has fallen', 'faster', 'hardest']) expect(lassoLead, v).not.toContain(v);
    // The Terms name lasso's charge without its shape.
    expect(body.slice(at('<Terms>'), at('</Terms>'))).not.toMatch(/diamond|corner|exactly/);
  });

  it('spreads its right answers over the choices', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const answers = [...quiz.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(7);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('regularisation quotes: the curve', () => {
  const f0 = fit(0);

  it('quotes the least-squares curve', () => {
    expect([DEGREE + 1, TRAIN.length, VALIDATION.length]).toEqual([10, 10, 9]);
    expect(body).toContain('Here is that failure again, on ten new points. A curve of degree 9, $\\hat{y} = w_0 + w_1 x + w_2 x^2 + \\cdots + w_9 x^9$, has 10 weights, and least squares fits it to 10 noisy points');
    expect(E3(f0.train)).toBe('0');
    expect(E3(f0.validation)).toBe('4.446');
    expect(body).toContain('so its training error is 0. Between the points it swings wildly, and on 9 validation points, kept out of the fit, its mean squared error is 4.446');
    const big = biggest(f0.w);
    expect([big.j, fmt(f0.w[big.j], 0)]).toEqual([7, '−1338']);
    expect(body).toContain('The biggest, $w_7$, is $-1338$');
    // The labels stay between about −1.5 and 1.5, yet the terms reach the hundreds at the training points.
    for (const d of [...TRAIN, ...VALIDATION]) expect(Math.abs(d.y)).toBeLessThan(1.5);
    const terms = TRAIN.flatMap((d) => powers(d.x).map((p, j) => Math.abs(p * f0.w[j])));
    expect(Math.max(...terms)).toBeGreaterThan(100);
    expect(Math.max(...terms)).toBeLessThan(1000);
    expect(body).toContain('The labels stay between about $-1.5$ and $1.5$, yet the curve is built from terms in the hundreds that almost cancel: the signature of a model bending itself around noise');
  });

  it('quotes the sweep of λ', () => {
    expect(Math.round(curvePenalty(f0.w) / 1e6)).toBe(3);
    expect(body).toContain('The squares of the weights at $\\lambda = 0$ add up to about 3 million');
    const tiny = fit(1e-6);
    expect([fmt(biggest(tiny.w).size, 0), E3(tiny.validation), E3(tiny.train)]).toEqual(['191', '0.288', '0.036']);
    expect(body).toContain('so even $\\lambda = 0.000001$ makes a charge the fit notices: the biggest weight drops from 1338 to 191, and the validation MSE falls from 4.446 to 0.288, while the training MSE rises from 0 to 0.036');
    expect(body).toContain('the training MSE over 10 points and the validation MSE over 9');
    const best = fit(0.01);
    expect(CURVE_FITS.every((f) => f.validation >= best.validation)).toBe(true);
    expect([E3(best.train), E3(best.validation)]).toEqual(['0.067', '0.089']);
    expect(body).toContain('At $\\lambda = 0.01$ the curve is a gentle wave, with training MSE 0.067 and validation MSE 0.089, the lowest of any $\\lambda$ here');
    expect(E3(fit(1).validation)).toBe('0.299');
    expect(body).toContain('at $\\lambda = 1$ the validation MSE is back up to 0.299');
    const top = fit(100);
    expect([tex(top.w[0], 3), tex(meanOf(TRAIN), 3), E3(top.validation), E3(top.train)]).toEqual(['-0.186', '-0.186', '0.605', '0.469']);
    expect(biggest(top.w).size).toBeLessThan(0.03);
    expect(body).toContain('leaving a flat line at $-0.186$, the mean of the training labels, with validation MSE 0.605: underfitting');
    expect(body).toContain('Over the sweep the training MSE only ever rises, from 0 to 0.469');
    for (let k = 1; k < CURVE_FITS.length; k++) expect(CURVE_FITS[k].train).toBeGreaterThan(CURVE_FITS[k - 1].train);
    // The misconceptions' corrections quote the same numbers.
    expect(body).toContain('here the training MSE rose from 0 to 0.067 while the validation MSE fell from 4.446 to 0.089');
    expect(body).toContain('here the validation MSE climbed from 0.089 at $\\lambda = 0.01$ to 0.605 at $\\lambda = 100$');
    expect(body).toContain('so the huge-$\\lambda$ fit was a flat line at the mean, $-0.186$, not at 0');
    // The visualiser's frames say the same.
    const frames = framesOf('curve');
    expect(frames[2].note).toContain('the validation error falls from 4.446 to 0.288');
    expect(frames[5].note).toContain('settles at −0.186');
  });
});

describe('regularisation quotes: two weights', () => {
  it('quotes the bowl and ridge', () => {
    expect(X2.length).toBe(8);
    expect([fmtVec(LEAST_SQUARES), fmt(S_MIN)]).toEqual(['(1.64, 1.21)', '1.92']);
    expect(body).toContain('fitted to 8 points whose two features rise and fall together');
    expect(body).toContain('Its lowest point, the least-squares weights, is $\\hat{w} = (1.64, 1.21)$, where $S = 1.92$');
    const w1 = ridgeWeights(1);
    expect([fmt(w1[0], 9), fmt(w1[1], 9), fmt(trainingError(w1), 9), fmt(w1[0] ** 2 + w1[1] ** 2, 9), fmt(l2(w1), 9)]).toEqual(['1.6', '1.2', '2', '4', '2']);
    expect(body).toContain('At $\\lambda = 1$ ridge\'s weights are exactly $(1.6, 1.2)$: $S$ there is 2, a little above 1.92, and the charge is $1 \\times (1.6^2 + 1.2^2) = 4$, the same all round the circle of radius 2');
    const w16 = ridgeWeights(16);
    const near = nearestOnCircle(l2(w16));
    expect([fmtVec(w16), fmt(trainingError(w16)), fmt(l2(w16)), fmtVec(near), fmt(trainingError(near))]).toEqual(['(1.2, 0.97)', '14.15', '1.54', '(1.24, 0.92)', '14.26']);
    expect(body).toContain('At $\\lambda = 16$ the weights are $(1.2, 0.97)$, on a circle of radius 1.54 touched by the contour $S = 14.15$');
    expect([fmt(shareOf(w16)), fmt(shareOf(LEAST_SQUARES))]).toEqual(['0.81', '0.74']);
    expect(body).toContain('$w_2/w_1$ is 0.81 against 0.74 at $\\hat{w}$, and the circle\'s point on that line, $(1.24, 0.92)$, has $S = 14.26$');
    expect(fmtVec(ridgeWeights(256))).toBe('(0.26, 0.22)');
    expect(body).toContain('As $\\lambda$ doubles up to 256 both weights shrink, to $(0.26, 0.22)$, but neither reaches 0');
    expect(body).toContain('at $\\lambda = 256$ its weights were still $(0.26, 0.22)$, while lasso\'s were both 0 from $\\lambda = 156$');
  });

  it('quotes lasso', () => {
    const w16 = lassoWeights(16);
    expect([fmtVec(w16), fmt(trainingError(w16))]).toEqual(['(1.54, 0.99)', '4.54']);
    expect([fmt(LEAST_SQUARES[1]), fmt(LEAST_SQUARES[0])]).toEqual(['1.21', '1.64']);
    expect(LEAST_SQUARES[1] - w16[1]).toBeGreaterThan(LEAST_SQUARES[0] - w16[0]);
    expect(body).toContain('By $\\lambda = 16$, $w_2$ has fallen from 1.21 to 0.99 while $w_1$ only went from 1.64 to 1.54: lasso\'s weights are $(1.54, 0.99)$, and the contour $S = 4.54$ touches the diamond on a flat side');
    expect([fmt(LASSO_W2_ZERO), fmtVec(lassoWeights(128)), fmt(LASSO_ALL_ZERO)]).toEqual(['86.18', '(0.44, 0)', '156']);
    expect(lassoWeights(128)[1]).toBe(0);
    expect(body).toContain('At $\\lambda = 86.18$, $w_2$ becomes **exactly** 0 and stays there: at $\\lambda = 128$ the weights are $(0.44, 0)$');
    expect(body).toContain('Then $w_1$ falls steadily, by the same amount for each unit of $\\lambda$, and becomes exactly 0 too, at $\\lambda = 156$; beyond that both weights are 0');
    // Between the two corners w₁ = (b₁ − λ/2)/a: the same fall for each unit of λ.
    for (const lam of [90, 100, 120, 150]) expect(lassoWeights(lam)[0]).toBeCloseTo((B2[0] - lam / 2) / A2[0][0], 12);
    expect(lassoWeights(200)).toEqual([0, 0]);
    // The challenge's frames agree.
    const frames = framesOf('lasso');
    expect(frames[3].note).toContain('at λ = 86.18');
    expect(frames[4].note).toContain('at λ = 156');
  });

  it('quotes the equations and the exercise', () => {
    expect([A2, B2]).toEqual([[[32, 21], [21, 26]], [78, 66]]);
    expect(body).toContain('$X^\\top X$ has rows $(32, 21)$ and $(21, 26)$, and $X^\\top y = (78, 66)$');
    expect(ridgeMatrix(RIDGE_TESTS[0].input)).toEqual([[48, 21], [21, 42]]);
    expect(RIDGE_TESTS[0].input.lam).toBe(16);
    expect(body).toContain('48\\,w_1 + 21\\,w_2 &= 78');
    expect(body).toContain('21\\,w_1 + 42\\,w_2 &= 66');
    expect(fmtVec(ridgeOf(RIDGE_TESTS[0].input) as [number, number])).toBe('(1.2, 0.97)');
    expect(body).toContain('whose answer is $(1.2, 0.97)$, the weights the widget showed');
    expect(getExercise('ridge-regression')!.examples[0].input).toBe(RIDGE_TESTS[0].input);
    // The twins: XᵀX is all 10s, λ = 1 makes the diagonal 11, and each weight is 13/21.
    expect(ridgeMatrix({ X: TWINS.X, lam: 0 })).toEqual([[10, 10], [10, 10]]);
    expect(ridgeMatrix(TWINS)).toEqual([[11, 10], [10, 11]]);
    expect(TWINS.lam).toBe(1);
    expect(ridgeOf(TWINS).map((v) => fmt(v, 2))).toEqual(['0.62', '0.62']);
    expect(ridgeOf(TWINS)[0]).toBeCloseTo(13 / 21, 12);
    expect(body).toContain('$X^\\top X$ has rows $(10, 10)$ and $(10, 10)$');
    expect(body).toContain('With $\\lambda = 1$ the diagonal becomes 11, and ridge splits the weight equally, $13/21 \\approx 0.62$ each');
    expect(getExercise('ridge-regression')!.tests.some((t) => t.input === TWINS)).toBe(true);
    // The 2s cancel: the slope of λ(w₁² + w₂²) along w₁ is 2λw₁.
    expect(texVec(ridgeOf(RIDGE_TESTS[0].input))).toBe('(1.2, 0.97)');
  });
});

describe('regularisation: quiz and probes', () => {
  it('checks the quiz', () => {
    expect(2 * (3 ** 2 + 4 ** 2)).toBe(50);
    expect([3 + 4, Math.hypot(3, 4)]).toEqual([7, 5]);
    expect([10 + 2, 5 + 2]).toEqual([12, 7]);
    // Centimetres for metres: values 100 times bigger, a weight 100 times smaller, its square 10,000 times smaller.
    expect(100 ** 2).toBe(10000);
    expect(body).toContain('centimetres instead of metres and its weight shrinks a hundred times, its charge ten thousand times');
    expect(body).toContain('12w₁ + 2w₂ = 12 and 2w₁ + 7w₂ = 7');
    // The slips among the choices: λ on every entry, λ added to Xᵀy, λ subtracted.
    expect(body).toContain('12w₁ + 4w₂ = 12 and 4w₁ + 7w₂ = 7');
    expect(body).toContain('10w₁ + 2w₂ = 14 and 2w₁ + 5w₂ = 9');
    expect(body).toContain('8w₁ + 2w₂ = 12 and 2w₁ + 3w₂ = 7');
    const vals = [0.52, 0.31, 0.27, 0.4];
    expect(vals.indexOf(Math.min(...vals))).toBe(2);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(where);
    const scores = [0.42, 0.25, 0.61];
    expect(scores.indexOf(Math.min(...scores))).toBe(1);
    for (const n of ['0.8', '0.42', '0.25', '0.61', '0.3', '30', '40', '300', '500', 'billion', 'kilometres', 'millimetres', 'bedrooms']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
  });
});

describe('regularisation: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('regularisation', source);
    expect(mistakes.map((m) => m.id)).toEqual(['lowers-training-error', 'bigger-lambda-better', 'charge-everything', 'ridge-zeroes']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('regularisation', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(7);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('regularisation', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'see', 'predict', 'do', 'see', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3200);
    expect(total).toBeLessThanOrEqual(3850);
    expect(source).not.toContain('—');
    expect(lessons.find((l) => l.slug === 'regularisation')?.concept).toBe('regularisation');
  });
});

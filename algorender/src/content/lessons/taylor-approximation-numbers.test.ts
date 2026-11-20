// B4 of the math and ML path, "Tangents and parabolas": every number the
// lesson quotes is measured here from the code that draws it (the taylor
// visualiser and the newton-sqrt exercise), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists, the
// prediction challenge asks at least its goal, and the lesson embeds its one
// exercise, which practises this lesson's visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  correctDecimals,
  d2Loss,
  descentRuns,
  dLoss,
  ETA,
  fitError,
  forgotTheTwo,
  FUNCTIONS,
  errorTable,
  GAPS,
  gdParabola,
  gdStep,
  nearestPower,
  newtonStep,
  parabolaMin,
  SIDE,
  sqrtNewton,
  STOP,
  taylor,
  taylorPoly,
  W_STAR,
  type TaylorInput,
} from '@/algorithms/calculus/taylor';
import { getExercise } from '@/content/exercises';
import { newtonGuesses } from '@/content/exercises/calculus';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';

const source = readFileSync(fileURLToPath(new URL('./taylor-approximation.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = taylor.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`taylor has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as TaylorInput;
};
const framesOf = (preset: string) => traceOf(taylor, inputOf(preset)).frames;

const exp = FUNCTIONS.exp;

describe('taylor-approximation embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return {
        tag: m[1],
        slug: m[2],
        preset: m[3],
        step: m[4] === undefined ? null : Number(m[4]),
        goal: goal === undefined ? null : Number(goal),
      };
    });
    expect(found.map((e) => e.preset)).toEqual(['fits', 'newton', 'newton-left', 'step']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['newton', 6]]);
    for (const e of found) {
      expect(e.slug).toBe('taylor');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['newton-sqrt']);
    expect(getExercise('newton-sqrt')?.visualiser).toBe('taylor');
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: Newton'), body.indexOf('<PredictChallenge'));
    const xs = sqrtNewton(2, 3);
    for (const v of [fmt(xs[1], 3), fmt(xs[2], 3), fmt(forgotTheTwo(2, 3, 1)[1], 3), 'short', 'overshoot', 'bounce', 'double']) expect(before).not.toContain(v);
  });
});

describe('taylor-approximation quotes: the fits of eˣ at 0', () => {
  const input = inputOf('fits');
  if (input.story !== 'fits') throw new Error('not a fits story');
  const { a } = input;
  const d = GAPS[0];
  const T = ([0, 1, 2] as const).map((o) => taylorPoly(exp, a, o));
  const err = (o: 0 | 1 | 2, gap: number) => fitError(exp, a, o, gap);

  it('starts at P = (0, 1) with slope 1, and judges at d = 0.5', () => {
    expect([input.fn, a, exp.f(a), exp.df(a), d]).toEqual(['exp', 0, 1, 1, 0.5]);
    expect(body).toContain('$P$ sits on $f(x) = e^x$ at $a = 0$, so $P = (0, 1)$');
    expect(body).toContain("the slope there is $f'(0) = 1$");
    expect(body).toContain(`a gap $d = ${d}$ to the right of $P$, where $e^{${a + d}} \\approx ${fmt(exp.f(a + d), 4)}$`);
  });

  it('measures the flat line, the tangent and the slopes either side', () => {
    // One precision (4 places) for the same miss wherever the lesson quotes it.
    expect(fmt(err(0, d), 4)).toBe('0.6487');
    expect(body).toContain('The flat line $T_0(x) = 1$ keeps only the height. It misses the curve by 0.6487.');
    expect(T[1](a + d)).toBe(1.5);
    expect(fmt(err(1, d), 4)).toBe('0.1487');
    expect(body).toContain('The tangent $T_1(x) = 1 + x$ copies the slope too. It says 1.5 and misses by only 0.1487.');
    expect(body).not.toMatch(/0\.649(?!\d)|0\.149(?!\d)/);
    expect(SIDE).toBe(0.5);
    const slopes = [a - SIDE, a, a + SIDE].map((x) => fmt(exp.df(x), 3));
    expect(slopes).toEqual(['0.607', '1', '1.649']);
    expect(body).toContain('it is 0.607 at $x = -0.5$, 1 at $P$ and 1.649 at $x = 0.5$');
    expect(exp.d2f(a)).toBe(1);
    expect(body).toContain("so $f''(0) = 1$");
    // The frames narrate the same numbers.
    const frames = framesOf('fits');
    expect(frames[1].note).toContain('misses the curve by 0.649');
    expect(frames[2].note).toContain('misses by only 0.149');
    expect(frames[3].note).toContain('0.607 at x = −0.5, 1 at P and 1.649 at x = 0.5');
  });

  it('adds the bend term and measures the parabola', () => {
    const term = 0.5 * exp.d2f(a) * d * d;
    expect(term).toBe(0.125);
    expect(T[2](a + d)).toBe(1.625);
    expect(fmt(err(2, d), 4)).toBe('0.0237');
    expect(body).toContain('the new term adds $\\tfrac{1}{2} \\times 1 \\times 0.5^2 = 0.125$, so the parabola says 1.625 and misses by just 0.0237');
    expect(framesOf('fits')[5].note).toContain('misses by just 0.0237');
    // Each fit misses by roughly the first term it leaves out.
    expect(exp.df(a) * d).toBe(0.5);
    expect(body).toContain("the slope term $f'(a)\\,d$, which at $d = 0.5$ is 0.5, against its real miss of 0.6487");
    expect(body).toContain('which at $d = 0.5$ is 0.125, against its real miss of 0.1487');
  });

  it('halves the gap twice: about 2, 4 and 8 times smaller', () => {
    expect([...GAPS]).toEqual([0.5, 0.25, 0.125]);
    expect(body).toContain('Here are the misses at $d$ = 0.5, 0.25 and 0.125');
    const table = errorTable(exp, a);
    const names = ['flat line', 'tangent', 'parabola'];
    const lead = ['each about 2 times smaller', 'about 4 times', 'about 8 times'];
    table.forEach((row, o) => {
      const last = o === 2 ? 5 : 4;
      expect(row.ratios.map(nearestPower)).toEqual([2 ** (o + 1), 2 ** (o + 1)]);
      const line = `${names[o]}: ${fmt(row.errors[0], 4)}, then ${fmt(row.errors[1], 4)}, then ${fmt(row.errors[2], last)} (${lead[o]}: ÷${fmt(row.ratios[0], 1)}, then ÷${fmt(row.ratios[1], 1)})`;
      expect(body).toContain(line);
    });
    expect(body).toContain('flat line: 0.6487, then 0.284, then 0.1331 (each about 2 times smaller: ÷2.3, then ÷2.1)');
    expect(body).toContain('parabola: 0.0237, then 0.0028, then 0.00034 (about 8 times: ÷8.5, then ÷8.3)');
  });

  it('shows that far from P a fit with more terms can be worse', () => {
    const x = -2;
    expect(fmt(exp.f(x), 3)).toBe('0.135');
    expect([T[0](x), T[1](x), T[2](x)]).toEqual([1, -1, 1]);
    expect([fmt(err(0, x), 3), fmt(err(1, x), 3), fmt(err(2, x), 3)]).toEqual(['0.865', '1.135', '0.865']);
    expect(err(1, x)).toBeGreaterThan(err(0, x));
    expect(body).toContain(
      'Go to $x = -2$, far from $P$, where $e^{-2}$ is only 0.135. The flat line says 1 and misses by 0.865. The tangent says −1, a value $e^x$ never takes, and misses by 1.135: worse than the flat line. The parabola says 1 and misses by 0.865 again.',
    );
  });
});

describe('taylor-approximation quotes: Newton’s method for √2', () => {
  const input = inputOf('newton');
  if (input.story !== 'newton') throw new Error('not a newton story');
  const xs = sqrtNewton(2, input.x0);
  const dec = xs.map((x) => correctDecimals(x));

  it('steps from 3', () => {
    expect(input.x0).toBe(3);
    expect(body).toContain('Start from $x_0 = 3$');
    expect([3 * 3 - 2, 2 * 3]).toEqual([7, 6]);
    expect(fmt(xs[1], 3)).toBe('1.833');
    expect(xs[1]).toBeCloseTo(3 - 7 / 6, 12);
    expect(xs[1]).toBeGreaterThan(Math.SQRT2);
    expect(body).toContain('At 3, $f(3) = 7$ and the slope is $f\'(3) = 6$, so $x_1 = 3 - 7/6 = 1.833$. That stops short of $\\sqrt{2}$');
    // Each guess is quoted cut off (not rounded) one digit past where it stops agreeing with √2.
    const cut = (x: number) => String(x).slice(0, 2 + correctDecimals(x) + 1);
    const ROOT = String(Math.SQRT2);
    for (const k of [2, 3, 4, 5]) {
      const s = cut(xs[k]);
      expect(s.slice(0, -1), `x${k}`).toBe(ROOT.slice(0, s.length - 1));
      expect(s.at(-1), `x${k}`).not.toBe(ROOT[s.length - 1]);
    }
    expect([2, 3, 4, 5].map((k) => cut(xs[k]))).toEqual(['1.46', '1.4149', '1.4142137', '1.4142135623731']);
    expect(body).toContain(`The next guesses, cut off one digit after they stop agreeing with $\\sqrt{2}$, are $x_2 = ${cut(xs[2])}\\ldots$, $x_3 = ${cut(xs[3])}\\ldots$, $x_4 = ${cut(xs[4])}\\ldots$ and $x_5 = ${cut(xs[5])}\\ldots$`);
    expect(dec.join(', ')).toBe('0, 0, 1, 3, 6, 12, 15');
    expect(xs.length - 1).toBe(6);
    expect(Math.abs(xs[6] - xs[5])).toBeLessThan(STOP);
    expect(body).toContain(`The correct decimal places went ${dec.join(', ')}, and the run stopped after 6 steps`);
    expect(framesOf('newton')[6].note).toContain(`Correct decimals went ${dec.join(', ')}`);
    // The definition before the challenge: 1.4139 agrees with √2 as far as 1.41.
    expect(correctDecimals(1.4139)).toBe(2);
    expect(ROOT.slice(0, 10)).toBe('1.41421356');
    expect(body).toContain('the digits after the point that agree with $\\sqrt{2} = 1.41421356\\ldots$: 1.4139 agrees as far as 1.41, so it has 2.');
    expect(body).toContain('a millionth of a millionth');
  });

  it('squares the miss once close', () => {
    const e3 = Math.abs(xs[3] - Math.SQRT2);
    const e4 = Math.abs(xs[4] - Math.SQRT2);
    expect(fmt(e3, 6)).toBe('0.000785');
    expect(fmt(2 * xs[3], 2)).toBe('2.83');
    expect((0.000785 ** 2 / 2.83).toExponential(1)).toBe('2.2e-7');
    expect((e3 ** 2 / (2 * xs[3])).toExponential(1)).toBe('2.2e-7');
    expect(e4.toExponential(1)).toBe('2.2e-7');
    expect(body).toContain('Here $x_3$ is off by 0.000785, and $0.000785^2 \\div 2.83 \\approx 2.2 \\times 10^{-7}$, which is how far off $x_4$ is');
    // x² − 2 has f″ = 2, so the tangent misses the curve at √2 by exactly d².
    const d = xs[3] - Math.SQRT2;
    const tangentAtRoot = xs[3] ** 2 - 2 + 2 * xs[3] * (Math.SQRT2 - xs[3]);
    expect(Math.abs(tangentAtRoot)).toBeCloseTo(d * d, 15);
  });

  it('bounces when the 2 is forgotten', () => {
    const bounce = forgotTheTwo(2, 3, 2).map((x) => fmt(x, 3));
    expect(bounce).toEqual(['3', '0.667', '3']);
    expect(body).toContain('From 3 that goes to 0.667, then back to 3');
    expect(framesOf('newton')[7].note).toContain('From 3 it lands at 0.667, then back at 3');
  });

  it('overshoots from 0.5, then stays above √2', () => {
    const left = inputOf('newton-left');
    if (left.story !== 'newton') throw new Error('not a newton story');
    expect(left.x0).toBe(0.5);
    const ys = sqrtNewton(2, left.x0);
    expect([0.5 * 0.5 - 2, 2 * 0.5, ys[1]]).toEqual([-1.75, 1, 2.25]);
    expect(body).toContain("at $x_0 = 0.5$: there $f(0.5) = -1.75$ and the slope is only 1, so $x_1 = 0.5 + 1.75 = 2.25$, well past $\\sqrt{2}$");
    // Cut off, not rounded, like the run from 3.
    expect([String(ys[2]).slice(0, 5), String(ys[3]).slice(0, 5), String(ys[4]).slice(0, 7)]).toEqual(['1.569', '1.421', '1.41423']);
    expect(body).toContain('From 2.25 on, every guess stays above $\\sqrt{2}$, as in the run from 3: 1.569…, 1.421…, 1.41423…, and so on');
    for (const y of ys.slice(1)) expect(y).toBeGreaterThanOrEqual(Math.SQRT2 - 1e-15);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(Math.SQRT2 - 1e-15);
  });

  it('runs the exercise’s √1,000,000 example: nine halvings, then doubling, 15 steps', () => {
    expect(getExercise('newton-sqrt')?.examples.some((e) => (e.input as { a: number }).a === 1_000_000)).toBe(true);
    const g = newtonGuesses(1_000_000);
    expect(g[0]).toBe(1_000_000);
    expect(Math.sqrt(1_000_000)).toBe(1000);
    for (let k = 1; k <= 9; k++) expect(Math.abs(g[k] / g[k - 1] - 0.5)).toBeLessThan(0.05);
    expect(g[10] / g[9]).toBeGreaterThan(0.55);
    expect(fmt(g[9], 0)).toBe('2121');
    expect(g.length - 1).toBe(15);
    expect(body).toContain('One example is $\\sqrt{1{,}000{,}000}$, starting from a guess of 1,000,000, a thousand times too big. The first nine steps only roughly halve it, down to about 2121');
    // Why: when x² is much bigger than a, x − (x² − a)/2x is about x − x/2.
    expect(body).toContain('when $x^2$ is much bigger than $a$, $x - (x^2 - a)/2x$ is about $x - x/2$');
    expect(body).toContain('the run is done after 15 steps');
  });
});

describe('taylor-approximation quotes: the step an optimiser takes', () => {
  const input = inputOf('step');
  if (input.story !== 'step') throw new Error('not a step story');
  const { w0 } = input;
  const runs = descentRuns(w0);
  const dist = (w: number) => Math.abs(w - W_STAR);

  it('has the slope and bend the lesson writes', () => {
    for (const w of [-1, 0.5, 2, 3.25, 4, 5]) {
      expect(dLoss(w)).toBeCloseTo(2 * (w - 2) + (w - 2) ** 3, 12);
      expect(d2Loss(w)).toBeCloseTo(2 + 3 * (w - 2) ** 2, 12);
    }
    expect(W_STAR).toBe(2);
    expect([w0, dLoss(w0), d2Loss(w0), d2Loss(W_STAR)]).toEqual([4, 12, 14, 2]);
    expect(body).toContain("An optimiser standing at $w_0 = 4$ finds $L'(4) = 12$ and $L''(4) = 14$");
    expect(body).toContain("(only 2 at the bottom)");
  });

  it('takes the gradient step as the bottom of a parabola of bend 1/η', () => {
    expect([ETA, 1 / ETA]).toEqual([0.1, 10]);
    expect(fmt(gdStep(w0), 6)).toBe('2.8');
    expect(body).toContain('Gradient descent with $\\eta = 0.1$ moves to $w_1 = 4 - 0.1 \\times 12 = 2.8$');
    expect(body).toContain('a bend of $1/\\eta = 10$');
    // The bottom of the 1/η parabola is the gradient step, and it has L's height and slope at w₀.
    expect(parabolaMin(dLoss(w0), 1 / ETA)).toBeCloseTo(gdStep(w0) - w0, 12);
    const q = gdParabola(w0);
    const lowest = q(gdStep(w0));
    for (const dw of [-0.3, -0.01, 0.01, 0.3]) expect(q(gdStep(w0) + dw)).toBeGreaterThan(lowest);
  });

  it('takes the Newton step, and compares the two runs', () => {
    expect(fmt(newtonStep(w0), 3)).toBe('3.143');
    expect(newtonStep(w0)).toBeCloseTo(4 - 12 / 14, 12);
    expect(body).toContain('$w_1 = 4 - 12/14 = 3.143$');
    expect([fmt(dist(runs.gd[1]), 3), fmt(dist(runs.newton[1]), 3)]).toEqual(['0.8', '1.143']);
    expect(body).toContain('Here the gradient step, 0.8 away against 1.143');
    const gd = runs.gd.slice(2).map((w) => fmt(dist(w), 3));
    const nt = runs.newton.slice(2).map((w, i) => fmt(dist(w), i === 2 ? 4 : 3));
    expect(gd).toEqual(['0.589', '0.451', '0.351']);
    expect(nt).toEqual(['0.504', '0.093', '0.0008']);
    expect(body).toContain('After 2, 3 and 4 steps, gradient descent is 0.589, 0.451 and 0.351 from the minimum');
    expect(body).toContain('Newton is 0.504, 0.093 and 0.0008');
    // “Only about a quarter of the distance each step”.
    for (let n = 2; n < runs.gd.length; n++) expect(Math.abs(dist(runs.gd[n]) / dist(runs.gd[n - 1]) - 0.75)).toBeLessThan(0.05);
    expect(body).toContain('losing only about a quarter of the distance each step');
  });
});

describe('taylor-approximation: quiz and probes', () => {
  it('checks the quiz', () => {
    // f(2) = 5, f′(2) = 3, f″(2) = 4, at 2.1.
    const smooth = { ...exp, f: () => 5, df: () => 3, d2f: () => 4 };
    expect(fmt(taylorPoly(smooth, 2, 2)(2.1), 6)).toBe('5.32');
    expect(fmt(taylorPoly(smooth, 2, 1)(2.1), 6)).toBe('5.3');
    expect(fmt(5 + 0.3 + 4 * 0.01, 6)).toBe('5.34');
    expect(fmt(5 + 0.5 * 4 * 0.01, 6)).toBe('5.02');
    expect(body).toContain('5 + 3 × 0.1 + ½ × 4 × 0.1² = 5 + 0.3 + 0.02 = 5.32');
    // A tangent's miss quarters when the gap halves.
    expect(fmt(0.036 / 4, 6)).toBe('0.009');
    // √10 from 3.
    expect(fmt(sqrtNewton(10, 3)[1], 3)).toBe('3.167');
    expect(fmt(forgotTheTwo(10, 3, 1)[1], 3)).toBe('3.333');
    expect(fmt(3 - 1 / 6, 3)).toBe('2.833');
    expect((3 + 10) / 2).toBe(6.5);
    expect(body).toContain('x₁ = 3 − (−1)/6 = 3.167. Forgetting the 2 gives 3.333, a sign slip 2.833, and averaging 3 and 10 gives 6.5');
    // √2 from 1 overshoots to 1.5.
    expect(sqrtNewton(2, 1)[1]).toBe(1.5);
    expect(fmt(Math.SQRT2, 3)).toBe('1.414');
    // Close to √5, 5 correct decimals become 10 or more (12), not 25.
    const runs = [3, 2.5, 2, 1, 4].map((x0) => sqrtNewton(5, x0).map((x) => correctDecimals(x, Math.sqrt(5))));
    const after4 = runs.flatMap((r) => r.flatMap((d, i) => (d === 5 && i + 1 < r.length ? [r[i + 1]] : [])));
    expect(after4.length).toBeGreaterThan(0);
    for (const next of after4) expect(next).toBe(12);
    expect(body).toContain("on √5, 5 become 12");
    // The Newton step with L′ = 6, L″ = 3.
    expect(parabolaMin(6, 3)).toBe(-2);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    // eˣ at 0, judged at x = −3.
    const T = ([0, 1, 2] as const).map((o) => taylorPoly(exp, 0, o)(-3));
    expect(T).toEqual([1, -2, 2.5]);
    expect([0, 1, 2].map((o) => fmt(fitError(exp, 0, o as 0 | 1 | 2, -3), 2))).toEqual(['0.95', '2.05', '2.45']);
    expect(fmt(Math.exp(-3), 2)).toBe('0.05');
    expect(body).toContain('They say 1, −2 and 2.5, so they miss by about 0.95, 2.05 and 2.45');
    // Halving the gap: d² quarters, d³ divides by 8.
    expect(fmt(0.12 / 4, 6)).toBe('0.03');
    expect(fmt(0.016 / 8, 6)).toBe('0.002');
    // Newton for √9 and √7 from 1.
    expect(sqrtNewton(9, 1)[1]).toBe(5);
    expect(sqrtNewton(7, 1)[1]).toBe(4);
    expect(fmt(Math.sqrt(7), 2)).toBe('2.65');
    for (const n of ['0.95', '2.05', '2.45', '0.016', '√9', '√7', '2.65']) {
      expect(text, `${n} is in the text`).not.toContain(n);
      expect(quiz, `${n} is in the quiz`).not.toContain(n);
    }
    // 0.12, but not the 0.125 the text quotes.
    expect(text).not.toMatch(/(?<![\d.])0\.12(?!\d)/);
    expect(quiz).not.toMatch(/(?<![\d.])0\.12(?!\d)/);
  });
});

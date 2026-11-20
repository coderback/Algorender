// B4 of the math and ML path, "Derivative rules": every number the lesson
// quotes is measured here from the code that draws it, and must appear in the
// lesson exactly as written. The embedded visualisers are checked too: each
// preset exists, each starting step is a real frame, the prediction challenge
// asks at least its goal, and the one exercise practises this visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bestH,
  centralDiff,
  cube,
  derivativeRules,
  dRelu,
  dSigmoid,
  dTanh,
  errorTable,
  forwardDiff,
  GALLERY,
  GALLERY_FNS,
  MEASURE_H,
  productDf,
  productDg,
  productF,
  productG,
  productRule,
  productStrips,
  sci,
  sigmoid,
  sweepXs,
  wrongGuess,
  type RulesInput,
} from '@/algorithms/calculus/derivative-rules';
import { getExercise } from '@/content/exercises';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';

const source = readFileSync(fileURLToPath(new URL('./derivative-rules.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = derivativeRules.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`derivative-rules has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as RulesInput;
};
const framesOf = (preset: string) => traceOf(derivativeRules, inputOf(preset)).frames as { state: PlotState; note: string; checkpoint?: unknown }[];

describe('derivative-rules embeds', () => {
  it('embeds real presets, at frames that exist, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? would always match empty.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = m[0].match(/goal=\{(\d+)\}/);
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal ? Number(goal[1]) : null };
    });
    expect(found.map((e) => `${e.tag}:${e.preset}`)).toEqual(['Explore:product', 'PredictChallenge:gallery', 'Explore:saturated', 'Explore:numeric']);
    for (const e of found) {
      expect(e.slug).toBe('derivative-rules');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
    expect(found.find((e) => e.tag === 'PredictChallenge')!.goal).toBe(10);
    // The saturated embed opens on the sigmoid's measured slope at x = 5.
    const saturated = inputOf('saturated');
    if (saturated.story !== 'gallery') throw new Error('saturated is a gallery');
    expect(framesOf('saturated')[10].note).toContain(`f′(${fmt(saturated.at.sigmoid)}) = ${fmt(dSigmoid(saturated.at.sigmoid), 4)}`);
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    expect([...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['numeric-derivative']);
    expect(getExercise('numeric-derivative')?.visualiser).toBe('derivative-rules');
  });
});

describe('derivative-rules quotes', () => {
  it('takes sums and constant multiples term by term', () => {
    const p = (x: number) => 4 * x * x * x - 2 * x + 7;
    for (const x of [-2, -0.5, 0, 1, 3]) expect(centralDiff(p, x, 1e-4)).toBeCloseTo(12 * x * x - 2, 6);
    expect(body).toContain('The slope of $4x^3 - 2x + 7$ is $$ 4 \\cdot 3x^2 - 2 \\cdot 1 + 0 = 12x^2 - 2 $$');
  });

  it('grows the rectangle f·g at a = 2', () => {
    const input = inputOf('product');
    if (input.story !== 'product') throw new Error('not the product story');
    const a = input.a;
    expect(a).toBe(2);
    expect([productF(a), productG(a), productDf(a), productDg(a)]).toEqual([3, 4, 1, 4]);
    expect(body).toContain('At $a = 2$, $f = 3$ and $g = 4$, and their slopes are 1 and 4');
    const s = productStrips(a, 0.5);
    expect([s.df, s.dg, s.top, s.right, s.corner, s.change, s.slope]).toEqual([0.5, 2.25, 2, 6.75, 1.125, 9.875, 19.75]);
    expect([a + 0.5, productF(a + 0.5), productG(a + 0.5), productF(a) * productG(a), productF(a + 0.5) * productG(a + 0.5)]).toEqual([2.5, 3.5, 6.25, 12, 21.875]);
    expect(body).toContain('Nudge $a$ by $h = 0.5$, to 2.5. Then $f$ goes from 3 to 3.5, so $\\Delta f = 0.5$, and $g$ goes from 4 to $2.5^2 = 6.25$, so $\\Delta g = 2.25$');
    expect(body).toContain('g \\cdot \\Delta f &= 4 \\times 0.5 = 2');
    expect(body).toContain('f \\cdot \\Delta g &= 3 \\times 2.25 = 6.75');
    expect(body).toContain('\\Delta f \\cdot \\Delta g &= 0.5 \\times 2.25 = 1.125');
    expect(21.875 - 12).toBe(s.change);
    expect(body).toContain('Together they make 9.875. That is exactly how much $f \\cdot g$ grew: it went from 12 to $3.5 \\times 6.25 = 21.875$. Divided by $h$, that is the secant\'s slope, 19.75.');
    const small = productStrips(a, 0.01);
    expect([fmt(small.corner, 6), fmt(small.slope, 4)]).toEqual(['0.000401', '16.0701']);
    expect(body).toContain('At $h = 0.01$ the corner is just 0.000401, and the secant\'s slope is 16.0701');
    // The module draws these two values in its frames too.
    const notes = framesOf('product').map((f) => f.note).join(' ');
    expect(notes).toContain('the corner, 0.000401');
    expect(productRule(a)).toBe(16);
    expect(body).toContain('&= 1 \\times 4 + 3 \\times 4 = 16');
    expect(centralDiff((x) => productF(x) * productG(x), a, 1e-4)).toBeCloseTo(16, 6);
    // x³ + x², term by term.
    expect([3 * a * a, 2 * a, 3 * a * a + 2 * a]).toEqual([12, 4, 16]);
    expect(body).toContain('$3x^2 + 2x$, which at 2 is $12 + 4 = 16$');
    expect(wrongGuess(a)).toBe(4);
    expect(wrongGuess(a) / productRule(a)).toBe(0.25);
    expect(body).toContain('$f\' \\cdot g\' = 1 \\times 4 = 4$, a quarter of the truth');
  });

  it('explains ln’s rule through the mirror, and measures every rule in the gallery', () => {
    expect(Math.exp(Math.log(4))).toBeCloseTo(4, 12);
    expect(centralDiff(Math.log, 4, 1e-5)).toBeCloseTo(1 / 4, 9);
    expect(body).toContain('The point $(4, \\ln 4)$ on $\\ln x$ is the mirror image of $(\\ln 4, 4)$ on $e^x$, where the slope is the height, 4. So the slope of $\\ln x$ at 4 is $1/4$');
    expect(MEASURE_H).toBe(0.001);
    expect(body).toContain('a central secant with $h = 0.001$ measures it');
    for (const fn of GALLERY_FNS) {
      for (const x of sweepXs(fn)) {
        const rule = GALLERY[fn].df(x);
        expect(rule, `${fn} at ${x}`).not.toBeNull();
        expect(Math.abs(centralDiff(GALLERY[fn].f, x, MEASURE_H) - rule!), `${fn} at ${x}`).toBeLessThan(1e-5);
      }
    }
    expect(body).toContain('the measured slope and the rule agreed to within $10^{-5}$');
    expect(dRelu(0)).toBeNull();
  });

  it('reads the activations’ slopes at 0 and far out', () => {
    expect([sigmoid(0), dSigmoid(0), dTanh(0)]).toEqual([0.5, 0.25, 1]);
    expect(body).toContain('$\\sigma(0) = 0.5$ and $\\sigma\'(0) = 0.5 \\times 0.5 = 0.25$');
    expect(body).toContain('its slope is $1 - 0 = 1$, four times σ\'s best');
    expect(dTanh(0) / dSigmoid(0)).toBe(4);
    // σ′ never tops 0.25 and tanh′ never tops 1.
    for (let x = -10; x <= 10; x += 0.01) {
      expect(dSigmoid(x)).toBeLessThanOrEqual(0.25);
      expect(dTanh(x)).toBeLessThanOrEqual(1);
    }
    expect(body).toContain('$\\sigma\' = \\sigma(1 - \\sigma)$, at most 0.25; $\\tanh\' = 1 - \\tanh^2$, at most 1');
    const input = inputOf('saturated');
    if (input.story !== 'gallery') throw new Error('saturated is a gallery');
    expect([input.at.sigmoid, input.at.tanh, input.at.relu]).toEqual([5, 2.5, 2]);
    expect(body).toContain('with σ at x = 5, tanh at x = 2.5 and ReLU at x = 2');
    expect([fmt(sigmoid(5), 4), fmt(dSigmoid(5), 4)]).toEqual(['0.9933', '0.0066']);
    expect(body).toContain('$\\sigma(5) \\approx 0.9933$, so $\\sigma\'(5) = \\sigma(5)\\,(1 - \\sigma(5)) \\approx 0.0066$');
    expect(fmt(dTanh(2.5), 4)).toBe('0.0266');
    expect(body).toContain('tanh at 2.5 has slope 0.0266');
    expect(fmt(dSigmoid(5) * 100, 2)).toBe('0.66');
    expect(body).toContain('A slope of 0.0066 cuts it to 0.66% of itself');
    expect(dRelu(2)).toBe(1);
  });

  it('measures x³ at a = 1 in floating point', () => {
    const input = inputOf('numeric');
    if (input.story !== 'numeric') throw new Error('not the numeric story');
    expect(input.a).toBe(1);
    const rows = errorTable(1);
    expect([rows[0].k, rows[rows.length - 1].k]).toEqual([1, 15]);
    expect(rows).toHaveLength(15);
    expect(body).toContain('watch both happen across fifteen values of $h$, from $10^{-1}$ down to $10^{-15}$, for $x^3$ at $a = 1$');
    // The algebra: the two cubes expanded, then forward = 3a² + 3ah + h², central = 3a² + h².
    expect(body).toContain('(a + h)^3 = a^3 + 3a^2h + 3ah^2 + h^3');
    expect(body).toContain('(a - h)^3 = a^3 - 3a^2h + 3ah^2 - h^3');
    expect(body).toContain('leaving $6a^2h + 2h^3$, and divides by $2h$');
    for (const a of [0.5, 1, 2])
      for (const h of [0.5, 0.1, 0.01]) {
        expect(cube(a + h)).toBeCloseTo(a ** 3 + 3 * a * a * h + 3 * a * h * h + h ** 3, 10);
        expect(cube(a - h)).toBeCloseTo(a ** 3 - 3 * a * a * h + 3 * a * h * h - h ** 3, 10);
        expect(cube(a + h) - cube(a - h)).toBeCloseTo(6 * a * a * h + 2 * h ** 3, 10);
        expect(forwardDiff(cube, a, h)).toBeCloseTo(3 * a * a + 3 * a * h + h * h, 10);
        expect(centralDiff(cube, a, h)).toBeCloseTo(3 * a * a + h * h, 10);
      }
    expect([fmt(forwardDiff(cube, 1, 0.1), 4), fmt(centralDiff(cube, 1, 0.1), 4)]).toEqual(['3.31', '3.01']);
    expect(body).toContain('At $a = 1$ and $h = 0.1$, forward gives 3.31 and central 3.01, against the true 3');
    expect([fmt(rows[0].forwardError, 4), fmt(rows[0].centralError, 4)]).toEqual(['0.31', '0.01']);
    expect(body).toContain('At $h = 0.1$ above that was 0.31 against 0.01');
    // One digit a step for forward, two for central, while truncation wins.
    for (let i = 0; i < 4; i++) {
      expect(Math.round(Math.log10(rows[i].forwardError / rows[i + 1].forwardError))).toBe(1);
      expect(Math.round(Math.log10(rows[i].centralError / rows[i + 1].centralError))).toBe(2);
    }
    const best = bestH(rows);
    expect([best.central.k, sci(best.central.centralError)]).toEqual([6, '2.5 × 10⁻¹¹']);
    expect(body).toContain('the central difference did best at $h = 10^{-6}$, off by only 2.5 × 10⁻¹¹');
    expect(sci(rows[14].centralError)).toBe('1.6 × 10⁻¹');
    expect(body).toContain('by $h = 10^{-15}$ it was off by 1.6 × 10⁻¹');
    expect([best.forward.k, sci(best.forward.forwardError)]).toEqual([8, '4.0 × 10⁻⁹']);
    expect(body).toContain('The forward difference did best at $h = 10^{-8}$, off by 4.0 × 10⁻⁹');
    expect(best.forward.forwardError / best.central.centralError).toBeGreaterThan(150);
    expect(body).toContain('forward\'s smallest error was more than 150 times central\'s');
    expect(bestH(errorTable(2)).central.k).toBe(5);
    expect(body).toContain('Drag P to $a = 2$ and central\'s best moves to $h = 10^{-5}$');
  });

  it('checks the quiz and the probes', () => {
    // Quiz: f(2) = 3, f′ = 1; g(2) = 5, g′ = −2 (f = x + 1, g = 9 − 2x).
    const f = (x: number) => x + 1;
    const g = (x: number) => 9 - 2 * x;
    expect([f(2), g(2)]).toEqual([3, 5]);
    expect(centralDiff((x) => f(x) * g(x), 2, 1e-4)).toBeCloseTo(1 * 5 + 3 * -2, 8);
    expect(1 * 5 + 3 * -2).toBe(-1);
    expect([1 * -2, 1 * 5 + 3 * 2, 3 * 5]).toEqual([-2, 11, 15]);
    // Quiz: (ln x)′ at 0.5.
    expect(centralDiff(Math.log, 0.5, 1e-5)).toBeCloseTo(2, 8);
    expect(fmt(Math.log(0.5), 3)).toBe('−0.693');
    expect(body).toContain("choices: ['0.5', '2', '−0.693', '−4']");
    // The exercise's 1/x: the power rule with n = −1.
    expect(centralDiff((x) => 1 / x, 2, 1e-5)).toBeCloseTo(-1 / 4, 8);
    expect(body).toContain('$1/x = x^{-1}$, so the power rule gives $-x^{-2} = -1/x^2$');
    // Quiz: tanh = 0.8.
    expect([fmt(1 - 0.8 ** 2), fmt(1 - 0.8), fmt(0.8 ** 2), fmt(0.8 * (1 - 0.8))]).toEqual(['0.36', '0.2', '0.64', '0.16']);
    const x08 = Math.atanh(0.8);
    expect(dTanh(x08)).toBeCloseTo(0.36, 12);
    // Quiz: σ at 8.
    expect([fmt(sigmoid(8), 4), fmt(dSigmoid(8), 4)]).toEqual(['0.9997', '0.0003']);
    expect(body).toContain('σ(8) ≈ 0.9997, so σ′ = σ(1 − σ) ≈ 0.0003');
    // Quiz: below about 10⁻⁶ the central difference gets worse (for x³ at 1).
    const rows = errorTable(1);
    expect(rows[6].centralError).toBeGreaterThan(rows[5].centralError);
    // Probe: x³ at 3, by the product rule and by multiplying slopes.
    expect([1 * 9 + 3 * 6, 1 * 6, 3 * 3 * 3]).toEqual([27, 6, 27]);
    expect(centralDiff(cube, 3, 1e-4)).toBeCloseTo(27, 6);
    // Probe: a rectangle 4 by 10, growing 1 and 2 a second.
    expect([1 * 10 + 4 * 2, 1 * 2, 4 * 10]).toEqual([18, 2, 40]);
    // Probe: x² at 4 with h = 0.5.
    const sq = (x: number) => x * x;
    expect([forwardDiff(sq, 4, 0.5), centralDiff(sq, 4, 0.5), forwardDiff(sq, 4, 0.25)]).toEqual([8.5, 8, 8.25]);
    expect([4.5 ** 2, 3.5 ** 2]).toEqual([20.25, 12.25]);
  });
});

// B6 of the math and ML path, "Maximum likelihood": every number the lesson
// quotes is measured here from the code that draws it (the maximum-likelihood
// visualiser and the log-likelihood exercise), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists, the
// prediction challenge asks at least its goal, and the lesson embeds its one
// exercise, which practises this lesson's visualiser, and links only lessons
// of the concepts it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  choose,
  coinLikelihood,
  coinLogLikelihood,
  crossEntropy,
  fitGaussian,
  gaussianLogLikelihood,
  leastSquares,
  LINE_POINTS,
  logDensity,
  manyFlips,
  maximumLikelihood,
  mean,
  meanAbsGap,
  measuredSlope,
  MEASUREMENTS,
  median,
  midrange,
  noiseLogLikelihood,
  power,
  residuals,
  sampleSd,
  squaredGaps,
  type MlInput,
} from '@/algorithms/probability/maximum-likelihood';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { logLikelihood } from '@/content/exercises/likelihood';
import { fmt } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from '.';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./maximum-likelihood.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const f3 = (v: number) => fmt(v, 3);

const inputOf = (preset: string) => {
  const ex = maximumLikelihood.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`maximum-likelihood has no example ${preset}`);
  return ex.make({ seed: 1, size: 0 }) as MlInput;
};
const framesOf = (preset: string) => traceOf(maximumLikelihood, inputOf(preset)).frames;
const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => k / 10);

describe('maximum-likelihood embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['coin', 'coin-few', 'gaussian', 'squared-error']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['coin-few', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('maximum-likelihood');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['log-likelihood']);
    expect(getExercise('log-likelihood')?.visualiser).toBe('maximum-likelihood');
    expect(source).toContain('(/code/fit-gaussian)');
    expect(getExercise('fit-gaussian')?.visualiser).toBe('maximum-likelihood');
  });

  it('links only lessons of the concepts it builds on', () => {
    const { concepts } = loadConcepts();
    const before = new Set<string>();
    const walk = (id: string) => {
      for (const p of concepts.find((c) => c.id === id)?.prereqs ?? [])
        if (!before.has(p)) {
          before.add(p);
          walk(p);
        }
    };
    walk('maximum-likelihood');
    const links = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const target of links) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Now a coin that landed heads once'), body.indexOf('<PredictChallenge'));
    for (const v of ['0.0864', '0.25', '0.492', '1,250', '2.449', '−2.5', '0.562']) expect(before).not.toContain(v);
  });

  it('gives no run’s answers away in the example labels the input panel lists, or just before the embeds', () => {
    // The picker and the Explore input panel list every example's label.
    expect(maximumLikelihood.input.examples.map((e) => e.label)).toEqual([
      'A coin: 7 heads in 10 flips',
      'A coin: 1 head in 4 flips',
      'A normal bell over 8 measurements',
      'A bell over measurements with no far one',
      'A line with normal noise',
    ]);
    // The paragraph before each Explore states the model, not the run's results.
    const before = (preset: string) => {
      const at = body.indexOf(`preset: '${preset}'`);
      return body.slice(body.lastIndexOf('</Section>', at), at);
    };
    for (const v of ['0.000977', '0.00222', '0.7 is', 'peaks at']) expect(before('coin').slice(before('coin').indexOf('$$'))).not.toContain(v);
    for (const v of ['5.25', '2.194', 'mean']) expect(before('gaussian').slice(before('gaussian').lastIndexOf('normal bell'))).not.toContain(v);
    for (const v of ['bigger likelihood', 'Σ', 'sum r', 'same place', '0.33']) expect(before('squared-error')).not.toContain(v);
  });
});

describe('maximum-likelihood quotes: 7 heads in 10 flips', () => {
  const L = (p: number) => coinLikelihood(7, 10, p);
  const lnL = (p: number) => coinLogLikelihood(7, 10, p);

  it('works out L at 0.5 and 0.7, and their ratio', () => {
    expect(inputOf('coin')).toEqual({ story: 'coin', h: 7, n: 10, p: 0.5 });
    expect(L(0.5)).toBe(0.5 ** 10);
    expect([fmt(L(0.5), 6), fmt(L(0.7), 5), fmt(L(0.7) / L(0.5), 1)]).toEqual(['0.000977', '0.00222', '2.3']);
    expect(body).toContain('so $L(0.5) = 0.5^{10} = 0.000977$. If $p = 0.7$, $L(0.7) = 0.7^7 \\times 0.3^3 = 0.00222$, more than twice as likely');
    expect(body).toContain('better than 0.5 does, by a factor of 2.3');
    expect(body).toContain('$L(0.7) = 0.00222$ doesn\'t mean "the chance that $p$ is 0.7 is 0.00222"');
    // The chance of "7 heads somewhere in 10" is C(10, 7) = 120 times the chance of the run: the same for every p.
    expect(choose(10, 7)).toBe(120);
    expect(fmt(120 * L(0.5), 3)).toBe('0.117');
    expect(body).toContain('is $C(10, 7) = 120$ times bigger, because 120 orders of the flips have 7 heads: 0.117 at $p = 0.5$');
    // The frames say the same.
    const frames = framesOf('coin');
    expect(readout(frames[2].state, 'guess')).toBe('0.000977');
    expect(readout(frames[2].state, 'best')).toBe('0.00222');
    // 0.7 beats every other p.
    for (let k = 1; k < 100; k++) expect(L(k / 100)).toBeLessThanOrEqual(L(0.7) * (1 + 1e-12));
  });

  it('adds up the nine heights', () => {
    const sum = grid.reduce((s, p) => s + L(p), 0);
    expect(fmt(sum, 5)).toBe('0.00758');
    expect(body).toContain('Add up the heights at $p = 0.1, 0.2, \\ldots, 0.9$ and you get 0.00758');
    // One flip that landed heads: L(p) = p, and the nine heights add up to 4.5, more than 1.
    expect(fmt(grid.reduce((s, p) => s + coinLikelihood(1, 1, p), 0), 6)).toBe('4.5');
    expect(body).toContain('for a single flip that landed heads, $L(p) = p$, and the same nine heights add up to 4.5');
    expect(readout(framesOf('coin')[3].state, 'sum')).toBe('0.00758');
  });

  it('underflows 3,500 heads in 5,000 flips, and adds logs instead', () => {
    expect(manyFlips(7, 10)).toEqual({ heads: 3500, flips: 5000 });
    expect(power(0.7, 3500) * power(0.3, 1500)).toBe(0);
    const big = coinLogLikelihood(3500, 5000, 0.7);
    expect(fmt(big, 1)).toBe('−3054.3');
    expect(body).toContain('$3500 \\ln 0.7 + 1500 \\ln 0.3 = -3054.3$');
    expect(body).toContain('Now take 3,500 heads in 5,000 flips, the same share');
    // More than 1,300 zeros after the point; the smallest float has about 320.
    const zeros = -Math.floor(big / Math.LN10) - 1;
    expect(zeros).toBeGreaterThan(1300);
    expect(zeros).toBeLessThan(1400);
    expect(Number.MIN_VALUE).toBe(5e-324);
    expect(body).toContain('has more than 1,300 zeros after the decimal point. The smallest number a float can hold has about 320');
    expect(readout(framesOf('coin')[4].state, 'product')).toBe('0');
  });

  it('works out the logs, the slopes and the cross-entropy', () => {
    expect([f3(lnL(0.5)), f3(lnL(0.7))]).toEqual(['−6.931', '−6.109']);
    expect(body).toContain('$\\ln L(0.5) = -6.931$ and $\\ln L(0.7) = -6.109$');
    expect(fmt(measuredSlope(lnL, 0.5), 2)).toBe('8');
    expect(fmt(measuredSlope(lnL, 0.7), 2)).toBe('0');
    expect(body).toContain('the slope of $\\ln L$ is 8 at $p = 0.5$, uphill towards 0.7, and 0 at $p = 0.7$');
    expect([f3(crossEntropy(7, 10, 0.7)), f3(crossEntropy(7, 10, 0.5))]).toEqual(['0.611', '0.693']);
    expect(body).toContain('It is 0.611 at $p = 0.7$ and 0.693 at $p = 0.5$');
    const frames = framesOf('coin');
    expect(readout(frames[7].state, 'slopeGuess')).toBe('8');
    expect(readout(frames[8].state, 'ceBest')).toBe('0.611');
  });
});

describe('maximum-likelihood quotes: 1 head in 4 flips (after the challenge)', () => {
  const L = (p: number) => coinLikelihood(1, 4, p);
  const lnL = (p: number) => coinLogLikelihood(1, 4, p);

  it('works out what the challenge showed', () => {
    expect(inputOf('coin-few')).toEqual({ story: 'coin', h: 1, n: 4, p: 0.4 });
    expect(body).toContain('with your guess starting at $p = 0.4$');
    expect([fmt(L(0.4), 4), fmt(L(0.25), 3)]).toEqual(['0.0864', '0.105']);
    expect(body).toContain('With $p = 0.4$ the four flips have chance $0.4 \\times 0.6^3 = 0.0864$, and the curve $L(p) = p(1 - p)^3$ peaks at $\\hat{p} = 1/4 = 0.25$, where $L = 0.105$');
    expect(fmt(grid.reduce((s, p) => s + L(p), 0), 3)).toBe('0.492');
    expect(manyFlips(1, 4)).toEqual({ heads: 1250, flips: 5000 });
    expect(body).toContain('The nine heights add up to 0.492, not 1. With 5,000 flips (1,250 heads)');
    expect([f3(lnL(0.4)), fmt(measuredSlope(lnL, 0.4), 2), f3(crossEntropy(1, 4, 0.25))]).toEqual(['−2.449', '−2.5', '0.562']);
    expect(body).toContain('$\\ln L(0.4) = \\ln 0.4 + 3 \\ln 0.6 = -2.449$: one $\\ln p$ for the head and three $\\ln(1 - p)$ for the tails. Its measured slope there is $-2.5$');
    expect(body).toContain('gives a cross-entropy of 0.562');
    // The challenge's own frames. At p = 0.4 the heads-and-tails-swapped slip is a fourth, different choice.
    const frames = framesOf('coin-few');
    expect(frames[0].checkpoint!.choices[frames[0].checkpoint!.answer]).toBe('0.0864');
    expect(frames[1].checkpoint!.choices[frames[1].checkpoint!.answer]).toBe('0.25');
    expect(readout(frames[3].state, 'sum')).toBe('0.492');
    expect(frames[5].checkpoint!.choices).toHaveLength(4);
    expect(frames[5].checkpoint!.choices).toContain(f3(Math.log(0.6) + 3 * Math.log(0.4)));
    expect(readout(frames[6].state, 'logGuess')).toBe('−2.449');
    expect(frames[6].checkpoint!.choices[frames[6].checkpoint!.answer]).toBe('Downhill: negative');
    expect(readout(frames[8].state, 'ceBest')).toBe('0.562');
    // A wide curve: p = 0.1 and 0.45 keep about 70% of the peak's likelihood.
    expect([fmt(L(0.1) / L(0.25), 2), fmt(L(0.45) / L(0.25), 2)]).toEqual(['0.69', '0.71']);
    expect(body).toContain('the likelihood at $p = 0.1$ and at $p = 0.45$ is still about 70% of the peak\'s');
  });
});

describe('maximum-likelihood quotes: a normal bell over 8 measurements', () => {
  const xs = MEASUREMENTS;
  const best = fitGaussian(xs);

  it('uses the preset’s measurements and bell', () => {
    expect(inputOf('gaussian')).toEqual({ story: 'gaussian', xs: [2.5, 3.5, 4, 4.5, 5, 5.5, 7, 10], mu: 4, sigma: 1.5 });
    expect(body).toContain('Here are 8 measurements: 2.5, 3.5, 4, 4.5, 5, 5.5, 7 and 10');
  });

  it('works out the bars, their product and ln L for μ = 4, σ = 1.5', () => {
    const bar = (x: number) => Math.exp(logDensity(x, 4, 1.5));
    expect([fmt(bar(4), 3), fmt(bar(10), 7)]).toEqual(['0.266', '0.0000892']);
    expect(body).toContain('the bar at 4 is the tallest, 0.266, and the bar at 10 is only 0.0000892');
    const product = xs.reduce((s, x) => s * bar(x), 1);
    expect(Math.round(product * 1e10)).toBe(3);
    expect(body).toContain('product is about $3 \\times 10^{-10}$');
    expect(f3(gaussianLogLikelihood(xs, 4, 1.5))).toBe('−21.929');
    expect(body).toContain('Added over the 8 measurements, $\\ln L = -21.929$ for this bell');
    expect(readout(framesOf('gaussian')[1].state, 'll')).toBe('−21.929');
  });

  it('finds the best μ at the mean, not the median or the midrange', () => {
    expect([mean(xs), median(xs), midrange(xs)]).toEqual([5.25, 4.75, 6.25]);
    expect(body).toContain('So the best $\\mu$ is the **mean**, 5.25. It is not the median, 4.75, nor halfway between the smallest and largest, 6.25');
    expect([f3(gaussianLogLikelihood(xs, 5.25, 1.5)), f3(gaussianLogLikelihood(xs, 4.75, 1.5))]).toEqual(['−19.151', '−19.595']);
    expect(body).toContain('$\\ln L$ is $-19.151$ at the mean and $-19.595$ at the median');
  });

  it('finds the best σ, dividing by n', () => {
    expect(squaredGaps(xs, 5.25)).toBe(38.5);
    expect(38.5 / 8).toBe(4.8125);
    expect([f3(best.sigma), f3(sampleSd(xs))]).toEqual(['2.194', '2.345']);
    expect(body).toContain('The squared gaps from 5.25 add up to 38.5');
    expect(body).toContain('Divide by $n = 8$, which gives 4.8125, then take the square root');
    // It is the standard deviation of the 8 measurements, each with chance 1/8, from random variables.
    expect(Math.sqrt(xs.reduce((s, x) => s + (x - 5.25) ** 2 / 8, 0))).toBeCloseTo(best.sigma, 12);
    expect(body).toContain('give each of the 8 measurements chance 1/8, and $\\hat{\\sigma}$ is the standard deviation');
    expect(body).toContain('= 2.194');
    expect(body).toContain('divides by $n - 1$ instead and gives 2.345');
    expect(f3(gaussianLogLikelihood(xs, best.mu, best.sigma))).toBe('−17.636');
    expect(body).toContain('The best bell, $\\mu = 5.25$ and $\\sigma = 2.194$, has $\\ln L = -17.636$');
    // The slips the visualiser offers beside it are other numbers.
    expect(f3(meanAbsGap(xs))).toBe('1.688');
    const frames = framesOf('gaussian');
    expect(readout(frames[3].state, 'sigma')).toBe('2.194');
  });
});

describe('maximum-likelihood quotes: a line under normal noise', () => {
  it('works out Σ r², ln L, the best shift and the least-squares line', () => {
    expect(inputOf('squared-error')).toEqual({ story: 'squared-error', ys: LINE_POINTS, left: 1, right: 7 });
    const rs = residuals(LINE_POINTS, 1, 7);
    const sse = squaredGaps(rs, 0);
    expect(f3(sse)).toBe('2.929');
    expect(f3(Math.log(Math.sqrt(2 * Math.PI)))).toBe('0.919');
    expect(f3(noiseLogLikelihood(rs, 1))).toBe('−6.978');
    expect(body).toContain('For the line drawn, they add up to 2.929. With $\\sigma = 1$, $\\ln(\\sigma\\sqrt{2\\pi}) = 0.919$, so $\\ln L = -6 \\times 0.919 - 2.929/2 = -6.978$');
    expect(fmt(mean(rs), 2)).toBe('0.33');
    expect(body).toContain('lowest when the line moves up by 0.33, the average residual');
    const { w, b } = leastSquares(LINE_POINTS);
    const mse = squaredGaps(LINE_POINTS.map((y, i) => y - (b + w * (i + 1))), 0) / LINE_POINTS.length;
    expect([f3(w), f3(mse)]).toEqual(['0.914', '0.367']);
    expect(body).toContain('here with slope 0.914 and mean squared error (the average of the squared residuals) 0.367');
    const frames = framesOf('squared-error');
    expect(readout(frames[2].state, 'll')).toBe('−6.978');
    expect(readout(frames[4].state, 'mse')).toBe('0.367');
  });
});

describe('maximum-likelihood quotes: the exercise', () => {
  it('quotes the far guess’s total and the narrow bell’s positive log density', () => {
    const tests = getExercise('log-likelihood')!.tests;
    const far = tests.find((t) => t.name.startsWith('a guess far'))!.input;
    expect(far).toEqual({ xs: [30, 32, 35, 37], mu: 0, sigma: 1 });
    expect(far.xs.reduce((s: number, x: number) => s * Math.exp(logDensity(x, 0, 1)), 1)).toBe(0);
    expect(f3(logLikelihood(far).total)).toBe('−2262.676');
    expect(body).toContain('One test puts the bell at 0 for data near 30, where each density is so tiny that multiplying them gives exactly 0; adding logs gives $-2262.676$');
    const narrow = tests.find((t) => t.name.startsWith('a narrow bell'))!.input;
    expect(narrow.sigma).toBe(0.25);
    expect(f3(logDensity(narrow.mu, narrow.mu, 0.25))).toBe('0.467');
    expect(body).toContain('a narrow bell, $\\sigma = 0.25$, which is taller than 1 at its centre: a density, unlike a chance, can be above 1, so its log density there is positive, 0.467');
  });
});

describe('maximum-likelihood: quiz and probes', () => {
  it('checks the probes', () => {
    // The first probe's L(0.68) and L(0.34), 4 times apart, are made up; the ln L values of the third keep their order.
    expect(0.004 / 0.001).toBe(4);
    expect([fmt(Math.log(0.00005), 1), fmt(Math.log(0.00002), 1)]).toEqual(['−9.9', '−10.8']);
    expect(body).toContain('about −9.9 against −10.8');
  });

  it('checks the quiz', () => {
    expect([16 / 25, 9 / 25]).toEqual([0.64, 0.36]);
    // Underflow: 0.42 multiplied 2,000 times (as a loop would) is 0, with more than 750 zeros; the logs add to −1735.
    let product = 1;
    for (let i = 0; i < 2000; i++) product *= 0.42;
    expect(product).toBe(0);
    expect(-Math.floor(2000 * Math.log10(0.42)) - 1).toBeGreaterThan(750);
    expect(fmt(2000 * Math.log(0.42), 0)).toBe('−1735');
    // Cross-entropy for 4 heads in 5: smallest at 0.8.
    expect([f3(crossEntropy(4, 5, 0.8)), f3(-coinLogLikelihood(4, 5, 0.8)), f3(crossEntropy(4, 5, 0.2))]).toEqual(['0.5', '2.502', '1.332']);
    for (const p of [0.5, 0.7, 0.79, 0.81, 0.9]) expect(crossEntropy(4, 5, p)).toBeGreaterThan(crossEntropy(4, 5, 0.8));
    expect([mean([11, 13, 14, 26]), median([11, 13, 14, 26]), midrange([11, 13, 14, 26])]).toEqual([16, 13.5, 18.5]);
    const xs = [12, 16, 20, 24];
    expect([mean(xs), squaredGaps(xs, 18), squaredGaps(xs, 18) / 4]).toEqual([18, 80, 20]);
    expect([fmt(Math.sqrt(20), 2), fmt(Math.sqrt(80 / 3), 2)]).toEqual(['4.47', '5.16']);
    expect(fitGaussian(xs).sigma).toBe(Math.sqrt(20));
  });

  it('keeps the probes’ and the quiz’s numbers out of the lesson and apart', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join(' ');
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '').slice(0, source.indexOf('<Quiz'));
    const lessonText = text.slice(0, text.indexOf('<Quiz'));
    // A number counts only whole: 0.3 is not in 0.35, nor 19 in −19.151.
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d|\\.\\d)`).test(where);
    for (const n of ['0.68', '0.34', '0.004', '0.001', '0.31', '0.12', '0.32', '0.52', '5.1', '3.9', '4.6', '0.00002', '0.00005']) {
      expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    for (const n of ['0.64', '0.36', '0.65', '0.0012', '0.35', '11', '13', '14', '26', '16', '13.5', '18.5', '12', '20', '24', '18', '4.47', '5.16', '19', '17', '0.42', '2,000', '1735', '750', '0.8', '0.500', '2.502', '1.332']) {
      expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
      expect(has(probes, n), `${n} is in the probes`).toBe(false);
    }
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(12);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('maximum-likelihood: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('maximum-likelihood', source);
    expect(mistakes.map((m) => m.id)).toEqual(['likelihood-is-probability', 'log-moves-peak']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('maximum-likelihood', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(8);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('maximum-likelihood', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'see', 'see', 'do', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3000);
    expect(total).toBeLessThanOrEqual(4400);
    expect(source).not.toContain('—');
  });
});

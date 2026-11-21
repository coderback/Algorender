// B5 of the math and ML path, "Densities and the normal distribution": every
// number the lesson quotes is measured here from the code that draws it (the
// distributions visualiser and the normal-cdf exercise), and must appear in
// the lesson exactly as written. The embeds are checked too: each preset
// exists, the prediction challenge asks at least its goal, and the lesson
// embeds its one exercise, which practises this lesson's visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BAR_WIDTHS,
  binChances,
  DENSITIES,
  distributions,
  drawSamples,
  histogram,
  midpointSum,
  MIX,
  normalCdf,
  normalPdf,
  SAMPLE_SIZES,
  SHARES,
  type DistInput,
} from '@/algorithms/probability/distributions';
import { DEFAULT_SEED } from '@/components/explorer/source';
import { getExercise } from '@/content/exercises';
import { FAR, numericCdf, type CurveInput } from '@/content/exercises/distributions';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';

const source = readFileSync(fileURLToPath(new URL('./continuous-distributions.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = distributions.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`distributions has no example ${preset}`);
  // Lessons don't pass a seed, so the explorer uses its default.
  return ex.make({ seed: DEFAULT_SEED, size: 0 }) as DistInput;
};
const framesOf = (preset: string) => traceOf(distributions, inputOf(preset)).frames;
const wait = DENSITIES.wait;

describe('continuous-distributions embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['bars', 'interval', 'cdf', 'tall', 'normal', 'samples']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['cdf', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('distributions');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['normal-cdf']);
    expect(getExercise('normal-cdf')?.visualiser).toBe('distributions');
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: the area to the left'), body.indexOf('<PredictChallenge'));
    const input = inputOf('cdf');
    if (input.story !== 'cdf') throw new Error('not a cdf story');
    const d = DENSITIES[input.density];
    for (const v of [fmt(d.f(input.x), 3), fmt(1 - d.F(input.x), 3), 'never fall', 'tallest', 'levels off', 'slope of $F$ is']) expect(before).not.toContain(v);
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('continuous-distributions quotes: from bars to a curve', () => {
  it('waits 2 minutes on average', () => {
    expect(midpointSum((x) => x * wait.f(x), 0, 80, 80000)).toBeCloseTo(2, 6);
    expect(body).toContain('buses come at random moments, every 2 minutes on average');
  });

  it('halves the bins, then divides by their widths', () => {
    const [p1, p2, p3] = BAR_WIDTHS.map((w) => binChances(wait, w, 0, 10));
    expect([...BAR_WIDTHS]).toEqual([1, 0.5, 0.25]);
    const total = p1.reduce((s, p) => s + p, 0);
    expect([fmt(p1[0], 3), fmt(total, 3), fmt(1 - total, 3)]).toEqual(['0.393', '0.993', '0.007']);
    expect(body).toContain('With 1-minute bins, the first bar, $P(0 \\le X < 1)$, is 0.393. The bars up to 10 minutes add up to 0.993; the other 0.007 is waits longer than 10 minutes.');
    expect([fmt(p2[0], 3), fmt(p2[1], 3)]).toEqual(['0.221', '0.172']);
    expect(p2[0]).toBeGreaterThan(p2[1]);
    expect(body).toContain("The first minute's 0.393 splits into 0.221 for the first half-minute and 0.172 for the second");
    expect(fmt(p3[0], 4)).toBe('0.1175');
    expect(body).toContain('Halve the bins again and the first bar is 0.1175.');
    expect(fmt(p3[0] / 0.25, 3)).toBe('0.47');
    expect(0.47 * 0.25).toBeCloseTo(0.1175, 12);
    expect(p3.length).toBe(40);
    expect(fmt(p3.reduce((s, p) => s + p, 0), 3)).toBe('0.993');
    expect(body).toContain("becomes $0.1175 \\div 0.25 = 0.47$. A bar's area, height × width, is then its chance again ($0.47 \\times 0.25 = 0.1175$), and the areas of all 40 bars add up to 0.993, as before.");
    expect([fmt(p1[0] / 1, 3), fmt(p2[0] / 0.5, 3), fmt(p3[0] / 0.25, 3)]).toEqual(['0.393', '0.442', '0.47']);
    expect(body).toContain('The first bar is 0.393 tall with 1-minute bins, 0.442 with half-minute bins and 0.47 with quarter-minute bins.');
    expect(wait.f(0)).toBe(0.5);
    expect(body).toContain('at $x = 0$ it is $\\tfrac{1}{2} e^0 = 0.5$');
    // The frames narrate the same numbers.
    const frames = framesOf('bars');
    expect(frames[1].note).toContain('0.393 becomes 0.221 and 0.172');
    expect(frames[3].note).toContain('0.47 × 0.25 = 0.1175');
  });
});

describe('continuous-distributions quotes: a chance is an area', () => {
  const input = inputOf('interval');
  if (input.story !== 'interval') throw new Error('not an interval story');
  const { a, b } = input;
  const P = wait.F(b) - wait.F(a);

  it('estimates the area from 1 to 3 with rectangles, then with F', () => {
    expect([input.density, a, b]).toEqual(['wait', 1, 3]);
    expect(fmt(wait.f(2), 3)).toBe('0.184');
    expect(wait.f(2)).toBeCloseTo(0.5 * Math.exp(-1), 15);
    expect(fmt(0.184 * 2, 3)).toBe('0.368');
    expect(fmt(wait.f(2) * 2, 3)).toBe('0.368');
    expect(body).toContain('$f(2) = \\tfrac{1}{2} e^{-1} = 0.184$, has area $0.184 \\times 2 = 0.368$. Ten thinner rectangles give 0.3832, and the exact area, where thinner and thinner rectangles settle, is 0.3834.');
    expect(fmt(midpointSum(wait.f, a, b, 10), 4)).toBe('0.3832');
    expect(fmt(P, 4)).toBe('0.3834');
    const frames = framesOf('interval');
    expect(frames[1].note).toContain('Ten thinner ones give 0.3832');
    expect(frames[1].note).toContain('P(a ≤ X ≤ b) = 0.3834');
    // The area to the left is 1 − e^(−x/2): its thin rectangles agree.
    for (const x of [0.5, 1, 3, 7]) expect(midpointSum(wait.f, 0, x, 20000)).toBeCloseTo(1 - Math.exp(-x / 2), 8);
    // It is 0 at 0, and its slope is the curve itself.
    expect(wait.F(0)).toBe(0);
    for (const x of [0.5, 1, 3, 7]) expect((wait.F(x + 1e-6) - wait.F(x - 1e-6)) / 2e-6).toBeCloseTo(0.5 * Math.exp(-x / 2), 6);
    expect(body).toContain('It is 0 at $x = 0$, and its slope is $\\tfrac{1}{2} e^{-x/2}$, the curve itself');
    expect([fmt(wait.F(1), 4), fmt(wait.F(3), 4), fmt(0.7769 - 0.3935, 4)]).toEqual(['0.3935', '0.7769', '0.3834']);
    expect(body).toContain('It is 0.3935 at 1 and 0.7769 at 3, and the area between is the difference: $0.7769 - 0.3935 = 0.3834$');
  });

  it('gives a single value no area, and the outside the rest', () => {
    expect(fmt(wait.f(1), 3)).toBe('0.303');
    expect(body).toContain('$P(X = 1) = 0$, even though the curve there is $f(1) = 0.303$ tall');
    expect(fmt(1 - P, 4)).toBe('0.6166');
    expect(body).toContain('$1 - 0.3834 = 0.6166$');
    expect(framesOf('interval')[4].note).toContain('together 0.6166');
  });
});

describe('continuous-distributions quotes: the CDF of a call’s length', () => {
  const input = inputOf('cdf');
  if (input.story !== 'cdf') throw new Error('not a cdf story');
  const d = DENSITIES[input.density];

  it('describes the two humps', () => {
    expect(input.density).toBe('mix');
    expect([MIX.short.mu, MIX.long.mu]).toEqual([2.5, 6.5]);
    expect(MIX.share).toBeGreaterThan(0.5);
    expect(body).toContain('Most calls are quick chats of about 2.5 minutes and the rest are longer calls of about 6.5');
    expect(input.x).toBe(4.5);
    expect(body).toContain('how steep it is at $x = 4.5$, and the chance of a call longer than 4.5 minutes');
  });

  it('measures F along the way, its slope at 4.5 and the area to the right', () => {
    expect(d.stops.map((s) => fmt(s))).toEqual(['1.5', '2.5', '4.5']);
    expect(d.stops.map((s) => fmt(d.F(s), 3))).toEqual(['0.063', '0.3', '0.615']);
    expect(body).toContain('At 1.5 minutes the area is only 0.063; by 2.5 it is 0.3, and by 4.5 it is 0.615.');
    expect(fmt(d.f(4.5), 3)).toBe('0.046');
    expect((d.F(4.5 + 1e-5) - d.F(4.5 - 1e-5)) / 2e-5).toBeCloseTo(d.f(4.5), 6);
    expect(body).toContain('its slope there is $f(4.5) = 0.046$');
    expect(fmt(1 - d.F(4.5), 3)).toBe('0.385');
    expect(body).toContain('$1 - F(4.5) = 1 - 0.615 = 0.385$');
    // The density is low between the humps, where F barely moves.
    expect(d.f(4.5)).toBeLessThan(d.f(2.5) / 5);
    expect(d.f(4.5)).toBeLessThan(d.f(6.5) / 2);
    const frames = framesOf('cdf');
    expect(frames[4].note).toContain('f(4.5) = 0.046');
    expect(frames[5].note).toContain('1 − F(x) = 0.385');
  });
});

describe('continuous-distributions quotes: a density above 1', () => {
  it('a reaction time from 0 to 0.5 seconds is 2 tall, and 0.1 to 0.3 has chance 0.4', () => {
    const input = inputOf('tall');
    if (input.story !== 'interval') throw new Error('not an interval story');
    const d = DENSITIES.narrow;
    expect([input.density, input.a, input.b]).toEqual(['narrow', 0.1, 0.3]);
    expect([d.f(0.25), d.F(0.5) - d.F(0), d.F(0)]).toEqual([2, 1, 0]);
    expect(fmt(d.F(0.3) - d.F(0.1), 6)).toBe('0.4');
    expect(body).toContain('a reaction time that is equally likely to be anywhere from 0 to 0.5 seconds: its density is a flat block 0.5 wide, so to have area 1 it must be 2 tall. A reaction time between 0.1 and 0.3 seconds then has chance $2 \\times 0.2 = 0.4$');
  });
});

describe('continuous-distributions quotes: the bell curve', () => {
  it('peaks at 0.399, halves to 0.199, and holds 0.6827, 0.9545 and 0.9973 within 1, 2 and 3σ', () => {
    const input = inputOf('normal');
    if (input.story !== 'normal') throw new Error('not a normal story');
    expect([input.mu, input.sigma]).toEqual([0, 1]);
    expect(fmt(normalPdf(0), 3)).toBe('0.399');
    expect(body).toContain('With $\\sigma = 1$ it is $1/\\sqrt{2\\pi} = 0.399$, the height of the peak.');
    expect(normalPdf(1) / normalPdf(0)).toBeCloseTo(Math.exp(-0.5), 15);
    expect(fmt(normalPdf(0, 0, 2), 3)).toBe('0.199');
    expect(body).toContain('so the peak halves, from 0.399 to 0.199');
    expect(SHARES.map((s) => fmt(s, 4))).toEqual(['0.6827', '0.9545', '0.9973']);
    for (const [k, s] of [['', '0.6827'], ['2', '0.9545'], ['3', '0.9973']]) expect(body).toContain(`between $\\mu - ${k}\\sigma$ and $\\mu + ${k}\\sigma$: ${s}`);
    expect(fmt(1 - SHARES[2], 4)).toBe('0.0027');
    expect(body).toContain('so 0.0027 of the area lies beyond three $\\sigma$');
    // The exam: μ = 60, σ = 10.
    for (const [k, lo, hi, share] of [[1, 50, 70, 0.68], [2, 40, 80, 0.95]]) {
      expect([60 - k * 10, 60 + k * 10]).toEqual([lo, hi]);
      expect(normalCdf(hi, 60, 10) - normalCdf(lo, 60, 10)).toBeCloseTo(share, 1);
    }
    expect(body).toContain('$\\mu = 60$ and $\\sigma = 10$, about 68% of marks are between 50 and 70, and about 95% between 40 and 80');
    const frames = framesOf('normal');
    expect(frames[1].note).toContain('from 0.399 to 0.199');
  });
});

describe('continuous-distributions quotes: the exercise', () => {
  const exercise = getExercise('normal-cdf')!;
  it('starts at μ − 8σ, uses 40 rectangles in the first example and up to 1,000 in the tests, with one curve 1.596 tall', () => {
    expect(FAR).toBe(8);
    // The area left of μ − 8σ, by thin rectangles from far further left.
    const tail = midpointSum((x) => normalPdf(x), -40, -8, 64000);
    expect(tail).toBeLessThan(1e-15);
    expect(tail).toBeGreaterThan(1e-16);
    expect(body).toContain('Far left means $\\mu - 8\\sigma$, where the area still further left is below $10^{-15}$');
    expect((exercise.examples[0].input as CurveInput).n).toBe(40);
    expect(Math.max(...exercise.tests.map((t) => (t.input as CurveInput).n))).toBe(1000);
    expect(body).toContain('The first example uses only 40 rectangles; the tests use up to 1,000.');
    const narrow = exercise.tests.map((t) => t.input as CurveInput).find((t) => t.sigma === 0.25)!;
    expect(fmt(normalPdf(narrow.mu, narrow.mu, narrow.sigma), 3)).toBe('1.596');
    expect(body).toContain('One test has $\\sigma = 0.25$, so its curve peaks at 1.596, taller than 1.');
    // 40 rectangles already land within a thousandth of Φ.
    for (const x of [-2, -1, 0, 1, 2]) expect(Math.abs(numericCdf(x, 0, 1, 40) - normalCdf(x))).toBeLessThan(1e-3);
  });
});

describe('continuous-distributions quotes: samples', () => {
  it('draws 10, 100, 1,000 and 10,000 calls from the default seed', () => {
    const input = inputOf('samples');
    if (input.story !== 'samples') throw new Error('not a samples story');
    const d = DENSITIES[input.density];
    expect(input).toEqual({ story: 'samples', density: 'mix', seed: DEFAULT_SEED });
    expect([...SAMPLE_SIZES]).toEqual([10, 100, 1000, 10000]);
    const samples = drawSamples(d, input.seed, 10000);
    const hists = SAMPLE_SIZES.map((n) => histogram(d, samples, n));
    expect([...d.ref]).toEqual([2, 4]);
    expect(hists.map((h) => fmt(h.share, 3))).toEqual(['0.2', '0.33', '0.425', '0.432']);
    expect(fmt(d.F(4) - d.F(2), 3)).toBe('0.43');
    expect(body).toContain('the share of calls between 2 and 4 minutes is 0.2, far from the area under the curve there, 0.43. With 100 calls the share is 0.33, with 1,000 it is 0.425, and with 10,000 it is 0.432.');
    expect([fmt(hists[0].gap, 3), fmt(hists[3].gap, 3)]).toEqual(['0.471', '0.012']);
    expect(body).toContain('The biggest gap between a bar and the curve falls from 0.471 to 0.012.');
    const frames = framesOf('samples');
    expect(frames[3].note).toContain('the biggest gap is 0.012');
  });
});

describe('continuous-distributions: quiz and probes', () => {
  const quiz = source.slice(source.indexOf('<Quiz'));
  const text = source.slice(0, source.indexOf('<Quiz')).replace(/probes=\{\[[\s\S]*?\]\}/g, '');
  const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join('\n');

  it('checks the quiz', () => {
    expect(fmt(0.14 * 0.1, 6)).toBe('0.014');
    expect(1 / 0.125).toBe(8);
    expect(fmt(0.83 - 0.35, 6)).toBe('0.48');
    expect(fmt(0.83 + 0.35, 6)).toBe('1.18');
    expect([100 - 2 * 15, 100 + 2 * 15]).toEqual([70, 130]);
    expect(normalCdf(130, 100, 15) - normalCdf(70, 100, 15)).toBeCloseTo(SHARES[1], 9);
    expect(fmt(normalPdf(0, 0, 5), 2)).toBe('0.08');
    expect(fmt(1 / Math.sqrt(2 * Math.PI), 1)).toBe('0.4');
    expect(fmt(1 / (25 * Math.sqrt(2 * Math.PI)), 3)).toBe('0.016');
    expect(quiz).toContain('1/(5 × 2.507) is about 0.08. Leaving out σ gives 0.4, and σ² in place of σ gives 0.016.');
    expect(fmt(Math.sqrt(2 * Math.PI), 3)).toBe('2.507');
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect(1 / 0.05).toBeCloseTo(20, 12);
    expect(fmt(normalPdf(0, 0, 0.07), 1)).toBe('5.7');
    expect(0.45 / 0.15).toBeCloseTo(3, 12);
    for (const n of ['1.7', '0.9', '0.15', '0.45', '11.05', '20', '0.05', '0.07', '5.7']) {
      expect(probes, `${n} is in a probe`).toContain(n);
      expect(text, `${n} is in the text`).not.toMatch(new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`));
      expect(quiz, `${n} is in the quiz`).not.toMatch(new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`));
    }
    // The quiz's own numbers stay out of the text and the probes.
    for (const n of ['0.14', '7.1', '0.014', '3.125', '1.2', '0.35', '3.4', '0.83', '0.48', '1.18', '130', '0.016', '0.62', '0.58', '0.9999']) {
      expect(quiz, `${n} is in the quiz`).toContain(n);
      expect(text, `${n} is in the text`).not.toMatch(new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`));
      expect(probes, `${n} is in a probe`).not.toMatch(new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`));
    }
  });
});

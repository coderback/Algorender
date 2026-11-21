// B5 of the math and ML path, "Random variables, expectation and variance":
// every number the lesson quotes is measured here from the code that draws it
// (the random-variables visualiser and the expectation-variance exercise), and
// must appear in the lesson exactly as written. The embeds are checked too:
// each preset exists, the prediction challenge asks at least its goal, the
// lesson embeds its one exercise, which practises this lesson's visualiser,
// and the right answers are spread over the choices.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  binomialPmf,
  choose,
  distributionOf,
  expectation,
  FAIR,
  meanAbsGap,
  probsOf,
  randomVariables,
  sampleStats,
  simulateBinomial,
  sumWeights,
  valuesOf,
  variance,
  type RvInput,
} from '@/algorithms/probability/random-variables';
import { DEFAULT_SEED } from '@/components/explorer/source';
import { getExercise } from '@/content/exercises';
import { moments } from '@/content/exercises/random-variables';
import { fmt } from '@/viz/plot/geometry';
import { planeOf, readout, traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./random-variables.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const f3 = (v: number) => fmt(v, 3);

const inputOf = (preset: string) => {
  const ex = randomVariables.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`random-variables has no example ${preset}`);
  return ex.make({ seed: DEFAULT_SEED, size: 0 }) as RvInput;
};
const framesOf = (preset: string) => traceOf(randomVariables, inputOf(preset)).frames;

describe('random-variables embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['dice-sum', 'tickets', 'dice-max', 'spread', 'two-dice', 'coins']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['dice-max', 5]]);
    // The sums of two dice were counted in probability-basics: this lesson opens them already counted, on the last frame.
    expect(found[0].step).toBe(framesOf('dice-sum').length - 1);
    for (const e of found) {
      expect(e.slug).toBe('random-variables');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['expectation-variance']);
    expect(getExercise('expectation-variance')?.visualiser).toBe('random-variables');
    expect(body).toContain('(/code/binomial-simulation)');
    expect(getExercise('binomial-simulation')?.visualiser).toBe('random-variables');
  });

  it('spreads its right answers over the choices (quizzes keep the written order)', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: the larger'), body.indexOf('<PredictChallenge'));
    for (const v of ['11/36', '2m', '1, 3, 5', ' L ', 'an L', '9/36', '161']) expect(before).not.toContain(v);
    // Nor does the see section: the larger die is only named there, never counted.
    const see = body.slice(body.indexOf('<Section step="see"'), body.indexOf('<Section step="predict"'));
    expect(see).not.toMatch(/larger/);
  });

  it('names the later lessons in bold and links only earlier ones', () => {
    expect(body).toContain('**the law of large numbers and Monte Carlo**');
    const links = [...body.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual(['probability-basics', 'sums-notation', 'counting-combinatorics']);
  });
});

describe('random-variables quotes: a rule from outcomes to numbers', () => {
  it('counts the sums of two dice', () => {
    const dist = distributionOf('sum');
    expect(dist.map((d) => d.count).join(', ')).toBe('1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1');
    expect(body).toContain('The counts, from a sum of 2 up to 12, are 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1.');
    expect(body).toContain('the heights add up to 36/36 = 1');
    expect(framesOf('dice-sum').at(-1)!.note).toContain('the most likely value is 7, with 6 of the 36 outcomes');
    expect([2 + 5, 6 + 6]).toEqual([7, 12]);
  });

  it('pays the fair’s game: −1/6 a game', () => {
    const doubles = [1, 2, 3, 4, 5, 6].length;
    expect([doubles, 36 - doubles]).toEqual([6, 30]);
    expect(body).toContain('$W = 4$ on the 6 doubles and $W = -1$ on the other 30 outcomes, so $P(W = 4) = 6/36$ and $P(W = -1) = 30/36$');
    const E = expectation([4, -1], [6 / 36, 30 / 36]);
    expect(E).toBeCloseTo(-1 / 6, 12);
    expect([4 * 6, -1 * 30]).toEqual([24, -30]);
    expect(body).toContain('E[W] &= 4 \\times \\tfrac{6}{36} + (-1) \\times \\tfrac{30}{36}');
    expect(body).toContain('&= \\tfrac{24 - 30}{36} = -\\tfrac{1}{6}');
    expect(fmt(E)).toBe('−0.17');
    expect(body).toContain('That is about −0.17: on average you lose about 17p a game, or about £60 over 360 games.');
    expect(360 * (1 / 6)).toBe(60);
  });

  it('balances the bag of tickets at 2.2', () => {
    const input = inputOf('tickets');
    if (input.story !== 'balance') throw new Error('not the balance story');
    expect(input.counts).toEqual([4, 3, 1, 1, 1]);
    expect(body).toContain('a bag holds 10 tickets: four marked 1, three marked 2, and one each marked 3, 4 and 5');
    const xs = valuesOf(input.counts);
    const ps = probsOf(input.counts);
    expect(ps).toEqual([0.4, 0.3, 0.1, 0.1, 0.1]);
    expect(body).toContain('the 1s come up about 40% of the time, the 2s about 30%, and each of the others about 10%');
    expect(xs.map((x, i) => fmt(x * ps[i], 3))).toEqual(['0.4', '0.6', '0.3', '0.4', '0.5']);
    const E = expectation(xs, ps);
    expect(f3(E)).toBe('2.2');
    expect(body).toContain('&= 0.4 + 0.6 + 0.3 + 0.4 + 0.5 = 2.2');
    const frames = framesOf('tickets');
    expect(readout(frames[5].state, 'sum')).toBe('2.2');
    // The pulls from either side, the plain middle, the tallest bar.
    expect(readout(frames[6].state, 'left')).toBe('0.54');
    expect(readout(frames[6].state, 'right')).toBe('0.54');
    expect(f3(meanAbsGap(xs, ps) / 2)).toBe('0.54');
    expect(body).toContain('the pulls from the left and from the right are both 0.54');
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBe(3);
    expect(body).toContain('It is **not** the middle of the values, which would be 3.');
    expect(input.counts[0] / input.counts[4]).toBe(4);
    expect(body).toContain('a 1 is four times as likely as a 5. Nor is it under the tallest bar, at 1.');
    // One more ticket marked 5.
    const more = [...input.counts.slice(0, 4), input.counts[4] + 1];
    expect(more.reduce((s, c) => s + c, 0)).toBe(11);
    expect(expectation(xs, more)).toBe(27);
    expect(f3(27 / 11)).toBe('2.455');
    expect(readout(frames[7].state, 'mean')).toBe('2.455');
    expect(body).toContain('Now 11 tickets carry numbers adding up to 27, so $E[X] = 27/11 = 2.455$');
  });

  it('counts the larger of two dice, and balances it at 161/36', () => {
    const dist = distributionOf('max');
    expect(dist.map((d) => d.count)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(dist.every((d) => d.count === 2 * d.x - 1)).toBe(true);
    expect(body).toContain('The counts were 1, 3, 5, 7, 9 and 11.');
    expect(body).toContain('so $2m - 1$ cells');
    expect(body).toContain('So the most likely value is 6, at 11/36.');
    const total = dist.reduce((s, d) => s + d.x * d.count, 0);
    expect(total).toBe(161);
    expect(body).toContain('E[X] &= (1 \\times 1 + 2 \\times 3 + 3 \\times 5 \\\\');
    expect(body).toContain('&\\quad + 4 \\times 7 + 5 \\times 9 + 6 \\times 11) / 36 \\\\ &= 161/36');
    const E = expectation(dist.map((d) => d.x), dist.map((d) => d.count / 36));
    expect(fmt(E)).toBe('4.47');
    expect(body).toContain('which is about 4.47, left of the tall bar at 6');
    expect(body).toContain('the balance point is about 4.47');
    // The slips the challenge offers: m + m and m × m.
    expect(framesOf('dice-max')[3].checkpoint!.choices).toEqual(['4', '7', '8', '16']);
  });
});

describe('random-variables quotes: spread, sums and the binomial', () => {
  it('measures the two bags’ variances and standard deviations', () => {
    const input = inputOf('spread');
    if (input.story !== 'spread') throw new Error('not the spread story');
    expect(input).toEqual({ story: 'spread', a: [1, 2, 4, 2, 1], b: [3, 1, 2, 1, 3] });
    expect(body).toContain('Bag A (one 1, two 2s, four 3s, two 4s and one 5) balances at $\\mu = 3$');
    expect(body).toContain('Bag B (three 1s, one 2, two 3s, one 4 and three 5s) also balances at 3');
    const xs = valuesOf(input.a);
    const [pa, pb] = [probsOf(input.a), probsOf(input.b)];
    expect([expectation(xs, pa), expectation(xs, pb)]).toEqual([3, 3]);
    const terms = xs.map((x, i) => f3(pa[i] * (x - 3) * (x - 3)));
    expect(terms.join(', ')).toBe('0.4, 0.2, 0, 0.2, 0.4');
    expect(body).toContain('Its terms are 0.4, 0.2, 0, 0.2 and 0.4');
    const [va, vb] = [variance(xs, pa), variance(xs, pb)];
    expect([f3(va), f3(vb)]).toEqual(['1.2', '2.6']);
    expect(body).toContain("So bag A's variance is 1.2.");
    expect(body).toContain('but its variance is 2.6: six of its ten tickets sit at the far ends');
    expect(input.b[0] + input.b[4]).toBe(6);
    const last = framesOf('spread').at(-1)!.state;
    expect([readout(last, 'varA'), readout(last, 'varB'), readout(last, 'sdA'), readout(last, 'sdB')]).toEqual(['1.2', '2.6', '1.095', '1.612']);
    expect(body).toContain('1.095 for bag A and 1.612 for bag B');
    // The shortcut E[X²] − μ².
    expect(xs.map((x, i) => x * x * input.a[i])).toEqual([1, 8, 36, 32, 25]);
    const ex2 = expectation(xs.map((x) => x * x), pa);
    expect(f3(ex2)).toBe('10.2');
    expect(f3(ex2 - 9)).toBe('1.2');
    expect(body).toContain('$E[X^2] = (1 + 8 + 36 + 32 + 25)/10 = 10.2$, and $10.2 - 9 = 1.2$');
  });

  it('adds two dice: expectations always, variances because they are independent', () => {
    const faces = [1, 2, 3, 4, 5, 6];
    const p = probsOf(FAIR);
    expect(expectation(faces, p)).toBe(3.5);
    expect(variance(faces, p)).toBeCloseTo(35 / 12, 14);
    expect(f3(35 / 12)).toBe('2.917');
    expect(body).toContain('Each fair die balances at 3.5 and has variance $35/12$, about 2.917.');
    const sw = sumWeights(FAIR, FAIR);
    expect(sw).toEqual(distributionOf('sum').map((d) => d.count));
    const sums = sw.map((_, i) => i + 2);
    const vs = variance(sums, probsOf(sw));
    expect(expectation(sums, probsOf(sw))).toBeCloseTo(7, 12);
    expect(body).toContain('Its bars balance at 7, which is 3.5 + 3.5.');
    // Written as fractions: 2.917 + 2.917 would be 5.834, and 4 × 2.917 would be 11.668.
    expect(vs).toBeCloseTo(35 / 6, 12);
    expect([f3(vs), f3(Math.sqrt(vs)), f3(Math.sqrt(35 / 12)), f3(2 * Number(f3(Math.sqrt(35 / 12)))), f3(4 * (35 / 12))]).toEqual(['5.833', '2.415', '1.708', '3.416', '11.667']);
    expect([35 / 12 + 35 / 12, 4 * (35 / 12)].map((v) => fmt(v, 9))).toEqual([fmt(35 / 6, 9), fmt(35 / 3, 9)]);
    expect(body).toContain('$\\text{Var}(X + Y) = 35/12 + 35/12 = 35/6$, about 5.833');
    expect(body).toContain("$\\sigma = \\sqrt{35/6}$, about 2.415, less than the two dice's own $\\sigma$s added, $1.708 + 1.708 = 3.416$");
    expect(body).toContain('$2X$ also balances at 7, twice 3.5');
    expect(body).toContain('$\\text{Var}(2X) = 4 \\times 35/12 = 35/3$, about 11.667, twice the variance of $X + Y$');
    expect(4 * (35 / 12)).toBeCloseTo(2 * (35 / 6), 12);
    // Scaling by a: E[aX] = a·E[X] and Var(aX) = a²·Var(X), halving included.
    for (const a of [2, 3, 0.5]) {
      expect(expectation(faces.map((x) => a * x), p)).toBeCloseTo(a * 3.5, 12);
      expect(variance(faces.map((x) => a * x), p)).toBeCloseTo(a * a * (35 / 12), 12);
    }
    expect(body).toContain('halving $X$ quarters its variance, since $(1/2)^2 = 1/4$');
    const frames = framesOf('two-dice');
    expect(readout(frames[1].state, 'es')).toBe('7');
    expect(readout(frames[2].state, 'vs')).toBe('5.833');
    expect(readout(frames[3].state, 'v2')).toBe('11.667');
  });

  it('builds six fair coins’ binomial and simulates it from the default seed', () => {
    const input = inputOf('coins');
    if (input.story !== 'binomial') throw new Error('not the binomial story');
    expect([input.n, input.p, input.seed]).toEqual([6, 0.5, 7]);
    expect([choose(6, 3), 2 ** 6]).toEqual([20, 64]);
    const pmf = binomialPmf(6, 0.5);
    expect(pmf[3]).toBe(20 / 64);
    expect(f3(pmf[3])).toBe('0.313');
    expect(body).toContain('With 6 fair coins, 20 of the 64 paths have 3 heads, so $P(K = 3) = 20/64$, about 0.313.');
    const bars = planeOf(framesOf('coins')[7].state, 'bars').shapes.flatMap((s) => (s.kind === 'bars' ? s.bars : []));
    expect(bars.find((b) => b.id === 'k3')?.label).toBe('0.313');
    expect([6 * 0.5, 6 * 0.5 * 0.5, fmt(Math.sqrt(1.5))]).toEqual([3, 1.5, '1.22']);
    expect(body).toContain('For the 6 fair coins that is $E[K] = 3$ and $\\text{Var}(K) = 1.5$, so $\\sigma = 1.22$.');
    // One flip: mean p, and variance p(1 − p)² + (1 − p)p² = p(1 − p), 0.25 for a fair coin.
    for (const q of [0.1, 0.3, 0.5, 0.7]) {
      expect(expectation([1, 0], [q, 1 - q])).toBeCloseTo(q, 12);
      expect(variance([1, 0], [q, 1 - q])).toBeCloseTo(q * (1 - q) ** 2 + (1 - q) * q ** 2, 12);
      expect(variance([1, 0], [q, 1 - q])).toBeCloseTo(q * (1 - q), 12);
    }
    expect(variance([1, 0], [0.5, 0.5])).toBe(0.25);
    expect(body).toContain('For a fair coin that is $0.5 \\times 0.5 = 0.25$.');
    const runs = simulateBinomial(6, 0.5, 1000, DEFAULT_SEED);
    const avg = [10, 100, 1000].map((R) => fmt(sampleStats(runs.slice(0, R)).mean, 3));
    expect(avg).toEqual(['3.4', '2.7', '3.018']);
    expect(fmt(sampleStats(runs).variance, 3)).toBe('1.552');
    expect(body).toContain('The average number of heads was 3.4 after 10 runs of six flips, 2.7 after 100 and 3.018 after 1000');
    expect(body).toContain('the runs’ average squared gap from their average was 1.552, against 1.5'.replace('’', "'"));
    const frames = framesOf('coins');
    expect([10, 11, 12].map((i) => readout(frames[i].state, 'avg'))).toEqual(avg);
    expect(readout(frames[12].state, 'var')).toBe('1.552');
  });

  it('quotes the exercise’s loaded die', () => {
    const loaded = { values: [1, 2, 3, 4, 5, 6], probs: [0.25, 0.125, 0.125, 0.125, 0.125, 0.25] };
    expect(getExercise('expectation-variance')!.tests.some((t) => JSON.stringify(t.input) === JSON.stringify(loaded))).toBe(true);
    expect(moments(loaded)).toMatchObject({ mean: 3.5, variance: 3.75 });
    expect(body).toContain('One test is a die loaded towards 1 and 6, each with probability 0.25 and the other faces 0.125: it balances at 3.5 like a fair die, but its variance is 3.75, against a fair die’s 2.917.'.replace('’', "'"));
  });
});

describe('random-variables: quiz and probes', () => {
  it('checks the quiz', () => {
    expect(expectation([10, 0], [0.2, 0.8])).toBe(2);
    const third = [1 / 3, 1 / 3, 1 / 3];
    expect([variance([1, 2, 3], third), variance([0, 2, 4], third)].map((v) => fmt(v, 6))).toEqual([fmt(2 / 3, 6), fmt(8 / 3, 6)]);
    expect([expectation([1, 2, 3], third), expectation([0, 2, 4], third)].map((v) => fmt(v, 9))).toEqual(['2', '2']);
    expect(variance([0, 6], [0.5, 0.5])).toBe(9);
    expect(expectation([0, 36], [0.5, 0.5])).toBe(18);
    expect(fmt(4 * 1.4, 9)).toBe('5.6');
    expect(fmt(1.4 + 1.4, 9)).toBe('2.8');
    const k = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const pmf = binomialPmf(10, 0.2);
    expect(expectation(k, pmf)).toBeCloseTo(2, 12);
    expect(variance(k, pmf)).toBeCloseTo(1.6, 12);
    expect([10 * 0.5, 10 * 0.5 * 0.5]).toEqual([5, 2.5]);
    // Y = 9 − X: X + Y is 9 every time.
    const spinner = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(expectation(spinner, spinner.map(() => 1 / 8))).toBe(4.5);
    expect(spinner.every((x) => x + (9 - x) === 9)).toBe(true);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.slice(0, source.indexOf('<Quiz')).replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join(' ');
    expect(expectation([0, 16], [0.75, 0.25])).toBe(4);
    expect(expectation([45, 0], [1 / 15, 14 / 15])).toBeCloseTo(3, 12);
    expect([variance([11, 13], [0.5, 0.5]), variance([2, 22], [0.5, 0.5])]).toEqual([1, 100]);
    expect([expectation([-9, 15], [0.5, 0.5]), variance([-9, 15], [0.5, 0.5])]).toEqual([3, 144]);
    expect([9 * 7, 3 * 7]).toEqual([63, 21]);
    expect([fmt(0.9 + 0.9), fmt(4 * 0.9)]).toEqual(['1.8', '3.6']);
    // A number on its own: 16 inside 161, or 13 inside 0.313, doesn't count.
    const alone = (n: string) => new RegExp(`(?<![\\d.])${n.replace(/[.$/]/g, (c) => `\\${c}`)}(?![\\d])`);
    expect(text).toMatch(alone('161'));
    expect(probes).toMatch(alone('1/15'));
    expect(text).not.toMatch(alone('3.1'));
    for (const n of ['0.75', '16', '£45', '1/15', '13', '22', '144', '−9%', '15%', '63', '21', '0.9', '1.8', '3.6']) {
      expect(text, `${n} is in the text`).not.toMatch(alone(n));
      expect(quiz, `${n} is in the quiz`).not.toMatch(alone(n));
    }
    // And the quiz's own numbers stay out of the probes and the worked examples.
    for (const n of ['£10', '8/3', '2/3', '1.4', '5.6', '2.8', '1.6', '4.5', '1 to 8']) {
      expect(probes, `${n} is in a probe`).not.toMatch(alone(n));
      expect(text, `${n} is in the text`).not.toMatch(alone(n));
    }
  });
});

// The lesson is listed in index.ts by the lead, so assessment.test.ts doesn't read it yet: the same rules, here.
describe('random-variables: mistakes, quiz and explain-back, read as the app reads them', () => {
  it('names three mistakes, each probed twice and trapped by a quiz question', () => {
    const mistakes = misconceptionsIn('random-variables', source);
    expect(mistakes.map((m) => m.id)).toEqual(['expected-is-likely', 'same-mean-same-spread', 'double-is-sum']);
    const [quiz] = quizzesIn('random-variables', source);
    expect(quiz.questions.length).toBeGreaterThanOrEqual(5);
    expect(quiz.questions.length).toBeLessThanOrEqual(6);
    for (const m of mistakes) {
      expect(m.correction.length).toBeGreaterThan(20);
      expect(m.probes).toHaveLength(2);
      for (const p of m.probes) expect(p.trap).not.toBe(p.answer);
      expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(m.id)), m.id).toBe(true);
    }
    for (const q of quiz.questions) for (const [choice, id] of Object.entries(q.traps ?? {})) {
      expect(Number(choice)).not.toBe(q.answer);
      expect(mistakes.some((m) => m.id === id)).toBe(true);
    }
    // The mistakes sit in the predict and do sections.
    const predict = source.indexOf('<Section step="predict"');
    const check = source.indexOf('<Section step="check"');
    for (const m of mistakes) {
      const at = source.indexOf(`id="${m.id}"`);
      expect(at > predict && at < check, m.id).toBe(true);
    }
  });

  it('asks for an explanation before the recap, with a short rubric and example', () => {
    const [prompt] = promptsIn('random-variables', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(r.trim().split(/\s+/).length).toBeLessThanOrEqual(30);
    const words = prompt.example.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(30);
    expect(words).toBeLessThanOrEqual(150);
    expect(source.indexOf('<ExplainBack')).toBeGreaterThan(source.indexOf('<Section step="explain"'));
    expect(source.indexOf('<ExplainBack')).toBeLessThan(source.indexOf('<Section step="recap"'));
  });
});

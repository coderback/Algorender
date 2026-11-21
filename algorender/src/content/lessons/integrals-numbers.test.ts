// B5 of the math and ML path, "Integrals as accumulated area": every number the
// lesson quotes is measured here from the code that draws it (the integral
// visualiser and the riemann-sum exercise), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists, the
// prediction challenge asks at least its goal, and the lesson embeds its one
// exercise, which practises this lesson's visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  dip,
  dipArea,
  FINE,
  grouped,
  integral,
  NS,
  powerArea,
  riemannSum,
  speed,
  squareArea,
  stripsNeeded,
  TOLERANCE,
  trapezoidSum,
  type IntegralInput,
} from '@/algorithms/calculus/integral';
import { getExercise } from '@/content/exercises';
import { misconceptionsIn, promptsIn } from '@/content/lessons/assessment';
import { quizzesIn } from '@/content/lessons/quizzes';
import { midpointSum, trapezoidSum as exerciseTrapezoid } from '@/content/exercises/integrals';
import { fmt } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';

const source = readFileSync(fileURLToPath(new URL('./integrals.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = integral.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`integral has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as IntegralInput;
};
const framesOf = (preset: string) => traceOf(integral, inputOf(preset)).frames;

describe('integrals embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['sums', 'rules', 'accumulate', 'power']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['accumulate', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('integral');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links its sister', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['riemann-sum']);
    expect(getExercise('riemann-sum')?.visualiser).toBe('integral');
    expect(body).toContain('[the trapezoid rule](/code/trapezoid-rule)');
    expect(getExercise('trapezoid-rule')?.visualiser).toBe('integral');
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: area that builds up'), body.indexOf('<PredictChallenge'));
    for (const v of ['falls', 'goes down', 'slower', 'faster', 'positive', 'x^3/3', '1.25', '0.125', 'lowest', fmt(dipArea(0.5), 3), fmt(dipArea(2), 3)]) expect(before).not.toContain(v);
  });

  it('names the next lesson in bold, unlinked, and links only lessons that exist before it', () => {
    expect(body).toContain('**Densities and the normal distribution**');
    for (const [, slug] of body.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)) expect(['sums-notation', 'derivatives-gradients']).toContain(slug);
  });
});

describe('integrals quotes: rectangles under the speed t²', () => {
  const input = inputOf('sums');
  if (input.story !== 'sums') throw new Error('not a sums story');
  const { b } = input;
  const L = NS.map((n) => riemannSum(speed, 0, b, n, 'left'));
  const R = NS.map((n) => riemannSum(speed, 0, b, n, 'right'));
  const exact = squareArea(0, b);

  it('opens on a steady 20 m/s for 5 s', () => {
    expect(20 * 5).toBe(100);
    expect(body).toContain('A car drives at a steady 20 metres per second for 5 seconds. How far does it go? Speed times time: 100 metres.');
    expect(body).toContain('5 wide and 20 tall');
  });

  it('runs the car for 3 s, ending at 9 m/s', () => {
    expect([b, speed(b), exact]).toEqual([3, 9, 9]);
    expect(body).toContain('$t$ seconds later it is doing $t^2$ metres per second. After 3 seconds it is doing 9 m/s.');
  });

  it('measures the left- and right-end sums and the gap between them', () => {
    expect([b / 2, speed(b / 2), L[0]]).toEqual([1.5, 2.25, 3.375]);
    expect(body).toContain('$\\Delta t = 3/2 = 1.5$ seconds wide');
    expect(body).toContain('0 at the start and $1.5^2 = 2.25$ halfway. The area is $(0 + 2.25) \\times 1.5 = 3.375$ metres.');
    expect([b / 4, fmt(L[1], 3)]).toEqual([0.75, '5.906']);
    expect(body).toContain('With 4 strips of 0.75 seconds the left-end sum grows to 5.906');
    expect([fmt(R[0], 3), fmt(R[1], 3)]).toEqual(['16.875', '12.656']);
    expect(body).toContain('16.875 with 2 strips, 12.656 with 4');
    const gaps = NS.map((_, k) => R[k] - L[k]);
    NS.forEach((n, k) => expect(gaps[k]).toBe((speed(b) - speed(0)) * (b / n)));
    expect(gaps.map((g) => fmt(g, 4))).toEqual(['13.5', '6.75', '3.375', '1.6875']);
    expect(body).toContain('$(9 - 0) \\times \\Delta t$: 13.5, then 6.75, then 3.375, then 1.6875 as the strips go from 2 to 16');
    expect([fmt(L[2], 3), fmt(R[2], 3), fmt(L[3], 3), fmt(R[3], 3)]).toEqual(['7.383', '10.758', '8.174', '9.861']);
    expect(body).toContain('With 8 strips the sums are 7.383 and 10.758; with 16, 8.174 and 9.861.');
    // The frames narrate the same numbers.
    const frames = framesOf('sums');
    expect(frames[1].note).toContain('(0 + 2.25) × 1.5 = 3.375 m');
    expect(frames[3].note).toContain('(9 − 0) × 0.75 = 6.75');
    expect(readout(frames[5].state, 'n16')).toBe('8.174, 9.861');
  });

  it('measures the left-end sum’s miss halving, the triangle estimate, and the strips it needs', () => {
    const misses = L.map((v) => fmt(exact - v, 3));
    expect(misses).toEqual(['5.625', '3.094', '1.617', '0.826']);
    expect(body).toContain('The left-end sum misses by 5.625, 3.094, 1.617 and then 0.826');
    for (let k = 1; k < NS.length; k++) expect(Math.abs((exact - L[k - 1]) / (exact - L[k]) - 2)).toBeLessThan(0.2);
    const estimate = 0.5 * 9 * (b / 16);
    expect(fmt(estimate, 2)).toBe('0.84');
    expect(body).toContain('$\\tfrac{1}{2} \\times 9 \\times \\Delta t$. With 16 strips that is about 0.84, against the real 0.826');
    expect(stripsNeeded('left', b, TOLERANCE)).toBe(2048);
    expect(TOLERANCE).toBe(0.01);
    expect(body).toContain('Doubling on, it takes 2,048 strips to miss by less than 0.01 metres.');
    expect(body).toContain('$\\int_0^3 t^2\\,dt = 9$ metres');
  });
});

describe('integrals quotes: middles and trapezoids', () => {
  const input = inputOf('rules');
  if (input.story !== 'rules') throw new Error('not a rules story');
  const { b } = input;
  const exact = squareArea(0, b);
  const M = NS.map((n) => riemannSum(speed, 0, b, n, 'mid'));
  const T = NS.map((n) => trapezoidSum(speed, 0, b, n));

  it('works the 2-strip middle and trapezoid sums', () => {
    expect([speed(0.75), speed(2.25), M[0], exact - M[0]]).toEqual([0.5625, 5.0625, 8.4375, 0.5625]);
    expect(body).toContain('the middles are at 0.75 and 2.25 seconds, so the middle sum is $(0.5625 + 5.0625) \\times 1.5 = 8.4375$, missing 9 by only 0.5625');
    expect(exact - riemannSum(speed, 0, b, 16, 'left')).toBeGreaterThan(exact - M[0]);
    expect(body).toContain('That already beats 16 left-end strips, which missed by 0.826.');
    expect([T[0], T[0] - exact]).toEqual([10.125, 1.125]);
    expect(body).toContain('$(0/2 + 2.25 + 9/2) \\times 1.5 = 10.125$. That is 1.125 too much');
  });

  it('lists the misses falling 4 times each doubling', () => {
    expect(M.map((v) => fmt(exact - v, 4))).toEqual(['0.5625', '0.1406', '0.0352', '0.0088']);
    expect(T.map((v) => fmt(v - exact, 4))).toEqual(['1.125', '0.2813', '0.0703', '0.0176']);
    expect(body).toContain('middles: miss 0.5625, then 0.1406, then 0.0352, then 0.0088');
    expect(body).toContain('trapezoids: miss 1.125, then 0.2813, then 0.0703, then 0.0176');
    for (let k = 1; k < NS.length; k++) {
      expect((exact - M[k - 1]) / (exact - M[k])).toBeCloseTo(4, 9);
      expect((T[k - 1] - exact) / (T[k] - exact)).toBeCloseTo(4, 9);
      expect(T[k] - exact).toBeCloseTo(2 * (exact - M[k]), 12);
    }
    expect(body).toContain('In the car’s case the middles went from 0.5625 to 0.1406: four times smaller, not two.'.replace('’', "'"));
  });

  it('counts the strips each rule needs, and Simpson’s rule lands on 9', () => {
    expect(FINE).toBe(0.0001);
    expect([stripsNeeded('mid', b, FINE), stripsNeeded('trap', b, FINE), stripsNeeded('left', b, FINE)]).toEqual([256, 256, 262144]);
    expect(grouped(262144)).toBe('262,144');
    expect(body).toContain('Doubling until the miss is under 0.0001, the middles and the trapezoids both stop at 256 strips; the left ends need 262,144.');
    // Simpson's rule: exact on t² even with 2 strips (the trapezoids overshoot exactly twice what the middles fall short).
    expect(T[0] - exact).toBe(2 * (exact - M[0]));
    expect((2 * M[0] + T[0]) / 3).toBe(9);
    expect((2 * M[3] + T[3]) / 3).toBe(9);
    expect(body).toContain('$(2 \\times 8.4375 + 10.125)/3 = 9$ on the dot');
    // On another curve, eˣ from 0 to 1, the ratio is only nearly 2, and the mixture misses by far less than either rule.
    const e = Math.exp(1) - 1;
    const m2 = riemannSum(Math.exp, 0, 1, 2, 'mid');
    const t2 = trapezoidSum(Math.exp, 0, 1, 2);
    const ratio = (t2 - e) / (e - m2);
    expect(ratio).toBeGreaterThan(1.95);
    expect(ratio).toBeLessThan(2.05);
    expect(Math.abs(ratio - 2)).toBeGreaterThan(1e-4);
    expect(Math.abs((2 * m2 + t2) / 3 - e)).toBeLessThan((e - m2) / 100);
    expect(body).toContain('On most curves the two misses are only nearly in that ratio, so it is not exact, but it misses by far less than either rule alone');
    expect(readout(framesOf('rules')[5].state, 'nleft')).toBe('262,144');
  });

  it('matches the exercise’s first example', () => {
    expect(getExercise('riemann-sum')?.examples[0].input).toEqual({ a: 0, b: 3, n: 2 });
    expect(midpointSum({ a: 0, b: 3, n: 2 })).toBe(8.4375);
    expect(exerciseTrapezoid({ a: 0, b: 3, n: 2 })).toBe(10.125);
    expect(body).toContain('`riemann(0, 3, 2)` should give the 8.4375 above');
  });
});

describe('integrals quotes: the accumulated area of x² − 1', () => {
  const input = inputOf('accumulate');
  if (input.story !== 'accumulate') throw new Error('not an accumulate story');

  it('sweeps A from 0 to 2', () => {
    expect([dip(0), dip(1), dip(2)]).toEqual([-1, 0, 3]);
    const A = [0.5, 1, 1.5, 2].map((x) => fmt(dipArea(x), 3));
    expect(A).toEqual(['−0.458', '−0.667', '−0.375', '0.667']);
    expect(body).toContain('$A(0.5) = -0.458$, then $A(1) = -0.667$');
    expect(fmt(dipArea(0.5) - dipArea(1), 3)).toBe('0.208');
    expect(body).toContain('the second half-step only took away 0.208, against 0.458 for the first');
    expect(body).toContain('$A(1.5) = -0.375$, still negative but rising, and $A(2) = 0.667$');
    const below = -dipArea(1);
    const above = dipArea(2) - dipArea(1);
    expect([fmt(above, 3), fmt(below, 3), fmt(above + below, 3)]).toEqual(['1.333', '0.667', '2']);
    expect(body).toContain('The 1.333 above the axis outweighs the 0.667 below it.');
    expect(body).toContain('it ends up 0.667 metres ahead of where it started, after driving 2 metres in all');
    // The frames say the same.
    const frames = framesOf('accumulate');
    expect(frames[4].note).toContain('the 1.333 above the axis outweighs the 0.667 below it');
  });

  it('measures A’s slope at 1.5 and the thin strip', () => {
    expect(input.x).toBe(1.5);
    expect(dip(1.5)).toBe(1.25);
    expect(body).toContain('Test it at $x = 1.5$, where $f(1.5) = 1.5^2 - 1 = 1.25$.');
    const strip = (h: number) => dipArea(1.5 + h) - dipArea(1.5);
    expect(fmt(strip(0.1), 4)).toBe('0.1403');
    expect(body).toContain("almost a rectangle 1.25 tall and 0.1 wide: the strip's area is 0.1403, against the rectangle's $1.25 \\times 0.1 = 0.125$");
    expect(readout(framesOf('accumulate')[6].state, 'added')).toBe('0.1403');
    // Divided by the width, then a strip ten times thinner.
    expect([fmt(strip(0.1) / 0.1, 3), fmt(strip(0.01), 5), fmt(strip(0.01) / 0.01, 3)]).toEqual(['1.403', '0.01265', '1.265']);
    expect(body).toContain('Divide by the width to get how fast $A$ grew: 1.403. A strip ten times thinner, from 1.5 to 1.51, has area 0.01265, and $0.01265 / 0.01 = 1.265$.');
    // The sliver above the rectangle shrinks about 100 times when the width shrinks 10 times.
    const sliver = (h: number) => strip(h) - 1.25 * h;
    expect(Math.round(sliver(0.1) / sliver(0.01))).toBe(102);
    expect(body).toContain('The width shrank 10 times but the sliver about 100 times');
    // The visualiser measures A's slope from the strips, and it comes out as f(1.5).
    expect(readout(framesOf('accumulate')[5].state, 'slope')).toBe('1.25');
    expect(body).toContain("at 1.5 the $A(x)$ graph's slope is exactly 1.25");
    expect(2 * 1.5).toBe(3);
    expect(body).toContain("not $f'(1.5) = 2 \\times 1.5 = 3$");
    expect(fmt(2 ** 3 / 3 - 2, 3)).toBe('0.667');
    expect(body).toContain('$2^3/3 - 2 = 0.667$');
  });
});

describe('integrals quotes: the power rule run backwards', () => {
  const input = inputOf('power');
  if (input.story !== 'power') throw new Error('not a power story');
  const { b } = input;

  it('finds b³/3, 8 times the area for twice the end, F(b) − F(a) and x⁴/4', () => {
    expect(b).toBe(2);
    expect(powerArea(2, 3)).toBe(9);
    expect(body).toContain('$3^3/3 = 9$ metres: the number every sum was closing in on');
    expect([fmt(powerArea(2, b), 3), fmt(riemannSum(speed, 0, b, 16, 'mid'), 4)]).toEqual(['2.667', '2.6641']);
    expect(body).toContain('With $b = 2$ the formula gives $2^3/3 = 2.667$, and 16 middle strips give 2.6641.');
    expect(fmt(powerArea(2, 4), 3)).toBe('21.333');
    expect(powerArea(2, 4) / powerArea(2, 2)).toBe(8);
    expect(body).toContain('$4^3/3 = 21.333$, 8 times as much');
    expect(fmt(powerArea(2, 4) - powerArea(2, 2), 3)).toBe('18.667');
    expect(body).toContain('$21.333 - 2.667 = 18.667$');
    // Another antiderivative, x³/3 + 5, gives the same difference.
    expect(fmt(powerArea(2, 4) + 5 - (powerArea(2, 2) + 5), 3)).toBe('18.667');
    expect(body).toContain('$(4^3/3 + 5) - (2^3/3 + 5)$ is still 18.667');
    expect(powerArea(3, 2)).toBe(4);
    expect(body).toContain('the area under $x^3$ from 0 to 2 is $2^4/4 = 4$');
    expect(readout(framesOf('power')[4].state, 'p3')).toBe('4');
  });
});

describe('integrals: assessment, as assessment.test.ts checks it once the lesson is listed', () => {
  const quizzes = quizzesIn('integrals', source);
  const mistakes = misconceptionsIn('integrals', source);
  const prompts = promptsIn('integrals', source);
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('has a quiz of 5 or 6 whose traps each name one of its mistakes, and every mistake is trapped', () => {
    expect(quizzes).toHaveLength(1);
    const { questions } = quizzes[0];
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(6);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id), id).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const m of mistakes) expect(questions.some((q) => Object.values(q.traps ?? {}).includes(m.id)), m.id).toBe(true);
    for (const m of mistakes) {
      expect(m.probes).toHaveLength(2);
      for (const p of m.probes) expect(p.trap).not.toBe(p.answer);
      expect(m.correction.length).toBeGreaterThan(20);
    }
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });

  it('asks for one explanation, with 3 to 5 short rubric points and a short example', () => {
    expect(prompts).toHaveLength(1);
    const [p] = prompts;
    expect(p.rubric.length).toBeGreaterThanOrEqual(3);
    expect(p.rubric.length).toBeLessThanOrEqual(5);
    for (const r of p.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(p.example)).toBeGreaterThanOrEqual(30);
    expect(words(p.example)).toBeLessThanOrEqual(150);
    // The explain section comes before the recap, and the lesson is 3,000 to 3,800 words.
    expect(source.indexOf('step="explain"')).toBeLessThan(source.indexOf('step="recap"'));
    expect(words(source)).toBeGreaterThanOrEqual(3000);
    expect(words(source)).toBeLessThanOrEqual(3800);
    expect(source).not.toMatch(/—/);
  });
});

describe('integrals: quiz and probes', () => {
  it('checks the quiz', () => {
    // x² from 0 to 4, 2 middle strips: (1 + 9) × 2.
    expect(riemannSum(speed, 0, 4, 2, 'mid')).toBe(20);
    expect(riemannSum(speed, 0, 4, 2, 'mid') / 2).toBe(10);
    expect((speed(1) + speed(3)) * 4).toBe(40);
    expect(riemannSum(speed, 0, 4, 2, 'left')).toBe(8);
    expect(squareArea(0, 4)).toBeCloseTo(21 + 1 / 3, 12);
    expect(body).toContain('(1 + 9) × 2 = 20, against an exact 21⅓');
    // Trapezoids: 0.12 ÷ 4.
    expect(fmt(0.12 / 4, 6)).toBe('0.03');
    // Forward 5 × 3, back 2 × 4.
    expect([5 * 3 - 2 * 4, 5 * 3 + 2 * 4]).toEqual([7, 23]);
    expect(body).toContain('15 − 8 = 7 m');
    // A′(2) for x³: 8; f′(2) = 12; A(2) = 4.
    expect([2 ** 3, 3 * 2 ** 2, powerArea(3, 2)]).toEqual([8, 12, 4]);
    // x² from 2 to 5.
    expect(squareArea(2, 5)).toBe(39);
    expect(fmt(powerArea(2, 5), 2)).toBe('41.67');
    expect(5 ** 3 - 2 ** 3).toBe(117);
    expect(5 ** 2 - 2 ** 2).toBe(21);
    expect(body).toContain('125/3 − 8/3 = 39');
    // x² − 4 crosses 0 at 2, where A = x³/3 − 4x is lowest on [0, 5].
    const A = (x: number) => x ** 3 / 3 - 4 * x;
    const xs = Array.from({ length: 501 }, (_, k) => k / 100);
    expect(xs.reduce((best, x) => (A(x) < A(best) ? x : best))).toBe(2);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.slice(0, source.indexOf('<Quiz')).replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    expect(fmt(0.36 / 4, 6)).toBe('0.09');
    expect(fmt(0.8 / 4, 6)).toBe('0.2');
    expect(2.5 * 4 - 1.5 * 6).toBe(1);
    expect(-2.75 + 2.75).toBe(0);
    // f = 2x: A = x², A′(9) = 18, A(9) = 81.
    expect([2 * 9, 9 ** 2]).toEqual([18, 81]);
    // A number counts only standing alone: 81 is not in 0.2813.
    const alone = (n: string) => new RegExp(`(?<![\\d.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`);
    for (const n of ['0.36', '0.045', '2.5', '1.5 from', '2.75', '5.5', '81', '11 −', '25 strips', '50 strips']) {
      expect(text, `${n} is in the text`).not.toMatch(alone(n));
      expect(quiz, `${n} is in the quiz`).not.toMatch(alone(n));
    }
    for (const n of ['0.12', '0.03', '23 m', '117', '41.67', '39', 'x² − 4']) expect(text, `${n} is in the text`).not.toMatch(alone(n));
  });
});

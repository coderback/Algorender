// B5 of the math and ML path, "Counting and combinations": every number the
// lesson quotes is measured here from the code that draws it (the counting
// visualiser and the pascal-choose exercise), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists, the
// prediction challenge asks at least its goal, and the lesson embeds its one
// exercise, which practises this lesson's visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { choose, chooseByOrders, counting, factorial, orderedPicks, pascal, pascalSlips, rowSum, type CountingInput } from '@/algorithms/probability/counting';
import { getExercise } from '@/content/exercises';
import { chooseValue } from '@/content/exercises/counting';
import { traceOf } from '@/viz/grid/testing';

const source = readFileSync(fileURLToPath(new URL('./counting-combinatorics.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = counting.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`counting has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as CountingInput;
};
const framesOf = (preset: string) => traceOf(counting, inputOf(preset)).frames;
const questions = (preset: string) => framesOf(preset).flatMap((f) => (f.checkpoint ? [f.checkpoint] : []));

/** A number on its own, not part of a longer one (so 55 is not found in 255 or 5.5). */
const hasNumber = (text: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.,]/g, '\\$&')}(?![\\d]|,\\d)`).test(text);

describe('counting-combinatorics embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['outfits', 'orders', 'pairs', 'pascal']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['orders', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('counting');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['pascal-choose']);
    expect(getExercise('pascal-choose')?.visualiser).toBe('counting');
  });

  it('links only lessons and visualisers that come before it, and names the next lesson in bold', () => {
    const links = [...source.matchAll(/\]\((\/[a-z/-]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual(['/learn/exponents-logs', '/learn/sums-notation', '/visualisers/permutations', '/learn/backtracking', '/visualisers/subsets']);
    expect(body).toContain('**Chance, events and independence**');
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(0, body.indexOf('<PredictChallenge'));
    const answers = questions('orders').map((q) => q.choices[q.answer]);
    expect(answers).toEqual(['4', '60', '120', '720']);
    for (const a of answers.slice(1)) expect(hasNumber(before, a), a).toBe(false);
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(12);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('counting-combinatorics quotes: the hook and AND multiplies', () => {
  it('counts the orders of a deck and the groups of 20 features', () => {
    let deck = 1n;
    for (let i = 2n; i <= 52n; i++) deck *= i;
    expect(String(deck).length).toBe(68);
    expect(factorial(52).toExponential(2)).toBe('8.07e+67');
    expect(body).toContain('A deck of 52 cards can be shuffled into about $8.07 \\times 10^{67}$ different orders, a number with 68 digits.');
    expect(2 ** 20).toBe(1_048_576);
    expect(body).toContain('from none to all: 1,048,576 groups');
    expect(body).toContain('That is $2^{20} = 1{,}048{,}576$ groups');
  });

  it('counts the outfits the visualiser draws', () => {
    const input = inputOf('outfits');
    expect(input).toEqual({ story: 'outfits', tops: 3, bottoms: 4, shoes: 2 });
    expect(body).toContain('Start with a wardrobe: 3 tops (red, blue, green) and 4 bottoms (jeans, shorts, a skirt and chinos).');
    expect(body).toContain('Three rows of four: $3 \\times 4 = 12$ outfits.');
    expect(body).toContain('Adding would give $3 + 4 = 7$');
    expect(body).toContain('$3 \\times 4 \\times 2 = 24$');
    const frames = framesOf('outfits');
    expect(frames.find((f) => f.note.includes('3 × 4 = 12 outfits'))).toBeDefined();
    expect(frames.find((f) => f.note.includes('3 × 4 × 2 = 24'))).toBeDefined();
    expect(10 ** 4).toBe(10_000);
    expect(body).toContain('10 \\times 10 \\times 10 \\times 10 = 10^4 = 10{,}000');
  });
});

describe('counting-combinatorics quotes: the podium', () => {
  const input = inputOf('orders');

  it('picks 3 places from 5 runners, and names the slips the challenge offers', () => {
    expect(input).toEqual({ story: 'orders', n: 5, k: 3 });
    expect(orderedPicks(5, 3)).toBe(60);
    expect(body).toContain('$$ 5 \\times 4 \\times 3 = 60 $$');
    const total = questions('orders').find((q) => q.question.startsWith('In all'))!;
    expect(total.choices).toEqual(['12', '15', '60', '125']);
    expect(body).toContain('Adding, $5 + 4 + 3 = 12$');
    expect(body).toContain('Multiplying runners by places, $5 \\times 3 = 15$');
    expect(body).toContain('And $5^3 = 125$');
  });

  it('ranks everyone: 5!, 6! and 10!, and the podiums as 5!/2!', () => {
    expect([factorial(5), factorial(6), factorial(10), factorial(2), factorial(0)]).toEqual([120, 720, 3_628_800, 2, 1]);
    expect(body).toContain('$5 \\times 4 \\times 3 \\times 2 \\times 1 = 120$ orders');
    expect(body).toContain('$6! = 6 \\times 5! = 720$');
    expect(body).toContain('$10! = 3{,}628{,}800$');
    expect(factorial(5) / factorial(2)).toBe(orderedPicks(5, 3));
    expect(body).toContain('\\text{podiums} = \\frac{5!}{2!} = \\frac{120}{2} = 60');
    const frames = framesOf('orders');
    expect(frames.find((f) => f.note.includes('60 × 2 × 1 = 120'))).toBeDefined();
    expect(frames.at(-1)!.note).toContain('6! = 720');
    expect(frames.at(-1)!.note).toContain('5! ÷ 2! = 60');
    expect(body).toContain('$3! = 3 \\times 2 \\times 1 = 6$');
  });
});

describe('counting-combinatorics quotes: teams and Pascal’s triangle', () => {
  it('counts teams of two and three from five', () => {
    expect(inputOf('pairs')).toEqual({ story: 'pairs', n: 5 });
    expect([orderedPicks(5, 2), 5 * 5, choose(5, 2), orderedPicks(5, 3), factorial(3), choose(5, 3)]).toEqual([20, 25, 10, 60, 6, 10]);
    expect(chooseByOrders(5, 2)).toBe(10);
    expect(chooseByOrders(5, 3)).toBe(10);
    expect(body).toContain('$5 \\times 4 = 20$ ordered picks out of the 25 cells');
    expect(body).toContain('$20 \\div 2 = 10$ teams');
    expect(body).toContain('There are $5 \\times 4 \\times 3 = 60$ ordered picks of three');
    expect(body).toContain('So there are $60 \\div 6 = 10$ teams of three.');
    expect(body).toContain('$C(5, 3) = C(5, 2)$');
    const frames = framesOf('pairs');
    expect(frames.find((f) => f.note.includes('20 ÷ 2 = 10 teams of two'))).toBeDefined();
    expect(frames.at(-1)!.note).toContain('60 ÷ 6 = 10 teams of three');
  });

  it('splits C(5, 2) by whether Eli is in, and adds C(4, 2) from the cells above', () => {
    expect(choose(5, 2)).toBe(choose(4, 1) + choose(4, 2));
    expect(body).toContain('$$ C(5, 2) = C(4, 1) + C(4, 2) $$');
    expect([choose(3, 1), choose(3, 2), choose(4, 2)]).toEqual([3, 3, 6]);
    expect(body).toContain('$C(4, 2) = C(3, 1) + C(3, 2) = 3 + 3 = 6$');
    const s = pascalSlips(4, 2);
    expect([s.wrongNeighbours, s.leftAndUp, s.product]).toEqual([4, 7, 9]);
    expect([choose(3, 2) + choose(3, 3), choose(4, 1) + choose(3, 2), choose(3, 1) * choose(3, 2)]).toEqual([4, 7, 9]);
    expect(body).toContain('gives $3 + 1 = 4$');
    expect(body).toContain('gives $4 + 3 = 7$');
    expect(body).toContain('multiplying gives $3 \\times 3 = 9$');
    // The challenge on C(4, 2) in the visualiser offers the same slips.
    const q = questions('pascal').find((c) => c.question === 'What is C(4, 2)?')!;
    expect(q.choices).toEqual(['4', '6', '7', '9']);
  });

  it('reads row 6 and the row sums', () => {
    const P = pascal(6);
    expect(P[6].join(', ')).toBe('1, 6, 15, 20, 15, 6, 1');
    expect(body).toContain('Row 6 reads 1, 6, 15, 20, 15, 6, 1.');
    expect(Math.max(...P[6])).toBe(choose(6, 3));
    expect(body).toContain('$C(6, 3) = 20$, is the biggest');
    const sums = P.map((_, n) => rowSum(n));
    expect(sums.join(', ')).toBe('1, 2, 4, 8, 16, 32, 64');
    expect(body).toContain('Now add up each row: 1, 2, 4, 8, 16, 32, 64.');
    expect(framesOf('pascal').at(-1)!.note).toContain('1, 2, 4, 8, 16, 32, 64');
    expect([2 ** 4, factorial(4)]).toEqual([16, 24]);
    expect(body).toContain('Four things have $2^4 = 16$ subsets but $4! = 24$ orders');
  });

  it('describes the exercise as it runs', () => {
    const exercise = getExercise('pascal-choose')!;
    expect(exercise.examples.map((e) => chooseValue(e.input))).toEqual([10, 20]);
    expect(body).toContain('`table(n + 1, n + 1, 0)`');
    expect(exercise.solution.javascript).toContain('table(n + 1, n + 1, 0)');
  });
});

describe('counting-combinatorics: quiz and probes', () => {
  it('checks the quiz', () => {
    expect([23 * 3, 23 + 3]).toEqual([69, 26]);
    expect([orderedPicks(16, 2), 16 * 16, 16 + 15, orderedPicks(16, 2) / 2]).toEqual([240, 256, 31, 120]);
    expect([choose(14, 2), orderedPicks(14, 2), 14 * 14]).toEqual([91, 182, 196]);
    const row9 = pascal(9)[9];
    expect(row9.join(', ')).toBe('1, 9, 36, 84, 126, 126, 84, 36, 9, 1');
    expect(body).toContain('Row 9 of Pascal’s triangle is 1, 9, 36, 84, 126, 126, 84, 36, 9, 1.');
    expect(choose(10, 4)).toBe(row9[3] + row9[4]);
    expect([choose(10, 4), row9[4] + row9[5]]).toEqual([210, 252]);
    expect(choose(25, 0)).toBe(1);
    expect([2 ** 18, 2 ** 18 - 1, 18 * 18]).toEqual([262_144, 262_143, 324]);
    expect(rowSum(18)).toBe(2 ** 18);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect([8 * 29, 8 + 29, 29 * 29]).toEqual([232, 37, 841]);
    expect([17 * 17, 17 + 17, orderedPicks(17, 2)]).toEqual([289, 34, 272]);
    expect([choose(11, 2), orderedPicks(11, 2), 11 * 11]).toEqual([55, 110, 121]);
    expect([choose(12, 3), orderedPicks(12, 3), 12 / 3, factorial(3)]).toEqual([220, 1320, 4, 6]);
    expect(choose(19, 0)).toBe(1);
    expect([2 ** 7, 2 ** 7 - 1, 7 + 1]).toEqual([128, 127, 8]);
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.slice(0, source.indexOf('<Quiz')).replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    for (const n of ['232', '37', '841', '29', '289', '272', '34', '55', '110', '121', '1,320', '220', '127', '128', '17', '11', '19']) {
      expect(hasNumber(text, n), `${n} is in the text`).toBe(false);
      expect(hasNumber(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    // And the quiz's own numbers are not in the text or the probes.
    const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join(' ');
    for (const n of ['23', '69', '26', '240', '256', '16 members', '91', '182', '196', '210', '252', '25 photos', '262,144', '324']) {
      const plain = !/\D/.test(n.replace(',', ''));
      const present = (t: string) => (plain ? hasNumber(t, n) : t.includes(n));
      expect(present(text), `${n} is in the text`).toBe(false);
      expect(present(probes), `${n} is in the probes`).toBe(false);
    }
  });
});

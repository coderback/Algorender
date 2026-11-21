// B5 of the math and ML path, "Chance, events and independence": every number
// the lesson quotes is measured here from the code that draws it (the
// two-dice visualiser and the dice-sum-chance exercise), and must appear in
// the lesson exactly as written. The embeds are checked too: each preset
// exists, the prediction challenge asks at least its goal, and the lesson
// embeds its one exercise, which practises this lesson's visualiser. The Bayes
// lesson, revised to build on this one, quotes the board's numbers as well.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  both,
  count,
  either,
  EVENTS,
  hits,
  independent,
  not,
  OUTCOMES,
  reduced,
  share3,
  sumIs,
  tally,
  throwDice,
  THROW_COUNTS,
  THROW_SEED,
  twoDice,
  unorderedWays,
  waysToSum,
  type DiceInput,
  type Test,
} from '@/algorithms/probability/two-dice';
import { getExercise } from '@/content/exercises';
import { countSums } from '@/content/exercises/chance';
import { traceOf } from '@/viz/grid/testing';

const read = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8');
const source = read('probability-basics');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string) => {
  const ex = twoDice.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`two-dice has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as DiceInput;
};
const framesOf = (preset: string) => traceOf(twoDice, inputOf(preset)).frames;
const E = EVENTS;

describe('probability-basics embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['sum-seven', 'or', 'and', 'dependent', 'throws']);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['or', 3]]);
    for (const e of found) {
      expect(e.slug).toBe('two-dice');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['dice-sum-chance']);
    expect(getExercise('dice-sum-chance')?.visualiser).toBe('two-dice');
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: or'), body.indexOf('<PredictChallenge'));
    const answers = framesOf('or').flatMap((f) => (f.checkpoint ? [f.checkpoint.choices[f.checkpoint.answer]] : []));
    expect(answers).toEqual(['11', '12', '25']);
    for (const a of answers) expect(before).not.toMatch(new RegExp(`(?<![\\d/])${a}(?![\\d/])`));
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(14);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('probability-basics quotes: one event', () => {
  it('counts 36 equally likely outcomes, six of them summing to 7', () => {
    expect(OUTCOMES.length).toBe(36);
    expect(body).toContain('that makes $6 \\times 6 = 36$ outcomes');
    const sevens = OUTCOMES.filter(([a, b]) => a + b === 7).map(([a, b]) => `$(${a}, ${b})$`);
    expect(sevens.length).toBe(6);
    expect(body).toContain(`The sum is 7 on six cells: ${sevens.slice(0, -1).join(', ')} and ${sevens.at(-1)}.`);
    expect(reduced(6)).toBe('1/6');
    expect(body).toContain('P(\\text{sum is } 7) = \\frac{6}{36} = \\frac{1}{6}');
    expect(body).toContain('about one throw in every 6 should come out at 7');
  });

  it('counts the sums: eleven of them, not equally likely', () => {
    const sums = Array.from({ length: 11 }, (_, i) => i + 2);
    expect(sums.length).toBe(11);
    expect(body).toContain('The sum can be anything from 2 to 12: eleven possible sums. So is each one a 1 in 11 chance?');
    expect([waysToSum(2), waysToSum(12), waysToSum(7)]).toEqual([1, 1, 6]);
    expect(Math.max(...sums.map(waysToSum))).toBe(waysToSum(7));
    expect(waysToSum(7) / waysToSum(2)).toBe(6);
    expect(body).toContain('a sum of 7 turns up about six times as often as a sum of 2');
    expect(body).toContain('A sum of 2 needs both dice to show 1: just one cell, so its chance is $1/36$. A sum of 12 needs two 6s: also one cell. A sum of 7 has six cells, the most of any sum');
  });

  it('finds “not A” as what A leaves out', () => {
    const rest = count(not(sumIs(7).test));
    expect([rest, reduced(rest)]).toEqual([30, '5/6']);
    expect(body).toContain('the $36 - 6 = 30$ cells that $A$ leaves out, and $P(\\text{not } A) = 30/36 = 5/6$');
    // The frame after the question shows the same.
    expect(framesOf('sum-seven')[3].note).toContain('30 of them, so P(not A) = 30/36');
  });
});

describe('probability-basics quotes: or', () => {
  it('takes the corner away once', () => {
    const A = E.first6.test;
    const B = E.second6.test;
    expect([count(A), count(B), count(both(A, B)), count(either(A, B))]).toEqual([6, 6, 1, 11]);
    expect(body).toContain('$A$ has 6 cells and $B$ has 6 cells, but "$A$ or $B$" has only 11. Adding $6 + 6$ counts the corner $(6, 6)$ twice');
    expect(body).toContain('$6 + 6 - 1 = 11$, and $P(A \\text{ or } B) = 11/36$');
  });

  it('adds straight when the events never meet', () => {
    expect(count(both(E.sum7.test, E.double.test))).toBe(0);
    expect([count(E.sum7.test), count(E.double.test), count(either(E.sum7.test, E.double.test)), reduced(12)]).toEqual([6, 6, 12, '1/3']);
    for (const [a] of OUTCOMES.filter(([x, y]) => x === y)) expect((2 * a) % 2).toBe(0);
    expect(body).toContain('$P(\\text{a 7 or a double}) = 6/36 + 6/36 = 12/36 = 1/3$');
  });

  it('counts the complement: no 6 is a 5 × 5 square', () => {
    expect(count(E.noSix.test)).toBe(25);
    expect(36 - 25).toBe(count(E.atLeastOne6.test));
    expect(body).toContain('a $5 \\times 5$ square of 25 cells');
    expect(body).toContain('$P(\\text{at least one } 6) = 1 - 25/36 = 11/36$');
  });
});

describe('probability-basics quotes: and, and independence', () => {
  it('multiplies a rectangle of rows × columns', () => {
    const A = E.firstEven.test;
    const B = E.secondHigh.test;
    expect([count(A), reduced(count(A)), count(B), reduced(count(B)), count(both(A, B))]).toEqual([18, '1/2', 12, '1/3', 6]);
    expect(count(both(A, B)) / 36).toBeCloseTo((3 / 6) * (2 / 6), 15);
    expect(independent(A, B)).toBe(true);
    expect(body).toContain('$P(A) = 18/36 = 3/6$');
    expect(body).toContain('so $P(B) = 12/36 = 2/6$');
    expect(body).toContain('a rectangle of $3 \\times 2 = 6$ cells');
    expect(body).toContain('P(A \\text{ and } B) = \\frac{6}{36} = \\frac{3}{6} \\times \\frac{2}{6}');
    for (let a = 1; a <= 6; a++) expect([1, 2, 3, 4, 5, 6].filter((b) => B(a, b)).length).toBe(2);
    expect(body).toContain('$B$ takes the same 2 cells of 6');
  });

  it('a sum of 10 or more and a first die of 6: three cells, not one', () => {
    const A = E.sum10up.test;
    const B = E.first6.test;
    expect([count(A), count(B), count(both(A, B))]).toEqual([6, 6, 3]);
    expect(OUTCOMES.filter(([a, b]) => A(a, b) && B(a, b))).toEqual([
      [6, 4],
      [6, 5],
      [6, 6],
    ]);
    expect(reduced(3)).toBe('1/12');
    expect(independent(A, B)).toBe(false);
    expect(body).toContain('$1/6 \\times 1/6 = 1/36$: one cell. But the bottom row holds three cells with a sum of 10 or more, $(6, 4)$, $(6, 5)$ and $(6, 6)$, so $P(A \\text{ and } B) = 3/36 = 1/12$, three times the product');
    // Half of the bottom row, against a sixth of the board.
    expect(count(both(A, B)) / count(B)).toBe(1 / 2);
    expect(count(A) / 36).toBe(1 / 6);
    expect(body).toContain('half of that row has a sum of 10 or more, against a sixth of the whole board');
  });

  it('a 7 and a double never meet; a 7 and a first die of 6 are independent', () => {
    expect(count(both(E.sum7.test, E.double.test))).toBe(0);
    expect(independent(E.sum7.test, E.double.test)).toBe(false);
    expect(body).toContain('$P(A \\text{ and } B) = 0$, yet the product is $1/36$');
    expect(OUTCOMES.filter(([a, b]) => a + b === 7 && a === 6)).toEqual([[6, 1]]);
    expect(independent(E.sum7.test, E.first6.test)).toBe(true);
    expect(body).toContain('exactly one cell, $(6, 1)$, and $1/36 = 1/6 \\times 1/6$: they are independent');
    for (let a = 1; a <= 6; a++) expect(OUTCOMES.filter(([x, y]) => x === a && x + y === 7).length).toBe(1);
  });
});

describe('probability-basics quotes: the throws', () => {
  const thrown = throwDice(THROW_SEED, 36000);
  const sevens = THROW_COUNTS.map((n) => hits(thrown, n, E.sum7.test));
  const frames = framesOf('throws');

  it('runs the preset’s seed', () => {
    const input = inputOf('throws');
    expect(input).toEqual({ story: 'throws', seed: THROW_SEED });
    expect([...THROW_COUNTS]).toEqual([36, 360, 3600, 36000]);
    expect(sevens).toEqual([8, 66, 607, 5970]);
    const shares = THROW_COUNTS.map((n, i) => share3(sevens[i] / n));
    expect(shares).toEqual(['0.222', '0.183', '0.169', '0.166']);
    expect(share3(1 / 6)).toBe('0.167');
    // The share closes in at every step.
    const gaps = THROW_COUNTS.map((n, i) => Math.abs(sevens[i] / n - 1 / 6));
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    const empty = tally(thrown, 36).flat().filter((c) => c === 0).length;
    expect(empty).toBe(15);
    expect(body).toContain('After 36 throws this run had 8 sevens, a share of 0.222, well above $1/6 \\approx 0.167$; and 15 of the 36 cells had no throw at all.');
    expect(body).toContain('After 360 throws it had 66 sevens (0.183), after 3600 it had 607 (0.169), and after 36,000 it had 5970 (0.166).');
    // The count drifts further from a sixth of the throws while the share closes in.
    expect(THROW_COUNTS.map((n, i) => Math.abs(sevens[i] - n / 6))).toEqual([2, 6, 7, 30]);
    expect(body).toContain('it even drifts further from it, 2 off, then 6, 7 and 30.');
    // The frames narrate the same run.
    expect(frames[1].note).toContain('After 36 throws, 8 summed to 7: a share of 0.222');
    expect(frames[1].note).toContain('15 of the 36 cells have had no throw at all');
    expect(frames[2].note).toContain('After 360 throws, 66 sevens: a share of 0.183');
    expect(frames[3].note).toContain('After 3600 throws, 607 sevens: a share of 0.169');
    expect(frames[4].note).toContain('After 36,000 throws, 5970 sevens: a share of 0.166');
  });
});

describe('probability-basics: quiz and probes', () => {
  const quiz = source.slice(source.indexOf('<Quiz'));
  const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join('\n');
  const text = source.slice(0, source.indexOf('<Quiz')).replace(/probes=\{\[[\s\S]*?\]\}/g, '');
  /** Whether a number or fraction appears as itself, not inside a longer one. */
  const has = (where: string, n: string) => new RegExp(`(?<![\\d/.])${n.replace('/', '\\/')}(?![\\d/])`).test(where);

  it('checks the quiz', () => {
    // A sum of 8: five ordered pairs; the slips 1/11, 5/12 and the unordered 3/21.
    expect([waysToSum(8), unorderedWays(8)]).toEqual([5, 3]);
    // 21 unordered pairs in all; (4, 4) is one cell, while (2, 6) stands for two.
    expect(OUTCOMES.filter(([a, b]) => a <= b).length).toBe(21);
    expect(quiz).toContain('gives 3 of 21 unordered pairs');
    expect(OUTCOMES.filter(([a, b]) => a + b === 8).map(([a, b]) => `(${a}, ${b})`).join(', ')).toBe('(2, 6), (3, 5), (4, 4), (5, 3), (6, 2)');
    expect(countSums(8, 'exactly')).toBe(5);
    // 1 to 10, not a multiple of 3.
    const ten = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(ten.filter((n) => n % 3 !== 0).length).toBe(7);
    // 1 to 20, even or a multiple of 5.
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    const even = (n: number) => n % 2 === 0;
    const five = (n: number) => n % 5 === 0;
    expect([twenty.filter(even).length, twenty.filter(five).length, twenty.filter((n) => even(n) && five(n)).length, twenty.filter((n) => even(n) || five(n)).length]).toEqual([10, 4, 2, 12]);
    // A sum of 4 and a first die of 1: one cell, against the product 1/72.
    const s4: Test = sumIs(4).test;
    const first1: Test = (a) => a === 1;
    expect([count(s4), count(first1), count(both(s4, first1))]).toEqual([3, 6, 1]);
    expect((3 / 36) * (6 / 36)).toBeCloseTo(1 / 72, 15);
    // One die: "1 or 2" and "odd" are independent.
    const die = [1, 2, 3, 4, 5, 6];
    const low = die.filter((n) => n <= 2).length / 6;
    const odd = die.filter((n) => n % 2 === 1).length / 6;
    const lowOdd = die.filter((n) => n <= 2 && n % 2 === 1).length / 6;
    expect([lowOdd, low * odd]).toEqual([1 / 6, 1 / 6]);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    // Two coins: one of each is 2 of 4. Three coins: one head 3 of 8, three heads 1.
    const coins = (n: number) => Array.from({ length: 2 ** n }, (_, k) => k.toString(2).padStart(n, '0'));
    expect(coins(2).filter((c) => c === '01' || c === '10').length / 4).toBe(1 / 2);
    expect([coins(3).filter((c) => [...c].filter((x) => x === '1').length === 1).length, coins(3).filter((c) => c === '111').length]).toEqual([3, 1]);
    // The club: 14 + 9 − 4.
    expect(14 + 9 - 4).toBe(19);
    // One die: even or more than 3 is 2, 4, 5, 6; even and 2 is just 2.
    const die = [1, 2, 3, 4, 5, 6];
    expect(die.filter((n) => n % 2 === 0 || n > 3)).toEqual([2, 4, 5, 6]);
    expect(die.filter((n) => n % 2 === 0 && n === 2).length / 6).toBe(1 / 6);
    // A sum of 3 and a first die of 4 can't both happen.
    expect(count(both(sumIs(3).test, (a) => a === 4))).toBe(0);
    for (const n of ['31', '14', '23', '19', '27', '17']) {
      expect(has(probes, n), `${n} is in a probe`).toBe(true);
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    for (const n of ['5/36', '5/12', '3/21', '7/10', '3/10', '12/20', '14/20', '1/72']) {
      expect(has(quiz, n), `${n} is in the quiz`).toBe(true);
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(probes, n), `${n} is in a probe`).toBe(false);
    }
  });
});

describe('“Bayes’ rule”, revised for B5: conditional probability on the two-dice board', () => {
  const bayes = read('bayes').replace(/\s+/g, ' ');

  it('links this lesson and quotes the board’s numbers', () => {
    expect(bayes).toContain('[chance, events and independence](/learn/probability-basics)');
    const inRow6 = (A: Test) => count(both(A, E.first6.test)) / count(E.first6.test);
    expect(inRow6(E.sum7.test)).toBe(1 / 6);
    expect(count(E.sum10up.test) / 36).toBe(1 / 6);
    expect(inRow6(E.sum10up.test)).toBe(1 / 2);
    expect(count(both(E.sum10up.test, E.first6.test))).toBe(3);
    expect(bayes).toContain(
      'Knowing the first die showed 6 left the chance of a sum of 7 at 1/6, but raised the chance of a sum of 10 or more from 1/6 to 1/2: inside the bottom row, 3 of the 6 cells have a sum of 10 or more.',
    );
    expect(bayes).toContain('That is **conditional probability**');
    expect(bayes).toContain('<Term name="P(A | B)">');
  });
});

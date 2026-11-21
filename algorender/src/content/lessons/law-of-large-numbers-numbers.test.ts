// B5 of the math and ML path, "The law of large numbers and Monte Carlo":
// every number the lesson quotes is measured here from the code that draws it
// (the monte-carlo visualiser and the estimate-pi exercise), and must appear in
// the lesson exactly as written. The embeds are checked too: each preset
// exists with its seed, the prediction challenge asks at least its goal, and
// the lesson embeds its one exercise, which practises this lesson's visualiser.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import remarkMath from 'remark-math';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  areaEstimates,
  band,
  dartsRun,
  diceRun,
  DIE_MEAN,
  errorBar,
  inLens,
  lensArea,
  lensBox,
  lensDarts,
  MAX_N,
  monteCarlo,
  piRuns,
  P_QUARTER,
  samplesFor,
  SIGMA_DART,
  SIGMA_DIE,
  spread,
  surplus,
  type MonteCarloInput,
} from '@/algorithms/probability/monte-carlo';
import { getExercise } from '@/content/exercises';
import { estimatePi, nextState } from '@/content/exercises/monte-carlo';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./law-of-large-numbers.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const inputOf = (preset: string, seed: number) => {
  const ex = monteCarlo.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`monte-carlo has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as MonteCarloInput;
};
const framesOf = (preset: string, seed: number) => traceOf(monteCarlo, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use. */
const SEEDS = { dice: 26, darts: 3, runs: 1, area: 1 } as const;

describe('law-of-large-numbers embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['dice', 'darts', 'runs', 'area']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['darts', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('monte-carlo');
      expect(e.seed).toBe(SEEDS[e.preset as keyof typeof SEEDS]);
      const frames = framesOf(e.preset, e.seed);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['estimate-pi']);
    expect(getExercise('estimate-pi')?.visualiser).toBe('monte-carlo');
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Now darts.'), body.indexOf('<PredictChallenge'));
    for (const v of ['π/4', '0, 2 or 4', '0.58', '100,000', '108,000', '0.785']) expect(before).not.toContain(v);
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(10);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('law-of-large-numbers quotes: a die’s running average', () => {
  const run = diceRun(SEEDS.dice);
  const m = (n: number) => fmt(run.means[n - 1], 3);

  it('works out E[X] and σ for a die', () => {
    const gaps = [1, 2, 3, 4, 5, 6].map((f) => (f - 3.5) ** 2);
    expect(gaps).toEqual([6.25, 2.25, 0.25, 0.25, 2.25, 6.25]);
    expect(gaps.reduce((s, g) => s + g, 0)).toBe(17.5);
    expect(fmt(17.5 / 6, 2)).toBe('2.92');
    expect(fmt(SIGMA_DIE, 2)).toBe('1.71');
    expect(body).toContain('\\sigma^2 &= \\tfrac{1}{6}\\,(6.25 + 2.25 + 0.25 \\\\ &\\qquad + 0.25 + 2.25 + 6.25) \\\\ &= 17.5 / 6 \\approx 2.92');
    expect(body).toContain('so $\\sigma \\approx 1.71$');
  });

  it('quotes the run from seed 26', () => {
    expect(run.rolls.slice(0, 4)).toEqual([4, 5, 4, 1]);
    expect(run.means[3]).toBe(DIE_MEAN);
    expect(body).toContain('the first roll is a 4 and the next three are 5, 4 and 1, so after 4 rolls the average is exactly 3.5');
    expect([m(16), run.totals[15], 3.5 * 16]).toEqual(['4.188', 67, 56]);
    expect(body).toContain('after 16 rolls it has climbed to 4.188, because the total is 67 where the expected total is 3.5 × 16 = 56');
    expect([m(64), m(256), m(1024), m(MAX_N)]).toEqual(['3.672', '3.656', '3.605', '3.544']);
    expect(fmt(run.means[MAX_N - 1] - DIE_MEAN, 3)).toBe('0.044');
    expect(body).toContain('3.672 after 64 rolls, 3.656 after 256, 3.605 after 1,024 and 3.544 after 4,096, just 0.044 from 3.5');
    // The surplus in the total: never paid back.
    const gaps = [16, 64, 256, 1024, MAX_N].map((n) => surplus(run, n));
    expect(gaps).toEqual([11, 11, 40, 108, 181]);
    expect(body).toContain('it was 11 after 16 rolls, still 11 after 64, then 40 after 256, 108 after 1,024 and 181 after 4,096');
    expect(fmt(181 / 4096, 3)).toBe('0.044');
    expect(body).toContain('181 ÷ 4,096 is only 0.044');
    // The frames narrate the same run.
    const frames = framesOf('dice', SEEDS.dice);
    expect(frames[1].note).toContain('The first roll is a 4');
    expect(frames[5].note).toContain('+40, against +11 after 64');
    // The 16-roll question (an eighth of the band) is answered in rolls, not as 64.
    expect(frames[3].checkpoint!.choices[frames[3].checkpoint!.answer]).toBe('1,024');
    expect(frames[4].note).toContain('64 times the 16 rolls, 1,024 in all');
  });

  it('measures the band', () => {
    expect([1, 4, 16, 64].map((n) => fmt(band(SIGMA_DIE, n)))).toEqual(['3.42', '1.71', '0.85', '0.43']);
    expect(fmt(band(SIGMA_DIE, MAX_N), 3)).toBe('0.053');
    expect(body).toContain('± 3.42 after one roll, ± 1.71 after 4, ± 0.85 after 16, ± 0.43 after 64 and ± 0.053 after 4,096');
    expect(Math.abs(run.means[MAX_N - 1] - DIE_MEAN)).toBeLessThan(band(SIGMA_DIE, MAX_N));
    // Where √n comes from: 16 rolls' total has variance 16σ², its drift σ√16, the average's miss σ/√16.
    expect([fmt(16 * 2.92, 1), fmt(16 * SIGMA_DIE ** 2, 1)]).toEqual(['46.7', '46.7']);
    expect([fmt(Math.sqrt(46.7), 1), fmt(SIGMA_DIE * 4, 1)]).toEqual(['6.8', '6.8']);
    expect([fmt(6.8 / 16, 2), fmt(SIGMA_DIE / Math.sqrt(16), 2), fmt(1.71 / 4, 2)]).toEqual(['0.43', '0.43', '0.43']);
    expect(body).toContain('For 16 rolls the total\'s variance is 16 × 2.92 = 46.7, so its typical drift is $\\sqrt{46.7} \\approx 6.8$ either side of 56, and the average\'s typical miss is 6.8 ÷ 16 ≈ 0.43, which is $1.71/\\sqrt{16}$');
    expect(body).toContain('The band is twice that either side: ± 0.85 at 16 rolls');
    // 949 runs in 1,000 inside the band at 1,024 rolls.
    let inside = 0;
    for (let s = 0; s < 1000; s++) if (Math.abs(diceRun(s).means[1023] - DIE_MEAN) <= band(SIGMA_DIE, 1024)) inside++;
    expect(inside).toBe(949);
    expect(fmt(band(SIGMA_DIE, 1024), 3)).toBe('0.107');
    expect(body).toContain('Rolling 1,024 dice in each of 1,000 separate runs, 949 of the 1,000 averages landed inside ± 0.107: about 19 in 20');
  });
});

describe('law-of-large-numbers quotes: darts estimate π', () => {
  const { inside, estimates } = dartsRun(SEEDS.darts);
  const e = (n: number) => fmt(estimates[n - 1], 4);

  it('works out the chance and the spread of one dart', () => {
    expect(fmt(P_QUARTER, 3)).toBe('0.785');
    expect(fmt(1 - P_QUARTER, 3)).toBe('0.215');
    expect(fmt(SIGMA_DART, 2)).toBe('1.64');
    expect(fmt(4 * Math.sqrt(0.785 * 0.215), 2)).toBe('1.64');
    expect(body).toContain('the chance is $\\pi/4 \\approx 0.785$');
    expect(body).toContain('$\\sigma = 4\\sqrt{0.785 \\times 0.215} \\approx 1.64$');
    // One flip's variance p(1 − p), times 4² for a score of 4.
    expect(SIGMA_DART ** 2).toBeCloseTo(16 * P_QUARTER * (1 - P_QUARTER), 12);
    expect(body).toContain('Inside or not is one flip with chance $p = 0.785$');
    expect(body).toContain('which multiplies the variance by $4^2 = 16$ and the spread by 4');
  });

  it('quotes the run from seed 3', () => {
    expect(inside.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(body).toContain('the first 4 darts all land inside, an estimate of 4');
    expect([inside[15], e(16)]).toEqual([14, '3.5']);
    expect(body).toContain('After 16 darts 14 are inside, so the estimate is 3.5');
    expect([e(64), e(512), e(1024)]).toEqual(['2.9375', '3.1484', '3.1367']);
    expect(body).toContain('2.9375 after 64, 3.1484 after 512, 3.1367 after 1,024');
    expect([commas(inside[MAX_N - 1]), e(MAX_N), fmt(estimates[MAX_N - 1] - Math.PI, 4)]).toEqual(['3,237', '3.1611', '0.0195']);
    expect(body).toContain('After 4,096 darts, 3,237 are inside, and the estimate is 3.1611, off by 0.0195');
    // Within the band, but not within 0.01: the challenge's last answer is No.
    expect(Math.abs(estimates[MAX_N - 1] - Math.PI)).toBeLessThan(band(SIGMA_DART, MAX_N));
    expect(framesOf('darts', SEEDS.darts)[12].checkpoint!.answer).toBe(1);
  });

  it('measures the band and the darts a narrow one needs', () => {
    expect([fmt(band(SIGMA_DART, 16)), fmt(band(SIGMA_DART, 32)), fmt(Math.SQRT2), fmt(band(SIGMA_DART, MAX_N), 3)]).toEqual(['0.82', '0.58', '1.41', '0.051']);
    expect(body).toContain('At 16 darts that is ± 0.82; doubling to 32 only narrows it by $\\sqrt{2} \\approx 1.41$, to ± 0.58. At 4,096 darts it is ± 0.051');
    const need = samplesFor(SIGMA_DART, 0.01);
    expect(Math.round(need / 1000) * 1000).toBe(108_000);
    expect(body).toContain('$(2 \\times 1.64 / 0.01)^2$, about 108,000 darts');
    // From ± 0.15 at 512 darts to ± 0.01: about 15 times narrower, so about 210 times the darts.
    const narrower = band(SIGMA_DART, 512) / 0.01;
    expect(fmt(band(SIGMA_DART, 512))).toBe('0.15');
    expect(Math.round(narrower)).toBe(15);
    expect(Math.round(narrower ** 2 / 10) * 10).toBe(210);
    expect(body).toContain('going from ± 0.15 at 512 darts to ± 0.01 needs about 210 times as many darts, not 15 times');
    expect(body).toContain('± 0.82 only to ± 0.58');
  });
});

describe('law-of-large-numbers quotes: twenty runs', () => {
  const runs = piRuns(SEEDS.runs);
  const at = (n: number) => runs.map((r) => r[n - 1]);
  const inside = (n: number) => at(n).filter((v) => Math.abs(v - Math.PI) <= band(SIGMA_DART, n)).length;

  it('quotes the runs from seed 1', () => {
    expect(at(1).filter((v) => v === 4).length).toBe(18);
    expect(body).toContain('here 18 say 4 and 2 say 0');
    expect([fmt(spread(at(64)), 3), fmt(spread(at(1024)), 3), fmt(spread(at(1024)) / spread(at(64)), 2)]).toEqual(['0.25', '0.058', '0.23']);
    expect(body).toContain('At 64 darts each the twenty estimates spread by 0.25 (their standard deviation); at 1,024, sixteen times as many, they spread by 0.058, 0.23 of what they were');
    expect([64, 256, 1024, MAX_N].map(inside)).toEqual([18, 19, 18, 20]);
    expect(body).toContain('Inside the band sat 18 of 20 runs at 64 darts, 19 at 256, 18 at 1,024 and all 20 at 4,096');
  });
});

describe('law-of-large-numbers quotes: the generator and the exercise', () => {
  it('steps the Park-Miller generator from seed 1', () => {
    expect([nextState(1), nextState(nextState(1)), nextState(nextState(nextState(1)))]).toEqual([16807, 282475249, 1622650073]);
    expect(body).toContain('From seed 1 the states go 16,807, then 282,475,249, then 1,622,650,073');
    expect(body).toContain('keeping only the remainder after dividing by 2,147,483,647');
  });

  it('estimates π from seed 7 with more and more darts', () => {
    const runs = [1000, 10000, 100000].map((n) => estimatePi({ n, seed: 7 }).estimate);
    expect(runs.map(String)).toEqual(['3.004', '3.1512', '3.13812']);
    expect(runs.map((v) => fmt(Math.abs(v - Math.PI), 4))).toEqual(['0.1376', '0.0096', '0.0035']);
    expect(body).toContain('With seed 7, 1,000 darts give 3.004, 10,000 give 3.1512 and 100,000 give 3.13812. The misses are 0.1376, 0.0096 and 0.0035');
    // The 1,000-dart run is outside its band; the other two are inside theirs.
    const bands = [1000, 10000, 100000].map((n) => band(SIGMA_DART, n));
    expect([fmt(bands[0], 2), fmt(bands[1], 3), fmt(bands[2], 3)]).toEqual(['0.1', '0.033', '0.01']);
    expect(runs.map((v, i) => Math.abs(v - Math.PI) <= bands[i])).toEqual([false, true, true]);
    expect(body).toContain('The band at 1,000 darts is ± 0.10, so 3.004 is one of the few runs that land outside it; at 10,000 and 100,000 the bands are ± 0.033 and ± 0.010, and both estimates sit inside');
  });
});

describe('law-of-large-numbers quotes: the lens', () => {
  const d = 1;
  const darts = lensDarts(SEEDS.area, d);
  const est = areaEstimates(d, darts);
  const inside = (n: number) => darts.slice(0, n).filter((p) => inLens(d, p)).length;

  it('uses the area preset’s lens, 1 apart in a box of area 2', () => {
    const input = inputOf('area', SEEDS.area);
    expect(input).toEqual({ story: 'area', d: 1, seed: 1 });
    const box = lensBox(d);
    expect([box.x1 - box.x0, box.y1 - box.y0, box.area]).toEqual([1, 2, 2]);
    expect(body).toContain('here 1 wide and 2 tall, so area 2');
  });

  it('quotes the estimate, its error bar and the exact area', () => {
    expect([inside(16), est[15]]).toEqual([10, 1.25]);
    expect(body).toContain('After 16 darts, 10 are inside');
    expect(body).toContain('its area is about $2 \\times 10/16 = 1.25$');
    expect(fmt(errorBar(2, 10 / 16, 16), 3)).toBe('0.484');
    expect(body).toContain('± 0.484 after 16 darts');
    const k = inside(MAX_N);
    expect([commas(k), fmt(est[MAX_N - 1], 3), fmt(errorBar(2, k / MAX_N, MAX_N), 2)]).toEqual(['2,506', '1.224', '0.03']);
    expect(body).toContain('After 4,096 darts, 2,506 are inside, giving 1.224 ± 0.03');
    const exact = lensArea(d);
    expect(exact).toBeCloseTo(2 * (Math.PI / 3 - Math.sqrt(3) / 4), 12);
    expect(fmt(exact, 4)).toBe('1.2284');
    expect(body).toContain('&\\approx 1.2284');
    expect(fmt(Math.abs(est[MAX_N - 1] - exact), 4)).toBe('0.0047');
    expect(body).toContain("The darts' 1.224 is off by 0.0047, well inside their error bar");
    // At d = 0 the lens is the whole circle.
    expect(lensArea(0)).toBeCloseTo(Math.PI, 12);
  });
});

describe('law-of-large-numbers: quiz and probes', () => {
  it('checks the quiz', () => {
    expect(90 / 6).toBe(15);
    expect(fmt(0.08 / Math.sqrt(3600 / 900), 3)).toBe('0.04');
    expect(fmt(0.08 / 4, 3)).toBe('0.02');
    expect((4 * 1950) / 2500).toBe(3.12);
    expect(1950 / 2500).toBe(0.78);
    expect(fmt(4 * 3 * 0.35, 2)).toBe('4.2');
    expect(fmt((2 * 1.64) / Math.sqrt(6400), 3)).toBe('0.041');
    expect(fmt((2 * 1.64) / 6400, 4)).toBe('0.0005');
    expect(fmt(2 * 1.64, 1)).toBe('3.3');
    expect(body).toContain('2 × 1.64 / √6,400 = 3.28 / 80 ≈ 0.041');
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect(4 * 400).toBe(1600);
    expect(Math.sqrt(5000 / 200)).toBe(5);
    expect(163 - 300 / 2).toBe(13);
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    // A number counts only whole: 400 is not in 6,400, nor 0.3 in 0.35.
    const has = (text: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(text);
    for (const n of ['9 times', '163', '13 more', '30,000', '400', '1,600', '160,000', '5,000', '25 times', '± 0.6', '± 0.3']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    // And the quiz's numbers are not the lesson's.
    const lessonText = text.slice(0, text.indexOf('<Quiz'));
    for (const n of ['2,500', '1,950', '6,400', '3,600', '900', '0.35', '24 sixes', '12', '4.2']) expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
  });
});

describe('law-of-large-numbers: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('law-of-large-numbers', source);
    expect(mistakes.map((m) => m.id)).toEqual(['die-evens-out', 'twice-samples-half-error']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('law-of-large-numbers', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(6);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions) for (const [choice, id] of Object.entries(q.traps ?? {})) {
      expect(ids.has(id)).toBe(true);
      expect(Number(choice)).not.toBe(q.answer);
    }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('law-of-large-numbers', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'see', 'do', 'see', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3000);
    expect(total).toBeLessThanOrEqual(3600);
    expect(source).not.toContain('—');
  });
});

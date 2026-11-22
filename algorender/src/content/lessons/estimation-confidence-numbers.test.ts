// B6 of the math and ML path, "Standard errors, confidence intervals and the
// bootstrap": every number the lesson quotes is measured here from the code
// that draws it (the confidence-intervals visualiser and the bootstrap-ci
// exercise), and must appear in the lesson exactly as written. The embeds are
// checked too: each preset exists with its seed, the prediction challenge asks
// at least its goal, the lesson embeds its one exercise, which practises this
// lesson's visualiser, and it links only lessons it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  BIG_N,
  bootstrapRun,
  CHANCES,
  confidenceIntervals,
  coverage,
  firstSample,
  intervalsRun,
  mean,
  MU,
  N,
  sampleSd,
  SIGMA,
  spread,
  standardError,
  standardErrorRun,
  total,
  type CiInput,
} from '@/algorithms/probability/confidence-intervals';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { bootstrapCi, dropOf, LESSON_ROLLS } from '@/content/exercises/bootstrap';
import { lessons } from '@/content/lessons';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./estimation-confidence.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const SEED = 4;

const framesOf = (preset: string, seed: number) => {
  const ex = confidenceIntervals.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`confidence-intervals has no example ${preset}`);
  return traceOf(confidenceIntervals, ex.make({ seed, size: 0 }) as CiInput).frames;
};

describe('estimation-confidence embeds and links', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['standard-error', 'intervals', 'bootstrap']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['intervals', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('confidence-intervals');
      expect(e.seed).toBe(SEED);
      const frames = framesOf(e.preset, e.seed);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['bootstrap-ci']);
    expect(getExercise('bootstrap-ci')?.visualiser).toBe('confidence-intervals');
    expect(source).toContain('](/code/standard-error)');
    expect(getExercise('standard-error')?.visualiser).toBe('confidence-intervals');
  });

  it('links only lessons on what it builds on', () => {
    const { concepts } = loadConcepts();
    const before = new Set<string>();
    const walk = (id: string) => {
      for (const p of concepts.find((c) => c.id === id)?.prereqs ?? []) {
        if (before.has(p)) continue;
        before.add(p);
        walk(p);
      }
    };
    walk('estimation-confidence');
    const links = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const target of links) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('step="predict"'), body.indexOf('<PredictChallenge'));
    for (const v of ['95%', '2.5', 'either holds', 'as often', '68%']) expect(before).not.toContain(v);
    // "Within 1, 2 or 3 standard errors" names the rule, not a count of misses.
    expect(before).not.toMatch(/(?<!1, )2 or 3/);
    // Nor do the hook, the terms or the sections before it say what share of intervals catch μ.
    const lead = body.slice(0, body.indexOf('<PredictChallenge'));
    for (const v of ['95% of samples', 'about 95%', 'catches $\\mu$ in about', '19 times in 20']) expect(lead).not.toContain(v);
    expect(lead).toContain('catches $\\mu$ in a known share of samples');
    // The sentences before each Explore ask rather than tell.
    const se = body.slice(0, body.indexOf("preset: 'standard-error'"));
    expect(se).not.toContain('4.04');
    const boot = body.slice(body.indexOf('step="see" title="The bootstrap'), body.indexOf("preset: 'bootstrap'"));
    expect(boot).not.toContain('same average every time');
  });

  it('labels its examples without giving answers away', () => {
    for (const ex of confidenceIntervals.input.examples) expect(ex.label).not.toMatch(/95%\s*catch|catch.*95|2 or 3|68%/);
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(10);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('estimation-confidence quotes: the standard error', () => {
  const { sample, second, means, big, bigMeans } = standardErrorRun(SEED);

  it('the die: its chances, μ = 4, and σ = √3 worked out', () => {
    expect(CHANCES).toEqual([1 / 8, 1 / 8, 1 / 8, 1 / 8, 1 / 4, 1 / 4]);
    expect([(1 + 2 + 3 + 4) / 8, (5 + 6) / 4, MU]).toEqual([1.25, 2.75, 4]);
    expect(body).toContain('\\mu &= \\tfrac{1 + 2 + 3 + 4}{8} + \\tfrac{5 + 6}{4} \\\\ &= 1.25 + 2.75 = 4');
    expect(fmt(SIGMA)).toBe('1.73');
    expect(fmt(SIGMA / Math.sqrt(N), 3)).toBe('0.346');
    const ex2 = [1, 2, 3, 4, 5, 6].reduce((t, f, i) => t + f * f * CHANCES[i], 0);
    expect([(1 + 4 + 9 + 16) / 8, (25 + 36) / 4, ex2, ex2 - MU * MU]).toEqual([3.75, 15.25, 19, 3]);
    expect(body).toContain('E[X^2] &= \\tfrac{1 + 4 + 9 + 16}{8} + \\tfrac{25 + 36}{4} \\\\ &= 3.75 + 15.25 = 19');
    expect(body).toContain('so $\\text{Var}(X) = 19 - 16 = 3$ and $\\sigma = \\sqrt{3} \\approx 1.73$. Then $\\sigma/\\sqrt{25} = 0.346$: one sample\'s SE, 0.324, came close without knowing $\\sigma$');
  });

  it('the sample of 25 rolls from seed 4', () => {
    expect(total(sample)).toBe(107);
    expect(mean(sample)).toBe(4.28);
    expect(fmt(mean(second))).toBe('4.04');
    expect(body).toContain('the rolls add up to 107, so $\\bar{x} = 107/25 = 4.28$. Would another 25 rolls give the same');
    expect(body).toContain('The next 25 rolls gave 4.04.');
    expect(framesOf('standard-error', SEED)[2].note).toContain('The next 25 rolls give x̄ = 4.04');
    const squares = sample.reduce((s, x) => s + (x - 4.28) ** 2, 0);
    expect(fmt(squares, 2)).toBe('63.04');
    expect(fmt(Math.sqrt(63.04 / 24), 2)).toBe('1.62');
    expect(fmt(sampleSd(sample), 2)).toBe('1.62');
    expect(body).toContain('add up to 63.04, and $$ \\begin{aligned} s &= \\sqrt{63.04 / 24} \\\\ &\\approx 1.62');
    expect(fmt(Math.sqrt(25 / 24), 2)).toBe('1.02');
    // Gaps from x̄ add up to less than gaps from μ.
    expect(sample.reduce((t, x) => t + (x - MU) ** 2, 0)).toBeGreaterThan(squares);
    expect(body).toContain('with $n = 25$ it makes $s$ about 2% bigger, since $\\sqrt{25/24} \\approx 1.02$');
    expect(fmt(standardError(sample), 3)).toBe('0.324');
    expect(fmt(1.62 / 5, 3)).toBe('0.324');
    expect(body).toContain('\\text{SE} = \\frac{s}{\\sqrt{n}} = \\frac{1.62}{5} \\approx 0.324');
    expect(body).toContain('typically only about 0.324 from $\\mu$');
    expect(fmt(spread(means), 3)).toBe('0.348');
    expect(body).toContain('their 1,000 averages spread by 0.348');
  });

  it('100 rolls', () => {
    expect(big.length).toBe(BIG_N);
    expect([fmt(sampleSd(big)), fmt(standardError(big), 3), fmt(spread(bigMeans), 3)]).toEqual(['1.83', '0.183', '0.171']);
    expect(body).toContain('With 100 rolls the run gets $s = 1.83$');
    expect(body).toContain('but SE $= 1.83/10 \\approx 0.183$. A hundred rolls\' averages spread by 0.171');
    expect(body).toContain('It makes the average more precise');
    const frames = framesOf('standard-error', SEED);
    expect(frames[5].note).toContain('s = 1.83');
  });
});

describe('estimation-confidence quotes: fifty intervals', () => {
  const run = intervalsRun(SEED);
  const first = run.two[0];

  it('sample 1’s interval', () => {
    expect(run.small[0]).toEqual(firstSample(SEED).sample);
    expect([fmt(first.xbar), fmt(first.se, 3), fmt(2 * first.se, 3), fmt(first.lo), fmt(first.hi)]).toEqual(['4.28', '0.324', '0.648', '3.63', '4.93']);
    expect(first.caught).toBe(true);
    expect(fmt(4.28 - 0.648, 3)).toBe('3.632');
    expect(fmt(4.28 + 0.648, 3)).toBe('4.928');
    expect(body).toContain('$\\bar{x} = 4.28$ and SE $\\approx 0.324$, so 2 SE $\\approx 0.648$ and its interval runs from 3.632 to 4.928. It catches $\\mu = 4$');
    expect(framesOf('intervals', SEED)[1].note).toContain('2 SE ≈ 0.648 and the interval x̄ ± 2 SE runs from 3.632 to 4.928');
    expect(body).toContain('the interval reaches only 0.648 either side: 22 of the 25 rolls lie outside it, and only the three 4s inside');
    expect(run.small[0].filter((r) => r >= first.lo && r <= first.hi)).toEqual([4, 4, 4]);
    expect(body).toContain('single rolls stray about 1.62 from 4.28');
  });

  it('the run of 50 from seed 4, and runs in general', () => {
    const missed = run.two.flatMap((iv, i) => (iv.caught ? [] : [[i + 1, iv.xbar]]));
    expect(missed).toEqual([
      [36, 4.56],
      [41, 4.76],
      [42, 4.8],
    ]);
    expect(body).toContain('In this run 47 of the 50 intervals caught $\\mu$ and 3 missed: samples 36, 41 and 42, whose averages 4.56, 4.76 and 4.8 all landed high');
    const runs = Array.from({ length: 1000 }, (_, s) => intervalsRun(s).two.filter((iv) => !iv.caught));
    const misses = runs.map((r) => r.length);
    const all = misses.reduce((t, m) => t + m, 0);
    const high = runs.flat().filter((iv) => iv.xbar > MU).length;
    expect([high, all, Math.round((100 * high) / all)]).toEqual([1845, 2953, 62]);
    expect(body).toContain('Over 1,000 runs of 50, 1,845 of the 2,953 misses, 62%, landed high');
    expect(fmt(all / 1000)).toBe('2.95');
    expect([misses.filter((m) => m === 0).length, misses.filter((m) => m >= 5).length]).toEqual([47, 166]);
    expect(body).toContain('Those 1,000 runs missed 2.95 times each on average (exactly 5% of 50 would be 2.5): 47 runs had no misses at all, and 166 had 5 or more');
    expect([run.bigTwo.filter((iv) => iv.caught).length, run.one.filter((iv) => iv.caught).length]).toEqual([48, 34]);
    expect(body).toContain('and 48 of them caught $\\mu$. Over 10,000 such samples, 9,547 did');
    expect(body).toContain('only 34 of the same 50 samples caught $\\mu$');
    expect([fmt((2 * SIGMA) / Math.sqrt(BIG_N)), fmt((2 * SIGMA) / Math.sqrt(N))]).toEqual(['0.35', '0.69']);
    expect(body).toContain('about $\\pm 0.35$ instead of $\\pm 0.69$');
    // The challenge itself says the same.
    const frames = framesOf('intervals', SEED);
    expect(frames[3].note).toContain('47 caught μ and 3 missed');
    expect(frames[3].note).toContain('All 3 misses landed high');
    expect(frames[6].note).toContain('34 of 50');
  });

  it('coverage over 10,000 samples', () => {
    expect([coverage(1, 10_000), coverage(3, 10_000, BIG_N), coverage(2, 10_000, N, 1)]).toEqual([0.9434, 0.9547, 0.6781]);
    expect(body).toContain('Over 10,000 samples of 25 rolls, $\\bar{x} \\pm 2\\,\\text{SE}$ caught $\\mu$ in 9,434');
    expect(body).toContain('over 10,000 samples 6,781, about 68%');
  });
});

describe('estimation-confidence quotes: the bootstrap', () => {
  const { first, means, cut, bigCut } = bootstrapRun(SEED);

  it('quotes the resamples from seed 4', () => {
    expect(fmt(mean(first))).toBe('4.6');
    expect(body).toContain('resample 1 has average 4.6');
    expect([fmt(mean(means), 3), fmt(spread(means), 3)]).toEqual(['4.268', '0.328']);
    expect(body).toContain('(their own average is 4.268), not around $\\mu = 4$');
    expect(body).toContain('They spread by 0.328, close to the formula\'s SE of 0.324');
    expect(cut.drop).toBe(25);
    expect([fmt(cut.lo), fmt(cut.hi)]).toEqual(['3.6', '4.88']);
    const sorted = [...means].sort((a, b) => a - b);
    expect([sorted[25], sorted[974]]).toEqual([cut.lo, cut.hi]);
    expect(body).toContain('from the 26th lowest, 3.6, to the 26th highest, 4.88. The formula gave 3.63 to 4.93');
    expect([fmt(bigCut.lo), fmt(bigCut.hi), fmt(bigCut.hi - bigCut.lo), fmt(cut.hi - cut.lo)]).toEqual(['3.7', '4.34', '0.64', '1.28']);
    expect(body).toContain('bootstraps to 3.7 to 4.34, which is 0.64 wide against 1.28, half as wide');
  });

  it('quotes the exercise on the same rolls', () => {
    expect(dropOf(400)).toBe(10);
    expect(400 - 1 - 10).toBe(389);
    expect(body).toContain('With 400 resamples, 2.5% is 10, so it drops 10 from each end; positions count from 0, so the interval runs from position 10 to position 389');
    expect(bootstrapCi({ data: firstSample(SEED).sample, resamples: 400, seed: 7 })).toEqual([3.64, 4.92]);
    expect(LESSON_ROLLS).toEqual(firstSample(SEED).sample);
    const lastTest = getExercise('bootstrap-ci')!.tests.at(-1)!;
    expect(lastTest.input).toEqual({ data: LESSON_ROLLS, resamples: 400, seed: 7 });
    expect(lastTest.name).toContain('x̄ = 4.28');
    expect(body).toContain("The exercise's last test runs on the lesson's 25 rolls ($\\bar{x} = 4.28$): 400 resamples from seed 7 give 3.64 to 4.92");
    expect(getExercise('standard-error')!.tests.some((t) => JSON.stringify(t.input) === JSON.stringify({ data: LESSON_ROLLS }))).toBe(true);
  });
});

describe('estimation-confidence: quiz and probes', () => {
  const has = (text: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(text);

  it('checks the quiz', () => {
    expect([12 / Math.sqrt(64), 12 / 64, 144 / 64]).toEqual([1.5, 0.1875, 2.25]);
    expect([fmt(7.2 - 0.3), fmt(7.2 + 0.3), fmt(7.2 - 0.15), fmt(7.2 + 0.15)]).toEqual(['6.9', '7.5', '7.05', '7.35']);
    expect([dropOf(2000), 2000 * 0.05]).toEqual([50, 100]);
    expect([9 / Math.sqrt(900), 18 - 0.6, 18 + 0.6]).toEqual([0.3, 17.4, 18.6]);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect(Math.sqrt(1600)).toBe(40);
    expect(Math.sqrt(9)).toBe(3);
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    for (const n of ['41%', '47%', '3.1', '3.9', '1,600', '31', '33', '9 times', '40']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    const lessonText = text.slice(0, text.indexOf('<Quiz'));
    for (const n of ['64', '12', '7.2', '0.15', '2,000', '900', '9 minutes', '17.4', '18.6', '1.5']) expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
  });
});

describe('estimation-confidence: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('estimation-confidence', source);
    expect(mistakes.map((m) => m.id)).toEqual(['ninety-five-percent-chance', 'interval-holds-the-data']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('estimation-confidence', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(6);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions) for (const [choice, id] of Object.entries(q.traps ?? {})) {
      expect(ids.has(id)).toBe(true);
      expect(Number(choice)).not.toBe(q.answer);
    }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('estimation-confidence', source);
    expect(prompt.rubric.length).toBe(4);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'see', 'do', 'check', 'explain', 'recap']);
    expect(source).not.toContain('—');
  });
});

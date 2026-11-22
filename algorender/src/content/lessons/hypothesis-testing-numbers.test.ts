// B6 of the math and ML path, "Hypothesis tests and p-values": every number
// the lesson quotes is measured here from the code that draws it (the
// permutation-test visualiser and exercise), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists with its
// seed, the prediction challenge asks at least its goal, the lesson embeds its
// one exercise, which practises this lesson's visualiser, and it links only
// lessons on what it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import remarkMath from 'remark-math';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALPHA,
  anyFalseAlarm,
  BONFERRONI,
  choose,
  exactTest,
  FLASHCARDS,
  lit,
  manyTests,
  mean,
  nullExperiments,
  permutationTest,
  REREADING,
  rounds,
  SHUFFLES,
  shuffleTest,
  type PermutationInput,
} from '@/algorithms/probability/permutation-test';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { permutationReference } from '@/content/exercises/permutation-test';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./hypothesis-testing.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const signed = (v: number, digits = 2) => (v > 0 ? `+${fmt(v, digits)}` : fmt(v, digits));

const inputOf = (preset: string, seed: number) => {
  const ex = permutationTest.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`permutation-test has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as PermutationInput;
};
const framesOf = (preset: string, seed: number) => traceOf(permutationTest, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use. */
const SEEDS = { shuffle: 7, 'no-effect': 9, many: 4 } as const;

describe('hypothesis-testing embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['shuffle', 'no-effect', 'many']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['no-effect', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('permutation-test');
      expect(e.seed).toBe(SEEDS[e.preset as keyof typeof SEEDS]);
      const frames = framesOf(e.preset, e.seed);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['permutation-test']);
    expect(getExercise('permutation-test')?.visualiser).toBe('permutation-test');
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
    walk('hypothesis-testing');
    const links = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(5);
    for (const target of links) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('What does a permutation test do when'), body.indexOf('<PredictChallenge'));
    expect(before.length).toBeGreaterThan(200);
    for (const v of ['1 in 20', '1 in 100', 'flat', 'evenly', 'equally likely', 'p > 0.5', 'above 0.5', 'unlikely', 'rarely']) expect(before.toLowerCase()).not.toContain(v);
    // Nor anywhere earlier in the lesson.
    const earlier = body.slice(0, body.indexOf('<PredictChallenge')).toLowerCase();
    for (const v of ['1 in 20', 'false alarm', 'flat']) expect(earlier).not.toContain(v);
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(13);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('hypothesis-testing: the review’s fixes stay fixed', () => {
  it('states random assignment, and sides chosen before the data', () => {
    expect(body).toContain('A coin toss decides which eight use flashcards');
    expect(body).toContain('The null hypothesis and the random dealing together make every one of them as likely as the real split');
    expect(body).toContain('The question, fixed before looking at the scores, was whether the methods make a difference in either direction');
    expect(body).not.toMatch(/really help\?/);
  });

  it('words the threshold as a share of no-effect experiments, not of significant results', () => {
    expect(body).not.toContain('false alarms you agree to accept');
    expect(body).toContain('of the experiments where nothing is going on, the share you agree to call significant');
    expect(body).toContain('It is **not** the share of significant results that are false alarms');
  });

  it('no caption or example label states a Predict answer', () => {
    const captions = [...source.matchAll(/caption="([^"]*)"/g)].map((m) => m[1]);
    expect(captions.length).toBe(2);
    const labels = permutationTest.input.examples.map((e) => e.label);
    const prompts = permutationTest.content.experiments.map((e) => e.prompt);
    for (const text of [...captions, ...labels, ...prompts])
      for (const giveaway of ['0.0025', 'anywhere', 'flat', 'level', 'lights up', 'one usually', 'a third', '64%', '1 in 20', 'rarely'])
        expect(text.toLowerCase(), text).not.toContain(giveaway);
  });

  it('keeps the truth out of the many-tests stems', () => {
    expect(body).not.toContain('None of the foods has any effect');
    expect(body).not.toContain('none really changes sales');
  });
});

describe('hypothesis-testing quotes: shuffling the flashcard scores', () => {
  const run = shuffleTest(FLASHCARDS, REREADING, SHUFFLES, SEEDS.shuffle);
  const exact = exactTest(FLASHCARDS, REREADING);

  it('uses the shuffle preset’s scores', () => {
    expect(inputOf('shuffle', SEEDS.shuffle)).toEqual({ story: 'shuffle', a: [...FLASHCARDS], b: [...REREADING], seed: 7 });
    expect([mean(FLASHCARDS), mean(REREADING), run.observed]).toEqual([76.5, 66.5, 10]);
    expect(body).toContain('The flashcard group averages 76.5 out of 100 and the rereaders 66.5: a gap of 10 points');
    expect(FLASHCARDS.length + REREADING.length).toBe(16);
    expect(choose(16, 8)).toBe(12870);
    expect(body).toContain('\\binom{16}{8} = 12{,}870');
  });

  it('quotes the first shuffles and the pile', () => {
    const frames = framesOf('shuffle', SEEDS.shuffle);
    expect(run.diffs[0]).toBe(0);
    expect(frames[1].note).toContain('This shuffle gives A′ a mean of 71.5 and B′ 71.5, a difference of 0');
    expect(body).toContain('the first shuffle happens to give two groups with the same mean, 71.5 each, so a difference of 0');
    const ten = run.diffs.slice(0, 10).map((d) => signed(d));
    expect(ten.join(', ')).toBe('0, +4.5, +2, +0.5, +2, +8.25, +2, +2.5, −5.5, −9.25');
    expect(body).toContain('The first ten shuffles give 0, +4.5, +2, +0.5, +2, +8.25, +2, +2.5, −5.5 and −9.25');
    expect(fmt(mean(run.diffs), 2)).toBe('−0.09');
    expect(body).toContain('After 1,000 shuffles the pile is a hump centred on −0.09');
    expect(run.diffs.filter((d) => Math.abs(d) <= 5).length).toBe(694);
    expect(body).toContain('694 of the 1,000 lie between −5 and +5');
    const sd = Math.sqrt(mean(run.diffs.map((d) => (d - mean(run.diffs)) ** 2)));
    expect([fmt(sd, 2), fmt(10 / 4.88, 2)]).toEqual(['4.88', '2.05']);
    expect(body).toContain("The pile's standard deviation is 4.88: it plays the role of a [standard error](/learn/estimation-confidence) for the difference");
    expect(body).toContain('the real difference of 10 sits about 10 ÷ 4.88 ≈ 2.05 spreads from the middle');
  });

  it('counts both tails, ties included, and works out p', () => {
    expect([run.diffs.filter((d) => d >= 10).length, run.diffs.filter((d) => d <= -10).length, run.extreme]).toEqual([22, 20, 42]);
    expect(run.diffs.filter((d) => Math.abs(d) === 10).length).toBeGreaterThan(0);
    expect(body).toContain('22 shuffles reached +10 or more and 20 reached −10 or less');
    expect(body).toContain('That makes 42 of the 1,000');
    expect(run.p).toBe(0.042);
    expect(body).toContain('p = \\frac{42}{1{,}000} = 0.042');
    expect(body).toContain('about 4 times in 100');
    expect(lit(run.extreme, SHUFFLES, ALPHA)).toBe(true);
    // The visualiser asks for p and shows the same.
    const frames = framesOf('shuffle', SEEDS.shuffle);
    expect(frames[5].checkpoint!.choices[frames[5].checkpoint!.answer]).toBe('0.042');
  });

  it('measures the wobble and the exact p', () => {
    expect(fmt(Math.sqrt((0.042 * 0.958) / 1000), 4)).toBe('0.0063');
    expect(body).toContain('$\\sqrt{p(1 - p)/N} \\approx 0.0063$');
    expect([exact.splits, exact.extreme, fmt(exact.p, 4)]).toEqual([12870, 488, '0.0379']);
    expect(body).toContain('488 are at least as extreme, and the exact p is $488 / 12{,}870 \\approx 0.0379$');
  });

  it('quotes the dragged gap of 5 and the experiments with a real 5-point advantage', () => {
    const lower = FLASHCARDS.map((x) => x - 5);
    expect(mean(lower) - mean(REREADING)).toBe(5);
    expect(fmt(exactTest(lower, REREADING).p, 3)).toBe('0.271');
    expect(body).toContain('so the gap is 5 instead of 10: the exact p becomes 0.271');
    // Dragging A's mean down 5 steps of its handle moves every A score down 5.
    let input = inputOf('shuffle', SEEDS.shuffle);
    for (let k = 0; k < 5; k++) input = permutationTest.input.drag!(input as never, 'shift', [1, mean((input as { a: number[] }).a) - 1 / 8]) as PermutationInput;
    expect((input as { a: number[] }).a).toEqual(lower);
    const real = nullExperiments(11, 400, SHUFFLES, 5);
    expect(real.filter((e) => !lit(e.extreme, SHUFFLES, ALPHA)).length).toBe(329);
    expect(body).toContain('In 400 simulated experiments, each drawing 16 scores from the bell curve above (mean 65, spread 10) and adding 5 points to every A score, with 8 students a group, p came out above 0.05 in 329 of them');
    expect(body).toContain('drag group A\'s mean down 5 points (one point per arrow press)');
    expect(body).toContain('a real 5-point advantage gave p above 0.05 in 329 of 400 experiments');
  });
});

describe('hypothesis-testing quotes: when nothing is going on', () => {
  it('quotes the challenge’s run from seed 9', () => {
    const ex = nullExperiments(SEEDS['no-effect'], 200);
    expect(fmt(ex[0].p, 3)).toBe('0.779');
    expect(body).toContain('the first experiment gives p = 0.779');
    expect(body).toContain('about 10 in every bar of width 0.05');
    expect(200 / 20).toBe(10);
    const below = ex.filter((e) => lit(e.extreme, SHUFFLES, ALPHA)).length;
    const above = ex.filter((e) => e.extreme > SHUFFLES / 2).length;
    const strict = ex.filter((e) => lit(e.extreme, SHUFFLES, 0.01)).length;
    expect([below, above, strict]).toEqual([11, 94, 2]);
    expect(body).toContain('Of the 200, 11 came out at or below 0.05, close to 1 in 20, and 94 came out above 0.5');
    expect(body).toContain('With a threshold of 0.01, 2 of the 200 still came out at or below it, 1 in 100');
    // The frames show the same.
    const frames = framesOf('no-effect', SEEDS['no-effect']);
    expect(frames[1].note).toContain('p = 0.779');
    expect(frames[3].note).toContain('11 of the 200');
  });
});

describe('hypothesis-testing quotes: twenty tests at once', () => {
  it('quotes the round from seed 4', () => {
    const tests = manyTests(SEEDS.many);
    const litAt05 = tests.map((t, i) => [t, i + 1] as const).filter(([t]) => lit(t.extreme, SHUFFLES, ALPHA));
    expect(litAt05.map(([t, i]) => [i, t.p])).toEqual([[7, 0.012]]);
    expect(body).toContain('In this round, test 7 lights up, with p = 0.012');
    expect(tests.filter((t) => lit(t.extreme, SHUFFLES, BONFERRONI)).length).toBe(0);
    expect(body).toContain("no test reaches 0.0025: test 7's 0.012 is not enough");
    expect(20 * 0.05).toBe(1);
    expect(body).toContain('20 × 0.05 = 1');
  });

  it('works out the chance of any false alarm, before and after the correction', () => {
    expect([fmt(0.95 ** 20, 2), fmt(anyFalseAlarm(ALPHA), 2), fmt(anyFalseAlarm(BONFERRONI), 3)]).toEqual(['0.36', '0.64', '0.049']);
    expect(BONFERRONI).toBe(0.0025);
    expect(body).toContain('all twenty stay dark with chance $0.95^{20} \\approx 0.36$');
    expect(body).toContain('1 - 0.95^{20} \\approx 0.64');
    expect(body).toContain('$0.05 / 20 = 0.0025$');
    expect(body).toContain('$1 - 0.9975^{20} \\approx 0.049$');
    const any = rounds(SEEDS.many).lit.filter((r) => r.some(Boolean)).length;
    expect(any).toBe(64);
    expect(body).toContain('In 100 more rounds of twenty, 64 lit at least one test');
    expect(framesOf('many', SEEDS.many)[2].note).toContain('64 lit at least one');
  });
});

describe('hypothesis-testing quotes: the generator and the exercise', () => {
  it('quotes the exercise’s p on the flashcard scores from seed 7', () => {
    const exercise = getExercise('permutation-test')!;
    const test = exercise.tests[0].input as { a: number[]; b: number[]; shuffles: number; seed: number };
    expect(test).toEqual({ a: [...FLASHCARDS], b: [...REREADING], shuffles: 1000, seed: 7 });
    const ref = permutationReference(test);
    expect(ref.diffs).toEqual(shuffleTest(FLASHCARDS, REREADING, SHUFFLES, 7).diffs);
    expect(ref.p).toBe(0.042);
    expect(body).toContain('Your code on the flashcard scores with 1,000 shuffles from seed 7 makes the same 1,000 differences and returns the same p = 0.042');
    expect(body).toContain('each step multiplies the state by 16,807 and keeps the remainder after dividing by 2,147,483,647');
  });
});

describe('hypothesis-testing: quiz and probes', () => {
  it('checks the quiz', () => {
    expect(18 / 600).toBe(0.03);
    expect(1 - 18 / 600).toBe(0.97);
    expect(0.05 / 25).toBe(0.002);
    expect(0.05 / Math.sqrt(25)).toBe(0.01);
    expect(0.05 * 25).toBe(1.25);
    expect(30 * 0.05).toBe(1.5);
    expect(body).toContain('30 × 0.05 = 1.5');
    expect(body).toContain('0.05 ÷ 25 = 0.002');
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect(40 * 0.05).toBe(2);
    expect(0.05 / 4).toBe(0.0125);
    expect(fmt(1 - 0.95 ** 4, 2)).toBe('0.19');
    expect(0.004 * 1000).toBe(4);
    const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join(' ');
    const quiz = source.slice(source.indexOf('<Quiz'));
    const stripped = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const text = stripped.slice(0, stripped.indexOf('<Quiz'));
    // A number counts only whole: 0.04 is not in 0.042, nor 25 in 0.0025.
    const has = (t: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(t);
    for (const n of ['0.004', '4 times in 1,000', '0.62', '6 people', '0.35', '12 pupils', '40 foods', '0.0125', '0.19']) {
      expect(has(probes, n), `${n} is in the probes`).toBe(true);
      expect(has(text, n), `${n} is in the lesson`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    for (const n of ['18', '600', '0.02', '9 runners', '0.45', '−6', '30', '0.04', '25', '0.8', '96%']) {
      expect(has(quiz, n), `${n} is in the quiz`).toBe(true);
      expect(has(text, n), `${n} is in the lesson`).toBe(false);
      expect(has(probes, n), `${n} is in the probes`).toBe(false);
    }
  });
});

describe('hypothesis-testing: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('hypothesis-testing', source);
    expect(mistakes.map((m) => m.id)).toEqual(['p-is-chance-null-true', 'big-p-proves-no-difference', 'one-in-twenty-is-a-finding']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('hypothesis-testing', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(7);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('hypothesis-testing', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'do', 'see', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3000);
    expect(total).toBeLessThanOrEqual(4100);
    expect(source.split('\n').length).toBeLessThanOrEqual(380);
    expect(source).not.toContain('—');
  });
});

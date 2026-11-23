// B7 of the math and ML path, "Softmax and many classes": every number the
// lesson quotes is measured here from the code that draws it (the softmax
// visualiser and the softmax exercises), and must appear in the lesson exactly
// as written. The embeds are checked too: each preset exists with its seed,
// the prediction challenge asks at least its goal, the lesson embeds its one
// exercise and links the other, and it links only lessons it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  accuracy,
  DEFAULT_LOGITS,
  DEFAULT_QUERY,
  eToThe,
  LN_FLOAT32_MAX,
  loss32,
  lossScores,
  meetingPoint,
  naive32,
  overflowScores,
  p3,
  probsAt,
  scaled,
  sigmoid,
  softmax,
  softmaxOf,
  stable32,
  STEPS,
  train,
  type SoftmaxInput,
} from '@/algorithms/ml/softmax';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { CE_TESTS, crossEntropyOf } from '@/content/exercises/softmax';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./softmax-regression.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');

const inputOf = (preset: string, seed: number) => {
  const ex = softmax.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`softmax has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as SoftmaxInput;
};
const framesOf = (preset: string, seed: number) => traceOf(softmax, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use (only the regions story uses its seed). */
const SEEDS = { bars: 1, regions: 7, overflow: 1 } as const;

describe('softmax-regression embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['bars', 'regions', 'overflow']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['regions', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('softmax');
      expect(e.seed).toBe(SEEDS[e.preset as keyof typeof SEEDS]);
      const frames = framesOf(e.preset, e.seed);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['stable-softmax']);
    expect(getExercise('stable-softmax')?.visualiser).toBe('softmax');
    expect(source).toContain('[the cross-entropy of softmax, safely](/code/cross-entropy)');
    expect(getExercise('cross-entropy')?.visualiser).toBe('softmax');
  });

  it('links only lessons on what it builds on', () => {
    const { concepts } = loadConcepts();
    const before = new Set<string>();
    const walk = (id: string) => {
      for (const p of concepts.find((c) => c.id === id)?.prereqs ?? []) {
        if (!before.has(p)) {
          before.add(p);
          walk(p);
        }
      }
    };
    walk('softmax-regression');
    const linked = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(linked.length).toBeGreaterThanOrEqual(5);
    for (const target of linked) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: three classes in the plane'), body.indexOf('<PredictChallenge'));
    for (const v of ['9 numbers', 'how many numbers', '1.099', 'ln 3', 'straight', '1/3', 'a third', 'same regions', 'no border moves', '0.961', 'T = 1/2', 'more extreme']) expect(before, v).not.toContain(v);
    expect(before).toContain('Predict the loss at the start');
  });

  it('gives none of the other embeds’ answers away: captions, lead-ins and example labels', () => {
    const tag = (preset: string) => body.match(new RegExp(`<Explore slug="softmax" settings=\\{\\{ preset: '${preset}'[^>]*/>`))![0];
    for (const v of ['same', 'sharpen', 'flatten', 'equal', 'cancel', '0.486', '0.622', 'stays on top']) expect(tag('bars'), v).not.toContain(v);
    const barsLead = body.slice(body.indexOf('Scores into probabilities, in three steps'), body.indexOf(tag('bars')));
    for (const v of ['0.486', '15.196', 'less than half', 'cancel', 'sharpen', 'flatten']) expect(barsLead, v).not.toContain(v);
    const caption = (preset: string) => /caption="([^"]*)"/.exec(tag(preset))![1];
    for (const v of ['∞', 'NaN', 'infinity', 'overflow', 'underflow', '120.313']) expect(caption('overflow'), v).not.toContain(v);
    const overflowLead = body.slice(body.indexOf('When the scores are huge'), body.indexOf(tag('overflow')));
    for (const v of ['∞', 'NaN', 'infinity', 'overflows', 'underflow', '\\infty']) expect(overflowLead, v).not.toContain(v);
    for (const ex of softmax.input.examples) for (const v of ['same', 'overflow', 'NaN', 'straight', 'sharpen', 'equal']) expect(ex.label.toLowerCase(), ex.id).not.toContain(v.toLowerCase());
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(14);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('softmax-regression quotes: scores into probabilities', () => {
  const z = DEFAULT_LOGITS;
  const p = softmaxOf(z);

  it('quotes the four scores, their powers, their total and the shares', () => {
    expect(z).toEqual([2, 1.5, 1, -0.5]);
    expect(z.reduce((a, b) => a + b, 0)).toBe(4);
    expect(body).toContain('scores four classes: cat 2, dog 1.5, fox 1 and owl $-0.5$. Scores can be negative, and their total, 4 here, means nothing');
    expect(z.map((v) => fmt(Math.exp(v), 3))).toEqual(['7.389', '4.482', '2.718', '0.607']);
    expect(body).toContain('$e^2 = 7.389$, $e^{1.5} = 4.482$, $e^1 = 2.718$ and $e^{-0.5} = 0.607$');
    expect(fmt(z.reduce((t, v) => t + Math.exp(v), 0), 3)).toBe('15.196');
    expect(body).toContain('Their total is $s = 15.196$');
    expect(p.map(p3)).toEqual(['0.486', '0.295', '0.179', '0.04']);
    expect(body).toContain('gives cat 0.486, dog 0.295, fox 0.179 and owl 0.04, which add up to 1');
    expect(p[0]).toBeLessThan(0.5);
    expect(body).toContain('Notice that cat has the biggest score, yet less than half the probability: its three rivals take the rest');
    // The visualiser's frames say the same.
    const frames = framesOf('bars', SEEDS.bars);
    expect(frames[1].note).toContain('cat 7.389, dog 4.482, fox 2.718, owl 0.607');
    expect(frames[2].note).toContain('cat gets 7.389 ÷ 15.196 = 0.486');
    expect(frames[2].note).toContain('less than half the probability');
  });

  it('compares with dividing the scores by their total, and turns gaps into ratios', () => {
    expect(2 / 4).toBe(0.5);
    expect(body).toContain('Dividing the scores by their total would give cat $2 \\div 4 = 0.5$');
    expect(framesOf('bars', SEEDS.bars)[2].note).toContain('2 ÷ 4 = 0.5');
    expect(fmt(Math.exp(0.5), 3)).toBe('1.649');
    expect(fmt(p[0] / p[1], 3)).toBe('1.649');
    expect(body).toContain('Cat is $e^{0.5} = 1.649$ times as likely as dog');
  });

  it('adds 10 to every score', () => {
    expect(fmt(Math.exp(10), 0)).toBe('22026');
    expect(body).toContain('every power grows by the same factor, $e^{10} = 22026$');
    softmaxOf(z.map((v) => v + 10)).forEach((v, i) => expect(v).toBeCloseTo(p[i], 12));
  });

  it('turns the temperature', () => {
    const half = softmaxOf(z, 0.5);
    expect([fmt(Math.exp(1), 3), p3(half[0])]).toEqual(['2.718', '0.662']);
    expect(fmt(half[0] / half[1], 3)).toBe('2.718');
    expect(body).toContain('cat against dog goes from 1.649 to $e^1 = 2.718$, and cat\'s share rises from 0.486 to 0.662');
    expect(softmaxOf(z, 100).map(p3)).toEqual(['0.253', '0.251', '0.25', '0.246']);
    expect(body).toContain('$T = 100$, shrinks every gap to almost nothing and the shares flatten towards a quarter each: 0.253, 0.251, 0.25 and 0.246');
    const frames = framesOf('bars', SEEDS.bars);
    expect(frames[4].note).toContain('cat has 0.662, up from 0.486');
    expect(frames[5].note).toContain('cat 0.253, dog 0.251, fox 0.25, owl 0.246');
  });

  it('two classes: the sigmoid of the gap', () => {
    expect(p3(sigmoid(0.5))).toBe('0.622');
    expect(p3(softmaxOf([2, 1.5])[0])).toBe('0.622');
    expect(body).toContain('Cat 2 against dog 1.5, alone, gives cat $\\sigma(0.5) = 0.622$');
    expect(framesOf('bars', SEEDS.bars)[6].note).toContain('at the gap 0.5: 0.622');
  });
});

describe('softmax-regression quotes: three classes in the plane', () => {
  const { points, models, losses } = train(SEEDS.regions);
  const W = models[STEPS];

  it('counts the numbers, the start and the training', () => {
    expect(points.length).toBe(30);
    expect(W.length * W[0].length).toBe(9);
    expect(fmt(losses[0], 3)).toBe('1.099');
    expect(fmt(Math.log(3), 3)).toBe('1.099');
    expect(body).toContain('$-\\ln(1/3) = \\ln 3 = 1.099$');
    expect(framesOf('regions', SEEDS.regions)[0].checkpoint!.choices).toContain('1.099');
    expect(STEPS).toBe(80);
    expect(fmt(losses[STEPS], 3)).toBe('0.034');
    expect(accuracy(W, points)).toBe(1);
    expect(body).toContain('After 80 steps the loss is 0.034, and all 30 points sit in their own class\'s region');
    expect(framesOf('regions', SEEDS.regions)[2].note).toContain('30 of the 30 points');
  });

  it('quotes the meeting point and the query', () => {
    const P = meetingPoint(W)!;
    expect(`(${fmt(P[0], 2)}, ${fmt(P[1], 2)})`).toBe('(0.18, 0)');
    expect(body).toContain('The three borders meet at one point, here $(0.18, 0)$');
    expect(DEFAULT_QUERY).toEqual([0.75, 0.5]);
    const q = probsAt(W, ...DEFAULT_QUERY);
    expect(q.map(p3)).toEqual(['0.8', '0.155', '0.045']);
    expect(body).toContain('The query point $(0.75, 0.5)$ gets A 0.8, B 0.155 and C 0.045');
    const q2 = probsAt(scaled(W, 2), ...DEFAULT_QUERY);
    expect(p3(q2[0])).toBe('0.961');
    expect(body).toContain("the query's A rises from 0.8 to 0.961");
    expect(body).toContain('pushed the query from 0.8 to 0.961');
    expect(framesOf('regions', SEEDS.regions)[4].note).toContain('goes from 0.8 to 0.961');
  });
});

describe('softmax-regression quotes: huge scores', () => {
  const z = overflowScores(1000);

  it('quotes the float32 limits and the overflow', () => {
    expect(softmaxOf([2, 1, 0]).map(p3)).toEqual(['0.665', '0.245', '0.09']);
    expect(body).toContain('softmax of $[1000, 999, 998]$ is softmax of $[2, 1, 0]$, since only the gaps count: 0.665, 0.245 and 0.09');
    expect(fmt(LN_FLOAT32_MAX, 2)).toBe('88.72');
    expect(body).toContain('$3.4 \\times 10^{38}$ is $e^{88.72}$, and $e^{1000}$ is about $1.97 \\times 10^{434}$');
    expect(eToThe(1000)).toBe('1.97 × 10⁴³⁴');
    expect(naive32(z).e).toEqual([Infinity, Infinity, Infinity]);
    expect(naive32(z).p.every(Number.isNaN)).toBe(true);
  });

  it('quotes the safe way', () => {
    const s = stable32(z);
    expect(s.e.map(p3)).toEqual(['1', '0.368', '0.135']);
    expect(p3(s.s)).toBe('1.503');
    expect(s.p.map(p3)).toEqual(['0.665', '0.245', '0.09']);
    expect(body).toContain('The powers are 1, 0.368 and 0.135, their total is 1.503, and the shares come out as 0.665, 0.245 and 0.09');
  });

  it('quotes the underflow and the smallest float32', () => {
    expect(eToThe(-1000)).toBe('5.08 × 10⁻⁴³⁵');
    expect(body).toContain('$e^{-1000}$ is about $5.08 \\times 10^{-435}$, far below the smallest positive float32, a subnormal, $2^{-149}$, about $1.4 \\times 10^{-45}$');
    expect(Math.fround(2 ** -150)).toBe(0);
    expect(Math.fround(2 ** -149)).toBe(2 ** -149);
    expect(Math.fround(2 ** -149)).toBeGreaterThan(0);
    expect(fmt(2 ** -149 / 1e-45, 1)).toBe('1.4');
    expect(naive32(z.map((v) => v - 2000)).e).toEqual([0, 0, 0]);
  });

  it('quotes the loss by log-sum-exp', () => {
    expect(lossScores(1000)).toEqual([1000, 999, 880]);
    expect(body).toContain('Say the scores are $[1000, 999, 880]$ and the true class is the third, 120 below the top');
    const l = loss32(lossScores(1000), 2);
    expect(l.fromP).toBe(Infinity);
    expect([p3(stable32(lossScores(1000)).s), p3(l.lnS), p3(l.lse)]).toEqual(['1.368', '0.313', '120.313']);
    expect(body).toContain('Here $s = 1.368$, $\\ln s = 0.313$, and the loss is $0.313 + 120 = 120.313$');
    expect(framesOf('overflow', SEEDS.overflow)[6].note).toContain('−ln p₃ = 120.313');
  });
});

describe('softmax-regression quotes: the code', () => {
  it('quotes float64’s limit and the cross-entropy exercise', () => {
    expect(fmt(Math.log(Number.MAX_VALUE), 2)).toBe('709.78');
    expect(Math.exp(1000)).toBe(Infinity);
    expect(body).toContain('Python and JavaScript use float64, whose largest number is about $e^{709.78}$, so a score of 1,000 still overflows');
    expect(CE_TESTS[0].input).toEqual({ logits: [[2, 1, 0]], labels: [0] });
    expect(fmt(crossEntropyOf(CE_TESTS[0].input).mean, 3)).toBe('0.408');
    expect(fmt(Math.log(1 + Math.exp(-1) + Math.exp(-2)), 3)).toBe('0.408');
    expect(body).toContain('One row of scores $[2, 1, 0]$ whose true class is the first has loss $\\ln(1 + e^{-1} + e^{-2}) = 0.408$');
    expect(CE_TESTS[4].input.logits[0]).toEqual([0, -800]);
    expect(crossEntropyOf(CE_TESTS[4].input).losses[0]).toBeCloseTo(800, 9);
    expect(body).toContain('a row whose true class sits 800 below the top costs about 800');
    expect(getExercise('stable-softmax')!.examples.map((e) => e.input.logits)).toEqual([[2, 1.5, 1, -0.5], [1000, 999, 998]]);
  });
});

describe('softmax-regression: quiz and probes', () => {
  it('checks the quiz', () => {
    expect([fmt(Math.exp(3), 2), fmt(Math.exp(3) + Math.E + 1, 2), p3(softmaxOf([3, 1, 0])[0])]).toEqual(['20.09', '23.8', '0.844']);
    expect(body).toContain('e^3 / (e^3 + e^1 + e^0) = 20.09 / 23.80 ≈ 0.844');
    expect(3 / 4).toBe(0.75);
    expect(p3(sigmoid(2))).toBe('0.881');
    expect(p3(softmaxOf([7, 5])[0])).toBe('0.881');
    expect(softmaxOf([2, 1, 0], 0.5)[0]).toBeGreaterThan(softmaxOf([2, 1, 0])[0]);
    expect(4 * 3).toBe(12);
    expect(softmaxOf([0.9, 0.7], 0.5)[0]).toBeCloseTo(softmaxOf([0.9 - 0.9, 0.7 - 0.9], 0.5)[0], 12);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect([fmt(Math.exp(4), 1), fmt(Math.exp(4) + Math.E, 1), fmt(softmaxOf([4, 1])[0], 2)]).toEqual(['54.6', '57.3', '0.95']);
    const rain = softmaxOf([1.6, 1.3, -0.2], 3);
    expect(rain[0]).toBeGreaterThan(rain[1]);
    expect(rain[0]).toBeLessThan(softmaxOf([1.6, 1.3, -0.2])[0]);
    expect(140 / 200).toBe(0.7);
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(where);
    for (const n of ['54.6', '57.3', '0.95, 0.9', 'rain 1.6', 'sun 1.3', '1.6', '−0.2', '50, 48', '140', '200', '70%']) expect(has(text, n), `${n} is in the text or quiz`).toBe(false);
  });
});

describe('softmax-regression: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('softmax-regression', source);
    expect(mistakes.map((m) => m.id)).toEqual(['divide-by-total', 'temperature-changes-winner', 'softmax-is-confidence', 'shift-changes-answer']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('softmax-regression', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(6);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('softmax-regression', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r), r).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'see', 'do', 'check', 'explain', 'recap']);
    const total = words(source);
    expect(total).toBeGreaterThanOrEqual(3200);
    expect(total).toBeLessThanOrEqual(3800);
    expect(source).not.toContain('—');
  });
});

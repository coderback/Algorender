// B6 of the math and ML path, "Minibatches, epochs and schedules": every
// number the lesson quotes is measured here from the code that draws it (the
// sgd visualiser and the sgd exercises), and must appear in the lesson exactly
// as written. The embeds are checked too: each preset exists with its seed,
// the prediction challenge asks at least its goal, the lesson embeds its one
// exercise and links the other, and it links only lessons it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  batchSpread,
  cloudFor,
  COMPARE_AT,
  distanceToMin,
  DROP_EVERY,
  ETA0,
  gradOn,
  L_MIN,
  lastEpochExcess,
  lossOn,
  MIN,
  PATH_ETA,
  PATH_EPOCHS,
  pathsRun,
  PER_EPOCH,
  PROBE,
  rate,
  S_STEPS,
  scheduleRuns,
  sgd,
  sigmaOne,
  spreadAround,
  START,
  stepsPerEpoch,
  uphill,
  upSteps,
  WARMUP,
  type SgdInput,
} from '@/algorithms/ml/sgd';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { minibatches, sgdStep, STEP_TESTS } from '@/content/exercises/sgd';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./stochastic-gradient-descent.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
/** fmt with the lesson's ASCII-free minus inside math: −9.66 is written -9.66 there. */
const tex = (v: number, digits = 2) => fmt(v, digits).replace('−', '-');

const inputOf = (preset: string, seed: number) => {
  const ex = sgd.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`sgd has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as SgdInput;
};
const framesOf = (preset: string, seed: number) => traceOf(sgd, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use. */
const SEEDS = { 'batch-size': 38, paths: 7, schedules: 7 } as const;

describe('stochastic-gradient-descent embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['batch-size', 'paths', 'schedules']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['paths', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('sgd');
      expect(e.seed).toBe(SEEDS[e.preset as keyof typeof SEEDS]);
      const frames = framesOf(e.preset, e.seed);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['sgd-step']);
    expect(getExercise('sgd-step')?.visualiser).toBe('sgd');
    expect(source).toContain('[shuffle and cut minibatches](/code/minibatches)');
    expect(getExercise('minibatches')?.visualiser).toBe('sgd');
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
    walk('stochastic-gradient-descent');
    const linked = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(linked.length).toBeGreaterThan(4);
    for (const target of linked) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Now descend.'), body.indexOf('<PredictChallenge'));
    for (const v of ['8 steps', 'exactly', 'went up', 'jitter', '0.14', '0.968', '13 epochs', '16°', 'nearer the bottom than', 'reshuffled']) expect(before).not.toContain(v);
  });

  it('gives none of the other embeds’ answers away: captions, lead-ins and example labels', () => {
    const tag = (preset: string) => body.match(new RegExp(`<Explore slug="sgd" settings=\{\{ preset: '${preset}'[^>]*/>`))![0];
    // The batch-size widget asks whether batches of 4 spread about half as wide: its caption must not name the √B rule.
    const caption = tag('batch-size');
    for (const v of ['√', 'half', 'no width', 'σ']) expect(caption).not.toContain(v);
    // The schedules lead-in lists the schedules without the values the widget asks for, or what the runs show.
    const lead = body.slice(body.indexOf('Schedules: changing the step size'), body.indexOf(tag('schedules')));
    for (const v of ['0.0375', '0.15', '0.075', 'settle', 'jitter', 'bounce', 'come to rest', 'floor', 'gradients are big']) expect(lead, v).not.toContain(v);
    expect(tag('schedules')).not.toMatch(/0.0375|0.15|settle|bounce/);
    // Example labels state no results.
    for (const ex of sgd.input.examples) {
      const frames = framesOf(ex.id, 1);
      for (const f of frames) {
        const c = f.checkpoint;
        if (!c) continue;
        const said = c.choices[c.answer];
        if (said.length > 3) expect(ex.label.toLowerCase(), `${ex.id}: ${said}`).not.toContain(said.toLowerCase());
      }
      for (const v of ['half', 'exactly', 'goes up', 'jitter', 'settle', 'lower']) expect(ex.label.toLowerCase()).not.toContain(v);
    }
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(13);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('stochastic-gradient-descent quotes: how wrong one batch is', () => {
  const G = gradOn(...PROBE);
  const sigma = sigmaOne(PROBE);

  it('quotes the point, its loss and its full gradient', () => {
    expect(PROBE).toEqual([0.5, 0]);
    expect(body).toContain('Stand partway down the bowl at $(w, b) = (0.5, 0)$, where $L = 3.568$');
    expect(fmt(lossOn(...PROBE), 3)).toBe('3.568');
    expect(fmtVec(G)).toBe('(−3.82, −2.26)');
    expect(fmt(Math.hypot(...G), 2)).toBe('4.44');
    expect(body).toContain('The gradient over all 32 points is $(-3.82, -2.26)$, an arrow of length 4.44');
    expect(body).toContain('one step with $\\eta = 0.1$ would land');
  });

  it('measures the single points, σ₁ and the batches’ spreads', () => {
    expect(uphill(cloudFor(1, SEEDS['batch-size']).tips)).toBe(8);
    expect(body).toContain('Here 8 of the 32 single-point steps land *higher* up the bowl than where they started');
    expect(fmt(sigma, 2)).toBe('5.49');
    expect(sigma).toBeGreaterThan(Math.hypot(...G));
    expect(body).toContain('Here $\\sigma_1$ is 5.49, more than the full gradient\'s own length, 4.44');
    expect([fmt(sigma / 2, 2), fmt(batchSpread(PROBE, 4), 2)]).toEqual(['2.74', '2.61']);
    expect(body).toContain('a batch of 4 should miss by about $5.49/\\sqrt{4} = 2.74$. Counted over every possible batch of 4 it misses by 2.61, a little less');
    expect([fmt(batchSpread(PROBE, 16), 2), fmt(sigma / 4, 2)]).toEqual(['0.99', '1.37']);
    expect(body).toContain('and batches of 16 by 0.99, well below $5.49/\\sqrt{16} = 1.37$');
    expect(batchSpread(PROBE, 32)).toBe(0);
    expect(body).toContain('a batch of all 32 *is* the full gradient, and misses by 0');
    // The widget's own draw, from seed 38, agrees with the exact spreads to within luck.
    const drawn = (b: number) => fmt(spreadAround(cloudFor(b, SEEDS['batch-size']).grads, G), 2);
    expect(drawn(4)).toBe('2.62');
    expect(body).toContain('The 64 batches of 4 drawn in the widget spread 2.62, a little off 2.61 by luck');
    for (const b of [2, 4, 8, 16]) expect(Math.abs(Number(drawn(b)) - batchSpread(PROBE, b)) / batchSpread(PROBE, b)).toBeLessThan(0.03);
    // The steps on the map are η times the gradients.
    expect(body).toContain('The dots on the map are steps, $\\eta = 0.1$ times a gradient, so their cloud is a tenth of that size');
    // The visualiser's frames say the same.
    const frames = framesOf('batch-size', SEEDS['batch-size']);
    expect(frames[1].note).toContain('8 of the 32 land higher up the bowl');
    expect(frames[1].note).toContain(`σ₁ = 5.49, more than the full gradient's own length, 4.44`);
    expect(frames[2].note).toContain('the batch gradients spread 2.61 against 5.49');
    expect(frames[2].note).toContain('spread 2.62, a little off by luck');
    // The 1/√B misconception's correction quotes the same spreads.
    expect(body).toContain('Here batches of 1 miss by 5.49 and batches of 4 by 2.61, about half, not a quarter');
  });

  it('answers “why not batches of 1?”', () => {
    expect(body).toContain('Why not batches of 1, then? A GPU works on a batch\'s points side by side');
  });

  it('counts the cost of an epoch', () => {
    expect(stepsPerEpoch(32, 16) * 16).toBe(32);
    expect(stepsPerEpoch(32, 1)).toBe(32);
    expect(body).toContain('so an epoch of 2 such steps works out 32, exactly what 32 steps on single points cost, or one full-batch step');
  });
});

describe('stochastic-gradient-descent quotes: full batch against batches of 4', () => {
  const { epochs, mini, full } = pathsRun(SEEDS.paths);
  const G = gradOn(...START);

  it('starts where the challenge says, and its fan averages to the full gradient', () => {
    expect([START, PATH_ETA, PER_EPOCH]).toEqual([[-1, -1.5], 0.1, 8]);
    expect(body).toContain('Start the line at $(w, b) = (-1, -1.5)$, far up the bowl, with $\\eta = 0.1$');
    expect(fmtVec(G)).toBe('(−9.66, −5.69)');
    const grads = epochs[0].map((b) => gradOn(START[0], START[1], b));
    expect(Math.round(Math.max(...grads.map((g) => angleBetween(g, G))))).toBe(16);
    const avg = [0, 1].map((k) => grads.reduce((s, g) => s + g[k], 0) / 8);
    expect(`(${tex(avg[0])}, ${tex(avg[1])})`).toBe('(-9.66, -5.69)');
    expect(body).toContain('At the start the full gradient is $(-9.66, -5.69)$. The eight batches of epoch 1 fan out around it, up to 16° off its direction, yet their eight gradients average to exactly $(-9.66, -5.69)$');
    expect(framesOf('paths', SEEDS.paths)[1].note).toContain('up to 16° off');
  });

  it('quotes the race', () => {
    expect([fmt(mini.losses[0], 3), fmt(mini.losses[8], 3), fmt(full.losses[1], 3)]).toEqual(['19.638', '0.71', '9.233']);
    expect(body).toContain('In epoch 1 the minibatch path takes 8 steps and $L$ falls from 19.638 to 0.71. For the same 32 point-gradients the full-batch path takes one step, to 9.233');
    const t = COMPARE_AT * PER_EPOCH;
    expect([fmt(distanceToMin(mini.at[t]), 3), fmt(distanceToMin(full.at[COMPARE_AT]), 3)]).toEqual(['0.14', '0.968']);
    expect(body).toContain('After 4 epochs the minibatch path is 0.14 from the lowest point and the full-batch path 0.968');
    // The full batch, one step an epoch, first gets that close after 13 steps.
    let at = START;
    let steps = 0;
    while (distanceToMin(at) >= distanceToMin(mini.at[t])) {
      const g = gradOn(...at);
      at = [at[0] - PATH_ETA * g[0], at[1] - PATH_ETA * g[1]];
      steps++;
    }
    expect(steps).toBe(13);
    expect(body).toContain('the full batch would need 13 epochs to get as close');
  });

  it('quotes the noise: steps that go up, and the jitter at the bottom', () => {
    expect(upSteps(mini, 32)).toBe(9);
    expect(body).toContain('Over those 4 epochs $L$ went up on 9 of the 32 steps');
    expect(body).toContain('In the run above that happened on 9 of 32 steps, yet $L$ fell from 19.638 to 0.611');
    expect(fmt(mini.losses[32], 3)).toBe('0.611');
    const T = PATH_EPOCHS * PER_EPOCH;
    const last = mini.at.slice(T - PER_EPOCH + 1).map(distanceToMin);
    expect([fmt(Math.min(...last), 3), fmt(Math.max(...last), 3)]).toEqual(['0.017', '0.151']);
    expect(body).toContain('in epoch 8 it stayed between 0.017 and 0.151 from the lowest point, $(1.48, 0.99)$, where $L = 0.583$');
    expect([fmtVec(MIN), fmt(L_MIN, 3)]).toEqual(['(1.48, 0.99)', '0.583']);
    const frames = framesOf('paths', SEEDS.paths);
    expect(frames[15].note).toContain('between 0.017 and 0.151');
    // The miss shrinks as the line improves, but not to nothing.
    expect([fmt(sigmaOne(MIN), 1), fmt(sigmaOne(MIN) / 2, 1)]).toEqual(['2.4', '1.2']);
    expect(sigmaOne(MIN)).toBeLessThan(sigmaOne(PROBE));
    expect(sigmaOne(PROBE)).toBeLessThan(sigmaOne(START));
    expect(Math.hypot(...gradOn(...MIN))).toBeLessThan(1e-9);
    expect(body).toContain("at the lowest point one point's gradient misses by about 2.4 ($\\sigma_1$ there, against 5.49 at $(0.5, 0)$), so a batch of 4 misses by about 1.2");
    expect(body).not.toContain('as much as ever');
    expect(frames[15].note).toContain('misses by about 2.4 (σ₁), so a batch of 4 by about 1.2');
  });
});

describe('stochastic-gradient-descent quotes: the code', () => {
  it('works the made-up step by hand', () => {
    const input = STEP_TESTS[0].input;
    expect(input).toEqual({ xs: [1, 2, 3], ys: [2, 4, 7], batch: [0, 2], w: 0, b: 0, lr: 0.05 });
    const s = sgdStep(input);
    expect(s.errors).toEqual([-2, -7]);
    expect((2 * -2 * 1 + 2 * -7 * 3) / 2).toBe(-23);
    expect((2 * -2 + 2 * -7) / 2).toBe(-9);
    expect([fmt(s.w, 4), fmt(s.b, 4)]).toEqual(['1.15', '0.45']);
    expect(body).toContain('three made-up points $(1, 2)$, $(2, 4)$ and $(3, 7)$, with the batch holding the first and the last, from $w = b = 0$ and $\\eta = 0.05$. The errors are $-2$ and $-7$');
    expect(body).toContain('g_w &= \\tfrac{1}{2}\\big(2(-2)(1) + 2(-7)(3)\\big) = -23');
    expect(body).toContain('g_b &= \\tfrac{1}{2}\\big(2(-2) + 2(-7)\\big) = -9');
    expect(body).toContain('the step goes to $w = 0 - 0.05 \\times (-23) = 1.15$ and $b = 0 - 0.05 \\times (-9) = 0.45$');
    expect(getExercise('sgd-step')!.examples.some((e) => e.input === input)).toBe(true);
  });

  it('quotes the minibatches from seed 7', () => {
    const got = minibatches({ n: 10, batch: 4, epochs: 2, seed: 7 });
    expect(got).toEqual([[9, 3, 5, 6], [7, 4, 1, 2], [8, 0], [7, 9, 6, 5], [8, 3, 2, 0], [1, 4]]);
    expect(body).toContain('With 10 points in batches of 4 from seed 7, epoch 1 gives [9, 3, 5, 6], [7, 4, 1, 2] and [8, 0], and epoch 2, reshuffled, gives [7, 9, 6, 5], [8, 3, 2, 0] and [1, 4]');
    expect(body).toContain('The last batch of each epoch is short, 2 points, because 4 doesn\'t divide 10');
    expect(getExercise('minibatches')!.examples[0].input).toEqual({ n: 10, batch: 4, epochs: 2, seed: 7 });
  });
});

describe('stochastic-gradient-descent quotes: schedules', () => {
  const runs = scheduleRuns(SEEDS.schedules);
  const dist = (id: 'constant' | 'cosine') => runs[id].at.slice(S_STEPS - 7).map(distanceToMin);

  it('describes the four schedules', () => {
    expect([S_STEPS, ETA0, DROP_EVERY, WARMUP]).toEqual([96, 0.3, 3, 8]);
    expect(body).toContain('each run for 12 epochs of 8 batches, 96 steps. They start bolder than the paths above, at $\\eta_0 = 0.3$, three times 0.1');
    expect(ETA0 / PATH_ETA).toBeCloseTo(3, 12);
    expect(body).toContain('$\\eta = \\eta_0 \\times (1 + \\cos(\\pi t / 96))/2$ at step $t$');
    expect(body).toContain('climbs in a straight line over the first epoch\'s 8 steps up to $\\eta_0$, then follows a cosine down over the other 88');
    // The values come after the widget that asks for them.
    expect([0, 24, 48, 72, 95].map((t) => rate('step', t))).toEqual([0.3, 0.15, 0.075, 0.0375, 0.0375]);
    expect(body).toContain('step decay runs at 0.3, then 0.15, 0.075, and 0.0375 for the last 3 epochs, three halvings in 12 epochs, not four');
    expect([rate('cosine', 0), rate('cosine', 48)]).toEqual([0.3, 0.15]);
    expect(rate('cosine', 95)).toBeLessThan(0.001);
    expect(body).toContain('Cosine starts at 0.3, where $\\cos 0 = 1$, is 0.15 halfway');
    expect([rate('warmup', 0), rate('warmup', 7)]).toEqual([0.0375, 0.3]);
    expect(body).toContain('Warmup climbs from 0.0375 to 0.3');
    expect(body.indexOf('step decay runs at 0.3')).toBeGreaterThan(body.indexOf("preset: 'schedules'"));
  });

  it('quotes the runs from seed 7', () => {
    const c = dist('constant');
    expect([fmt(Math.min(...c), 3), fmt(Math.max(...c), 3)]).toEqual(['0.013', '0.565']);
    expect(runs.constant.losses[8] - L_MIN).toBeLessThan(0.1);
    expect(framesOf('schedules', SEEDS.schedules)[4].note).toContain('within an epoch');
    expect(body).toContain('the path is down in the bowl within an epoch, then bounces: in the last epoch it was between 0.013 and 0.565 from the lowest point');
    expect(['constant', 'cosine', 'step', 'warmup'].map((id) => fmt(lastEpochExcess(runs[id as 'constant']), 4))).toEqual(['0.169', '0.0007', '0.0022', '0.001']);
    expect(body).toContain('$L$ sat 0.169 above its lowest on average over that epoch. On the same batches, cosine sat just 0.0007 above it on average');
    const k = dist('cosine');
    expect([fmt(Math.min(...k), 3), fmt(Math.max(...k), 3)]).toEqual(['0.023', '0.026']);
    expect(body).toContain('and stayed between 0.023 and 0.026 from the lowest point. Step decay averaged 0.0022 above over the last epoch and warmup 0.001');
    expect(body).not.toMatch(/ended 0\.0/);
    const frames = framesOf('schedules', SEEDS.schedules);
    expect(frames[4].note).toContain('between 0.013 and 0.565');
    expect(frames[5].note).toContain('0.0007 above the lowest');
  });
});

describe('stochastic-gradient-descent: quiz and probes', () => {
  it('checks the quiz', () => {
    expect(40000 / 250).toBe(160);
    expect(3.6 / Math.sqrt(300 / 75)).toBe(1.8);
    expect(3.6 / 4).toBe(0.9);
    expect(3.6 * 4).toBe(14.4);
    expect([(4 - 2) / 2, (-2 + 6) / 2]).toEqual([1, 2]);
    expect(0.4 * (1 + Math.cos(Math.PI))) .toBeCloseTo(0, 12);
    expect((0.4 * (1 + Math.cos(Math.PI / 2))) / 2).toBeCloseTo(0.2, 12);
    expect(Math.sqrt(128 / 64)).toBeCloseTo(Math.SQRT2, 12);
    // Q4 says the points are split, not shared.
    expect(body).toContain('Six points are split into two batches of 3');
    // The quiz asks what a schedule is for, not only its arithmetic.
    expect(body).toContain('now bounces along a floor. What is most likely to lower it?');
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect([7500 / 500, 7500 / 50, 500 / 50]).toEqual([15, 150, 10]);
    expect([51200 / 256, 270 / 30, fmt(2.1 / 3, 2), fmt(2.1 / 9, 2), 5 ** 2]).toEqual([200, 9, '0.7', '0.23', 25]);
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(where);
    for (const n of ['7,500', '500', '50', '15', '150', '51,200', '256', '200', '30', '270', '0.7', '0.23', '2.1', '25 times', 'batches of 20']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    const lessonText = text.slice(0, text.indexOf('<Quiz'));
    for (const n of ['40,000', '250', '160', '3.6', '1.8', '14.4', '75', '300', '0.4', '128', '64 to']) expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
  });
});

describe('stochastic-gradient-descent: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('stochastic-gradient-descent', source);
    expect(mistakes.map((m) => m.id)).toEqual(['noise-shrinks-like-one-over-b', 'bigger-batch-better', 'loss-falls-every-step']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('stochastic-gradient-descent', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(7);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('stochastic-gradient-descent', source);
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
    expect(total).toBeGreaterThanOrEqual(3200);
    expect(total).toBeLessThanOrEqual(4000);
    expect(source).not.toContain('—');
  });
});

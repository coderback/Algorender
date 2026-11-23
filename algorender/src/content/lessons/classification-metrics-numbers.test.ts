// B7 of the math and ML path, "Precision, recall and ROC": every number the
// lesson quotes is measured here from the code that draws it (the roc-curve
// visualiser and the classification exercises), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists with its
// seed, the prediction challenge asks at least its goal, the lesson embeds its
// one exercise and links the other, and it links only lessons it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  areaUnder,
  countsAt,
  fprOf,
  MIX,
  N_EACH,
  pairsOf,
  precisionDip,
  precisionOf,
  recallOf,
  rocCurve,
  rocPoints,
  scoresFor,
  THRESHOLDS,
  type RocInput,
} from '@/algorithms/ml/roc-curve';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { aucOf, confusionOf, FOUR, SEVEN } from '@/content/exercises/classification-metrics';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./classification-metrics.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const f3 = (v: number) => fmt(v, 3);

const inputOf = (preset: string, seed: number) => {
  const ex = rocCurve.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`roc-curve has no example ${preset}`);
  return ex.make({ seed, size: 0 }) as RocInput;
};
const framesOf = (preset: string, seed: number) => traceOf(rocCurve, inputOf(preset, seed)).frames;

/** The seeds the lesson's embeds use. */
const SEEDS = { threshold: 7, roc: 1, imbalance: 7 } as const;

describe('classification-metrics embeds', () => {
  it('embeds real presets with their seeds, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)', seed: (\d+)(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], seed: Number(m[4]), step: m[5] === undefined ? null : Number(m[5]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['threshold', 'roc', 'imbalance']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['roc', 4]]);
    for (const e of found) {
      expect(e.slug).toBe('roc-curve');
      expect(e.seed).toBe(SEEDS[e.preset as keyof typeof SEEDS]);
      const frames = framesOf(e.preset, e.seed);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser, and links the other', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['confusion']);
    expect(getExercise('confusion')?.visualiser).toBe('roc-curve');
    expect(source).toContain('[the area under the ROC curve, by sorting](/code/auc)');
    expect(getExercise('auc')?.visualiser).toBe('roc-curve');
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
    walk('classification-metrics');
    const linked = [...source.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(linked).toEqual(['logistic-regression', 'bayes']);
    for (const target of linked) {
      const meta = lessons.find((l) => l.slug === target);
      expect(meta, target).toBeDefined();
      expect(before.has(meta!.concept), `links ${target}`).toBe(true);
    }
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Rather than pick one threshold'), body.indexOf('<PredictChallenge'));
    for (const v of ['(0, 0)', '(1, 1)', '0.125', '0.875', '0.5', 'half', 'up or right', 'only move', 'never', '1,501', '1501', '1,495', '0.938', 'top-left']) expect(before, v).not.toContain(v);
  });

  it('gives none of the other embeds’ answers away: captions, lead-ins and example labels', () => {
    const tag = (preset: string) => body.match(new RegExp(`<Explore slug="roc-curve" settings=\\{\\{ preset: '${preset}'[^>]*/>`))![0];
    // The threshold widget asks what recall can do as the threshold rises, and whether precision can drop.
    for (const v of ['fall', 'drop', 'never', 'rise', 'false negative']) expect(tag('threshold'), v).not.toContain(v);
    // The imbalance widget asks about the lazy model's accuracy, the rates, precision, and both curves.
    const lead = body.slice(body.indexOf('Back to the 80 emails'), body.indexOf(tag('imbalance')));
    for (const v of ['99%', '0.99', 'same', 'lower', 'collapse', 'falls', 'unchanged', "can't move", '0.039']) {
      expect(lead, v).not.toContain(v);
      expect(tag('imbalance'), v).not.toContain(v);
    }
    // The answers come after the widget that asks for them.
    expect(body.indexOf('99% accurate, with a recall of 0')).toBeGreaterThan(body.indexOf(tag('imbalance')));
    for (const ex of rocCurve.input.examples) for (const v of ['99', 'same', 'lower', 'never', 'false negative', '(0, 0)']) expect(ex.label.toLowerCase()).not.toContain(v);
  });

  it('spreads its right answers over the choices', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBe(15);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });
});

describe('classification-metrics quotes: four kinds of answer', () => {
  const s = scoresFor(SEEDS.threshold);
  const c = countsAt(s, 0.5);

  it('counts the 80 emails at t = 0.5', () => {
    expect(c).toEqual({ tp: 36, fp: 9, fn: 4, tn: 31 });
    expect(body).toContain('Above the axis, 36 spam emails are flagged (true positives) and 4 slip through (false negatives). Below it, 9 real emails are flagged (false positives) and 31 are left alone (true negatives)');
    expect(f3(accuracyOf(c))).toBe('0.838');
    expect(body).toContain('That is 67 of the 80 answers right, an accuracy of 0.838');
    expect(body).toContain('- Really spam: TP 36, FN 4. - Really not spam: FP 9, TN 31.');
    expect([recallOf(c), fprOf(c), precisionOf(c)]).toEqual([0.9, 0.225, 0.8]);
    expect(body).toContain('the top row: $36/40 = 0.9$. The filter catches 90% of the spam');
    expect(body).toContain('the bottom row: $9/40 = 0.225$. It wrongly flags 22.5% of the real emails');
    expect(body).toContain('the first column: $36/45 = 0.8$. Of the emails in the spam folder, 80% are spam');
    expect(body).toContain('Here they are 0.9 and 0.8');
    // The widget says the same.
    const frames = framesOf('threshold', SEEDS.threshold);
    expect(frames[2].note).toContain('Recall = 36 ÷ 40 = 0.9');
    expect(frames[2].note).toContain('FP ÷ (FP + TN) = 0.225');
    expect(frames[2].note).toContain('TP ÷ (TP + FP) = 0.8');
  });

  it('raises the threshold, and finds where precision drops', () => {
    const c7 = countsAt(s, 0.7);
    expect([c7.tp, c7.fp, recallOf(c7), fprOf(c7), f3(precisionOf(c7)!)]).toEqual([18, 1, 0.45, 0.025, '0.947']);
    expect(body).toContain('recall falls to 0.45 (18 of 40) and the false positive rate to 0.025 (1 of 40)');
    expect(body).toContain('at 0.7 it is $18/19 = 0.947$');
    const zero = countsAt(s, 0);
    expect([recallOf(zero), fprOf(zero), precisionOf(zero)]).toEqual([1, 1, 0.5]);
    expect(body).toContain('recall is 1, the false positive rate is 1, and precision is just the share of spam among all 80 emails, 0.5');
    const dip = precisionDip(s)!;
    expect([dip.from, dip.to, dip.pos, dip.neg, f3(dip.before), f3(dip.after)]).toEqual([0.48, 0.49, 3, 0, '0.796', '0.783']);
    expect(body).toContain('raising the threshold from 0.48 to 0.49 unflags 3 spam emails that scored exactly 0.48, and no real ones, so precision drops from 0.796 to 0.783');
    expect(body).toContain('as it did from 0.48 to 0.49 above');
    expect(framesOf('threshold', SEEDS.threshold)[4].note).toContain('precision drops from 0.796 to 0.783');
  });
});

describe('classification-metrics quotes: the ROC curve', () => {
  const s = scoresFor(SEEDS.roc);
  const p = pairsOf(s);
  const auc = areaUnder(rocPoints(s));

  it('quotes the point at t = 0.5, the pairs and the area', () => {
    const c = countsAt(s, 0.5);
    expect([fprOf(c), recallOf(c)]).toEqual([0.125, 0.875]);
    expect(body).toContain('At $t = 0.5$ it had reached $(0.125, 0.875)$: recall 0.875 for a false positive rate of 0.125');
    expect([p.pairs, p.wins, p.ties, p.wins + p.ties / 2, f3(auc), f3(p.auc)]).toEqual([1600, 1495, 12, 1501, '0.938', '0.938']);
    expect(auc).toBeCloseTo(p.auc, 12);
    expect(body).toContain('The area under the ROC curve, the **AUC**, is 0.938 here');
    expect(body).toContain('40 × 40 = 1,600 pairs. In 1,495 of them the positive scores higher, and 12 are ties');
    expect(body).toContain('\\frac{1495 + 12/2}{1600} = \\frac{1501}{1600} = 0.938');
    expect(N_EACH).toBe(40);
    expect(body).toContain('the curve rises by $1/40$');
    const frames = framesOf('roc', SEEDS.roc);
    expect(frames.at(-1)!.note).toContain('1495 of the 1600 pairs have the positive scoring higher and 12 tie');
  });

  it('no threshold is as good as the AUC suggests', () => {
    const best = Math.max(...THRESHOLDS.map((t) => accuracyOf(countsAt(s, t))));
    expect([best, best * 80]).toEqual([0.875, 70]);
    expect(body).toContain('Here the AUC is 0.938, but no threshold gets more than 70 of the 80 answers right (87.5%)');
  });
});

describe('classification-metrics quotes: the code', () => {
  it('works the seven made-up scores by hand', () => {
    expect(SEVEN).toEqual({ scores: [0.9, 0.8, 0.7, 0.5, 0.5, 0.3, 0.1], labels: [1, 1, 0, 1, 0, 1, 0], threshold: 0.5 });
    expect(confusionOf(SEVEN)).toEqual([3, 2, 1, 1]);
    expect(body).toContain('Take seven made-up scores, 0.9, 0.8, 0.7, 0.5, 0.5, 0.3 and 0.1, whose labels are 1, 1, 0, 1, 0, 1, 0 (1 for a positive), with the threshold at 0.5');
    expect(body).toContain('TP = 3. The 0.7 and the second 0.5 are flagged negatives: FP = 2. The 0.3 is a missed positive, FN = 1, and the 0.1 an unflagged negative, TN = 1');
    expect(getExercise('confusion')!.examples[0].input).toBe(SEVEN);
  });

  it('works the AUC of four scores, and counts the big test’s pairs', () => {
    expect(FOUR).toEqual({ scores: [0.8, 0.4, 0.4, 0.2], labels: [1, 1, 0, 0] });
    expect(aucOf(FOUR)).toBe(0.875);
    expect(body).toContain('With positives scoring 0.8 and 0.4 and negatives 0.4 and 0.2, the 0.8 beats both negatives and the 0.4 beats one and ties one, so the AUC is $(3 + 0.5)/4 = 0.875$');
    expect(600 * 600).toBe(360000);
    expect(body).toContain('600 of each make 360,000 pairs');
    expect(getExercise('auc')!.tests.some((t) => (t.input as { scores: number[] }).scores.length === 1200)).toBe(true);
  });
});

describe('classification-metrics quotes: when positives are rare', () => {
  const s = scoresFor(SEEDS.imbalance);
  const c1 = countsAt(s, 0.5);
  const c99 = countsAt(s, 0.5, MIX);

  it('makes 1 in 100 by letting each negative stand for 99', () => {
    expect([N_EACH, N_EACH * (MIX + 1), N_EACH * MIX]).toEqual([40, 4000, 3960]);
    expect(body).toContain('count each negative 99 times, itself and 98 copies scoring just as it does: 40 positives among 4,000 examples, 1 in 100');
    expect(accuracyOf({ tp: 0, fp: 0, fn: 40, tn: 3960 })).toBe(0.99);
    expect(body).toContain('A lazy model that flags nothing is right about all 3,960 negatives: 99% accurate, with a recall of 0');
  });

  it('quotes the classifier at 1 in 100', () => {
    expect([recallOf(c99), fprOf(c99)]).toEqual([0.9, 0.225]);
    expect(body).toContain('The real classifier at $t = 0.5$ still has recall 0.9 and a false positive rate of 0.225');
    expect([c1.fp, c99.fp, fmt(accuracyOf(c99) * 100, 1)]).toEqual([9, 891, '77.6']);
    expect(body).toContain('its 9 false positives have become 891, and its accuracy has fallen to 77.6%, below the lazy model');
    expect(body).toContain('scored 77.6%');
    expect([f3(precisionOf(c1)!), f3(precisionOf(c99)!), c99.tp + c99.fp, c99.tp]).toEqual(['0.8', '0.039', 927, 36]);
    expect(body).toContain('And precision collapses, from 0.8 to 0.039: of the 927 examples it flags, only 36 are positive');
    const frames = framesOf('imbalance', SEEDS.imbalance);
    expect(frames[3].note).toContain('Precision falls from 0.8 to 0.039: of the 927 flagged, only 36 are positive');
    expect(frames[2].note).toContain('Accuracy is now 77.6%, below the lazy model');
  });

  it('quotes the curves and the F1 score', () => {
    expect(rocPoints(s, MIX)).toEqual(rocPoints(s));
    expect(f3(areaUnder(rocPoints(s)))).toBe('0.914');
    expect(body).toContain("which the copies keep exactly, so the curve, and these first 80 emails' AUC of 0.914, are exactly the same at either mix");
    expect(body).toContain('and copies keep every within-class share exactly as it was, so the mix can');
    expect(framesOf('imbalance', SEEDS.imbalance)[4].note).toContain('copying each negative 99 times leaves every share exactly as it was');
    expect(framesOf('imbalance', SEEDS.imbalance)[0].note).toContain('count each negative 99 times, itself and 98 copies');
    const a = countsAt(s, 0.7);
    const b = countsAt(s, 0.7, MIX);
    expect([f3(precisionOf(a)!), f3(precisionOf(b)!), b.tp, b.tp + b.fp]).toEqual(['0.947', '0.154', 18, 117]);
    expect(body).toContain('At $t = 0.7$, precision falls from 0.947 to 0.154 (18 positives among 117 flags)');
    expect(Math.max(...s.neg)).toBe(0.7);
    expect(countsAt(s, 0.71).fp).toBe(0);
    expect(recallOf(countsAt(s, 0.71))).toBe(0.375);
    expect(body).toContain('Precision reaches 1 only above the highest negative score, 0.7, where no negative is flagged at all, and there recall is at most 0.375');
    const f1 = (c: typeof c1) => (2 * precisionOf(c)! * recallOf(c)) / (precisionOf(c)! + recallOf(c));
    expect([f3(f1(c1)), f3(f1(c99))]).toEqual(['0.847', '0.074']);
    expect(body).toContain('At $t = 0.5$ it is 0.847 with half the examples positive, and 0.074 at 1 in 100');
  });
});

describe('classification-metrics: quiz and probes', () => {
  it('checks the quiz', () => {
    // 400 people: 60 TP, 20 FN, 40 FP, 280 TN.
    expect([60 / 80, 60 / 100, (60 + 280) / 400, 40 / 320]).toEqual([0.75, 0.6, 0.85, 0.125]);
    expect(60 + 20 + 40 + 280).toBe(400);
    expect(999 / 1000).toBe(0.999);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    expect([42 / 50, 42 / 84, fmt(50 / 84, 1)]).toEqual([0.84, 0.5, '0.6']);
    expect([24 / 200, 24 / 30, 30 / 200]).toEqual([0.12, 0.8, 0.15]);
    expect([9 / 12, 7 / 10]).toEqual([0.75, 0.7]);
    expect([20 / 50, 15 / 50, 20 / 25, 15 / 20]).toEqual([0.4, 0.3, 0.8, 0.75]);
    expect(499 / 500).toBe(0.998);
    expect(249 / 250).toBe(0.996);
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const has = (where: string, n: string) => new RegExp(`(?<![\\d,.])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(where);
    for (const n of ['42', '84', '0.84', '24', '30 who', '0.12', '0.61', '9 of them', '0.83', '0.77', '500', '99.8%', '250', '99.6%', '93%', '85%', '25 transactions', '50 frauds']) {
      expect(has(text, n), `${n} is in the text`).toBe(false);
      expect(has(quiz, n), `${n} is in the quiz`).toBe(false);
    }
    const lessonText = text.slice(0, text.indexOf('<Quiz'));
    for (const n of ['400', '280', '0.92', '1,000', '99.9%']) expect(has(lessonText, n), `${n} is in the lesson`).toBe(false);
  });
});

describe('classification-metrics: assessment tags and MDX', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('reads its mistakes, probes, quiz traps and explain-back as the app will', () => {
    const mistakes = misconceptionsIn('classification-metrics', source);
    expect(mistakes.map((m) => m.id)).toEqual(['precision-is-recall', 'higher-threshold-more-precise', 'auc-is-accuracy', 'accuracy-means-good']);
    for (const m of mistakes) {
      expect(m.probes.length).toBe(2);
      expect(m.correction.length).toBeGreaterThan(20);
      for (const p of m.probes) {
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeLessThan(p.choices.length);
        expect(p.trap).not.toBe(p.answer);
      }
    }
    const [quiz, ...rest] = quizzesIn('classification-metrics', source);
    expect(rest).toEqual([]);
    expect(quiz.questions.length).toBe(7);
    const ids = new Set(mistakes.map((m) => m.id));
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(ids.has(id)).toBe(true);
        expect(Number(choice)).not.toBe(q.answer);
      }
    for (const id of ids) expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(id)), id).toBe(true);
    const [prompt] = promptsIn('classification-metrics', source);
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

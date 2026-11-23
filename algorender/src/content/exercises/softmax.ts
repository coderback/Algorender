// Softmax as code (B7 of the math and ML path): a softmax that overflows on
// big scores, to fix by subtracting the largest score first, and the mean
// cross-entropy of rows of scores, computed by log-sum-exp so it never takes
// the log of a probability rounded to 0. Milestone project M3 reuses
// `softmax(logits)` exactly as the fixed bug hunt has it.
//
// Python's math.exp and JavaScript's Math.exp can differ in the last bit, and
// exercises.test.ts needs both languages to write the same numbers into the
// visual arrays. So each value goes into its array rounded to 6 places
// (round(v, 6) and Math.round(v * 1e6) / 1e6 agree unless a value sits on a
// tie, which none here does), and the full values are returned, which the
// checks compare with a tolerance. Sums are plain loops in both languages
// (Python's sum() adds floats with extra care, so it can differ in the last bit).

import type { Arg, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

const isNumbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((v) => typeof v === 'number');
/** a and b agree to `rel` of b's size (and to 1e-12 near 0). */
const near = (a: number, b: number, rel = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b) + 1e-12;
const allNear = (got: readonly number[], want: readonly number[], rel = 1e-9) => got.length === want.length && want.every((w, i) => near(got[i], w, rel));
const fmt = (v: number, digits = 6) => {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};
const listOf = (vs: readonly number[], digits = 6) => `[${vs.map((v) => fmt(v, digits)).join(', ')}]`;
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** The learner's visual array `name` at the end of the run. */
function finalArray(result: RunResult, name: string): number[] | null {
  const made = result.events.find((e) => e.kind === 'array' && e.name === name);
  return made && made.kind === 'array' ? (result.arrays[made.array] ?? null) : null;
}

/** What a crash on these scores means, if it is overflow or underflow; null for any other error. */
function overflowVerdict(result: RunResult, scores: readonly number[]): Verdict | null {
  const message = result.error?.message ?? '';
  const at = result.error?.line == null ? '' : `Line ${result.error.line}: `;
  const top = Math.max(...scores);
  if (/OverflowError|math range error/.test(message))
    return { pass: false, message: `${at}OverflowError: e to the power ${fmt(top, 2)} is too big for a float (anything above about e^709.78 is), so Python stops. Subtract the largest score m from every score before exp: the biggest power is then e⁰ = 1, and the probabilities are the same, since only the gaps between scores matter.` };
  if (/ZeroDivisionError|division by zero/.test(message))
    return { pass: false, message: `${at}ZeroDivisionError: every e^z underflowed to 0 (e^${fmt(top, 2)} is far below the smallest float), so the total is 0. Subtract the largest score m first: then one power is e⁰ = 1 and the total is at least 1.` };
  if (/math domain error|expected a positive input/.test(message))
    return { pass: false, message: `${at}ValueError: ln of 0. A probability underflowed to 0, and ln 0 has no value. Don’t take the log of p: −ln p_y = m + ln s − z_y, where s adds up e^(z − m), works straight from the scores.` };
  if (/can't store NaN/.test(message))
    return { pass: false, message: `${at}a NaN, “not a number”. ${top > 700 ? `e^${fmt(top, 2)} overflows to Infinity, and Infinity / Infinity is NaN` : 'Every e^z underflowed to 0, and 0 / 0 is NaN'}. Subtract the largest score m from every score before exp: the biggest power is then e⁰ = 1, nothing overflows, and the total is at least 1.` };
  if (/can't store -?Infinity/.test(message))
    return { pass: false, message: `${at}an infinite loss. A probability underflowed to 0, and −ln 0 is Infinity. Don’t take the log of p: −ln p_y = m + ln s − z_y, where s adds up e^(z − m), works straight from the scores.` };
  return null;
}

// ───────────────────────────── 1. stable-softmax (a bug hunt) ─────────────────────────────

export type SoftmaxExInput = { logits: number[] };

/**
 * Softmax of the scores, and the usual slips, each as the code that makes it would run:
 * - naive: no shift (overflows past e^709.78, NaN or a crash).
 * - min: the smallest score subtracted, not the largest (the rest can still overflow).
 * - divide: the scores divided by the largest instead of shifted (a temperature: other probabilities).
 * - unnormalised: e^(z − m) returned without dividing by the total.
 * - over-total: the scores themselves divided by their total.
 */
export type SoftmaxSlip = 'right' | 'naive' | 'min' | 'divide' | 'unnormalised' | 'over-total';

export function softmaxSlip(logits: readonly number[], slip: SoftmaxSlip = 'right'): number[] {
  if (slip === 'over-total') {
    const t = logits.reduce((a, b) => a + b, 0);
    return logits.map((z) => z / t);
  }
  const m = Math.max(...logits);
  const shifted = logits.map((z) => (slip === 'naive' ? z : slip === 'min' ? z - Math.min(...logits) : slip === 'divide' ? z / m : z - m));
  const exps = shifted.map((v) => Math.exp(v));
  let total = 0;
  for (const e of exps) total = total + e;
  return slip === 'unnormalised' ? exps : exps.map((e) => e / total);
}

function checkSoftmax({ logits }: SoftmaxExInput, result: RunResult): Verdict {
  if (result.error) return overflowVerdict(result, logits) ?? crashed(result)!;
  const got = result.returned;
  if (!isNumbers(got) || got.length !== logits.length) return { pass: false, message: `Return the ${logits.length} probabilities as a list of numbers, one per score.` };
  const want = softmaxSlip(logits);
  const is = (slip: SoftmaxSlip) => {
    const s = softmaxSlip(logits, slip);
    return s.every(Number.isFinite) && allNear(got, s);
  };
  if (allNear(got, want)) {
    const probs = finalArray(result, 'probs');
    if (!probs || !probs.every((v, i) => Math.abs(v - round6(want[i])) <= 1.5e-6)) return { pass: false, message: `The probabilities are right, but probs should hold each one rounded to 6 places: ${listOf(want)}.` };
    return { pass: true, message: `softmax(${listOf(logits, 2)}) = ${listOf(want, 4)}, adding up to 1${Math.max(...logits) > 700 || Math.max(...logits) < -700 ? `, with nothing overflowing: the largest score, ${fmt(Math.max(...logits), 2)}, was subtracted first` : ''}.` };
  }
  if (got.some(Number.isNaN)) return { pass: false, message: 'Your probabilities came back NaN, “not a number”: e^z overflowed to Infinity (or every e^z underflowed to 0), and Infinity / Infinity (or 0 / 0) is NaN. Subtract the largest score from every score before exp.' };
  if (is('divide')) return { pass: false, message: 'You divided every score by the largest. That is a temperature, T = m, and it changes the probabilities. Subtract m instead: shifting every score by the same amount changes nothing.' };
  if (is('unnormalised')) return { pass: false, message: `Those are the powers e^(z − m), which add up to ${fmt(got.reduce((a, b) => a + b, 0), 4)}, not 1. Divide each by their total.` };
  if (is('over-total')) return { pass: false, message: 'You divided the scores themselves by their total. Softmax divides e to the power of each score by the total of those powers, so every probability is positive and they add up to 1.' };
  if (is('min')) return { pass: false, message: 'Subtract the largest score, not the smallest: after subtracting the smallest the others are above 0, and e to a big power still overflows.' };
  const total = got.reduce((a, b) => a + b, 0);
  return { pass: false, message: `softmax(${listOf(logits, 2)}) should be ${listOf(want, 6)}, but you returned ${listOf(got)}${near(total, 1, 1e-6) ? '' : `, which adds up to ${fmt(total, 4)}, not 1`}.` };
}

const SOFTMAX_PY = (fixed: boolean) => `import math


def softmax(logits):${fixed ? '\n    m = max(logits)' : ''}
    exps = []
    for z in logits:
        exps.append(math.exp(${fixed ? 'z - m' : 'z'}))
    total = 0
    for e in exps:
        total = total + e
    probs = array([0] * len(logits))
    result = []
    for k in range(len(logits)):
        p = exps[k] / total
        probs[k] = round(p, 6)
        result.append(p)
    return result
`;
const SOFTMAX_JS = (fixed: boolean) => `function softmax(logits) {${fixed ? '\n  const m = Math.max(...logits);' : ''}
  const exps = [];
  for (const z of logits) exps.push(Math.exp(${fixed ? 'z - m' : 'z'}));
  let total = 0;
  for (const e of exps) total = total + e;
  const probs = array(logits.map(() => 0));
  const result = [];
  for (let k = 0; k < logits.length; k++) {
    const p = exps[k] / total;
    probs[k] = Math.round(p * 1e6) / 1e6;
    result.push(p);
  }
  return result;
}
`;
const softmaxTs = (js: string) =>
  js
    .replace('function softmax(logits) {', 'function softmax(logits: number[]): number[] {')
    .replace('const exps = [];', 'const exps: number[] = [];')
    .replace('const result = [];', 'const result: number[] = [];');

/** The scores the visualiser's bars story starts from, and the overflow story's. */
export const BARS_LOGITS = [2, 1.5, 1, -0.5];
export const BIG_LOGITS = [1000, 999, 998];

export const SOFTMAX_TESTS: { name: string; input: SoftmaxExInput }[] = [
  { name: 'four small scores', input: { logits: BARS_LOGITS } },
  { name: 'scores in the thousands', input: { logits: BIG_LOGITS } },
  { name: 'scores far below 0', input: { logits: [-1000, -1001, -1002] } },
  { name: 'a tie', input: { logits: [3, 3] } },
  { name: 'one score', input: { logits: [5] } },
  { name: 'a huge spread', input: { logits: [710, 0, -710] } },
  { name: 'the largest score last', input: { logits: [-3, 2, 800] } },
];

const stableSoftmax: Exercise<SoftmaxExInput> = {
  slug: 'stable-softmax',
  title: 'Fix a softmax that overflows',
  kind: 'bug',
  visualiser: 'softmax',
  summary: 'A softmax that works on small scores but breaks on big ones. Make it subtract the largest score first.',
  task: [
    '`softmax(logits)` should return the probabilities of a list of scores: e to the power of each score, divided by the total of those powers. It writes each probability into `probs`, rounded to 6 places for the picture, and returns them in full.',
    'It works on small scores. On the second test, [1000, 999, 998], Python stops with an OverflowError and JavaScript makes a NaN (“not a number”) that `probs` can’t store, although softmax of those scores is perfectly ordinary. Scores far below 0 break it too. Run it, read the error, and fix it so that every probability is unchanged.',
  ],
  entry: { python: 'softmax', js: 'softmax' },
  args: ({ logits }) => [{ kind: 'value', name: 'logits', value: logits }],
  starter: { python: SOFTMAX_PY(false), javascript: SOFTMAX_JS(false), typescript: softmaxTs(SOFTMAX_JS(false)) },
  solution: { python: SOFTMAX_PY(true), javascript: SOFTMAX_JS(true), typescript: softmaxTs(SOFTMAX_JS(true)) },
  bug: {
    symptom: 'Small scores work; on [1000, 999, 998] Python raises OverflowError and JavaScript makes NaN, and scores far below 0 fail too.',
    explanation: 'e to any power above about 709.78 is bigger than the largest float64, so it overflows: Python raises OverflowError, JavaScript gives Infinity, and Infinity / Infinity is NaN. Far below 0 every power underflows to 0, and 0 / 0 is NaN (a ZeroDivisionError in Python). Softmax only depends on the gaps between scores, so subtract the largest score m from every score first: the biggest power is then e⁰ = 1, nothing overflows, the total is at least 1, and every probability is the same as before.',
  },
  examples: [
    { id: 'small', label: 'Four small scores', input: { logits: BARS_LOGITS } },
    { id: 'big', label: 'Scores in the thousands', input: { logits: BIG_LOGITS } },
  ],
  tests: SOFTMAX_TESTS,
  check: checkSoftmax,
  markSortedAtEnd: false,
  pointers: ['k'],
  hints: [
    'Run the second test and read the error’s line: which value is too big for a float?',
    'Adding the same number to every score changes no probability: the factor it multiplies every e by cancels in the division. Which number would keep every power at most e⁰ = 1?',
  ],
  legend: [
    { neutral: 'A probability not worked out yet (0)' },
    { mark: 'write', label: 'The probability just worked out' },
  ],
};

// ───────────────────────────── 2. cross-entropy ─────────────────────────────

export type CrossEntropyInput = { logits: number[][]; labels: number[] };

/**
 * The mean cross-entropy, −ln softmax(row)[label] averaged over the rows, and the usual slips:
 * - sum: the total over the rows, not the mean.
 * - sign: ln p, not −ln p (negative).
 * - log2: in bits (log base 2), not nats.
 * - drop-m: m subtracted inside the exp but not added back.
 * - top: the loss of the top-scoring class, not the true one.
 * - first: the loss of class 0 on every row.
 * - naive: ln of the softmax probability itself (fine unless a probability underflows to 0).
 */
export type CrossSlip = 'right' | 'sum' | 'sign' | 'log2' | 'drop-m' | 'top' | 'first' | 'naive';

export function crossEntropyOf({ logits, labels }: CrossEntropyInput, slip: CrossSlip = 'right'): { mean: number; losses: number[] } {
  const losses = logits.map((row, i) => {
    const m = Math.max(...row);
    let s = 0;
    for (const z of row) s = s + Math.exp(z - m);
    const y = slip === 'top' ? row.indexOf(m) : slip === 'first' ? 0 : labels[i];
    if (slip === 'naive') {
      let t = 0;
      for (const z of row) t = t + Math.exp(z);
      return -Math.log(Math.exp(row[y]) / t);
    }
    const loss = (slip === 'drop-m' ? 0 : m) + Math.log(s) - row[y];
    return slip === 'log2' ? loss / Math.LN2 : slip === 'sign' ? -loss : loss;
  });
  let total = 0;
  for (const l of losses) total = total + l;
  return { mean: slip === 'sum' ? total : total / losses.length, losses };
}

function checkCrossEntropy(input: CrossEntropyInput, result: RunResult): Verdict {
  if (result.error) return overflowVerdict(result, input.logits.flat()) ?? crashed(result)!;
  const got = result.returned;
  const n = input.logits.length;
  if (typeof got !== 'number') return { pass: false, message: 'Return one number: the mean of −ln p of the true class over the rows.' };
  const want = crossEntropyOf(input);
  const is = (slip: CrossSlip) => {
    const v = crossEntropyOf(input, slip).mean;
    return Number.isFinite(v) && !near(v, want.mean) && near(got, v);
  };
  if (near(got, want.mean)) {
    const losses = finalArray(result, 'losses');
    if (!losses || losses.every((v) => v === 0)) return { pass: false, message: `The mean is right, but losses is still all 0: write each row’s loss into losses[i], rounded to 6 places, so the run shows which rows cost the most.` };
    const bad = losses.findIndex((v, i) => Math.abs(v - round6(want.losses[i])) > 1.5e-6);
    if (bad >= 0) return { pass: false, message: `The mean is right, but losses[${bad}] should be row ${bad}’s loss, ${fmt(want.losses[bad])}; yours is ${fmt(losses[bad])}.` };
    return { pass: true, message: `Over ${n} row${n === 1 ? '' : 's'} the losses are ${listOf(want.losses, 4)}, and their mean, the cross-entropy, is ${fmt(want.mean, 6)}.` };
  }
  if (!Number.isFinite(got)) return { pass: false, message: `You returned ${fmt(got)}. ${got === Infinity || got === -Infinity ? 'A probability underflowed to 0, and ln 0 = −∞.' : 'A NaN: e^z overflowed, or 0 / 0.'} Work from the scores: −ln p_y = m + ln s − z_y, where m is the row’s largest score and s adds up e^(z − m).` };
  if (n > 1 && is('sum')) return { pass: false, message: `You returned the total over the ${n} rows, ${fmt(got)}. The cross-entropy is their mean: divide by ${n}.` };
  if (is('sign')) return { pass: false, message: `Your answer is negative: ln p, not −ln p. A probability is at most 1, so its log is at most 0, and the loss −ln p is at least 0.` };
  if (is('log2')) return { pass: false, message: `That is the cross-entropy in bits (log base 2), ${fmt(want.mean)} ÷ ln 2. This loss uses the natural log ln (math.log, Math.log), as maximum likelihood does.` };
  if (is('drop-m')) return { pass: false, message: `You subtracted m inside the exp but never added it back. ln(e^z₁ + … + e^z_K) = m + ln(e^(z₁ − m) + … + e^(z_K − m)): the loss is m + ln s − z_y.` };
  if (is('top')) return { pass: false, message: 'You took −ln p of each row’s top-scoring class. The loss asks how much probability the true class got: use row[labels[i]].' };
  if (is('first')) return { pass: false, message: 'You took −ln p of class 0 on every row. The loss asks how much probability each row’s true class got: use row[labels[i]].' };
  return { pass: false, message: `The cross-entropy here is ${fmt(want.mean)}, but you returned ${fmt(got)}. For each row: m = its largest score, s = the total of e^(z − m), loss = m + ln s − row[labels[i]]; then the mean of the losses.` };
}

const CE_BLANKS_PY = `import math


def cross_entropy(logits, labels):
    losses = array([0] * len(logits))
    total = 0
    for i in range(len(logits)):
        row = logits[i]
        m = «1:max(row)»
        s = 0
        for z in row:
            s = s + «2:math.exp(z - m)»
        loss = «3:m + math.log(s)» - «4:row[labels[i]]»
        losses[i] = round(loss, 6)
        total = «5:total + loss»
    return total / «6:len(logits)»
`;
const CE_BLANKS_JS = `function crossEntropy(logits, labels) {
  const losses = array(Array.from({ length: logits.length }, () => 0));
  let total = 0;
  for (let i = 0; i < logits.length; i++) {
    const row = logits[i];
    const m = «1:Math.max(...row)»;
    let s = 0;
    for (const z of row) s = s + «2:Math.exp(z - m)»;
    const loss = «3:m + Math.log(s)» - «4:row[labels[i]]»;
    losses[i] = Math.round(loss * 1e6) / 1e6;
    total = «5:total + loss»;
  }
  return total / «6:logits.length»;
}
`;
const CE_STARTER_PY = `import math


def cross_entropy(logits, labels):
    losses = array([0] * len(logits))
    total = 0
    for i in range(len(logits)):
        row = logits[i]
        # The loss of this row is -ln p of its true class, labels[i].
        # Work it out from the scores, never from p itself:
        # m = the largest score, s = the total of e^(z - m) over the row,
        # loss = m + ln s - row[labels[i]].
        # Write round(loss, 6) into losses[i] and add loss to total.
        pass
    return 0
`;
const CE_STARTER_JS = `function crossEntropy(logits, labels) {
  const losses = array(Array.from({ length: logits.length }, () => 0));
  let total = 0;
  for (let i = 0; i < logits.length; i++) {
    const row = logits[i];
    // The loss of this row is -ln p of its true class, labels[i].
    // Work it out from the scores, never from p itself:
    // m = the largest score, s = the total of e^(z - m) over the row,
    // loss = m + ln s - row[labels[i]].
    // Write Math.round(loss * 1e6) / 1e6 into losses[i] and add loss to total.
  }
  return 0;
}
`;
const ceTs = (js: string) => js.replace('function crossEntropy(logits, labels) {', 'function crossEntropy(logits: number[][], labels: number[]): number {');
const strip = (marked: string) => marked.replace(/«\d+:([^»]*)»/g, '$1');

const ceArgs = ({ logits, labels }: CrossEntropyInput): Arg[] => [
  { kind: 'grid', name: 'logits', values: logits },
  { kind: 'value', name: 'labels', value: labels },
];

export const CE_TESTS: { name: string; input: CrossEntropyInput }[] = [
  { name: 'one row, the true class on top', input: { logits: [[2, 1, 0]], labels: [0] } },
  { name: 'three rows of three classes', input: { logits: [[2, 1, 0], [0.5, 2.5, -1], [1, 0, 2]], labels: [0, 0, 2] } },
  { name: 'the bars’ four scores, the true class owl, then cat', input: { logits: [BARS_LOGITS, BARS_LOGITS], labels: [3, 0] } },
  { name: 'scores in the thousands, and far below 0', input: { logits: [BIG_LOGITS, [-1000, -1001, -1002]], labels: [2, 0] } },
  { name: 'a confident mistake: the true class 800 below the top', input: { logits: [[0, -800], [5, 5]], labels: [1, 0] } },
  { name: 'two classes, as in logistic regression', input: { logits: [[3, 0], [-1, 0], [0.5, 0]], labels: [0, 1, 1] } },
];

const crossEntropy: Exercise<CrossEntropyInput> = {
  slug: 'cross-entropy',
  title: 'The cross-entropy of softmax, safely',
  kind: 'write',
  visualiser: 'softmax',
  summary: 'Average −ln p of the true class over rows of scores, by log-sum-exp, so a probability rounded to 0 never reaches a log.',
  task: [
    'A classifier gives each example a row of scores, one per class, and `labels[i]` is example i’s true class. Its loss is the cross-entropy: the mean, over the rows, of −ln p, where p is the probability softmax gives the true class. As in maximum likelihood, it is −ln L divided by the number of examples. Write `cross_entropy(logits, labels)` (`crossEntropy` in JavaScript and TypeScript), which returns it.',
    'Never work out p and then its log: when the true class’s score is far below the top, p rounds to 0, and ln 0 is −∞. Instead, for each row let m be its largest score and s the total of e^(z − m) over its scores. Then −ln p = −ln(e^(z_y − m) / s) = m + ln s − z_y, where z_y is the true class’s score: this is log-sum-exp, and nothing in it can overflow or reach ln 0.',
    'Write each row’s loss into `losses[i]`, rounded to 6 places for the picture, and return the mean of the full losses.',
  ],
  entry: { python: 'cross_entropy', js: 'crossEntropy' },
  args: ceArgs,
  starter: { python: CE_STARTER_PY, javascript: CE_STARTER_JS, typescript: ceTs(CE_STARTER_JS) },
  solution: { python: strip(CE_BLANKS_PY), javascript: strip(CE_BLANKS_JS), typescript: ceTs(strip(CE_BLANKS_JS)) },
  blanks: { python: CE_BLANKS_PY, javascript: CE_BLANKS_JS, typescript: ceTs(CE_BLANKS_JS) },
  fades: [[4], [2, 4, 6], [1, 2, 3, 4, 5, 6]],
  distractors: {
    python: ['            s = s + math.exp(z)', '        loss = math.log(s) - row[labels[i]]'],
    javascript: ['    for (const z of row) s = s + Math.exp(z);', '    const loss = Math.log(s) - row[labels[i]];'],
    typescript: ['    for (const z of row) s = s + Math.exp(z);', '    const loss = Math.log(s) - row[labels[i]];'],
  },
  examples: [
    { id: 'three', label: 'Three rows of three classes', input: CE_TESTS[1].input },
    { id: 'extreme', label: 'Scores in the thousands, and far below 0', input: CE_TESTS[3].input },
  ],
  tests: CE_TESTS,
  check: checkCrossEntropy,
  markSortedAtEnd: false,
  pointers: ['i'],
  hints: [
    'Loop over the rows. In each, find m = the largest score, then add up e^(z − m) over the row into s.',
    'The loss of row i is m + ln s − row[labels[i]] (`math.log`, `Math.log`). It is at least 0, and 0 only if the true class got all the probability.',
    'Add each loss to total, and return total divided by the number of rows: the cross-entropy is a mean.',
  ],
  legend: [
    { neutral: 'A score, or a loss not worked out yet (0)' },
    { mark: 'write', label: 'The loss just worked out' },
  ],
};

export const softmaxExercises: Exercise[] = [stableSoftmax, crossEntropy];

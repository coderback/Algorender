import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { arcBend, CELLS, clampSize, joinWords } from './shared';

export type CoinInput = { coins: number[]; amount: number };

export const MAX_AMOUNT = 30;
const MAX_COIN = 50;
const MAX_COINS = 6;

const pseudocode = [
  'dp[0] ← 0',
  'for a from 1 to A:',
  '  dp[a] ← ∞',
  '  for each coin c ≤ a:',
  '    if dp[a − c] + 1 < dp[a]:',
  '      dp[a] ← dp[a − c] + 1',
  '      coin[a] ← c',
  '',
  'if dp[A] = ∞: A cannot be made',
  'else, starting from a = A:',
  '  take coin[a];  a ← a − coin[a]',
];

const DP = 0;
const COIN = 1;
const LIST = 'used';
const INF = Number.POSITIVE_INFINITY;
const NONE = '–';

const show = (n: number) => (n === INF ? '∞' : String(n));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "What goes in dp[a]?": the answer, the losing candidates, near misses and ∞, ascending with ∞ last. */
function valueChoices(answer: number, wrong: readonly number[]): { choices: string[]; answer: number } {
  const set = new Set<number>([answer]);
  const near = answer === INF ? [1, 2, 3] : [answer + 1, answer - 1, INF, answer + 2];
  for (const w of [...wrong, ...near]) if (set.size < 4 && w >= 1) set.add(w);
  const sorted = [...set].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { choices: sorted.map(show), answer: sorted.indexOf(answer) };
}

/** Largest-coin-first: the coins it takes, and what is left if it gets stuck. */
export function largestFirst(coins: readonly number[], amount: number): { taken: number[]; left: number } {
  const desc = [...coins].sort((x, y) => y - x);
  const taken: number[] = [];
  let left = amount;
  for (;;) {
    const c = desc.find((x) => x <= left);
    if (left === 0 || c == null) return { taken, left };
    taken.push(c);
    left -= c;
  }
}

function* run({ coins, amount: A }: CoinInput): Generator<Frame<GridState>> {
  const t = new GridTracer(['cells', 'tried']);
  t.addTable({
    label: 'dp[a]: fewest coins that make a; coin[a]: the last one',
    corner: 'a',
    rows: [
      { id: 'dp', label: 'dp' },
      { id: 'coin', label: 'coin' },
    ],
    cols: Array.from({ length: A + 1 }, (_, a) => ({ label: String(a) })),
  });
  t.addList({ id: LIST, label: 'Coins used', empty: 'Found during the traceback' });
  const dp = Array<number>(A + 1).fill(INF);
  const last = Array<number>(A + 1).fill(0);
  const coinNames = joinWords(coins.map(String));

  yield t.frame({
    note: `dp[a] will hold the fewest coins that add up to a, using as many ${coinNames} coins as needed: every amount is a smaller amount plus one last coin.`,
    vars: { A, coins: coins.join(', ') },
  });

  dp[0] = 0;
  t.set([DP, 0], 0);
  t.set([COIN, 0], NONE);
  yield t.frame({
    line: 0,
    note: 'Making 0 takes no coins at all, so dp[0] = 0: every other amount is built on top of it.',
    marks: { key: [[DP, 0]] },
    vars: { a: 0, 'dp[a]': 0 },
  });

  for (let a = 1; a <= A; a++) {
    const here: CellRef = [DP, a];
    const usable = coins.filter((c) => c <= a);
    t.count('tried', usable.length);

    if (usable.length === 0) {
      t.set(here, '∞');
      t.set([COIN, a], NONE);
      t.count('cells');
      yield t.frame({
        line: 3,
        note: `No coin is ${a} or smaller, so no way of making ${a} exists: dp[${a}] stays ∞.`,
        marks: { key: [here, [COIN, a]] },
        vars: { a, 'dp[a]': '∞' },
      });
      continue;
    }

    // Each usable coin as the last one: what is left, and how many coins that takes (∞ + 1 is ∞).
    const cands = usable.map((c) => ({ c, rest: a - c, value: dp[a - c] + 1 }));
    const best = Math.min(...cands.map((x) => x.value));
    const win = cands.find((x) => x.value === best)!; // coins ascend, so the smallest coin wins a tie
    const deps: CellRef[] = cands.map((x) => [DP, x.rest]);
    const arrows = cands.map((x) => ({ from: [DP, x.rest] as const, to: here, mark: 'compare' as const, bend: arcBend(x.c) }));
    const options = cands.map((x) => `${x.c} leaves ${x.rest} (dp[${x.rest}] = ${show(dp[x.rest])})`);
    yield t.frame({
      line: 4,
      note:
        cands.length === 1
          ? `Only the ${win.c} coin fits in ${a}, so every way to make ${a} ends with it and leaves ${win.rest} (dp[${win.rest}] = ${show(dp[win.rest])}).`
          : `Every way to make ${a} ends with one last coin: ${joinWords(options, 'or')}.`,
      marks: { key: [here], compare: deps },
      arrows,
      vars: { a },
      checkpoint: { question: `What goes in dp[${a}]?`, ...valueChoices(best, cands.map((x) => x.value)) },
    });

    dp[a] = best;
    last[a] = best === INF ? 0 : win.c;
    t.set(here, show(best));
    t.set([COIN, a], best === INF ? NONE : win.c);
    t.count('cells');

    if (best === INF) {
      yield t.frame({
        line: 2,
        note:
          cands.length === 1
            ? `${win.rest} cannot be made, and one more coin on top of "impossible" is still impossible (∞ + 1 = ∞), so dp[${a}] stays ∞.`
            : `Every coin leaves an amount that cannot be made, and ∞ + 1 is still ∞, so dp[${a}] stays ∞: ${a} cannot be made.`,
        marks: { key: [here, [COIN, a]], compare: deps },
        arrows,
        vars: { a, 'dp[a]': '∞' },
      });
      continue;
    }

    const runner = cands.filter((x) => x !== win).sort((x, y) => x.value - y.value)[0];
    const formula = `dp[${a}] = dp[${win.rest}] + 1 = ${best}`;
    const note = !runner
      ? `${formula}: one ${win.c} coin more than the fewest that make ${win.rest}.`
      : runner.value === INF
        ? `${formula} with a ${win.c}: every other coin leaves an amount that cannot be made.`
        : runner.value === best
          ? `${formula} with a ${win.c}; a ${runner.c} ties (dp[${runner.rest}] + 1 = ${best}), and the first coin found is kept.`
          : `${formula} with a ${win.c}: better than dp[${runner.rest}] + 1 = ${runner.value} with a ${runner.c}.`;
    yield t.frame({
      line: 5,
      note,
      marks: { key: [here, [COIN, a]], compare: [[DP, win.rest]] },
      arrows: [{ from: [DP, win.rest], to: here, mark: 'compare', bend: arcBend(win.c) }],
      vars: { a, c: win.c, 'dp[a]': best },
    });
  }

  const greedy = largestFirst(coins, A);
  if (dp[A] === INF) {
    t.mark([DP, A], 'reject');
    yield t.frame({
      line: 8,
      note: `dp[${A}] = ∞: no combination of ${coinNames} coins adds up to ${A}, so there is no answer (largest-coin-first gets stuck too, with ${greedy.left} left over).`,
      vars: { A, 'dp[A]': '∞' },
    });
    return;
  }

  // Traceback: coin[a] is the last coin of a best way to make a.
  t.mark([DP, A], 'path');
  yield t.frame({
    line: 9,
    note: `dp[${A}] = ${dp[A]}, so ${plural(dp[A], 'coin')} is the fewest; coin[a] remembers the last coin of a best way to make each a, so following it back from ${A} lists them.`,
    vars: { a: A, 'dp[A]': dp[A] },
  });
  const used: number[] = [];
  let a = A;
  while (a > 0) {
    const c = last[a];
    const rest = a - c;
    t.addArrow({ from: [DP, a], to: [DP, rest], mark: 'path', bend: -arcBend(c) });
    t.mark([DP, rest], 'path');
    t.mark([COIN, a], 'path');
    t.addItem(LIST, { id: `c${used.length}`, text: String(c), mark: 'path' });
    used.push(c);
    yield t.frame({
      line: 10,
      note:
        rest === 0
          ? `coin[${a}] = ${c}: take a ${c}, which leaves 0, so every coin has been found.`
          : `coin[${a}] = ${c}: take a ${c}, leaving ${rest}, which the table already makes with ${plural(dp[rest], 'coin')}.`,
      vars: { a: rest, c },
    });
    a = rest;
  }

  const sum = (xs: number[]) => xs.join(' + ');
  const verdict =
    greedy.left > 0
      ? `largest-coin-first would get stuck: after ${sum(greedy.taken)} it has ${greedy.left} left, and no coin fits that`
      : greedy.taken.length > used.length
        ? `largest-coin-first takes ${sum(greedy.taken)}, ${plural(greedy.taken.length, 'coin')}, because the biggest coin that fits is not always part of the best answer`
        : `largest-coin-first also needs ${plural(greedy.taken.length, 'coin')} here, but only the table guarantees the fewest for every coin set`;
  yield t.frame({
    note: `Fewest coins: ${sum(used)} = ${A}, ${plural(used.length, 'coin')}; ${verdict}.`,
    vars: { A, coins: used.length },
  });
}

const custom: NonNullable<InputSpec<CoinInput>['custom']> = {
  label: `Coins (1–${MAX_COIN}, up to ${MAX_COINS}) | amount=… (1–${MAX_AMOUNT})`,
  placeholder: 'e.g. 1, 3, 4 | amount=6',
  parse: (text) => {
    const halves = text.split('|');
    if (halves.length !== 2) return { error: 'Write the coins, then "| amount=…", e.g. 1, 3, 4 | amount=6.' };
    const parts = halves[0].split(/[\s,]+/).filter(Boolean);
    if (parts.length === 0) return { error: 'Enter at least one coin before the "|".' };
    const coins: number[] = [];
    for (const part of parts) {
      const c = Number(part);
      if (!Number.isInteger(c) || c < 1 || c > MAX_COIN) return { error: `Coins must be whole numbers from 1 to ${MAX_COIN}; "${part}" is not.` };
      coins.push(c);
    }
    const distinct = [...new Set(coins)].sort((x, y) => x - y);
    if (distinct.length > MAX_COINS) return { error: `Use at most ${MAX_COINS} different coins.` };
    const m = /^\s*(?:amount\s*=\s*)?(\d+)\s*$/i.exec(halves[1]);
    if (!m) return { error: 'After the "|", give the amount, e.g. amount=6.' };
    const amount = Number(m[1]);
    if (amount < 1 || amount > MAX_AMOUNT) return { error: `The amount must be from 1 to ${MAX_AMOUNT}.` };
    return { value: { coins: distinct, amount } };
  },
  format: ({ coins, amount }) => `${coins.join(', ')} | amount=${amount}`,
};

/** Two or three different coins from 1–9, so some random amounts cannot be made. */
function randomCoins(seed: number): number[] {
  const rng = createRng(seed);
  const count = 2 + Math.floor(rng() * 2);
  const set = new Set<number>();
  while (set.size < count) set.add(1 + Math.floor(rng() * 9));
  return [...set].sort((x, y) => x - y);
}

export const coinChange = defineAlgorithm<CoinInput, GridState>({
  kind: 'algorithm',
  slug: 'coin-change',
  view: 'grid',
  input: {
    examples: [
      { id: 'greedy-fails', label: 'Greedy fails (1, 3, 4 → 6)', make: () => ({ coins: [1, 3, 4], amount: 6 }), sized: false },
      { id: 'impossible', label: "Can't be made (3, 5 → 7)", make: () => ({ coins: [3, 5], amount: 7 }), sized: false },
      { id: 'classic', label: 'Classic coins (1, 5, 10, 25)', make: ({ size }) => ({ coins: [1, 5, 10, 25], amount: clampSize(size, 1, MAX_AMOUNT) }) },
      { id: 'random', label: 'Random coins', make: ({ seed, size }) => ({ coins: randomCoins(seed), amount: clampSize(size, 1, MAX_AMOUNT) }) },
    ],
    size: { label: 'Amount', min: 1, max: MAX_AMOUNT, default: 12 },
    custom,
  },
  pseudocode,
  stats: [CELLS, { key: 'tried', label: 'Coins tried' }],
  legend: [
    { neutral: 'Computed (∞: cannot be made)' },
    { mark: 'key', label: 'Amount being filled' },
    { mark: 'compare', label: 'Smaller amounts it builds on' },
    { mark: 'path', label: 'Traceback (coins used)' },
    { mark: 'reject', label: 'Amount cannot be made' },
  ],
  run,
  content: {
    idea: 'To make an amount with the fewest coins, think about the last coin: whichever it is, the rest must be made as cheaply as possible. So fill dp[a] for every amount from 0 up, each from dp[a − c] + 1 for every coin c, and read the coins back from the record of winning last coins.',
    invariant: 'dp[0] = 0 and dp[a] = 1 + min over coins c ≤ a of dp[a − c], or ∞ when every coin leaves an amount that cannot be made. Amounts are filled in increasing order, so every dp[a − c] is final before dp[a] needs it.',
    whenToUse: 'Making change, or any "fewest pieces to reach a total" question with unlimited copies of each piece (an unbounded knapsack). O(n·A) time is pseudo-polynomial: fine for small amounts, too slow when A runs into the millions.',
    traits: [
      { label: 'Optimal for any coin set', good: true },
      { label: 'Largest-coin-first can fail', good: null },
      { label: 'Pseudo-polynomial O(n·A)', good: false },
    ],
    experiments: [
      { example: 'greedy-fails', prompt: 'Largest-coin-first takes 4 + 1 + 1, three coins. Watch dp[6]: the 3 coin wins because dp[3] = 1, giving 3 + 3, two coins.' },
      { example: 'impossible', prompt: 'With only 3s and 5s some amounts stay ∞. 6 can be made (3 + 3) but 7 cannot: ∞ + 1 is still ∞.' },
      { example: 'classic', prompt: 'Real coin sets are designed so that largest-first is always right: the final note agrees with it at every amount. Slide the amount up to 30: two coins, a 5 and a 25.' },
    ],
  },
});

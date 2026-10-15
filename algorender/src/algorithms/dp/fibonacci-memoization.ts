import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { numberChoices } from './shared';

/** memo: top-down with a memo; naive: the same recursion storing nothing; table: bottom-up. */
export type FibMode = 'memo' | 'naive' | 'table';
export type FibInput = { n: number; mode: FibMode };

const pseudocode = [
  'fib(n):',
  '  if n in memo: return memo[n]',
  '  if n ≤ 1: r ← n',
  '  else: r ← fib(n − 1) + fib(n − 2)',
  '  memo[n] ← r',
  '  return r',
  '',
  'bottom-up(n):',
  '  dp[0] ← 0;  dp[1] ← 1',
  '  for i from 2 to n:',
  '    dp[i] ← dp[i − 1] + dp[i − 2]',
];

const STACK = 'stack';
/** Arc height for the arrow from k − 2 to k, so it passes over the top of cell k − 1. */
const ARC = 0.55;

function* run({ n, mode }: FibInput): Generator<Frame<GridState>> {
  const t = new GridTracer(['calls', 'hits', 'additions']);
  const cols = Array.from({ length: n + 1 }, (_, k) => ({ label: String(k) }));
  if (mode === 'table') {
    yield* bottomUp(t, n, cols);
    return;
  }

  const memo = mode === 'memo';
  const MEMO = 0;
  const CALLS = memo ? 1 : 0;
  t.addTable({
    label: memo ? 'Memo and number of calls, per k' : 'Number of calls to fib(k)',
    corner: 'k',
    rows: memo ? [{ id: 'memo', label: 'memo[k]' }, { id: 'calls', label: 'calls' }] : [{ id: 'calls', label: 'calls' }],
    cols,
  });
  for (let k = 0; k <= n; k++) t.set([CALLS, k], 0);
  t.addList({ id: STACK, label: 'Call stack (innermost last)', empty: 'Empty' });

  const callsOf = Array<number>(n + 1).fill(0);
  let nextId = 0;

  function* fib(k: number, depth: number): Generator<Frame<GridState>, number> {
    const id = `call${nextId++}`;
    const top = { item: id, list: STACK };
    t.addItem(STACK, { id, text: `fib(${k})` });
    t.count('calls');
    t.set([CALLS, k], ++callsOf[k]);
    const known = memo && t.get([MEMO, k]) !== '';
    const vars = { k, depth };

    if (!memo) {
      if (k <= 1) {
        t.setItemText(STACK, id, `fib(${k}) = ${k}`);
        yield t.frame({
          line: 2,
          note: `Call fib(${k}): ${k} ≤ 1 is a base case, so it returns ${k} straight away.`,
          marks: { key: [top, [CALLS, k]] },
          vars,
        });
        t.removeItem(STACK, id);
        return k;
      }
      yield t.frame({
        line: 3,
        note: `Call fib(${k}): it needs fib(${k - 1}) + fib(${k - 2}), so it calls fib(${k - 1}) first.`,
        marks: { key: [top, [CALLS, k]] },
        vars,
      });
    } else {
      yield t.frame({
        line: 0,
        note: `Call fib(${k}). Before doing any work, check the memo.`,
        marks: { key: [top, [CALLS, k]], compare: [[MEMO, k]] },
        vars,
        checkpoint: { question: `Is fib(${k}) already in the memo?`, choices: ['Yes', 'No'], answer: known ? 0 : 1 },
      });
      if (known) {
        const value = t.num([MEMO, k]);
        t.count('hits');
        t.setItemText(STACK, id, `fib(${k}) = ${value}`);
        yield t.frame({
          line: 1,
          note: `Memo hit: memo[${k}] already holds ${value}, so return it without recursing.`,
          marks: { found: [top, [MEMO, k]] },
          vars: { ...vars, r: value },
        });
        t.removeItem(STACK, id);
        return value;
      }
      if (k <= 1) {
        t.set([MEMO, k], k);
        t.setItemText(STACK, id, `fib(${k}) = ${k}`);
        yield t.frame({
          line: 2,
          note: `fib(${k}) is not in the memo yet, and ${k} ≤ 1 is a base case: r = ${k}. Store it in memo[${k}].`,
          marks: { key: [top], write: [[MEMO, k]] },
          vars: { ...vars, r: k },
        });
        t.removeItem(STACK, id);
        return k;
      }
      yield t.frame({
        line: 3,
        note: `fib(${k}) is not in the memo yet, so compute fib(${k - 1}) + fib(${k - 2}), starting with fib(${k - 1}).`,
        marks: { key: [top] },
        vars,
      });
    }

    const a = yield* fib(k - 1, depth + 1);
    t.setItemText(STACK, id, `fib(${k}) = ${a} + ?`);
    const b = yield* fib(k - 2, depth + 1);
    t.setItemText(STACK, id, `fib(${k}) = ${a} + ${b}`);
    const r = a + b;
    const deps = memo
      ? {
          marks: { key: [top], compare: [[MEMO, k - 1], [MEMO, k - 2]] as const },
          arrows: [
            { from: [MEMO, k - 1] as const, to: [MEMO, k] as const, mark: 'compare' as const },
            { from: [MEMO, k - 2] as const, to: [MEMO, k] as const, mark: 'compare' as const, bend: ARC },
          ],
        }
      : { marks: { key: [top] } };
    yield t.frame({
      line: 3,
      note: `Back in fib(${k}): fib(${k - 1}) returned ${a} and fib(${k - 2}) returned ${b}.`,
      ...deps,
      vars: { ...vars, a, b },
      checkpoint: { question: `What does fib(${k}) return?`, ...numberChoices(r, [r + 1, r - 1, a]) },
    });

    t.count('additions');
    t.setItemText(STACK, id, `fib(${k}) = ${r}`);
    if (memo) {
      t.set([MEMO, k], r);
      yield t.frame({
        line: 4,
        note: `memo[${k}] ← ${a} + ${b} = ${r}, so any later call to fib(${k}) is a single look-up.`,
        ...deps,
        marks: { ...deps.marks, write: [[MEMO, k]] },
        vars: { ...vars, a, b, r },
      });
    } else {
      yield t.frame({
        line: 5,
        note: `Return ${a} + ${b} = ${r}. Nothing is stored, so the next call to fib(${k}) starts from scratch.`,
        ...deps,
        vars: { ...vars, a, b, r },
      });
    }
    t.removeItem(STACK, id);
    return r;
  }

  yield t.frame({
    note: memo
      ? `fib(${n}) = fib(${n - 1}) + fib(${n - 2}) asks for the same smaller values again and again. Here each answer goes into a memo the first time, and every later call just looks it up.`
      : `Plain recursion: fib(k) calls fib(k − 1) and fib(k − 2) and stores nothing, so lines 2 and 5 never run. Keep an eye on the calls row.`,
    vars: { n },
  });
  const result = yield* fib(n, 0);
  const { calls, hits, additions } = t.stats;
  yield t.frame({
    note: memo
      ? `fib(${n}) = ${result}, using ${calls} calls (${hits} of them memo hits) and ${additions} additions: each fib(k) was computed exactly once.`
      : `fib(${n}) = ${result}, but it took ${calls} calls and ${additions} additions: fib(1) alone was computed ${callsOf[1]} times.`,
    vars: { n, 'fib(n)': result },
  });
}

function* bottomUp(t: GridTracer, n: number, cols: { label: string }[]): Generator<Frame<GridState>> {
  t.addTable({ label: 'dp[i] = fib(i)', corner: 'i', rows: [{ id: 'dp', label: 'dp[i]' }], cols });
  yield t.frame({
    line: 7,
    note: `Bottom-up: fill dp[0..${n}] from the left, each entry from the two before it. No recursion and no call stack.`,
    vars: { n },
  });
  t.set([0, 0], 0);
  t.set([0, 1], 1);
  yield t.frame({ line: 8, note: 'The base cases: dp[0] = 0 and dp[1] = 1.', marks: { write: [[0, 0], [0, 1]] }, vars: { n } });
  for (let i = 2; i <= n; i++) {
    const a = t.num([0, i - 1]);
    const b = t.num([0, i - 2]);
    const r = a + b;
    const highlight = {
      arrows: [
        { from: [0, i - 1] as const, to: [0, i] as const, mark: 'compare' as const },
        { from: [0, i - 2] as const, to: [0, i] as const, mark: 'compare' as const, bend: ARC },
      ],
    };
    yield t.frame({
      line: 10,
      note: `dp[${i - 1}] = ${a} and dp[${i - 2}] = ${b} are already filled in.`,
      marks: { key: [[0, i]], compare: [[0, i - 1], [0, i - 2]] },
      ...highlight,
      vars: { i, 'dp[i−1]': a, 'dp[i−2]': b },
      checkpoint: { question: `What value goes in dp[${i}]?`, ...numberChoices(r, [r + 1, a, r - 1]) },
    });
    t.set([0, i], r);
    t.count('additions');
    yield t.frame({
      line: 10,
      note: `dp[${i}] = ${a} + ${b} = ${r}.`,
      marks: { key: [[0, i]], compare: [[0, i - 1], [0, i - 2]] },
      ...highlight,
      vars: { i, 'dp[i−1]': a, 'dp[i−2]': b, 'dp[i]': r },
    });
  }
  yield t.frame({
    note: `fib(${n}) = ${t.num([0, n])}, after ${n - 1} additions: one per entry, with no repeated work and no recursion.`,
    vars: { n, 'fib(n)': t.num([0, n]) },
  });
}

export const fibonacciMemoization = defineAlgorithm<FibInput, GridState>({
  kind: 'algorithm',
  slug: 'fibonacci-memoization',
  view: 'grid',
  input: {
    examples: [
      { id: 'memo', label: 'Memoised (top-down)', make: ({ size }) => ({ n: size, mode: 'memo' }) },
      { id: 'naive', label: 'No memo (plain recursion)', make: ({ size }) => ({ n: size, mode: 'naive' }) },
      { id: 'table', label: 'Bottom-up table', make: ({ size }) => ({ n: size, mode: 'table' }) },
    ],
    size: { label: 'n', min: 2, max: 15, default: 6 },
  },
  pseudocode,
  stats: [
    { key: 'calls', label: 'Calls' },
    { key: 'hits', label: 'Memo hits' },
    { key: 'additions', label: 'Additions' },
  ],
  legend: [
    { neutral: 'Stored value' },
    { mark: 'key', label: 'Current call or cell' },
    { mark: 'compare', label: 'Values it uses' },
    { mark: 'write', label: 'Just stored' },
    { mark: 'found', label: 'Memo hit' },
  ],
  run,
  content: {
    idea: 'fib(n) = fib(n − 1) + fib(n − 2) is short to write but asks for the same smaller values over and over. Remembering each answer the first time (a memo) means every fib(k) is computed once and every repeat is an instant look-up.',
    invariant: 'fib(0) = 0, fib(1) = 1 and fib(k) = fib(k − 1) + fib(k − 2). Once memo[k] is set it never changes, so a look-up returns exactly what recomputing would.',
    whenToUse: 'Any recursion that solves the same subproblem many times (overlapping subproblems). Top-down memoisation keeps the natural recursive code and only computes what is needed; a bottom-up table avoids deep recursion and makes the order explicit.',
    traits: [
      { label: 'Overlapping subproblems', good: null },
      { label: 'O(n) time with a memo, not ~1.6ⁿ', good: true },
      { label: 'O(n) extra memory', good: null },
    ],
    experiments: [
      { example: 'naive', prompt: 'Compare the calls row with the memoised run: small k are computed again and again, and the counts themselves are Fibonacci numbers.' },
      { example: 'memo', prompt: 'Each fib(k) is computed once. Which calls turn into memo hits, and why is it always the second one?' },
      { example: 'table', prompt: 'The same values, filled left to right with no call stack at all.' },
    ],
  },
});

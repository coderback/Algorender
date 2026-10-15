import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { answerPositions, expectLegendMatchesMarks, cell, expectGoodTrace, expectShortPseudocode, list, table, traceOf } from '@/viz/grid/testing';
import { dynamicProgramming } from '.';
import { editDistance } from './edit-distance';
import { fibonacciMemoization, type FibMode } from './fibonacci-memoization';
import { knapsack01 } from './knapsack-01';
import type { Item } from './knapsack-input';
import { longestCommonSubsequence } from './longest-common-subsequence';

// ───────────────────────────── references ─────────────────────────────

function lcsTable(a: string, b: string): number[][] {
  const L = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  return L;
}

function editTable(a: string, b: string): number[][] {
  const D = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      D[i][j] = a[i - 1] === b[j - 1] ? D[i - 1][j - 1] : 1 + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
  return D;
}

/** Best 0/1 knapsack value by trying every subset. */
function bruteKnapsack(items: Item[], W: number): number {
  let best = 0;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let w = 0;
    let v = 0;
    items.forEach((it, k) => {
      if (mask & (1 << k)) {
        w += it.w;
        v += it.v;
      }
    });
    if (w <= W) best = Math.max(best, v);
  }
  return best;
}

const fib = (n: number): number => (n <= 1 ? n : fib(n - 1) + fib(n - 2));

const isSubsequence = (s: string, of: string) => {
  let k = 0;
  for (const ch of of) if (k < s.length && s[k] === ch) k++;
  return k === s.length;
};

const tableValues = (algo: AnyAlgorithm, input: unknown) => {
  const t = table(traceOf(algo, input).frames.at(-1)!.state);
  return t.rows.map((r) => t.cells[r.id].map(Number));
};

const word = (alphabet: string[]) => fc.string({ unit: fc.constantFrom(...alphabet), minLength: 1, maxLength: 10 });

// ───────────────────────────── every module ─────────────────────────────

describe.each(dynamicProgramming)('$slug', (algo) => {
  it('builds every example and replays it with good frames, under the frame cap', () => {
    const sizes = algo.input.size ? [algo.input.size.min, algo.input.size.default, algo.input.size.max] : [0];
    for (const example of algo.input.examples) {
      for (const size of sizes) {
        for (const seed of [1, 7, 99]) {
          const { frames, truncated } = traceOf(algo, example.make({ seed, size }));
          expect(truncated).toBe(false);
          expectGoodTrace(algo, frames);
        }
      }
    }
  });

  it('keeps pseudo-code short enough for the side panel', () => expectShortPseudocode(algo));

  it('lists exactly the marks it uses in its legend', () => expectLegendMatchesMarks(algo));

  it('has a legend that starts with the neutral state, and experiments that name real examples', () => {
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(algo.input.examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('varies where the right answer sits among the choices', () => {
    const positions = new Set<number>();
    for (const example of algo.input.examples) {
      for (const p of answerPositions(traceOf(algo, example.make({ seed: 3, size: algo.input.size?.default ?? 0 })).frames)) positions.add(p);
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it.runIf(algo.input.custom != null)('accepts its own formatted custom input', () => {
    for (const example of algo.input.examples) {
      const input = example.make({ seed: 11, size: 0 });
      const text = algo.input.custom!.format(input);
      expect(algo.input.custom!.parse(text)).toEqual({ value: input });
    }
  });
});

// ───────────────────────────── correctness ─────────────────────────────

describe('longest-common-subsequence', () => {
  it('fills the table like the recurrence and reads off a longest common subsequence', () => {
    fc.assert(
      fc.property(word(['A', 'B', 'C']), word(['A', 'B', 'C']), (a, b) => {
        const { frames, truncated } = traceOf(longestCommonSubsequence, { a, b });
        expect(truncated).toBe(false);
        const ref = lcsTable(a, b);
        expect(tableValues(longestCommonSubsequence, { a, b })).toEqual(ref);
        const found = list(frames.at(-1)!.state, 'lcs')
          .items.map((it) => it.text)
          .join('');
        expect(found).toHaveLength(ref[a.length][b.length]);
        expect(isSubsequence(found, a) && isSubsequence(found, b)).toBe(true);
      }),
      { numRuns: 80 },
    );
  });

  it('narrates every frame of random runs properly', () => {
    fc.assert(
      fc.property(word(['A', 'B', 'C']), word(['A', 'B']), (a, b) => expectGoodTrace(longestCommonSubsequence, traceOf(longestCommonSubsequence, { a, b }).frames)),
      { numRuns: 30 },
    );
  });

  it('rejects malformed custom input', () => {
    const parse = longestCommonSubsequence.input.custom!.parse;
    expect(parse('kitten')).toHaveProperty('error');
    expect(parse('a, b, c')).toHaveProperty('error');
    expect(parse('hello, wo rld!')).toHaveProperty('error');
    expect(parse('abcdefghijk, abc')).toHaveProperty('error');
    expect(parse('kitten → sitting')).toEqual({ value: { a: 'kitten', b: 'sitting' } });
  });
});

describe('edit-distance', () => {
  it('fills the table like the recurrence and its edit script turns A into B in D[m,n] edits', () => {
    fc.assert(
      fc.property(word(['a', 'b', 'c']), word(['a', 'b', 'c']), (a, b) => {
        const { frames, truncated } = traceOf(editDistance, { a, b });
        expect(truncated).toBe(false);
        const ref = editTable(a, b);
        expect(tableValues(editDistance, { a, b })).toEqual(ref);
        let source = '';
        let output = '';
        let edits = 0;
        for (const { text } of list(frames.at(-1)!.state, 'edits').items) {
          if (text.startsWith('+')) {
            output += text.slice(1);
            edits++;
          } else if (text.startsWith('−')) {
            source += text.slice(1);
            edits++;
          } else if (text.includes('→')) {
            const [x, y] = text.split('→');
            source += x;
            output += y;
            edits++;
          } else {
            source += text;
            output += text;
          }
        }
        expect(source).toBe(a);
        expect(output).toBe(b);
        expect(edits).toBe(ref[a.length][b.length]);
      }),
      { numRuns: 80 },
    );
  });

  it('labels rows and columns with the letters, not indices', () => {
    const t = table(traceOf(editDistance, { a: 'kitten', b: 'sitting' }).frames[0].state);
    expect(t.rows.map((r) => r.label).join('')).toBe('εkitten');
    expect(t.cols.map((c) => c.label).join('')).toBe('εsitting');
  });
});

describe('knapsack-01', () => {
  const items = fc.array(fc.record({ w: fc.integer({ min: 1, max: 15 }), v: fc.integer({ min: 0, max: 99 }) }), { minLength: 1, maxLength: 6 });
  const capacity = fc.integer({ min: 1, max: 15 });

  it('finds the best value and a set of items that achieves it', () => {
    fc.assert(
      fc.property(items, capacity, (its, W) => {
        const { frames, truncated } = traceOf(knapsack01, { items: its, capacity: W });
        expect(truncated).toBe(false);
        const last = frames.at(-1)!.state;
        const best = bruteKnapsack(its, W);
        expect(Number(cell(last, its.length, W))).toBe(best);
        const chosen = list(last, 'taken').items.map((it) => it.text.charCodeAt(0) - 65);
        expect(new Set(chosen).size).toBe(chosen.length);
        expect(chosen.reduce((s, k) => s + its[k].w, 0)).toBeLessThanOrEqual(W);
        expect(chosen.reduce((s, k) => s + its[k].v, 0)).toBe(best);
      }),
      { numRuns: 80 },
    );
  });

  it('fills every cell, not just the full-capacity column', () => {
    const vals = tableValues(knapsack01, knapsack01.input.examples[0].make({ seed: 1, size: 0 }));
    for (const row of vals) for (const v of row) expect(Number.isFinite(v)).toBe(true);
  });

  it('narrates random runs properly, including the largest custom size', () => {
    fc.assert(
      fc.property(items, capacity, (its, W) => expectGoodTrace(knapsack01, traceOf(knapsack01, { items: its, capacity: W }).frames)),
      { numRuns: 30 },
    );
    const big = { items: Array.from({ length: 6 }, (_, k) => ({ w: k + 1, v: 10 + k })), capacity: 15 };
    const { frames, truncated } = traceOf(knapsack01, big);
    expect(truncated).toBe(false);
    expectGoodTrace(knapsack01, frames);
  });

  it('rejects malformed custom input', () => {
    const parse = knapsack01.input.custom!.parse;
    expect(parse('6:10, 5:7')).toHaveProperty('error');
    expect(parse('6:10, 5 | 10')).toHaveProperty('error');
    expect(parse('0:10 | 10')).toHaveProperty('error');
    expect(parse('6:10 | 99')).toHaveProperty('error');
    expect(parse('1:1, 1:1, 1:1, 1:1, 1:1, 1:1, 1:1 | 5')).toHaveProperty('error');
    expect(parse(' 6 : 10 ,5:7| 10 ')).toEqual({ value: { items: [{ w: 6, v: 10 }, { w: 5, v: 7 }], capacity: 10 } });
  });
});

describe('fibonacci-memoization', () => {
  const modes: FibMode[] = ['memo', 'naive', 'table'];

  it.each(modes)('%s computes fib(n) with the expected amount of work', (mode) => {
    for (let n = 2; n <= 15; n++) {
      const { frames, truncated } = traceOf(fibonacciMemoization, { n, mode });
      expect(truncated).toBe(false);
      const last = frames.at(-1)!;
      expect(last.vars['fib(n)']).toBe(fib(n));
      const { calls, hits, additions } = last.stats;
      if (mode === 'memo') expect({ calls, hits, additions }).toEqual({ calls: 2 * n - 1, hits: n - 2, additions: n - 1 });
      if (mode === 'naive') expect({ calls, hits, additions }).toEqual({ calls: 2 * fib(n + 1) - 1, hits: 0, additions: fib(n + 1) - 1 });
      if (mode === 'table') expect({ calls, hits, additions }).toEqual({ calls: 0, hits: 0, additions: n - 1 });
      if (mode !== 'naive') expect(tableValues(fibonacciMemoization, { n, mode })[0]).toEqual(Array.from({ length: n + 1 }, (_, k) => fib(k)));
    }
  });

  it('counts how often each fib(k) is called, and the stack is empty at the end', () => {
    const last = traceOf(fibonacciMemoization, { n: 7, mode: 'naive' }).frames.at(-1)!.state;
    // fib(k) is called fib(n − k + 1) times by plain recursion (fib(0) one time fewer).
    const calls = table(last).cells.calls.map(Number);
    for (let k = 1; k <= 7; k++) expect(calls[k]).toBe(fib(8 - k));
    expect(list(last, 'stack').items).toHaveLength(0);
  });

  it('asks a memo question only while there is a memo', () => {
    const questions = (mode: FibMode) =>
      traceOf(fibonacciMemoization, { n: 6, mode })
        .frames.flatMap((f) => (f.checkpoint ? [f.checkpoint.question] : []))
        .filter((q) => q.includes('memo'));
    expect(questions('memo').length).toBeGreaterThan(0);
    expect(questions('naive')).toHaveLength(0);
  });
});

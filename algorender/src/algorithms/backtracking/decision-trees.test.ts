import fc from 'fast-check';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { visualisers } from '@/data/visualisers';
import type { AnyAlgorithm } from '@/engine/module';
import { MAX_FRAMES, recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import { layoutTree } from '@/viz/tree/layout';
import { parents } from '@/viz/tree/tracer';
import type { NodeId, TreeState } from '@/viz/tree/types';
import { backtracking, decisionTrees } from '.';
import { MAX_PERMUTATION_ITEMS, permutations, permutationsInOrder } from './permutations';
import { MAX_SUBSET_ITEMS, parseItems, setText, subsets, subsetsInOrder, type ItemsInput } from './subsets';

// ───────────────────────────── references ─────────────────────────────

/**
 * Every subset in the order the search records them, worked out without a
 * tree: taking is tried before leaving out, so reading "take" as 1 the leaves
 * count down in binary from 11…1 to 0, item 0 being the highest bit. With
 * repeated items, only the first time each distinct subset turns up is kept.
 */
function subsetReference(input: readonly string[]): string[] {
  const items = [...input].sort();
  const n = items.length;
  const seen = new Set<string>();
  const out: string[] = [];
  for (let mask = 2 ** n - 1; mask >= 0; mask--) {
    const s = setText(items.filter((_, k) => (mask >> (n - 1 - k)) & 1));
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** All orders of the items' indexes in dictionary order, by repeated next-permutation. */
function permutationReference(items: readonly string[]): string[] {
  const p = items.map((_, k) => k);
  const out: string[] = [];
  for (;;) {
    out.push(p.map((k) => items[k]).join(''));
    let i = p.length - 2;
    while (i >= 0 && p[i] > p[i + 1]) i--;
    if (i < 0) return out;
    let j = p.length - 1;
    while (p[j] < p[i]) j--;
    [p[i], p[j]] = [p[j], p[i]];
    p.splice(i + 1, p.length - i - 1, ...p.slice(i + 1).reverse());
  }
}

/** Sorted multiset text, to compare subsets regardless of order. */
const multiset = (s: string) => (s === '∅' ? '' : s.slice(1, -1).split(', ').sort().join(''));

// ───────────────────────────── harness ─────────────────────────────

type Frames = Frame<TreeState>[];

const traceOf = (algo: AnyAlgorithm, input: ItemsInput) => recordTrace<TreeState>(algo.run(input));
const outputOf = (f: Frame<TreeState>) => f.state.output?.items ?? [];
const visibleIds = (s: TreeState) => Object.keys(s.nodes).filter((id) => !s.nodes[id].hidden);
const current = (s: TreeState) => Object.keys(s.marks).find((id) => s.marks[id] === 'key' && s.nodes[id]) ?? null;
const row = (s: TreeState, id: string) => s.table!.find((r) => r.id === id)!;
const curRow = (s: TreeState) => row(s, 'cur').cells.map((c) => c.label).filter(Boolean);

/** Every mark used anywhere in a state: nodes, keys and table cells. */
const marksIn = (s: TreeState) => new Set<MarkKey>(Object.values(s.marks));

function expectWellFormed(state: TreeState) {
  const tableIds = (state.table ?? []).flatMap((r) => r.cells.map((c) => c.id));
  const cellIds = Object.values(state.nodes).flatMap((n) => n.cells.map((c) => c.id));
  const known = new Set([...Object.keys(state.nodes), ...cellIds, ...tableIds]);
  for (const id of Object.keys(state.marks)) {
    expect(known.has(id), `marked id ${id}`).toBe(true);
    if (state.nodes[id]) expect(state.nodes[id].hidden, `mark on hidden ${id}`).toBeFalsy();
  }
  const parent = parents(state);
  expect(parent.size + 1).toBe(Object.keys(state.nodes).length);
  // A visible node's parent is visible: the tree only grows outwards.
  for (const id of visibleIds(state)) if (parent.has(id)) expect(state.nodes[parent.get(id)!].hidden).toBeFalsy();
  for (const id of state.pathEdges) expect(state.nodes[id].hidden).toBeFalsy();
  expect(state.search).toBe(true);
  expect(state.description.length).toBeGreaterThan(0);
}

/** Narration, lines, counters, checkpoints, state, growth and the frame cap: the checks every trace must pass. */
function expectGoodTrace(algo: AnyAlgorithm, frames: Frames) {
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(MAX_FRAMES);
  const statKeys = algo.stats.map((s) => s.key).sort();
  let prev: Record<string, number> = {};
  let prevVisible = new Set<string>();
  const fullLayout = layoutTree(frames[0].state).boxes;
  frames.forEach((frame, i) => {
    const at = `${algo.slug} frame ${i}: ${frame.note}`;
    expect(frame.note.trim().length, at).toBeGreaterThan(0);
    expect(frame.line, at).not.toBeNull();
    expect(algo.pseudocode[frame.line!]?.trim(), at).toBeTruthy();
    expect(Object.keys(frame.stats).sort()).toEqual(statKeys);
    for (const [k, v] of Object.entries(frame.stats)) expect(v, `${at} (${k})`).toBeGreaterThanOrEqual(prev[k] ?? 0);
    prev = frame.stats;

    const c = frame.checkpoint;
    if (c) {
      expect(c.choices.length, at).toBeGreaterThanOrEqual(2);
      expect(c.choices.length, at).toBeLessThanOrEqual(4);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(c.answer).toBeLessThan(c.choices.length);
      expect(i, at).toBeLessThan(frames.length - 1);
      const answer = c.choices[c.answer];
      if (answer.length > 3) expect(frame.note, at).not.toContain(answer);
    }

    expectWellFormed(frame.state);
    // The tree grows by at most one call per frame, never shrinks, and never moves: hidden calls hold their place.
    const visible = new Set(visibleIds(frame.state));
    for (const id of prevVisible) expect(visible.has(id), at).toBe(true);
    expect(visible.size - prevVisible.size).toBeLessThanOrEqual(1);
    prevVisible = visible;
    expect(layoutTree(frame.state).boxes).toEqual(fullLayout);
    // The current call is drawn, with the path from the root to it highlighted.
    const cur = current(frame.state);
    if (cur) {
      const parent = parents(frame.state);
      let depth = 0;
      for (let id: NodeId | undefined = cur; parent.has(id!); id = parent.get(id!)) depth++;
      expect(frame.state.pathEdges.length).toBe(depth);
    }
  });
  expect(frames.at(-1)!.state.pathEdges).toEqual([]);
  expect(visibleIds(frames.at(-1)!.state).length).toBe(Object.keys(frames.at(-1)!.state.nodes).length);
}

/** Inputs for a module: its examples plus random custom items. */
const exampleInputs = (algo: AnyAlgorithm) => algo.input.examples.map((e) => e.make({ seed: 1, size: 0 }) as ItemsInput);

// ───────────────────────────── every module ─────────────────────────────

describe.each(decisionTrees.map((a) => [a.slug, a] as const))('%s', (slug, algo) => {
  it('is a tree-view algorithm listed in the site registry, with no legacy page', () => {
    expect(algo.view).toBe('tree');
    expect(visualisers.find((v: { slug: string }) => v.slug === slug)).toBeDefined();
    expect(existsSync(fileURLToPath(new URL(`../../app/visualisers/${slug}`, import.meta.url)))).toBe(false);
    expect(backtracking).not.toContain(algo);
  });

  it('builds every example and replays it with good frames, under the frame cap', () => {
    for (const input of exampleInputs(algo)) {
      const { frames, truncated } = traceOf(algo, input);
      expect(truncated).toBe(false);
      expectGoodTrace(algo, frames);
    }
  });

  it('keeps pseudo-code short enough for the code panel', () => {
    for (const line of algo.pseudocode) expect([...line].length, line).toBeLessThanOrEqual(42);
  });

  it('has complete content, a neutral legend row first, and experiments that name real examples', () => {
    expect(algo.legend[0]).toHaveProperty('neutral');
    for (const text of [algo.content.idea, algo.content.invariant, algo.content.whenToUse]) expect(text.length).toBeGreaterThan(20);
    expect(algo.content.traits.length).toBeGreaterThan(0);
    const ids = new Set(algo.input.examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example), x.example).toBe(true);
  });

  it('lists exactly the marks it uses in its legend', () => {
    const used = new Set<MarkKey>();
    for (const input of exampleInputs(algo)) for (const f of traceOf(algo, input).frames) marksIn(f.state).forEach((m) => used.add(m));
    const listed = algo.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
    expect([...used].sort()).toEqual([...listed].sort());
  });

  it('varies where the right answer sits among the choices', () => {
    const positions = new Set<number>();
    for (const input of exampleInputs(algo)) for (const f of traceOf(algo, input).frames) if (f.checkpoint) positions.add(f.checkpoint.answer);
    expect(positions.size).toBeGreaterThan(1);
  });

  it('accepts its own formatted custom input and rejects bad items', () => {
    const { parse, format } = algo.input.custom!;
    for (const input of exampleInputs(algo)) expect(parse(format(input))).toEqual({ value: input });
    expect(parse('a, b c')).toEqual({ value: { items: ['a', 'b', 'c'] } });
    expect(parse('ABC')).toEqual({ value: { items: ['a', 'b', 'c'] } });
    expect(parse('')).toHaveProperty('error');
    expect(parse('a ? b')).toHaveProperty('error');
    expect(parse('abcdef')).toHaveProperty('error');
  });

  it('narrates random custom inputs properly', () => {
    const max = slug === 'subsets' ? MAX_SUBSET_ITEMS : MAX_PERMUTATION_ITEMS;
    const items = slug === 'subsets' ? fc.array(fc.constantFrom('a', 'b', 'c', 'x', '1'), { minLength: 1, maxLength: max }) : fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'z', '7'), { minLength: 1, maxLength: max });
    fc.assert(
      fc.property(items, (list) => expectGoodTrace(algo, traceOf(algo, { items: list }).frames)),
      { numRuns: 30 },
    );
  });
});

// ───────────────────────────── subsets ─────────────────────────────

describe('subsets', () => {
  const run = (items: string[]) => traceOf(subsets, { items }).frames;

  it.each([1, 2, 3, 4, 5])('n = %i distinct items: all 2ⁿ subsets exactly once, full set first and ∅ last', (n) => {
    const items = 'abcde'.slice(0, n).split('');
    const frames = run(items);
    const out = outputOf(frames.at(-1)!);
    expect(out).toHaveLength(2 ** n);
    expect(new Set(out.map(multiset)).size).toBe(2 ** n);
    expect(out).toEqual(subsetReference(items));
    expect(out[0]).toBe(setText(items));
    expect(out.at(-1)).toBe('∅');
    expect(frames.at(-1)!.stats).toEqual({ calls: 2 ** (n + 1) - 1, recorded: 2 ** n, copies: 0 });
  });

  it('records each distinct subset once, in the stated order, whatever repeats the items have', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: MAX_SUBSET_ITEMS }), (items) => {
        const frames = run(items);
        const out = outputOf(frames.at(-1)!);
        expect(out).toEqual(subsetReference(items));
        expect(out).toEqual(subsetsInOrder(items).map(setText));
        expect(new Set(out.map(multiset)).size).toBe(out.length);
        // Every sub-multiset is there: the product of (copies + 1) over distinct items.
        const counts = [...new Set(items)].map((x) => items.filter((y) => y === x).length + 1);
        expect(out).toHaveLength(counts.reduce((a, b) => a * b, 1));
      }),
      { numRuns: 120 },
    );
  });

  it('skips copies on the duplicates example and says so', () => {
    const items = subsets.input.examples.find((e) => e.id === 'duplicates')!.make({ seed: 1, size: 0 }).items;
    const frames = run([...items]);
    expect(outputOf(frames.at(-1)!)).toEqual(['{a, a, b}', '{a, a}', '{a, b}', '{a}', '{b}', '∅']);
    expect(frames.some((f) => f.line === 12 && f.note.includes('another a'))).toBe(true);
    expect(frames.at(-1)!.stats.copies).toBe(1);
    expect(frames.at(-1)!.note).toContain('2^3 = 8');
  });

  it('adds to the results only when a leaf records, and keeps cur in step with the current call', () => {
    for (const items of [['a', 'b', 'c'], ['a', 'a', 'b', 'c']]) {
      const frames = run(items);
      frames.forEach((f, i) => {
        const before = i === 0 ? 0 : outputOf(frames[i - 1]).length;
        expect(outputOf(f).length - before).toBe(f.line === 6 ? 1 : 0);
        // The items row marks exactly what cur holds (taken) and the item being decided.
        const taken = row(f.state, 'items').cells.filter((c) => f.state.marks[c.id] === 'write').map((c) => c.label);
        if (i > 0) expect(taken).toEqual(curRow(f.state));
        if (f.line === 6) expect(outputOf(f).at(-1)).toBe(setText(curRow(f.state)));
      });
    }
  });

  it('answers its predictions with what happens next', () => {
    for (const items of [['a', 'b', 'c'], ['a', 'b', 'c', 'd'], ['a', 'a', 'b'], ['b', 'b', 'a', 'a']]) {
      const frames = run(items);
      let asked = 0;
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        asked++;
        const next = frames[i + 1];
        const answer = c.choices[c.answer];
        if (c.question === 'Which subset is recorded next?') {
          expect(next.line).toBe(6);
          expect(outputOf(next).at(-1)).toBe(answer);
        } else {
          expect(c.question).toBe('Which choice does the search undo next?');
          if (answer.startsWith('Un-choose ')) {
            expect(next.line).toBe(9);
            // The call that un-chooses decides the item named in the answer.
            const call = current(next.state)!;
            expect(next.state.nodes[call].name).toContain(`deciding ${answer.slice('Un-choose '.length)}`);
          } else expect(i + 1).toBe(frames.length - 1);
        }
      });
      expect(asked).toBeGreaterThan(2 ** new Set(items).size - 1);
    }
  });
});

// ───────────────────────────── permutations ─────────────────────────────

describe('permutations', () => {
  const run = (items: string[]) => traceOf(permutations, { items }).frames;
  const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1));

  it.each([1, 2, 3, 4])('n = %i: all n! orders exactly once, in dictionary order', (n) => {
    const items = 'abcd'.slice(0, n).split('');
    const frames = run(items);
    const out = outputOf(frames.at(-1)!);
    expect(out).toEqual(permutationReference(items));
    expect(out).toEqual(permutationsInOrder(items).map((p) => p.join('')));
    expect(new Set(out).size).toBe(factorial(n));
    for (const p of out) expect([...p].sort().join('')).toBe([...items].sort().join(''));
  });

  it('records every order of random distinct items, in the order the items are given', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', '1', '9'), { minLength: 1, maxLength: MAX_PERMUTATION_ITEMS }), (items) => {
        const frames = run(items);
        expect(outputOf(frames.at(-1)!)).toEqual(permutationReference(items));
        // calls = 1 + n + n(n−1) + … + n!
        let calls = 1;
        let level = 1;
        for (let k = 0; k < items.length; k++) calls += level *= items.length - k;
        expect(frames.at(-1)!.stats.calls).toBe(calls);
      }),
      { numRuns: 60 },
    );
  });

  it('caps the items at four and says why', () => {
    expect(MAX_PERMUTATION_ITEMS).toBe(4);
    expect(parseItems('abcde', MAX_PERMUTATION_ITEMS, true)).toHaveProperty('error');
    expect(permutations.input.custom!.parse('a b a')).toHaveProperty('error');
    expect(permutations.content.whenToUse).toContain('120 leaves');
    expect(run(['a', 'b', 'c', 'd']).length).toBeLessThan(400);
  });

  it('marks exactly the used items, which are exactly the items in cur', () => {
    const frames = run(['a', 'b', 'c', 'd']);
    for (const f of frames) {
      const used = row(f.state, 'items').cells.filter((c) => f.state.marks[c.id] === 'write' || f.state.marks[c.id] === 'key').map((c) => c.label);
      expect(used.sort()).toEqual([...curRow(f.state)].sort());
      expect(new Set(curRow(f.state)).size).toBe(curRow(f.state).length);
    }
  });

  it('answers its predictions with what happens next', () => {
    for (const items of [['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
      const frames = run(items);
      const kinds = new Set<string>();
      frames.forEach((f, i) => {
        const c = f.checkpoint;
        if (!c) return;
        const next = frames[i + 1];
        const answer = c.choices[c.answer];
        if (c.question.startsWith('How many orders')) {
          kinds.add('how many');
          // Count the recordings until this call's branch is undone.
          const start = outputOf(f).length;
          const undone = frames.findIndex((g, k) => k > i && g.line === 10 && curRow(g.state).length < curRow(f.state).length);
          expect(outputOf(frames[undone]).length - start).toBe(Number(answer));
        } else if (c.question.startsWith('Which item goes in position')) {
          kinds.add('first');
          expect(curRow(next.state).at(-1)).toBe(answer);
        } else {
          kinds.add('next');
          expect(c.question).toMatch(/^Which item does the loop for position \d try next\?$/);
          if (answer.startsWith('None')) expect(next.line === 10 || i + 1 === frames.length - 1).toBe(true);
          else {
            expect([5, 8]).toContain(next.line);
            expect(curRow(next.state).at(-1)).toBe(answer);
          }
        }
      });
      expect(kinds).toEqual(new Set(['how many', 'first', 'next']));
    }
  });
});

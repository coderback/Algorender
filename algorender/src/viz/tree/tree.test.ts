import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { decisionTrees } from '@/algorithms/backtracking';
import type { AnyAlgorithm, AnyStructure, Args } from '@/engine/module';
import { recordOperation, recordTrace } from '@/engine/trace';
import { setStructures } from '@/structures/sets';
import { treeStructures } from '@/structures/trees';
import { layoutTree, rootsOf } from './layout';
import { SearchTracer } from './search';
import { parents, TreeTracer, treeSnapshot } from './tracer';
import type { NodeId, TreeNode, TreeShape, TreeState } from './types';
import { TreeView } from './TreeView';

// Server rendering can't measure, so pretend the view was measured at a phone or desktop width.
const measured = vi.hoisted(() => ({ width: 360 }));
vi.mock('@/viz/linear/useWidth', () => ({ useWidth: () => [{ current: null }, measured.width] as const }));

const render = (state: TreeState) => renderToStaticMarkup(createElement(TreeView, { state }));
const viewBox = (html: string) => {
  const [, , , w, h] = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(html)!.map(Number);
  return { w, h };
};

const node = (children: (NodeId | null)[], extra: Partial<TreeNode> = {}): TreeNode => ({ shape: 'round', cells: [{ id: `k${Math.random()}`, label: 'x' }], children, ...extra });

// ───────────────────────────── layout ─────────────────────────────

describe('forest layout', () => {
  const shape: TreeShape = {
    root: 'a',
    roots: ['a', 'd', 'g'],
    nodes: { a: node(['b', 'c']), b: node([]), c: node([]), d: node(['e']), e: node(['f']), f: node([]), g: node([]) },
    strip: null,
  };

  it('puts every tree side by side in order, never overlapping, a little further apart than siblings', () => {
    const layout = layoutTree(shape);
    const { boxes, metrics: m } = layout;
    expect(Object.keys(boxes).sort()).toEqual(Object.keys(shape.nodes).sort());
    for (const [x, y] of [
      ['a', 'd'],
      ['d', 'g'],
      ['c', 'e'],
    ]) {
      expect(boxes[y].x - boxes[y].left - (boxes[x].x + boxes[x].right)).toBeGreaterThanOrEqual(m.treeGap - 1e-6);
    }
    expect(m.treeGap).toBeGreaterThan(m.gap);
    // Whole trees are separate blocks: a small tree never tucks under a wide one's branches.
    const extentOf = (ids: string[]) => [Math.min(...ids.map((i) => boxes[i].x - boxes[i].left)), Math.max(...ids.map((i) => boxes[i].x + boxes[i].right))];
    const [first, second, third] = [extentOf(['a', 'b', 'c']), extentOf(['d', 'e', 'f']), extentOf(['g'])];
    expect(second[0] - first[1]).toBeGreaterThanOrEqual(m.treeGap - 1e-6);
    expect(third[0] - second[1]).toBeGreaterThanOrEqual(m.treeGap - 1e-6);
    const wide: TreeShape = { root: 'p', roots: ['p', 'q'], nodes: { p: node([]), q: node(['r', 's', 't']), r: node([]), s: node([]), t: node([]) }, strip: null };
    const w = layoutTree(wide).boxes;
    expect(w.r.x - w.r.left).toBeGreaterThan(w.p.x + w.p.right);
    for (const id of ['a', 'd', 'g']) expect(boxes[id].depth).toBe(0);
    expect(boxes.f.depth).toBe(2);
    expect(layout.parent).toEqual({ b: 'a', c: 'a', e: 'd', f: 'e' });
  });

  it('finds parents from every root, and a plain tree is a one-root forest', () => {
    expect([...parents(shape)].sort()).toEqual([
      ['b', 'a'],
      ['c', 'a'],
      ['e', 'd'],
      ['f', 'e'],
    ]);
    expect(rootsOf({ root: 'a' })).toEqual(['a']);
    expect(rootsOf({ root: null })).toEqual([]);
    expect(rootsOf(shape)).toEqual(['a', 'd', 'g']);
  });
});

describe('search tree layout', () => {
  /** A complete binary tree of the given depth, ids by heap index. */
  const full = (depth: number, hide: (i: number) => boolean): TreeShape => {
    const nodes: Record<NodeId, TreeNode> = {};
    const count = 2 ** (depth + 1) - 1;
    for (let i = 0; i < count; i++) {
      const kids = 2 * i + 1 < count ? [`n${2 * i + 1}`, `n${2 * i + 2}`] : [];
      nodes[`n${i}`] = { shape: 'round', cells: [], children: kids, ...(i > 0 && { edgeLabel: i % 2 ? '+a' : '−a', edgeGlyph: i % 2 ? '+' : '−' }), ...(hide(i) && { hidden: true }) };
    }
    return { root: 'n0', nodes, strip: null, search: true };
  };

  it('lays hidden calls out exactly where they will appear, so revealing them moves nothing', () => {
    const all = layoutTree(full(4, () => false));
    expect(layoutTree(full(4, (i) => i > 3)).boxes).toEqual(all.boxes);
    expect(layoutTree(full(4, (i) => i > 3), { sideways: true }).boxes).toEqual(layoutTree(full(4, () => false), { sideways: true }).boxes);
  });

  it('is compact, and sideways runs depth across and siblings down without overlaps', () => {
    const down = layoutTree(full(4, () => false));
    expect(down.metrics.dot).toBeLessThan(18);
    const side = layoutTree(full(4, () => false), { sideways: true });
    expect(side.sideways).toBe(true);
    const boxes = Object.values(side.boxes);
    for (const b of boxes) expect(b.x).toBeCloseTo(b.depth * side.metrics.sideLevel);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].depth !== boxes[j].depth) continue;
        expect(Math.abs(boxes[i].y - boxes[j].y)).toBeGreaterThanOrEqual(boxes[i].h / 2 + boxes[j].h / 2 + side.metrics.gap - 1e-6);
      }
    }
    // Wide and short one way, narrow and tall the other.
    expect(down.maxX - down.minX).toBeGreaterThan(down.maxY - down.minY);
    expect(side.maxY - side.minY).toBeGreaterThan(side.maxX - side.minX);
  });

  it('SearchTracer reveals calls one by one and keeps settled marks', () => {
    const t = new SearchTracer(
      [
        { id: 'r', parent: null, name: 'root' },
        { id: 'x', parent: 'r', edgeLabel: '+a', name: 'x' },
        { id: 'y', parent: 'r', edgeLabel: '−a', name: 'y' },
      ],
      'Tiny',
      ['calls'],
    );
    const f0 = t.frame({ note: 'start', line: 0, at: 'r' });
    expect(f0.state.nodes.x.hidden).toBe(true);
    expect(f0.state.marks).toEqual({ r: 'key' });
    expect(() => t.frame({ note: 'too soon', at: 'x' })).toThrow();
    t.reveal('x');
    t.settle('x', 'found');
    const f1 = t.frame({ note: 'x', line: 0, at: 'x' });
    expect(f1.state.nodes.x.hidden).toBeUndefined();
    expect(f1.state.marks).toEqual({ x: 'found' });
    expect(f1.state.pathEdges).toEqual(['x']);
    // Unchanged nodes are shared between snapshots; a revealed one is new.
    expect(f1.state.nodes.r).toBe(f0.state.nodes.r);
    expect(f1.state.nodes.x).not.toBe(f0.state.nodes.x);
    t.reveal('y');
    const f2 = t.frame({ note: 'y', line: 0, at: 'y' });
    expect(f2.state.nodes.x).toBe(f1.state.nodes.x);
    expect(f2.state.marks).toEqual({ x: 'found', y: 'key' });
  });
});

// ───────────────────────────── rendering ─────────────────────────────

/** Arguments that exercise each operation: a small key, a word, the first elements. */
function argsFor(ds: AnyStructure, model: unknown, opIndex: number): Args {
  return Object.fromEntries(
    ds.operations[opIndex].args.map((a, k) => [a.name, a.type === 'int' ? (a.default ?? a.min) : a.type === 'text' ? 'cat' : (a.options(model)[k * 3] ?? a.options(model)[0])]),
  );
}

/** The first and last frames and an even spread between (server-rendering Motion is slow). */
const sample = <T,>(frames: readonly T[], count = 12): T[] =>
  frames.length <= count ? [...frames] : Array.from({ length: count }, (_, k) => frames[Math.round((k * (frames.length - 1)) / (count - 1))]);

describe.each([...treeStructures, ...setStructures].map((ds) => [ds.slug, ds] as const))('%s renders', (_, ds) => {
  it.each([360, 1000])('every example and frames of every operation at %ipx', { timeout: 60_000 }, (width) => {
    measured.width = width;
    for (const start of ds.initial) {
      const model = start.make(3);
      const idle = render(ds.snapshot(model) as TreeState);
      expect(idle).toContain('sr-only');
      ds.operations.forEach((spec, k) => {
        const args = argsFor(ds, model, k);
        if (spec.disabledReason?.(model, args)) return;
        for (const frame of sample(recordOperation(spec.run(model, args)).frames, 6)) expect(render(frame.state as TreeState)).toContain('aria-hidden');
      });
    }
  });
});

describe.each(decisionTrees.map((a) => [a.slug, a] as const))('%s renders', (_, algo: AnyAlgorithm) => {
  it.each([360, 1000])('frames of every example at %ipx, drawing only the calls reached', { timeout: 60_000 }, (width) => {
    measured.width = width;
    for (const example of algo.input.examples) {
      const { frames } = recordTrace<TreeState>(algo.run(example.make({ seed: 1, size: 0 })));
      for (const frame of sample(frames)) {
        const html = render(frame.state);
        const reached = Object.values(frame.state.nodes).filter((n) => !n.hidden).length;
        // One edge per reached call except the root.
        expect(html.match(/<line/g)?.length ?? 0).toBe(reached - 1);
      }
    }
  });
});

describe('tree view', () => {
  const last = (algo: AnyAlgorithm, id: string) => {
    const example = algo.input.examples.find((e) => e.id === id)!;
    return recordTrace<TreeState>(algo.run(example.make({ seed: 1, size: 0 }))).frames.at(-1)!.state;
  };
  const [subsets, permutations] = decisionTrees;

  it('turns a wide search tree sideways on a phone, and keeps it upright on a wide screen', () => {
    const big = last(permutations, 'four');
    measured.width = 360;
    const phone = viewBox(render(big));
    expect(phone.h).toBeGreaterThan(phone.w);
    measured.width = 1000;
    const desk = viewBox(render(big));
    expect(desk.w).toBeGreaterThan(desk.h);
    // A small tree stays upright even on a phone: the same drawing as on a wide screen.
    const small = last(subsets, 'three');
    measured.width = 360;
    const smallPhone = viewBox(render(small));
    measured.width = 1000;
    expect(viewBox(render(small))).toEqual(smallPhone);
  });

  it('drops crowded edge labels to their glyphs, keeping full labels wherever they fit', () => {
    measured.width = 1000;
    const html = render(last(subsets, 'four'));
    expect(html).toContain('>+c<');
    expect(html).not.toContain('>+d<');
    expect(html).toContain('>+<');
    // On the duplicates tree's second level, +a has room though the leaves beside it are crowded.
    const dupes = render(last(subsets, 'duplicates'));
    expect(dupes).toContain('>−a×2<');
    expect(dupes.match(/>\+a</g)).toHaveLength(2);
    // Sideways there is room for the full labels.
    measured.width = 360;
    const side = render(last(subsets, 'five'));
    expect(viewBox(side).h).toBeGreaterThan(viewBox(side).w);
    expect(side).toContain('>+e<');
  });

  it('draws union-find as a forest of arrows up to each parent, with its arrays underneath', () => {
    measured.width = 360;
    const uf = setStructures[0];
    const state = uf.snapshot(uf.initial.find((s) => s.id === 'two-sets')!.make(1)) as TreeState;
    const html = render(state);
    expect(html).toContain('<marker');
    expect(html.match(/marker-end="url\(#/g)).toHaveLength(8);
    expect(html).toContain('parent[x]');
    expect(html).toContain('rank[x]');
  });

  it('draws plain trees exactly as before: no table, no arrows, nothing hidden', () => {
    for (const ds of treeStructures) {
      const state = ds.snapshot(ds.initial[0].make(1)) as TreeState;
      expect(state.roots).toBeUndefined();
      expect(state.search).toBeUndefined();
      expect(state.table).toBeUndefined();
      expect(state.parentArrows).toBeUndefined();
      expect(render(state)).not.toContain('<marker');
    }
  });

  it('shares an unchanged table and forest between frames, and replaces a changed one', () => {
    const drawing = {
      empty: '',
      describe: () => 'd',
      shape: (v: number): TreeShape => ({
        root: 'a',
        roots: ['a', 'b'],
        nodes: { a: { shape: 'round', cells: [], children: [] }, b: { shape: 'round', cells: [], children: [] } },
        strip: null,
        table: [{ id: 'r', label: 'r', cells: [{ id: 'c', label: String(Math.min(v, 1)) }] }],
      }),
    };
    const t = new TreeTracer<number>(1, drawing, []);
    const a = t.frame({ note: 'a' }).state;
    t.model = 2;
    const b = t.frame({ note: 'b' }).state;
    expect(b.table).toBe(a.table);
    expect(b.roots).toBe(a.roots);
    expect(b.nodes).toBe(a.nodes);
    t.model = 0;
    const c = t.frame({ note: 'c' }).state;
    expect(c.table).not.toBe(b.table);
    expect(c.table![0].cells[0].label).toBe('0');
    expect(treeSnapshot(drawing, 0).table).toEqual(c.table);
  });
});

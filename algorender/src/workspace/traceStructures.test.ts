// The graph and tree traces of learner code: runs through the JS runtime in
// 'lines' mode, checked frame by frame where it matters.

import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import type { GraphState } from '@/viz/graph/types';
import type { TreeState } from '@/viz/tree/types';
import { runJs } from './js/runtime';
import { type Arg, LINE_LIMITS, type RunResult } from './protocol';
import { traceFor } from './trace';
import { GRAPH_RUN_STATS } from './traceGraph';
import { TREE_RUN_STATS } from './traceTree';

/** A diamond, A–B, A–C, B–D, C–D: BFS from A reaches D at level 2, through B. */
const DIAMOND: Arg = {
  kind: 'graph',
  name: 'graph',
  directed: false,
  weighted: false,
  adjacency: [
    { node: 'A', neighbours: [{ to: 'B', weight: 1 }, { to: 'C', weight: 1 }] },
    { node: 'B', neighbours: [{ to: 'A', weight: 1 }, { to: 'D', weight: 1 }] },
    { node: 'C', neighbours: [{ to: 'A', weight: 1 }, { to: 'D', weight: 1 }] },
    { node: 'D', neighbours: [{ to: 'B', weight: 1 }, { to: 'C', weight: 1 }] },
  ],
  layout: { A: [0, 50], B: [100, 0], C: [100, 100], D: [200, 50] },
};
const START: Arg = { kind: 'value', name: 'start', value: 'A' };

const BFS = `function bfs(graph, start) {
  const level = { [start]: 0 };
  const queue = [start];
  while (queue.length > 0) {
    const u = queue.shift();
    for (const v of graph[u]) {
      if (!(v in level)) {
        level[v] = level[u] + 1;
        queue.push(v);
      }
    }
  }
  return level;
}
`;

const DFS = `function dfsOrder(graph, start) {
  const order = [];
  const seen = new Set();
  function visit(u) {
    seen.add(u);
    order.push(u);
    for (const v of graph[u]) {
      if (!seen.has(v)) visit(v);
    }
  }
  visit(start);
  return order;
}
`;

const STACK_DFS = `function dfsOrder(graph, start) {
  const order = [];
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const u = stack.pop();
    if (seen.has(u)) continue;
    seen.add(u);
    order.push(u);
    for (const v of [...graph[u]].reverse()) stack.push(v);
  }
  return order;
}
`;

function run(code: string, entry: string, args: Arg[]): RunResult {
  return runJs({ language: 'javascript', code, entry, args, limits: LINE_LIMITS, mode: 'lines' });
}

function graphTrace(code: string, entry: string, args: Arg[] = [DIAMOND, START]) {
  const r = run(code, entry, args);
  expect(r.error).toBeNull();
  const t = traceFor(r, { code })!;
  expect(t.view).toBe('graph');
  return { result: r, frames: t.trace.frames as Frame<GraphState>[], stats: t.stats };
}

function treeTrace(code: string, entry: string, args: Arg[]) {
  const r = run(code, entry, args);
  expect(r.error).toBeNull();
  const t = traceFor(r, { code })!;
  expect(t.view).toBe('tree');
  return { result: r, frames: t.trace.frames as Frame<TreeState>[], stats: t.stats };
}

const pathEdges = (s: GraphState) => Object.keys(s.edgeMarks).filter((id) => s.edgeMarks[id] === 'path').sort();
const label = (s: TreeState, id: string) => s.nodes[id].cells[0].label;
const marked = (s: TreeState, mark: string) => Object.keys(s.marks).filter((id) => s.marks[id] === mark && s.nodes[id]).map((id) => label(s, id)).sort();

describe('traceGraph', () => {
  it('draws BFS: the queue waits, the dequeued node is explored, levels sit under the nodes, and the tree edges stay', () => {
    const { frames, stats } = graphTrace(BFS, 'bfs');
    expect(stats).toBe(GRAPH_RUN_STATS);
    const end = frames.at(-1)!;
    expect(end.note).toBe('Your function finished and returned {"A":0, "B":1, "C":1, "D":2}.');
    expect(end.state.annotationLabel).toBe('level');
    expect(end.state.annotations).toEqual({ A: '0', B: '1', C: '1', D: '2' });
    // B reached D first, so the BFS tree is A–B, A–C, B–D.
    expect(pathEdges(end.state)).toEqual(['A-B', 'A-C', 'B-D']);
    expect(end.state.nodeMarks).toEqual({ A: 'visited', B: 'visited', C: 'visited', D: 'visited' });
    expect(end.stats).toMatchObject({ visited: 4, edges: 8 });

    // Taking B off the front of the queue makes it the node being explored at once.
    const dequeueB = frames.findIndex((f) => f.note.includes('removes "B" from the front of queue'));
    expect(dequeueB).toBeGreaterThan(0);
    expect(frames[dequeueB].state.nodeMarks).toMatchObject({ A: 'visited', B: 'key', C: 'frontier' });
    const queue = frames[dequeueB].state.panels.find((p) => p.title === 'queue')!;
    expect(queue).toMatchObject({ kind: 'chips', ends: ['front', 'back'] });
    expect(queue.kind === 'chips' && queue.chips.map((c) => c.label)).toEqual(['C']);

    // Reading a node's neighbours and taking an edge are said, and the edge is lit and pulses.
    const first = frames.find((f) => f.note.startsWith('Line 6 reads A’s neighbours (B, C), takes the edge A – B'))!;
    expect(first.state.edgeMarks['A-B']).toBe('compare');
    expect(first.state.pulse?.edge).toBe('A-B');
    expect(first.vars).toMatchObject({ start: 'A', u: 'A', v: 'B' });
  });

  it('draws recursive DFS: paused calls wait, a Calls panel lists them, and the tree edges follow the recursion', () => {
    const { frames, result } = graphTrace(DFS, 'dfsOrder');
    expect(result.returned).toEqual(['A', 'B', 'D', 'C']);
    const deep = frames.find((f) => f.note === 'Line 8 calls visit("C").')!;
    expect(deep.state.nodeMarks).toEqual({ A: 'frontier', B: 'frontier', D: 'frontier', C: 'key' });
    const calls = deep.state.panels.find((p) => p.id === 'calls')!;
    expect(calls.kind === 'chips' && calls.chips.map((c) => c.label)).toEqual(['dfsOrder(A)', 'visit(A)', 'visit(B)', 'visit(D)', 'visit(C)']);
    expect(pathEdges(frames.at(-1)!.state)).toEqual(['A-B', 'B-D', 'C-D']);
    // A set has no order of its own: its chips follow the graph's node order.
    const seen = frames.at(-1)!.state.panels.find((p) => p.title === 'seen')!;
    expect(seen.kind === 'chips' && seen.chips.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('tells a stack from a queue by where the code takes items out, and a record list from both', () => {
    const { frames } = graphTrace(STACK_DFS, 'dfsOrder');
    const panels = frames.at(-2)!.state.panels;
    expect(panels.find((p) => p.title === 'stack')).toMatchObject({ ends: ['bottom', 'top'] });
    const order = panels.find((p) => p.title === 'order')!;
    expect(order.kind === 'chips' && order.ends).toBeUndefined();
    // Nodes in the stack wait; nodes only in `order` and `seen` are recorded.
    const mid = frames.find((f) => f.note.includes('removes "C" from the end of stack'))!;
    expect(mid.state.nodeMarks.C).toBe('key');
    expect(mid.state.nodeMarks.A).toBe('visited');
    // Reading every entry at once (a spread) is said as one clause.
    expect(frames.some((f) => f.note.includes('takes A’s edges to B and C'))).toBe(true);
  });

  it('plays on the memory view when asked, and stops with the run’s error', () => {
    const r = run(BFS, 'bfs', [DIAMOND, START]);
    expect(traceFor(r, { view: 'memory' })!.view).toBe('memory');
    const broken = run(BFS.replace('level[u] + 1', 'level[u].x.y'), 'bfs', [DIAMOND, START]);
    const t = traceFor(broken)!;
    expect(t.view).toBe('graph');
    const end = t.trace.frames.at(-1)! as Frame<GraphState>;
    expect(end.note).toMatch(/^Line 8: TypeError/);
    // The node being explored when it failed stays lit.
    expect(end.state.nodeMarks.A).toBe('key');
  });
});

const INSERT = `function insert(root, val) {
  if (root === null) {
    return new TreeNode(val);
  }
  if (val < root.val) {
    root.left = insert(root.left, val);
  } else {
    root.right = insert(root.right, val);
  }
  return root;
}
`;

const INORDER = `function inorder(root) {
  const out = [];
  function go(node) {
    if (node === null) return;
    go(node.left);
    out.push(node.val);
    go(node.right);
  }
  go(root);
  return out;
}
`;

const TREE: Arg = { kind: 'tree', name: 'root', values: [4, 2, 7, null, 3] };

describe('traceTree', () => {
  it('draws a BST insert: the new node floats free while it is returned, then is linked in under its parent', () => {
    const { frames, stats, result } = treeTrace(INSERT, 'insert', [TREE, { kind: 'value', name: 'val', value: 5 }]);
    expect(stats).toBe(TREE_RUN_STATS);
    expect(result.returned).toEqual([4, 2, 7, null, 3, 5]);
    // The call arrives with the whole tree, and nothing is "just made".
    const called = frames.find((f) => f.note.startsWith('Your function is called'))!;
    expect(called.note).toBe('Your function is called: insert(TreeNode(4), 5).');
    expect(marked(called.state, 'write')).toEqual([]);
    expect(marked(called.state, 'key')).toEqual(['4']);

    const made = frames.find((f) => f.note === 'insert returns TreeNode(5).')!;
    expect(made.state.roots).toHaveLength(2);
    expect(marked(made.state, 'found')).toEqual(['5']);
    expect(marked(made.state, 'frontier')).toEqual(['4', '7']);

    const linked = frames.find((f) => f.note === 'Line 6 sets root.left to TreeNode(5).')!;
    expect(linked.state.roots).toHaveLength(1);
    const seven = Object.keys(linked.state.nodes).find((id) => label(linked.state, id) === '7')!;
    expect(linked.state.nodes[seven].children.map((c) => (c ? label(linked.state, c) : null))).toEqual(['5', null]);
    // The calls' nodes draw the path down: 4 → 7.
    expect(linked.state.pathEdges).toEqual([seven]);
  });

  it('draws an inorder traversal: paused calls wait, the result list is a row, and every node ends visited', () => {
    const { frames, result } = treeTrace(INORDER, 'inorder', [TREE]);
    expect(result.returned).toEqual([2, 3, 4, 7]);
    const atThree = frames.find((f) => f.note === 'Line 6 pushes 3 to out.' || f.note === 'Line 6 appends 3 to out.')!;
    expect(marked(atThree.state, 'key')).toEqual(['3']);
    expect(marked(atThree.state, 'frontier')).toEqual(['2', '4']);
    expect(atThree.state.table).toEqual([{ id: expect.any(String), label: 'out', cells: [expect.objectContaining({ label: '2' }), expect.objectContaining({ label: '3' })] }]);
    const end = frames.at(-1)!;
    expect(marked(end.state, 'visited')).toEqual(['2', '3', '4', '7']);
    expect(end.state.description).toMatch(/^A tree of 4 nodes, level by level: 4, 2, 7, 3\./);
  });

  it('survives a cycle the code makes, drawing it as a tree with the extra link left out', () => {
    const code = `function loop(root) {
  root.left.left = root;
  return 1;
}
`;
    const { frames } = treeTrace(code, 'loop', [{ kind: 'tree', name: 'root', values: [1, 2] }]);
    const end = frames.at(-1)!.state;
    expect(end.roots).toHaveLength(1);
    expect(Object.keys(end.nodes)).toHaveLength(2);
  });
});

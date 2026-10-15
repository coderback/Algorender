import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { GraphState, NodeId } from '@/viz/graph/types';
import { DAG_AT, DAG_EDGES, SCC_AT, SCC_EDGES, STRONG_AT, STRONG_EDGES } from './examples';
import { adjacency, authored, choose, fixedExample, graphInput, nodeIds, randomGraph, type GraphInput, type GraphRules } from './model';
import { EDGES, nodeChips, VISITED } from './shared';

export const sccRules: GraphRules = { direction: 'directed', weighted: false, start: false, name: 'Finding strongly connected components' };

const pseudocode = [
  'for each node u not yet visited:',
  '  DFS(u); push nodes on S when finished',
  'reverse every edge',
  'while S is not empty:',
  '  u ← pop(S)',
  '  if u has no component yet:',
  '    DFS from u in the reversed graph',
  '    everything it reaches is one SCC',
];

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['visited', 'edges']);
  const ids = nodeIds(g);
  if (ids.length === 0) {
    yield t.frame({ note: 'The graph is empty, so it has no components.' });
    return;
  }
  const adj = adjacency(g);
  const radj = adjacency(g, { reversed: true });
  const visited = new Set<NodeId>();
  const stack: NodeId[] = [];
  const comp = new Map<NodeId, number>();
  const sccs: NodeId[][] = [];
  let questions = 0;

  const panels = () => {
    t.setPanel({ kind: 'chips', id: 'stack', title: 'S (finish order)', chips: nodeChips(stack), ends: ['bottom', 'top'], empty: 'empty' });
    t.setPanel({
      kind: 'groups',
      id: 'sccs',
      title: 'Strongly connected components',
      groups: sccs.map((members, i) => ({ id: `S${i + 1}`, label: `S${i + 1}`, members, mark: 'visited' as const })),
      empty: 'none yet',
    });
  };

  // ── pass 1: DFS on the graph, recording finish order ──
  function* dfs1(u: NodeId, from: NodeId | null): Generator<GraphFrame> {
    visited.add(u);
    t.count('visited');
    t.mark(u, 'key');
    if (from) t.mark(from, 'frontier');
    yield t.frame({
      line: 1,
      note: from ? `${from} → ${u}: ${u} is unvisited, so DFS goes deeper into it.` : `${u} is unvisited: start a depth-first search there.`,
      ...(from && { pulse: t.edgeId(from, u) }),
      vars: { u },
    });
    for (const { to: v, edge } of adj.get(u)!) {
      t.count('edges');
      if (visited.has(v)) continue;
      t.markEdge(edge, 'path');
      yield* dfs1(v, u);
      t.mark(u, 'key');
    }
    stack.push(u);
    t.mark(u, 'visited');
    t.annotate(u, String(stack.length));
    panels();
    yield t.frame({
      line: 1,
      note: `${u} has no unvisited neighbours left, so it finishes ${ordinal(stack.length)}: push it on S. Nodes that finish later sit higher on S.`,
      vars: { u, finished: stack.length },
    });
  }

  t.setAnnotationLabel('finish position');
  panels();
  yield t.frame({
    line: 0,
    note: 'A strongly connected component (SCC) is a group of nodes that can all reach each other. Kosaraju’s algorithm finds them with two depth-first searches: one to order the nodes, one on the reversed graph to peel off components.',
    vars: {},
  });
  for (const u of ids) if (!visited.has(u)) yield* dfs1(u, null);

  // ── reverse ──
  t.reverseEdges();
  t.clearMarks();
  yield t.frame({
    line: 2,
    note: `Reverse every edge. Inside an SCC everything still reaches everything, but edges between SCCs now point back, so a search started in the right component can’t leak out of it. S’s top, ${stack.at(-1)}, finished last and is the safe place to start.`,
    vars: { top: stack.at(-1)! },
  });

  // ── pass 2: pop S, DFS on the reversed graph ──
  function* dfs2(u: NodeId, id: number, members: NodeId[]): Generator<GraphFrame> {
    for (const { to: v, edge } of radj.get(u)!) {
      t.count('edges');
      const joins = !comp.has(v);
      const ask = {
        question: `Following ${u} → ${v} in the reversed graph: does ${v} join S${id}?`,
        choices: [`Yes: ${v} joins S${id}`, `No: ${v} is already placed`],
        answer: joins ? 0 : 1,
      };
      if (!joins) {
        const where = comp.get(v) === id ? `already in S${id}` : `in S${comp.get(v)}, an earlier component`;
        yield t.frame({ line: 6, note: `${u} → ${v}: ${v} is ${where}, so don’t cross.`, edges: { compare: [edge] }, vars: { u, v }, ask });
        continue;
      }
      comp.set(v, id);
      members.push(v);
      t.count('visited');
      t.mark(v, 'frontier');
      t.markEdge(edge, 'path');
      t.badge(v, `S${id}`);
      yield t.frame({ line: 6, note: `${u} → ${v}: ${v} has no component yet and is reachable backwards from ${members[0]}, so it joins S${id}.`, pulse: edge, vars: { u, v }, ask });
      yield* dfs2(v, id, members);
    }
  }

  while (stack.length > 0) {
    const waiting = [...stack];
    const u = stack.pop()!;
    panels();
    const unassigned = waiting.filter((x) => !comp.has(x));
    const q = unassigned.length > 1 ? choose(u, [waiting[0], ...waiting.slice(1, -1).reverse()], questions++) : null;
    if (comp.has(u)) {
      yield t.frame({ line: 5, note: `Pop ${u}: it already belongs to S${comp.get(u)}. Skip it.`, nodes: { key: [u] }, vars: { u }, ...(q && { ask: { question: 'Which node is popped next?', ...q } }) });
      continue;
    }
    const id = sccs.length + 1;
    const members = [u];
    comp.set(u, id);
    t.count('visited');
    t.mark(u, 'key');
    t.badge(u, `S${id}`);
    yield t.frame({
      line: 4,
      note: `Pop ${u}, the latest finisher still unplaced. It starts a new component, S${id}: search backwards from it.`,
      vars: { u, component: `S${id}` },
      ...(q && { ask: { question: 'Which node is popped next?', ...q } }),
    });
    yield* dfs2(u, id, members);
    members.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    sccs.push(members);
    for (const m of members) t.mark(m, 'visited');
    panels();
    yield t.frame({
      line: 7,
      note: `Nothing new is reachable backwards from ${u}: S${id} = {${members.join(', ')}}. ${members.length === 1 ? `${u} is on no cycle, so it is a component by itself.` : 'They all reach each other.'}`,
      vars: { component: `S${id}`, size: members.length },
    });
  }

  t.reverseEdges();
  t.clearMarks();
  for (const id of ids) t.mark(id, 'visited');
  yield t.frame({
    line: null,
    note: `Done: ${sccs.length} strongly connected component${sccs.length === 1 ? '' : 's'}. Edges flipped back to the original direction; ${
      sccs.length === ids.length ? 'every node is alone, so the graph has no cycles.' : `the biggest is {${[...sccs].sort((a, b) => b.length - a.length)[0].join(', ')}}.`
    }`,
    vars: { components: sccs.length },
  });
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export const sccExamples = [
  fixedExample('three', 'Three components', () => authored(sccRules, SCC_EDGES, SCC_AT)),
  fixedExample('strong', 'One big component', () => authored(sccRules, STRONG_EDGES, STRONG_AT)),
  fixedExample('dag', 'No cycles (a DAG)', () => authored(sccRules, DAG_EDGES, DAG_AT)),
  {
    id: 'random',
    label: 'Random',
    make: ({ seed, size }: { seed: number; size: number }) => randomGraph(seed, size, { directed: true, weighted: false, extra: 0.9 }),
  },
] as const;

export const kosaraju = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'kosaraju',
  view: 'graph',
  input: graphInput(sccRules, [...sccExamples]),
  pseudocode,
  stats: [{ ...VISITED, label: 'Node visits (both passes)' }, EDGES],
  legend: [
    { neutral: 'Not visited in this pass' },
    { mark: 'key', label: 'Current' },
    { mark: 'frontier', label: 'On the DFS path / joining this SCC' },
    { mark: 'visited', label: 'Finished / placed in an SCC' },
    { mark: 'path', label: 'Edge the search followed' },
    { mark: 'compare', label: 'Edge to a placed node' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'Find the strongly connected components of a directed graph with two depth-first searches: the first records the order nodes finish in, the second runs on the reversed graph in reverse finish order, and each search it starts sweeps up exactly one component.',
    invariant: 'The node that finishes last lies in a “source” component (nothing outside it reaches in). After reversing, nothing outside that component is reachable from it, so the second DFS collects exactly that component, and the argument repeats on what remains.',
    whenToUse: 'Grouping mutually reachable nodes: cycles of dependencies, web pages that link to each other, solving 2-SAT, simplifying a graph into its DAG of components. Tarjan’s algorithm does the same in one pass.',
    traits: [
      { label: 'O(V + E)', good: true },
      { label: 'Two passes plus the reversed graph', good: false },
      { label: 'Simple to reason about', good: true },
      { label: 'Directed graphs only', good: null },
    ],
    experiments: [
      { example: 'three', prompt: 'Predict the finish order on S, then check: does each second-pass search stay inside one component?' },
      { example: 'dag', prompt: 'With no cycles, every node is its own SCC. The finish order reversed is a topological order.' },
      { example: 'strong', prompt: 'Everything is mutually reachable. How many searches does the second pass start?' },
    ],
  },
});

import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { GraphState, NodeId } from '@/viz/graph/types';
import { sccExamples, sccRules } from './kosaraju';
import { adjacency, graphInput, nodeIds, type GraphInput } from './model';
import { EDGES, nodeChips, VISITED } from './shared';

const pseudocode = [
  'for each node u with no index: visit(u)',
  'visit(u):',
  '  index[u] ← low[u] ← counter++',
  '  push u onto stack S',
  '  for each edge u → v:',
  '    if v has no index:',
  '      visit(v)',
  '      low[u] ← min(low[u], low[v])',
  '    else if v is on S:',
  '      low[u] ← min(low[u], index[v])',
  '  if low[u] = index[u]:',
  '    pop S down to u: one SCC',
];

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['visited', 'edges']);
  const ids = nodeIds(g);
  if (ids.length === 0) {
    yield t.frame({ note: 'The graph is empty, so it has no components.' });
    return;
  }
  const adj = adjacency(g);
  const index = new Map<NodeId, number>();
  const low = new Map<NodeId, number>();
  const stack: NodeId[] = [];
  const onStack = new Set<NodeId>();
  const sccs: NodeId[][] = [];
  const comp = new Map<NodeId, number>();
  let counter = 0;

  const panels = (changed?: NodeId) => {
    t.setPanel({ kind: 'chips', id: 'stack', title: 'Stack S', chips: nodeChips(stack), ends: ['bottom', 'top'], empty: 'empty' });
    t.setPanel({
      kind: 'table',
      id: 'links',
      title: 'Index and low-link',
      columns: ['node', 'index', 'low', 'on S'],
      rows: ids.map((id) => ({
        id,
        cells: [id, index.has(id) ? String(index.get(id)) : '–', low.has(id) ? String(low.get(id)) : '–', onStack.has(id) ? 'yes' : '–'],
        ...(comp.has(id) && { mark: 'visited' as const }),
        ...(id === changed && { cellMarks: { 2: 'write' as const } }),
      })),
    });
    t.setPanel({
      kind: 'groups',
      id: 'sccs',
      title: 'Strongly connected components',
      groups: sccs.map((members, i) => ({ id: `S${i + 1}`, label: `S${i + 1}`, members, mark: 'visited' as const })),
      empty: 'none yet',
    });
    for (const id of ids) t.annotate(id, index.has(id) ? `${index.get(id)}/${low.get(id)}` : null);
  };

  function* visit(u: NodeId, from: NodeId | null): Generator<GraphFrame> {
    index.set(u, counter);
    low.set(u, counter);
    counter++;
    stack.push(u);
    onStack.add(u);
    t.count('visited');
    if (from) t.mark(from, 'frontier');
    t.mark(u, 'key');
    panels();
    yield t.frame({
      line: 3,
      note: `${from ? `${from} → ${u}: ${u} has no index yet, so visit it. ` : ''}index[${u}] = low[${u}] = ${index.get(u)}: so far ${u} reaches back only to itself. Push it on S.`,
      ...(from && { pulse: t.edgeId(from, u) }),
      vars: { u, 'index[u]': index.get(u)!, 'low[u]': low.get(u)! },
    });

    for (const { to: v, edge } of adj.get(u)!) {
      t.count('edges');
      if (!index.has(v)) {
        t.markEdge(edge, 'path');
        yield* visit(v, u);
        t.mark(u, 'key');
        const before = low.get(u)!;
        const lowered = low.get(v)! < before;
        if (lowered) low.set(u, low.get(v)!);
        panels(lowered ? u : undefined);
        yield t.frame({
          line: 7,
          note: lowered
            ? `Back from ${v}: low[${v}] = ${low.get(v)} < low[${u}] = ${before}, so ${u} can also reach back to index ${low.get(v)} through ${v}: low[${u}] ← ${low.get(u)}.`
            : `Back from ${v}: low[${v}] = ${low.get(v)} is not below low[${u}] = ${before}, so nothing changes.`,
          edges: { compare: [edge] },
          vars: { u, v, 'low[v]': low.get(v)!, 'low[u]': low.get(u)! },
          ask: lowUpdated(u, before, lowered),
        });
      } else if (onStack.has(v)) {
        const before = low.get(u)!;
        const lowered = index.get(v)! < before;
        if (lowered) low.set(u, index.get(v)!);
        panels(lowered ? u : undefined);
        yield t.frame({
          line: 9,
          note: lowered
            ? `${u} → ${v}: ${v} is still on S with index ${index.get(v)} < low[${u}] = ${before}, so ${u} reaches back to it: low[${u}] ← ${index.get(v)}.`
            : `${u} → ${v}: ${v} is on S, but index[${v}] = ${index.get(v)} is not below low[${u}] = ${before}. No change.`,
          edges: { compare: [edge] },
          vars: { u, v, 'index[v]': index.get(v)!, 'low[u]': low.get(u)! },
          ask: lowUpdated(u, before, lowered),
        });
      } else {
        yield t.frame({
          line: 8,
          note: `${u} → ${v}: ${v} already belongs to a finished component (S${comp.get(v)}), which can’t reach back to ${u}. Ignore it.`,
          edges: { compare: [edge] },
          vars: { u, v },
        });
      }
    }

    const isRoot = low.get(u) === index.get(u);
    const ask = {
      question: `Is ${u} the root of an SCC (low[${u}] = index[${u}])?`,
      choices: [`Yes: pop ${u}'s SCC off S`, `No: ${u} stays on S`],
      answer: isRoot ? 0 : 1,
    };
    if (!isRoot) {
      t.mark(u, 'frontier');
      panels();
      yield t.frame({
        line: 10,
        note: `low[${u}] = ${low.get(u)} < index[${u}] = ${index.get(u)}: ${u} reaches back to an older node still on S, so it belongs to that node’s component. Leave it on S and return.`,
        vars: { u, 'index[u]': index.get(u)!, 'low[u]': low.get(u)! },
        ask,
      });
      return;
    }
    const members: NodeId[] = [];
    for (;;) {
      const w = stack.pop()!;
      onStack.delete(w);
      members.push(w);
      if (w === u) break;
    }
    const id = sccs.length + 1;
    members.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    sccs.push(members);
    for (const m of members) {
      comp.set(m, id);
      t.mark(m, 'visited');
      t.badge(m, `S${id}`);
    }
    panels();
    yield t.frame({
      line: 11,
      note: `low[${u}] = index[${u}] = ${index.get(u)}: nothing below ${u} reaches back above it, so ${u} is the root of a component. Pop S down to ${u}: S${id} = {${members.join(', ')}}.`,
      vars: { u, component: `S${id}`, size: members.length },
      ask,
    });
  }

  function lowUpdated(u: NodeId, before: number, lowered: boolean) {
    return {
      question: `Is low[${u}] updated?`,
      choices: [`Yes: low[${u}] drops below ${before}`, `No: low[${u}] stays ${before}`],
      answer: lowered ? 0 : 1,
    };
  }

  t.setAnnotationLabel('index/low');
  panels();
  yield t.frame({
    line: 0,
    note: 'Tarjan’s algorithm finds strongly connected components in one depth-first search. Each node gets an index (visit order) and a low-link: the smallest index it can reach back to while that node is still on the stack.',
    vars: {},
  });
  for (const u of ids) {
    if (index.has(u)) continue;
    yield t.frame({ line: 0, note: `${u} has no index yet: start a search there.`, nodes: { key: [u] }, vars: { u } });
    yield* visit(u, null);
  }

  yield t.frame({
    line: null,
    note: `Done: ${sccs.length} strongly connected component${sccs.length === 1 ? '' : 's'}, found in a single pass. Components come out in reverse topological order: S1 has no edges into a later one.`,
    vars: { components: sccs.length },
  });
}

export const tarjan = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'tarjan',
  view: 'graph',
  input: graphInput(sccRules, [...sccExamples]),
  pseudocode,
  stats: [VISITED, EDGES],
  legend: [
    { neutral: 'No index yet' },
    { mark: 'key', label: 'Current' },
    { mark: 'frontier', label: 'On the stack S' },
    { mark: 'visited', label: 'In a finished SCC' },
    { mark: 'path', label: 'DFS tree edge' },
    { mark: 'compare', label: 'Edge being checked' },
    { mark: 'write', label: 'low-link just lowered' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'One depth-first search finds every strongly connected component. Each node records its visit index and a low-link, the oldest node still on the stack that it can reach back to; a node whose low-link equals its own index is the root of a component, which is popped off the stack in one go.',
    invariant: 'The stack holds exactly the visited nodes whose component isn’t finished, in visit order; low[u] is the smallest index on the stack that u’s subtree can reach. When low[u] = index[u], everything above u on the stack is u’s component.',
    whenToUse: 'The same jobs as Kosaraju (cycles of dependencies, 2-SAT, condensing a graph into a DAG) with a single pass and no reversed graph. The same low-link idea finds bridges and articulation points in undirected graphs.',
    traits: [
      { label: 'O(V + E), one pass', good: true },
      { label: 'No reversed graph needed', good: true },
      { label: 'Low-links are subtle to get right', good: false },
      { label: 'Directed graphs only', good: null },
    ],
    experiments: [
      { example: 'three', prompt: 'Watch C → A lower C’s low-link to 0, then B’s on the way back. Which node pops {A, B, C}?' },
      { example: 'dag', prompt: 'With no cycles every low-link stays equal to its index, so every node pops alone.' },
      { example: 'strong', prompt: 'One component: nothing pops until the very end. Which node is the root?' },
    ],
  },
});

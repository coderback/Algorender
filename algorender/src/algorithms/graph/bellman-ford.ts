import { defineAlgorithm } from '@/engine/module';
import { askAhead, edgeKey, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { EdgeId, GraphState, NodeId } from '@/viz/graph/types';
import { arrow, authored, fixedExample, graphInput, list, nodeIds, randomGraph, plusW, showDist, showW, type GraphInput, type GraphRules } from './model';
import { RELAXATIONS } from './shared';

const rules: GraphRules = { direction: 'either', weighted: true, start: true, name: 'Bellman–Ford' };

const pseudocode = [
  'dist[·] ← ∞;  dist[s] ← 0',
  'repeat V − 1 times:',
  '  for each edge u → v, weight w:',
  '    if dist[u] + w < dist[v]:',
  '      dist[v] ← dist[u] + w',
  '      prev[v] ← u',
  '  if nothing changed: stop early',
  'for each edge u → v, weight w:',
  '  if dist[u] + w < dist[v]:',
  '    report a negative cycle',
];

type Arc = { u: NodeId; v: NodeId; w: number; edge: EdgeId; key: string };

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['edges', 'relaxations', 'passes']);
  const s = g.start ?? g.nodes[0]?.id;
  const sep = arrow(g.directed);
  if (s == null) {
    yield t.frame({ note: 'The graph is empty, so there are no paths to find.' });
    return;
  }
  const V = g.nodes.length;
  // Each undirected edge can be used both ways, so it is tried as two arcs.
  const arcs: Arc[] = g.edges.flatMap((e) => {
    const edge = edgeKey(e.from, e.to, g.directed);
    const fwd = { u: e.from, v: e.to, w: e.weight, edge, key: `${e.from}>${e.to}` };
    return g.directed ? [fwd] : [fwd, { u: e.to, v: e.from, w: e.weight, edge, key: `${e.to}>${e.from}` }];
  });

  const dist = new Map(nodeIds(g).map((id) => [id, Infinity]));
  const prev = new Map<NodeId, { from: NodeId; edge: EdgeId }>();
  let current: string | null = null;

  const panels = (written?: NodeId) => {
    t.setPanel({
      kind: 'chips',
      id: 'order',
      title: 'Edge order (one pass)',
      chips: arcs.map((a) => ({ id: a.key, label: `${a.u}${sep}${a.v}`, sub: showW(a.w), ...(a.key === current && { mark: 'compare' as const }) })),
      empty: 'no edges',
    });
    t.setPanel({
      kind: 'table',
      id: 'dist',
      title: 'Distances',
      columns: ['node', 'dist', 'prev'],
      rows: nodeIds(g).map((id) => ({
        id,
        cells: [id, showDist(dist.get(id)!), prev.get(id)?.from ?? '–'],
        ...(id === written && { cellMarks: { 1: 'write' as const } }),
      })),
    });
    for (const id of nodeIds(g)) t.annotate(id, showDist(dist.get(id)!));
  };
  const setPrev = (v: NodeId, from: NodeId, edge: EdgeId) => {
    const before = prev.get(v);
    if (before && ![...prev.entries()].some(([x, p]) => x !== v && p.edge === before.edge)) t.markEdge(before.edge, null);
    prev.set(v, { from, edge });
    t.markEdge(edge, 'path');
  };
  /** The prev-pointer cycle reached by walking back V steps from `from`, in forward order, or null. */
  const cycleThrough = (from: NodeId): { nodes: NodeId[]; edges: EdgeId[] } | null => {
    let x = from;
    for (let i = 0; i < V; i++) {
      const p = prev.get(x);
      if (!p) return null;
      x = p.from;
    }
    const nodes: NodeId[] = [x];
    const edges: EdgeId[] = [];
    for (let y = x; ; ) {
      const p = prev.get(y)!;
      edges.push(p.edge);
      y = p.from;
      if (y === x) break;
      nodes.push(y);
    }
    return { nodes: nodes.reverse(), edges: edges.reverse() };
  };

  t.setAnnotationLabel('dist');
  dist.set(s, 0);
  t.mark(s, 'key');
  panels(s);
  yield t.frame({
    line: 0,
    note: `Bellman–Ford finds shortest paths from ${s} even with negative edges. It doesn't pick nodes cleverly; it just tries every edge, over and over, until nothing improves.`,
    vars: { s, V },
  });

  let pass = 0;
  let stoppedEarly = false;
  for (pass = 1; pass <= V - 1; pass++) {
    t.count('passes');
    current = null;
    panels();
    yield t.frame({
      line: 1,
      note:
        pass === 1
          ? `Pass 1 of ${V - 1}: try every edge once. After pass k, every shortest path that uses at most k edges has been found, and no shortest path needs more than V − 1 = ${V - 1}.`
          : `Pass ${pass} of ${V - 1}: try every edge again, in the same order. Paths up to ${pass} edges long are now covered.`,
      vars: { pass },
    });
    let changed = 0;
    for (const a of arcs) {
      t.count('edges');
      current = a.key;
      const du = dist.get(a.u)!;
      const dv = dist.get(a.v)!;
      const vars = { pass, u: a.u, v: a.v, w: a.w, 'dist[u]': du, 'dist[v]': dv };
      if (du === Infinity) {
        panels();
        yield t.frame({ line: 3, note: `${a.u} ${sep} ${a.v}: dist[${a.u}] is still ∞, so this edge can't lead anywhere shorter yet.`, edges: { compare: [a.edge] }, vars });
        continue;
      }
      const better = du + a.w < dv;
      const ask = {
        question: `Does ${a.u} ${sep} ${a.v} (weight ${showW(a.w)}) improve dist[${a.v}]?`,
        choices: [`Yes: relax ${a.v} through ${a.u}`, `No: keep dist[${a.v}] = ${showDist(dv)}`],
        answer: better ? 0 : 1,
      };
      if (better) {
        dist.set(a.v, du + a.w);
        setPrev(a.v, a.u, a.edge);
        t.count('relaxations');
        changed++;
        panels(a.v);
        yield t.frame({
          line: 4,
          note: `dist[${a.v}] = ${showDist(dv)} > dist[${a.u}] ${plusW(a.w)} = ${showDist(du + a.w)}, so relax: ${a.v} is now ${showDist(du + a.w)} via ${a.u}.`,
          pulse: a.edge,
          vars: { ...vars, 'dist[v]': du + a.w },
          ask,
        });
      } else {
        panels();
        yield t.frame({
          line: 3,
          note: `${a.u} ${sep} ${a.v}: ${showDist(du)} ${plusW(a.w)} = ${showDist(du + a.w)} is not less than dist[${a.v}] = ${showDist(dv)}. No change.`,
          edges: { compare: [a.edge] },
          vars,
          ask,
        });
      }
    }
    current = null;
    panels();
    if (changed === 0) {
      stoppedEarly = true;
      yield t.frame({
        line: 6,
        note: `Pass ${pass} changed nothing, so the next pass would see exactly the same distances: stop early. A fixed point also rules out a negative cycle.`,
        vars: { pass },
      });
      break;
    }
    yield t.frame({ line: 6, note: `Pass ${pass} lowered ${changed} distance${changed === 1 ? '' : 's'}.`, vars: { pass, changed } });
  }

  if (!stoppedEarly) {
    yield t.frame({
      line: 7,
      note: `All ${V - 1} passes are done. A shortest path never needs more than ${V - 1} edges, so if any edge can still lower a distance now, a negative cycle must be making paths ever shorter.`,
      vars: {},
    });
    for (const a of arcs) {
      t.count('edges');
      current = a.key;
      const du = dist.get(a.u)!;
      const dv = dist.get(a.v)!;
      panels();
      if (du === Infinity || du + a.w >= dv) {
        yield t.frame({
          line: 8,
          note: `${a.u} ${sep} ${a.v}: ${du === Infinity ? `dist[${a.u}] is ∞` : `${showDist(du)} ${plusW(a.w)} = ${showDist(du + a.w)} ≥ ${showDist(dv)}`}, so it can't improve anything.`,
          edges: { compare: [a.edge] },
          vars: { u: a.u, v: a.v, w: a.w },
        });
        continue;
      }
      // Still improvable: relax it, then walk prev back V times to land on the cycle and go round it once.
      dist.set(a.v, du + a.w);
      setPrev(a.v, a.u, a.edge);
      const cycle = cycleThrough(a.v) ?? nodeIds(g).map(cycleThrough).find((c) => c != null) ?? null;
      const weightOf = (edge: EdgeId) => g.edges.find((e) => edgeKey(e.from, e.to, g.directed) === edge)!.weight;
      const total = cycle ? cycle.edges.reduce((sum, e) => sum + weightOf(e), 0) : 0;
      const loop = cycle ? [...cycle.nodes, cycle.nodes[0]].join(` ${sep} `) : '';
      t.clearMarks();
      if (cycle) {
        for (const id of cycle.nodes) t.mark(id, 'reject');
        for (const e of cycle.edges) t.markEdge(e, 'reject');
      }
      t.setPanel({
        kind: 'facts',
        id: 'result',
        title: 'Result',
        facts: [
          { label: 'Negative cycle', value: cycle ? loop : 'yes', mark: 'reject' },
          ...(cycle ? [{ label: 'Cycle weight', value: showW(total) }] : []),
        ],
      });
      current = null;
      panels(a.v);
      yield t.frame({
        line: 9,
        note: `${a.u} ${sep} ${a.v} can still lower dist[${a.v}] (${showDist(du)} ${plusW(a.w)} < ${showDist(dv)}), so a negative cycle is reachable${
          cycle ? `: following prev leads round ${loop}, weight ${showW(total)}` : ''
        }. Each lap makes paths shorter, so shortest distances don't exist.`,
        pulse: a.edge,
        vars: { u: a.u, v: a.v, ...(cycle && { cycleWeight: total }) },
      });
      return;
    }
    current = null;
    panels();
  }

  const unreached = nodeIds(g).filter((id) => dist.get(id) === Infinity);
  t.setPanel({ kind: 'facts', id: 'result', title: 'Result', facts: [{ label: 'Negative cycle', value: 'none', mark: 'visited' }] });
  for (const id of nodeIds(g)) if (dist.get(id) !== Infinity) t.mark(id, 'visited');
  yield t.frame({
    line: stoppedEarly ? 6 : 7,
    note: `Done: no edge can improve any distance, so these are the shortest distances from ${s}.${unreached.length ? ` ${list(unreached)} can't be reached from ${s}.` : ''}`,
    vars: { passes: t.stats.passes },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>, start: string) =>
  fixedExample(id, label, () => ({ ...authored(rules, edges, at), start }));

const CHAIN_AT = { A: [0, 70], B: [100, 0], C: [200, 70], D: [300, 0], E: [400, 70] } as const;

export const bellmanFord = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'bellman-ford',
  view: 'graph',
  input: graphInput(rules, [
    N('negative', 'Negative edge', 'A>B:2, A>C:5, C>B:-4, B>D:1, C>D:4', { A: [0, 80], B: [140, 0], C: [140, 160], D: [280, 80] }, 'A'),
    N(
      'cycle',
      'Negative cycle',
      'A>B:4, B>C:2, C>D:1, D>B:-5, D>E:3, A>E:9',
      { A: [0, 60], B: [120, 0], C: [230, 70], D: [120, 150], E: [330, 150] },
      'A',
    ),
    N('lucky', 'Edges in path order', 'A>B:1, B>C:2, C>D:3, D>E:4', CHAIN_AT, 'A'),
    N('unlucky', 'Edges in reverse order', 'D>E:4, C>D:3, B>C:2, A>B:1', CHAIN_AT, 'A'),
    {
      id: 'random',
      label: 'Random',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: true, weighted: true, weights: [-2, 9], extra: 0.5, start: true }),
    },
  ]),
  pseudocode,
  stats: [{ key: 'edges', label: 'Edges checked' }, RELAXATIONS, { key: 'passes', label: 'Passes' }],
  legend: [
    { neutral: 'Not reached yet' },
    { mark: 'key', label: 'Source' },
    { mark: 'compare', label: 'Edge being checked' },
    { mark: 'path', label: 'Best route (prev edge)' },
    { mark: 'write', label: 'Distance just lowered' },
    { mark: 'visited', label: 'Final distance' },
    { mark: 'reject', label: 'Negative cycle' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'Relax every edge, V − 1 times over. Each pass extends correct shortest paths by at least one more edge, so after V − 1 passes every shortest path is found, negative edges included. One extra pass detects negative cycles.',
    invariant: 'After pass k, dist[v] is at most the length of the shortest path to v that uses at most k edges, and it never falls below the true shortest distance unless a negative cycle is reachable.',
    whenToUse: 'Shortest paths with negative edge weights (currency exchange, constraint systems), or when you must detect a negative cycle. It is slower than Dijkstra, O(V·E), so use Dijkstra when every weight is non-negative.',
    traits: [
      { label: 'Handles negative edges', good: true },
      { label: 'Detects negative cycles', good: true },
      { label: 'O(V·E): slower than Dijkstra', good: false },
      { label: 'Result depends on edge order only in speed', good: null },
    ],
    experiments: [
      { example: 'negative', prompt: 'The same graph that fools Dijkstra. Watch C lower B’s distance below 2, and D follow.' },
      { example: 'cycle', prompt: 'B → C → D → B has total weight −2. Watch the extra pass catch it.' },
      { example: 'unlucky', prompt: 'Edges in reverse order need all V − 1 passes. Then try “Edges in path order”: one pass is enough.' },
    ],
  },
});

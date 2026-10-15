import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { GraphState, Mark } from '@/viz/graph/types';
import { authored, fixedExample, graphInput, list, nodeIds, randomGraph, showDist, type GraphInput, type GraphRules } from './model';

const rules: GraphRules = { direction: 'either', weighted: true, start: false, name: 'Floyd–Warshall' };

const pseudocode = [
  'd[i][j] ← w(i, j);  d[i][i] ← 0',
  'for each node k:',
  '  for each node i:',
  '    for each node j:',
  '      if d[i][k] + d[k][j] < d[i][j]:',
  '        d[i][j] ← d[i][k] + d[k][j]',
  'if some d[i][i] < 0: negative cycle',
];

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['checks', 'updates']);
  const ids = nodeIds(g);
  const n = ids.length;
  if (n === 0) {
    yield t.frame({ note: 'The graph is empty, so there are no paths to find.' });
    return;
  }
  const dist = ids.map((_, i) => ids.map((__, j) => (i === j ? 0 : Infinity)));
  const at = new Map(ids.map((id, i) => [id, i]));
  for (const e of g.edges) {
    const [a, b] = [at.get(e.from)!, at.get(e.to)!];
    dist[a][b] = Math.min(dist[a][b], e.weight);
    if (!g.directed) dist[b][a] = Math.min(dist[b][a], e.weight);
  }

  const matrix = (marks: { row: number; col: number; mark: Mark }[] = [], k: number | null = null, caption?: string) =>
    t.setPanel({
      kind: 'matrix',
      id: 'dist',
      title: 'd[i][j]: shortest i → j found so far',
      labels: ids,
      cells: dist.map((row) => row.map(showDist)),
      marks,
      axis: k == null ? null : { index: k, label: ids[k] },
      ...(caption && { caption }),
    });

  matrix();
  yield t.frame({
    line: 0,
    note: 'Floyd–Warshall finds the shortest distance between every pair of nodes. Start with the direct edges: d[i][j] is the edge weight, 0 on the diagonal, ∞ where there is no edge.',
    vars: { V: n },
  });

  for (let k = 0; k < n; k++) {
    const K = ids[k];
    t.clearMarks();
    t.mark(K, 'key');
    const candidates = ids.flatMap((_, i) => ids.map((__, j) => [i, j] as const)).filter(([i, j]) => i !== k && j !== k && dist[i][k] < Infinity && dist[k][j] < Infinity)
      // A loop i → k → i can only beat d[i][i] = 0 if it is negative.
      .filter(([i, j]) => i !== j || dist[i][k] + dist[k][j] < 0);
    matrix([], k, `Row ${K} and column ${K} hold the two halves of every path through ${K}.`);
    yield t.frame({
      line: 1,
      note: `k = ${K}: now allow paths to pass through ${K} (as well as the nodes before it). Only pairs where i reaches ${K} and ${K} reaches j can improve: ${candidates.length} of them.`,
      vars: { k: K },
    });

    for (const [i, j] of candidates) {
      t.count('checks');
      const [I, J] = [ids[i], ids[j]];
      const via = dist[i][k] + dist[k][j];
      const old = dist[i][j];
      const better = via < old;
      const reads = [
        { row: i, col: k, mark: 'compare' as const },
        { row: k, col: j, mark: 'compare' as const },
      ];
      const ask = {
        question: `Is d[${I}][${J}] shortened by going through ${K}?`,
        choices: [`Yes: ${I} → ${K} → ${J} is shorter`, `No: keep d[${I}][${J}] = ${showDist(old)}`],
        answer: better ? 0 : 1,
      };
      const vars = { k: K, i: I, j: J, 'd[i][k]': dist[i][k], 'd[k][j]': dist[k][j], 'd[i][j]': old };
      const nodes = i === j ? { compare: [I] } : { compare: [I, J] };
      if (better) {
        dist[i][j] = via;
        t.count('updates');
        matrix([...reads, { row: i, col: j, mark: 'write' }], k);
        yield t.frame({
          line: 5,
          note:
            i === j
              ? `d[${I}][${K}] + d[${K}][${I}] = ${showDist(via)} < 0: going ${I} → ${K} → ${I} costs less than staying put, so a negative cycle runs through ${I}.`
              : `d[${I}][${K}] + d[${K}][${J}] = ${showDist(dist[i][k])} + ${showDist(dist[k][j])} = ${showDist(via)} < ${showDist(old)}, so going through ${K} is shorter: d[${I}][${J}] ← ${showDist(via)}.`,
          nodes,
          vars: { ...vars, 'd[i][j]': via },
          ask,
        });
      } else {
        matrix([...reads, { row: i, col: j, mark: 'key' }], k);
        yield t.frame({
          line: 4,
          note: `d[${I}][${K}] + d[${K}][${J}] = ${showDist(dist[i][k])} + ${showDist(dist[k][j])} = ${showDist(via)}, not less than ${showDist(old)}: the route through ${K} doesn't help.`,
          nodes,
          vars,
          ask,
        });
      }
    }
    t.mark(K, 'visited');
  }

  const negative = ids.filter((_, i) => dist[i][i] < 0);
  t.clearMarks();
  for (const id of negative) t.mark(id, 'reject');
  matrix(negative.map((id) => ({ row: at.get(id)!, col: at.get(id)!, mark: 'reject' as const })));
  t.setPanel({
    kind: 'facts',
    id: 'result',
    title: 'Result',
    facts: [{ label: 'Negative cycle', value: negative.length ? `through ${negative.join(', ')}` : 'none', mark: negative.length ? 'reject' : 'visited' }],
  });
  yield t.frame({
    line: 6,
    note: negative.length
      ? `${list(negative.map((id) => `d[${id}][${id}]`))} ${negative.length === 1 ? 'is' : 'are'} negative: a negative cycle runs through ${list(negative)}, so distances involving it are meaningless (they could drop forever).`
      : `Every node has been allowed as a stop-over and the diagonal is all 0, so there is no negative cycle: the matrix holds the shortest distance between every pair.`,
    vars: { checks: t.stats.checks, updates: t.stats.updates },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>) => fixedExample(id, label, () => authored(rules, edges, at));

export const floydWarshall = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'floyd-warshall',
  view: 'graph',
  input: graphInput(rules, [
    N('classic', 'Four cities', 'A>B:3, A>D:7, B>A:8, B>C:2, C>A:5, C>D:1, D>A:2', { A: [0, 0], B: [170, 0], C: [170, 150], D: [0, 150] }),
    N(
      'undirected',
      'Two-way roads',
      'A-B:4, A-C:1, B-C:2, B-D:5, C-D:8, D-E:3',
      { A: [0, 80], B: [130, 0], C: [130, 160], D: [260, 80], E: [370, 80] },
    ),
    N('negative', 'Negative edge', 'A>B:4, A>C:2, C>B:-1, B>D:2, D>A:3', { A: [0, 80], B: [150, 0], C: [150, 160], D: [300, 80] }),
    N('cycle', 'Negative cycle', 'A>B:1, B>C:-2, C>A:-1, C>D:2', { A: [0, 0], B: [150, 0], C: [75, 120], D: [230, 150] }),
    {
      id: 'random',
      label: 'Random',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: true, weighted: true, extra: 0.6 }),
    },
  ]),
  pseudocode,
  stats: [
    { key: 'checks', label: 'Cells checked' },
    { key: 'updates', label: 'Cells improved' },
  ],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'key', label: 'k: the allowed stop-over / cell being decided' },
    { mark: 'compare', label: 'Read: d[i][k] and d[k][j] (and i, j)' },
    { mark: 'write', label: 'Cell just improved' },
    { mark: 'visited', label: 'Already used as k' },
    { mark: 'reject', label: 'On a negative cycle' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'All-pairs shortest paths by dynamic programming: allow one more node at a time as a possible stop-over, and for every pair ask whether going through it is shorter. Three nested loops over the nodes, nothing more.',
    invariant: 'After considering k, d[i][j] is the shortest i-to-j path whose intermediate nodes all come from the first k nodes. So when every node has been k, it is the true shortest distance.',
    whenToUse: 'Small or dense graphs where you need every pair’s distance (route tables, transitive closure, the “center” of a network). For one source on a sparse graph, Dijkstra or Bellman–Ford is far cheaper.',
    traits: [
      { label: 'Handles negative edges', good: true },
      { label: 'Detects negative cycles (diagonal < 0)', good: true },
      { label: 'O(V³) time, O(V²) memory', good: false },
      { label: 'Very simple code', good: true },
    ],
    experiments: [
      { example: 'classic', prompt: 'Before k = B, d[A][C] is ∞. Predict its value right after k = B.' },
      { example: 'cycle', prompt: 'The cycle A → B → C → A has weight −2. Watch the diagonal turn negative.' },
      { example: 'undirected', prompt: 'With two-way roads the matrix stays symmetric. Is every update made twice?' },
    ],
  },
});

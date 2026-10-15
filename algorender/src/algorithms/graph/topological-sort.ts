import { defineAlgorithm } from '@/engine/module';
import { askAhead, GraphTracer, type GraphFrame } from '@/viz/graph/tracer';
import type { GraphState, NodeId } from '@/viz/graph/types';
import { adjacency, authored, choose, fixedExample, graphInput, list, nodeIds, randomGraph, type GraphInput, type GraphRules } from './model';
import { EDGES, nodeChips } from './shared';

const rules: GraphRules = { direction: 'directed', weighted: false, start: false, name: 'Topological sort' };

const pseudocode = [
  'in[v] ← number of edges into v',
  'Q ← every node with in[v] = 0',
  'while Q is not empty:',
  '  u ← dequeue(Q);  append u to order',
  '  for each edge u → v:',
  '    in[v] ← in[v] − 1',
  '    if in[v] = 0: enqueue(v)',
  'if order has fewer than V nodes:',
  '  the rest are on or behind a cycle',
];

function* trace(g: GraphInput): Generator<GraphFrame> {
  const t = new GraphTracer(g, ['visited', 'edges']);
  const adj = adjacency(g);
  const ids = nodeIds(g);
  if (ids.length === 0) {
    yield t.frame({ note: 'The graph is empty, so the order is empty too.' });
    return;
  }
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of g.edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const queue: NodeId[] = [];
  const order: NodeId[] = [];
  let choices = 0;
  let questions = 0;

  const panels = () => {
    t.setPanel({ kind: 'chips', id: 'queue', title: 'Queue (ready to place)', chips: nodeChips(queue), ends: ['front', 'back'], empty: 'empty' });
    t.setPanel({ kind: 'chips', id: 'order', title: 'Topological order', chips: nodeChips(order, { mark: () => 'visited' }), empty: 'none yet' });
    for (const id of ids) t.annotate(id, order.includes(id) ? null : String(indeg.get(id)));
  };

  t.setAnnotationLabel('in-degree (unplaced prerequisites)');
  panels();
  yield t.frame({
    line: 0,
    note: 'A topological order lists the nodes so every edge points forward: each node comes after everything it depends on. Kahn’s algorithm starts by counting each node’s incoming edges.',
    vars: { V: ids.length, E: g.edges.length },
  });

  for (const id of ids) if (indeg.get(id) === 0) queue.push(id);
  for (const id of queue) t.mark(id, 'frontier');
  panels();
  yield t.frame({
    line: 1,
    note: queue.length
      ? `${list(queue)} ${queue.length === 1 ? 'has' : 'have'} no incoming edges: nothing must come first, so ${queue.length === 1 ? 'it is' : 'they are'} ready. Queue ${queue.length === 1 ? 'it' : 'them'}.`
      : 'Every node has an incoming edge, so nothing can go first: the graph must contain a cycle.',
    vars: { ready: queue.length },
  });

  while (queue.length > 0) {
    if (queue.length > 1) choices++;
    const waiting = [...queue];
    const u = queue.shift()!;
    order.push(u);
    t.count('visited');
    t.mark(u, 'key');
    t.badge(u, `#${order.length}`);
    panels();
    const q = waiting.length > 1 ? choose(u, waiting.slice(1).reverse(), questions++) : null;
    yield t.frame({
      line: 3,
      note:
        waiting.length > 1
          ? `Dequeue ${u} and place it at position ${order.length}. Any ready node could go here; taking them first-in, first-out is one valid choice.`
          : `Dequeue ${u} and place it at position ${order.length}: everything it depends on is already placed.`,
      vars: { u, position: order.length },
      ...(q && { ask: { question: 'Which node is dequeued next?', ...q } }),
    });

    for (const { to: v, edge } of adj.get(u)!) {
      t.count('edges');
      const left = indeg.get(v)! - 1;
      indeg.set(v, left);
      t.markEdge(edge, 'visited');
      const ask = {
        question: `After ${u} → ${v} is satisfied, is ${v} ready (in-degree 0)?`,
        choices: [`Yes: enqueue ${v}`, `No: ${v} still waits`],
        answer: left === 0 ? 0 : 1,
      };
      if (left === 0) {
        queue.push(v);
        t.mark(v, 'frontier');
        panels();
        yield t.frame({ line: 6, note: `${u} → ${v}: that was ${v}'s last unplaced prerequisite, so in[${v}] = 0 and ${v} is ready. Enqueue it.`, edges: { compare: [edge] }, pulse: edge, vars: { u, v, 'in[v]': 0 }, ask });
      } else {
        panels();
        yield t.frame({
          line: 5,
          note: `${u} → ${v}: one of ${v}'s prerequisites is placed, but in[${v}] = ${left}: ${left === 1 ? 'one more edge still points' : `${left} more edges still point`} into it.`,
          edges: { compare: [edge] },
          vars: { u, v, 'in[v]': left },
          ask,
        });
      }
    }
    t.mark(u, 'visited');
    panels();
  }

  const stuck = ids.filter((id) => !order.includes(id));
  if (stuck.length) {
    for (const id of stuck) t.mark(id, 'reject');
    for (const e of g.edges) if (stuck.includes(e.from) && stuck.includes(e.to)) t.markEdge(t.edgeId(e.from, e.to), 'reject');
    t.setPanel({ kind: 'facts', id: 'result', title: 'Result', facts: [{ label: 'Cycle', value: `among ${stuck.join(', ')}`, mark: 'reject' }] });
    yield t.frame({
      line: 8,
      note: `The queue is empty but ${list(stuck)} ${stuck.length === 1 ? 'is' : 'are'} unplaced: each still has an incoming edge from another unplaced node. Following those edges backwards must loop, so there is a cycle and no topological order exists.`,
      vars: { placed: order.length, stuck: stuck.length },
    });
    return;
  }
  t.setPanel({ kind: 'facts', id: 'result', title: 'Result', facts: [{ label: 'Order', value: order.join(' → '), mark: 'visited' }] });
  yield t.frame({
    line: 7,
    note: `Done: all ${order.length} nodes are placed and every edge points forward.${choices ? ` The queue held more than one node ${choices} time${choices === 1 ? '' : 's'}, so other valid orders exist too.` : ' The queue never held two nodes at once, so this is the only valid order.'}`,
    vars: { placed: order.length },
  });
}

const N = (id: string, label: string, edges: string, at: Record<string, readonly [number, number]>) => fixedExample(id, label, () => authored(rules, edges, at));

export const topologicalSort = defineAlgorithm<GraphInput, GraphState>({
  kind: 'algorithm',
  slug: 'topological-sort',
  view: 'graph',
  input: graphInput(rules, [
    N('courses', 'Course prerequisites', 'Prg>Sys, Prg>DS, Mth>DS, Mth>Alg, DS>Alg, DS>Net, Sys>OS, OS>Net, Alg>ML', {
      Prg: [0, 30],
      Mth: [0, 190],
      Sys: [120, 0],
      DS: [120, 110],
      OS: [240, 0],
      Alg: [240, 150],
      Net: [360, 50],
      ML: [360, 190],
    }),
    N('many', 'Many valid orders', 'A>D, B>D, B>E, C>E, D>F, E>F', { A: [0, 0], B: [0, 100], C: [0, 200], D: [130, 50], E: [130, 150], F: [260, 100] }),
    N('cycle', 'Graph with a cycle', 'A>B, B>C, C>D, D>B, D>E, A>F', { A: [0, 80], B: [110, 80], C: [220, 0], D: [220, 160], E: [330, 160], F: [110, 200] }),
    N('chain', 'Only one order', 'A>B, B>C, C>D, A>C, B>D', { A: [0, 60], B: [110, 0], C: [220, 60], D: [330, 0] }),
    {
      id: 'random',
      label: 'Random DAG',
      make: ({ seed, size }) => randomGraph(seed, size, { directed: true, weighted: false, dag: true, extra: 0.5 }),
    },
  ]),
  pseudocode,
  stats: [{ key: 'visited', label: 'Nodes placed' }, EDGES],
  legend: [
    { neutral: 'Waiting on prerequisites' },
    { mark: 'frontier', label: 'Ready (in the queue)' },
    { mark: 'key', label: 'Being placed' },
    { mark: 'visited', label: 'Placed / edge satisfied' },
    { mark: 'compare', label: 'Edge just satisfied' },
    { mark: 'reject', label: 'Stuck on a cycle' },
  ],
  run: (input) => askAhead(trace(input)),
  content: {
    idea: 'Order the nodes of a directed graph so that every edge points forward, like scheduling tasks after their prerequisites. Kahn’s algorithm repeatedly places a node with no unplaced prerequisites and “removes” its outgoing edges.',
    invariant: 'A node enters the queue exactly when all its predecessors are placed, so every placed node comes after everything that points into it.',
    whenToUse: 'Build systems, course planning, spreadsheet recalculation, package installs: any dependency ordering. It also detects cycles: if some nodes never become ready, the dependencies are circular.',
    traits: [
      { label: 'Detects cycles', good: true },
      { label: 'O(V + E)', good: true },
      { label: 'Only for directed graphs', good: null },
      { label: 'Order not unique in general', good: null },
    ],
    experiments: [
      { example: 'many', prompt: 'A, B and C are all ready at the start. Write down two different valid orders.' },
      { example: 'cycle', prompt: 'B, C and D wait on each other. Which nodes get stuck, and why does E get stuck too?' },
      { example: 'chain', prompt: 'Here the queue never holds two nodes, so the order is forced. Which edges force it?' },
    ],
  },
});

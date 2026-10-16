// Exercises on a graph. The learner's function gets the graph as a dict (an
// object in JS) of neighbour lists; their own queue, stack, sets and dicts,
// read from memory at every line, drive GraphView (src/workspace/traceGraph.ts).

import { COMPONENTS_AT, COMPONENTS_EDGES, NETWORK_AT, NETWORK_EDGES, ONE_WAY_AT, ONE_WAY_EDGES } from '@/algorithms/graph/examples';
import { adjacency, authored, randomGraph, type GraphInput, type GraphRules } from '@/algorithms/graph/model';
import type { NodeId } from '@/viz/graph/types';
import { GRAPH_RUN_LEGEND } from '@/workspace/traceGraph';
import type { Arg, Json, RunResult } from '@/workspace/protocol';
import { crashed, type Exercise, type Verdict } from './shared';

/** A graph and the node to start from. */
export type GraphExerciseInput = { graph: GraphInput; start: NodeId };

/** A graph as the entry function's argument: each node's neighbours in label order, as the visualisers take them. */
export function graphArg(name: string, g: GraphInput): Arg {
  const adj = adjacency(g);
  return {
    kind: 'graph',
    name,
    directed: g.directed,
    weighted: g.weighted,
    adjacency: g.nodes.map((n) => ({ node: n.id, neighbours: adj.get(n.id)!.map((a) => ({ to: a.to, weight: a.weight })) })),
    layout: Object.fromEntries(g.nodes.map((n) => [n.id, [n.x, n.y]])),
  };
}

const graphArgs = ({ graph, start }: GraphExerciseInput): Arg[] => [graphArg('graph', graph), { kind: 'value', name: 'start', value: start }];

const either: GraphRules = { direction: 'either', weighted: false, start: true, name: 'Graph exercise' };

const example = (edges: string, at: Record<string, readonly [number, number]>, start: NodeId): GraphExerciseInput => ({
  graph: { ...authored(either, edges, at), start },
  start,
});

const random = (seed: number, size: number, directed = false): GraphExerciseInput => {
  const graph = randomGraph(seed, size, { directed, weighted: false, extra: 0.4, start: true });
  return { graph, start: graph.start ?? graph.nodes[0].id };
};

const NETWORK = example(NETWORK_EDGES, NETWORK_AT, 'A');
const COMPONENTS = example(COMPONENTS_EDGES, COMPONENTS_AT, 'A');
const ONE_WAY = example(ONE_WAY_EDGES, ONE_WAY_AT, 'A');
const LONELY = example('A', { A: [0, 0] }, 'A');

/** Each reachable node's fewest-edges distance from the start, and the node that first reached it. */
export function bfsLevels({ graph, start }: GraphExerciseInput): { level: Map<NodeId, number>; parent: Map<NodeId, NodeId> } {
  const adj = adjacency(graph);
  const level = new Map([[start, 0]]);
  const parent = new Map<NodeId, NodeId>();
  const queue = [start];
  for (let k = 0; k < queue.length; k++) {
    const u = queue[k];
    for (const { to } of adj.get(u)!) {
      if (level.has(to)) continue;
      level.set(to, level.get(u)! + 1);
      parent.set(to, u);
      queue.push(to);
    }
  }
  return { level, parent };
}

/** The order a recursive depth-first search first visits the nodes, and the node that reached each. */
export function dfsOrder({ graph, start }: GraphExerciseInput): { order: NodeId[]; parent: Map<NodeId, NodeId> } {
  const adj = adjacency(graph);
  const order: NodeId[] = [];
  const parent = new Map<NodeId, NodeId>();
  const seen = new Set<NodeId>();
  const visit = (u: NodeId) => {
    seen.add(u);
    order.push(u);
    for (const { to } of adj.get(u)!) {
      if (seen.has(to)) continue;
      parent.set(to, u);
      visit(to);
    }
  };
  visit(start);
  return { order, parent };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A node whose neighbours the code read more than once, if any: a search reads each node's neighbours once. */
function exploredTwice(result: RunResult): NodeId | null {
  const reads = new Map<NodeId, number>();
  for (const e of result.events) {
    if (e.kind !== 'neighbours') continue;
    reads.set(e.node, (reads.get(e.node) ?? 0) + 1);
    if (reads.get(e.node)! > 1) return e.node;
  }
  return null;
}

/** The levels the learner returned, as a map, or a message saying what to return instead. */
function returnedLevels(got: Json): Map<string, unknown> | string {
  if (got === null || typeof got !== 'object') return `Return a dict (an object in JavaScript) from each reached node to its level, not ${JSON.stringify(got)}.`;
  if (Array.isArray(got)) return 'Return a dict (a plain object in JavaScript, not an array or a Map) from each reached node to its level.';
  return new Map(Object.entries(got));
}

function checkLevels(input: GraphExerciseInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = returnedLevels(result.returned);
  if (typeof got === 'string') return { pass: false, message: got };
  const { level, parent } = bfsLevels(input);
  const { start } = input;
  for (const [n, want] of level) {
    if (!got.has(n)) return { pass: false, message: `${n} is ${plural(want, 'edge')} from ${start}, but it isn’t in what you returned.` };
    const said = got.get(n);
    if (said !== want) {
      const via = parent.get(n);
      const why = via ? ` It is first reached from ${via} (level ${level.get(via)}), so it is one more.` : '';
      return { pass: false, message: `${n} should be level ${want}, not ${JSON.stringify(said)}.${why}` };
    }
  }
  for (const [n, said] of got) {
    if (!level.has(n)) return { pass: false, message: `${n} can’t be reached from ${start}, so leave it out (you gave it ${JSON.stringify(said)}).` };
  }
  const twice = exploredTwice(result);
  if (twice) {
    return {
      pass: false,
      message: `Right levels, but your code read ${twice}’s neighbours more than once. Mark a node as seen when you first queue it, so each node is queued and explored once.`,
    };
  }
  const far = Math.max(...level.values());
  return { pass: true, message: `Every level is right: ${plural(level.size, 'node')} reached, the farthest ${plural(far, 'edge')} from ${start}.` };
}

function checkOrder(input: GraphExerciseInput, result: RunResult): Verdict {
  const failed = crashed(result);
  if (failed) return failed;
  const got = result.returned;
  if (!Array.isArray(got)) return { pass: false, message: `Return a list (an array in JavaScript) of nodes in the order you visit them, not ${JSON.stringify(got)}.` };
  const { order, parent } = dfsOrder(input);
  const same = got.length === order.length && got.every((n, i) => n === order[i]);
  if (!same) {
    const breadth = [...bfsLevels(input).level.keys()];
    if (got.length === breadth.length && got.every((n, i) => n === breadth[i]) && breadth.some((n, i) => n !== order[i])) {
      return {
        pass: false,
        message: `That is breadth-first order: every neighbour of ${input.start} comes before anything further away. Depth-first goes as deep as it can first: visit a neighbour, then its neighbours, before the next neighbour.`,
      };
    }
    const i = order.findIndex((n, k) => got[k] !== n);
    const before = order.slice(0, i).join(', ');
    if (i < 0) return { pass: false, message: `After visiting every reachable node, you listed ${JSON.stringify(got[order.length])} too: ${input.start} can’t reach it, or it is a repeat.` };
    if (i >= got.length) return { pass: false, message: `Your list stops after ${before}, but ${order[i]} is still reachable: ${parent.get(order[i])} leads to it.` };
    const from = parent.get(order[i])!;
    return {
      pass: false,
      message: `Position ${i + 1} should be ${order[i]}, not ${JSON.stringify(got[i])}: after ${before}, the search is still exploring ${from}, and ${order[i]} is the first neighbour of ${from} it hasn’t seen.`,
    };
  }
  const twice = exploredTwice(result);
  if (twice) return { pass: false, message: `Right order, but your code read ${twice}’s neighbours more than once: skip a node you have already seen.` };
  return { pass: true, message: `Visited all ${plural(order.length, 'reachable node')} depth first: ${order.join(', ')}.` };
}

const ts = (js: string, ...swaps: [string, string][]) => swaps.reduce((code, [from, to]) => code.replace(from, to), js);
const jsAndTs = (python: string[], js: string[]) => ({ python, javascript: js, typescript: js });

const BFS_PY = `from collections import deque


def bfs_levels(graph, start):
    level = {start: 0}
    queue = deque([start])
    while queue:
        u = queue.popleft()
        for v in graph[u]:
            if v not in level:
                level[v] = level[u] + 1
                queue.append(v)
    return level
`;
const BFS_JS = `function bfsLevels(graph, start) {
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
const BFS_PY_BLANKS = `from collections import deque


def bfs_levels(graph, start):
    level = {start: «1:0»}
    queue = deque([start])
    while queue:
        u = «2:queue.popleft()»
        for v in «3:graph[u]»:
            if «4:v not in level»:
                level[v] = «5:level[u] + 1»
                «6:queue.append(v)»
    return level
`;
const BFS_JS_BLANKS = `function bfsLevels(graph, start) {
  const level = { [start]: «1:0» };
  const queue = [start];
  while (queue.length > 0) {
    const u = «2:queue.shift()»;
    for (const v of «3:graph[u]») {
      if («4:!(v in level)») {
        level[v] = «5:level[u] + 1»;
        «6:queue.push(v)»;
      }
    }
  }
  return level;
}
`;
const BFS_TS: [string, string][] = [
  ['function bfsLevels(graph, start) {', 'function bfsLevels(graph: Record<string, string[]>, start: string): Record<string, number> {'],
  ['const level = {', 'const level: Record<string, number> = {'],
  ['queue.shift()', 'queue.shift()!'],
];

const DFS_PY = `def dfs_order(graph, start):
    order = []
    seen = set()

    def visit(u):
        seen.add(u)
        order.append(u)
        for v in graph[u]:
            if v not in seen:
                visit(v)

    visit(start)
    return order
`;
const DFS_JS = `function dfsOrder(graph, start) {
  const order = [];
  const seen = new Set();
  function visit(u) {
    seen.add(u);
    order.push(u);
    for (const v of graph[u]) {
      if (!seen.has(v)) {
        visit(v);
      }
    }
  }
  visit(start);
  return order;
}
`;
const DFS_PY_BLANKS = `def dfs_order(graph, start):
    order = []
    seen = set()

    def visit(u):
        «1:seen.add(u)»
        order.append(u)
        for v in «2:graph[u]»:
            if «3:v not in seen»:
                «4:visit(v)»

    «5:visit(start)»
    return order
`;
const DFS_JS_BLANKS = `function dfsOrder(graph, start) {
  const order = [];
  const seen = new Set();
  function visit(u) {
    «1:seen.add(u)»;
    order.push(u);
    for (const v of «2:graph[u]») {
      if («3:!seen.has(v)») {
        «4:visit(v)»;
      }
    }
  }
  «5:visit(start)»;
  return order;
}
`;
const DFS_TS: [string, string][] = [
  ['function dfsOrder(graph, start) {', 'function dfsOrder(graph: Record<string, string[]>, start: string): string[] {'],
  ['const order = [];', 'const order: string[] = [];'],
  ['const seen = new Set();', 'const seen = new Set<string>();'],
  ['function visit(u) {', 'function visit(u: string): void {'],
];

const GRAPH_TESTS: { name: string; input: GraphExerciseInput }[] = [
  { name: 'small network, from A', input: NETWORK },
  { name: 'small network, from the middle', input: { graph: { ...NETWORK.graph, start: 'D' }, start: 'D' } },
  { name: 'two components', input: COMPONENTS },
  { name: 'one-way streets', input: ONE_WAY },
  { name: 'one-way streets, from G', input: { graph: { ...ONE_WAY.graph, start: 'G' }, start: 'G' } },
  { name: 'a single node', input: LONELY },
  { name: 'random graph (8 nodes)', input: random(11, 8) },
  { name: 'random graph (10 nodes)', input: random(29, 10) },
  { name: 'random one-way graph (9 nodes)', input: random(47, 9, true) },
];

const GRAPH_EXAMPLES = [
  { id: 'network', label: 'Small network', input: NETWORK },
  { id: 'components', label: 'Two components', input: COMPONENTS },
  { id: 'one-way', label: 'One-way streets', input: ONE_WAY },
];

const TASK_GRAPH = '`graph[u]` lists the neighbours of node `u` (one-way graphs list only the edges leaving `u`), in alphabetical order.';

export const graphExercises: Exercise<GraphExerciseInput>[] = [
  {
    slug: 'bfs-levels',
    title: 'Write breadth-first search',
    kind: 'write',
    visualiser: 'breadth-first-search',
    summary: 'Find how many edges each node is from the start, ring by ring, and watch your own queue drive the graph.',
    task: [
      `Write \`bfs_levels(graph, start)\` (Python) or \`bfsLevels(graph, start)\` (JavaScript/TypeScript). ${TASK_GRAPH}`,
      'Return a dict (an object in JavaScript) from every node `start` can reach to its level: the fewest edges on any path from `start`. Leave out nodes it can’t reach.',
      'Use a queue. `start` is level 0. Take the node at the front, and give each neighbour you haven’t seen yet a level one higher, putting it at the back of the queue.',
    ],
    entry: { python: 'bfs_levels', js: 'bfsLevels' },
    args: graphArgs,
    starter: {
      python: `from collections import deque


def bfs_levels(graph, start):
    # graph[u] lists u's neighbours. Return {node: level} for every node start reaches.
    # deque([start]) is a queue: append() adds at the back, popleft() takes from the front.
    level = {start: 0}
    return level
`,
      javascript: `function bfsLevels(graph, start) {
  // graph[u] lists u's neighbours. Return { node: level } for every node start reaches.
  // An array works as a queue: push() adds at the back, shift() takes from the front.
  const level = { [start]: 0 };
  return level;
}
`,
      typescript: `function bfsLevels(graph: Record<string, string[]>, start: string): Record<string, number> {
  // graph[u] lists u's neighbours. Return { node: level } for every node start reaches.
  // An array works as a queue: push() adds at the back, shift() takes from the front.
  const level: Record<string, number> = { [start]: 0 };
  return level;
}
`,
    },
    solution: { python: BFS_PY, javascript: BFS_JS, typescript: ts(BFS_JS, ...BFS_TS) },
    blanks: { python: BFS_PY_BLANKS, javascript: BFS_JS_BLANKS, typescript: ts(BFS_JS_BLANKS, ...BFS_TS.slice(0, 2), ['queue.shift()»', 'queue.shift()!»']) },
    fades: [[5], [2, 5], [2, 3, 5, 6], [1, 2, 3, 4, 5, 6]],
    distractors: jsAndTs(['u = queue.pop()', 'level[v] = level[u]'], ['const u = queue.pop();', 'level[v] = level[u];']),
    examples: GRAPH_EXAMPLES,
    tests: GRAPH_TESTS,
    check: checkLevels,
    markSortedAtEnd: false,
    pointers: [],
    hints: [
      'Keep `level` as your record of seen nodes too: a node is seen once it has a level.',
      'Loop while the queue isn’t empty. Take `u` from the front, then look at each `v` in `graph[u]`.',
      'Give `v` a level only if it doesn’t have one yet: `level[v] = level[u] + 1`, then put `v` at the back of the queue. Taking from the front is what keeps the rings in order.',
    ],
    legend: [...GRAPH_RUN_LEGEND],
  },
  {
    slug: 'dfs-order',
    title: 'Write depth-first search',
    kind: 'write',
    visualiser: 'depth-first-search',
    summary: 'Go as deep as you can before backing up, and watch your own calls pile up on the graph.',
    task: [
      `Write \`dfs_order(graph, start)\` (Python) or \`dfsOrder(graph, start)\` (JavaScript/TypeScript). ${TASK_GRAPH}`,
      'Return the nodes in the order a depth-first search from `start` first visits them, taking each node’s neighbours in the order `graph[u]` lists them.',
      'Visit a node, then fully explore each neighbour you haven’t seen yet before moving on to the next one. A recursive helper does this in a few lines: each call is one node, and the calls waiting underneath remember where to come back to.',
    ],
    entry: { python: 'dfs_order', js: 'dfsOrder' },
    args: graphArgs,
    starter: {
      python: `def dfs_order(graph, start):
    # graph[u] lists u's neighbours. Return the nodes in the order you first visit them.
    order = []
    seen = set()
    return order
`,
      javascript: `function dfsOrder(graph, start) {
  // graph[u] lists u's neighbours. Return the nodes in the order you first visit them.
  const order = [];
  const seen = new Set();
  return order;
}
`,
      typescript: `function dfsOrder(graph: Record<string, string[]>, start: string): string[] {
  // graph[u] lists u's neighbours. Return the nodes in the order you first visit them.
  const order: string[] = [];
  const seen = new Set<string>();
  return order;
}
`,
    },
    solution: { python: DFS_PY, javascript: DFS_JS, typescript: ts(DFS_JS, ...DFS_TS) },
    blanks: { python: DFS_PY_BLANKS, javascript: DFS_JS_BLANKS, typescript: ts(DFS_JS_BLANKS, ...DFS_TS) },
    fades: [[4], [3, 4], [1, 3, 4, 5], [1, 2, 3, 4, 5]],
    distractors: jsAndTs(['visit(u)', 'order.append(v)'], ['visit(u);', 'order.push(v);']),
    examples: GRAPH_EXAMPLES,
    tests: GRAPH_TESTS,
    check: checkOrder,
    markSortedAtEnd: false,
    pointers: [],
    hints: [
      'Write a helper `visit(u)` that records `u` (in `seen` and in `order`) and then loops over `graph[u]`.',
      'Inside the loop, call `visit(v)` for each neighbour `v` that isn’t in `seen` yet. The call returns only once everything reachable from `v` is done.',
      'Start everything with `visit(start)`, then return `order`.',
    ],
    legend: [...GRAPH_RUN_LEGEND],
  },
];

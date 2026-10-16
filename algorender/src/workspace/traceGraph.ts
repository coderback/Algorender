// A graph run (a 'lines' run whose code explored a graph argument) on the
// graph view. The steps say what the learner's own variables hold, and the
// graph's reads (protocol.ts) say which node's neighbours the code is reading
// and which edge it just took. Nothing is guessed from names:
// - a node is being explored (key) by the innermost call once the call reads
//   its neighbours, or takes it out of a queue or stack into a variable
//   (u = queue.popleft()), or before either, while it is the call's first
//   node-valued variable (the parameter `u` of dfs(u));
// - it is waiting (frontier) while it sits in a queue or stack (a list the
//   code takes items out of, at the front or the end), or while a paused call
//   lower on the stack is exploring it;
// - it is recorded (visited) while it is in any other set, dict or list;
// - the edge the code took just before a node first showed up anywhere is
//   the edge that reached it (path), which draws a BFS or DFS tree.
// Every one of those containers gets a panel named after its variable, and
// the first dict of numbers (levels, distances) is written under the nodes.

import type { LegendEntry, StatSpec } from '@/engine/module';
import type { Trace, VarValue } from '@/engine/types';
import { circleLayout } from '@/viz/graph/layout';
import { edgeKey } from '@/viz/graph/tracer';
import type { Chip, EdgeId, GraphEdge, GraphNode, GraphState, Mark, NodeId, Panel, TableRow } from '@/viz/graph/types';
import { listWords, traceSteps, type Step, type StepOptions } from './lines';
import type { HeapObject, MemValue, RunEvent, RunResult } from './protocol';

type GraphEvent = Extract<RunEvent, { kind: 'graph' }>;
type Heap = ReadonlyMap<string, HeapObject>;

export const GRAPH_RUN_STATS: readonly StatSpec[] = [
  { key: 'visited', label: 'Nodes explored' },
  { key: 'edges', label: 'Edges taken' },
  { key: 'steps', label: 'Steps' },
];

export const GRAPH_RUN_LEGEND: readonly LegendEntry[] = [
  { neutral: 'Not in your variables yet' },
  { mark: 'key', label: 'Its neighbours are being read' },
  { mark: 'frontier', label: 'Waiting: in a queue or stack, or a paused call' },
  { mark: 'visited', label: 'Recorded in a set, dict or list' },
  { mark: 'path', label: 'The edge that first reached a node' },
  { mark: 'compare', label: 'The edge just taken' },
];

/** A string's text without the quotes a language writes it with ('A' or "A"). */
export function unquoted(v: MemValue): string | null {
  return 'prim' in v && v.type === 'string' && v.prim.length >= 2 ? v.prim.slice(1, -1) : null;
}

/** A value for the variables panel: numbers, booleans and null as themselves, strings without quotes. */
export function varOf(v: MemValue): VarValue | undefined {
  if (!('prim' in v)) return undefined;
  if (v.type === 'string') return unquoted(v) ?? v.prim;
  if (v.type === 'none') return v.prim === '…' ? undefined : null;
  if (v.type === 'boolean') return v.prim === 'True' || v.prim === 'true';
  const n = Number(v.prim);
  return Number.isFinite(n) ? n : v.prim;
}

/** One entry of a container as a panel draws it: its node (if it names one), a label, and the rest of a pair. */
type Item = { node: NodeId | null; label: string; sub?: string };

type Container = {
  id: string;
  /** The variable that first referred to it. */
  name: string;
  kind: 'seq' | 'set' | 'map';
  /** A list the code takes things out of: at the front (a queue) or the end (a stack). Null for a record. */
  work: 'queue' | 'stack' | null;
  /** Its values were numbers at some step: written under the nodes, if it is the first such dict. */
  numeric: boolean;
};

/**
 * A graph run on the graph view, or null when the run never reached the graph
 * (it failed first). Each frame is a step, as on the memory view.
 */
export function traceGraph(result: RunResult, options: StepOptions = {}): Trace<GraphState> | null {
  const given = result.events.find((e): e is GraphEvent => e.kind === 'graph');
  if (!given) return null;
  const g = graphOf(given);
  const nodes = new Set(g.nodes.map((n) => n.id));
  const steps = result.events.filter((e): e is Step => e.kind === 'step');
  const reader = new Reader(given.name, nodes);
  const containers = survey(steps, reader);
  const annotated = [...containers.values()].find((c) => c.kind === 'map' && c.numeric) ?? null;
  const callsPanel = steps.some((e) => e.stack.length > 2);

  const focus = new Map<string, NodeId>();
  // What each container held at the step before, to see a node taken out of a queue or stack.
  let lastHeld = new Map<string, Item[]>();
  const reached = new Set<NodeId>();
  const explored = new Set<NodeId>();
  let pathEdges: Readonly<Record<EdgeId, Mark>> = {};
  let lastEdge: { from: NodeId; to: NodeId } | null = null;
  let edgesTaken = 0;
  let pulses = 0;

  return traceSteps(
    result,
    {
      picture: (e, { prev, between }) => {
        // The reads since the step before happened in the frame that ran the line: the one innermost
        // then, unless it has since returned, when the caller carried on.
        const ranIn = prev && e.stack.some((f) => f.id === prev.stack.at(-1)!.id) ? prev.stack.at(-1)!.id : e.stack.at(-1)!.id;
        const fetched: NodeId[] = [];
        const taken: { from: NodeId; to: NodeId; weight: number }[] = [];
        for (const r of between) {
          if (r.kind === 'neighbours') {
            fetched.push(r.node);
            focus.set(ranIn, r.node);
            explored.add(r.node);
          } else if (r.kind === 'edge') {
            taken.push(r);
            lastEdge = r;
            edgesTaken += 1;
          }
        }
        for (const id of [...focus.keys()]) if (!e.stack.some((f) => f.id === id)) focus.delete(id);

        const heap: Heap = new Map(e.heap.map((o) => [o.id, o]));
        reader.find(e, heap);
        // What each container holds now, in the order containers first appeared.
        const held = new Map<string, { c: Container; items: Item[]; values: Map<NodeId, string> }>();
        for (const f of e.stack) {
          for (const [, v] of f.locals) {
            const c = 'ref' in v ? containers.get(v.ref) : undefined;
            if (c && !held.has(c.id)) held.set(c.id, { c, ...reader.contents(heap.get(c.id)!, heap) });
          }
        }
        const ordered = [...held.values()].sort((a, b) => order(containers, a.c.id) - order(containers, b.c.id));

        // A node the line took out of a queue or stack into one of its variables is the one it explores next.
        const before = prev?.stack.find((f) => f.id === ranIn);
        const after = e.stack.find((f) => f.id === ranIn);
        if (before && after) {
          const count = (items: readonly Item[] | undefined, n: NodeId) => items?.filter((x) => x.node === n).length ?? 0;
          for (const [name, v] of after.locals) {
            const n = reader.node(v);
            const old = before.locals.find(([k]) => k === name)?.[1];
            if (!n || (old && reader.node(old) === n)) continue;
            if (ordered.some(({ c, items }) => c.work && count(items, n) < count(lastHeld.get(c.id), n))) focus.set(ranIn, n);
          }
        }
        lastHeld = new Map(ordered.map(({ c, items }) => [c.id, items]));

        // Each call's node: the one whose neighbours it read last, else its first node-valued variable.
        const callNode = (k: number): NodeId | null => {
          const f = e.stack[k];
          const read = focus.get(f.id);
          if (read) return read;
          if (k === 0) return null;
          for (const [, v] of f.locals) {
            const n = reader.node(v);
            if (n) return n;
          }
          return null;
        };
        const nodesOfCalls = e.stack.map((_, k) => callNode(k));
        const current = nodesOfCalls.at(-1) ?? null;
        const waiting = new Set<NodeId>(nodesOfCalls.slice(0, -1).filter((n): n is NodeId => n != null));
        const recorded = new Set<NodeId>();
        for (const { c, items } of ordered) {
          for (const item of items) if (item.node) (c.work ? waiting : recorded).add(item.node);
        }

        // A node showing up for the first time, just after the code took an edge to it: that edge reached it.
        const now = new Set<NodeId>([...waiting, ...recorded, ...(current ? [current] : [])]);
        for (const n of now) {
          if (reached.has(n)) continue;
          reached.add(n);
          const via: { from: NodeId; to: NodeId } | null = lastEdge;
          if (via && via.to === n) {
            const id = g.edgeId(via.from, n);
            if (id) pathEdges = { ...pathEdges, [id]: 'path' };
          }
        }

        const nodeMarks: Record<NodeId, Mark> = {};
        for (const n of nodes) {
          if (n === current) nodeMarks[n] = 'key';
          else if (waiting.has(n)) nodeMarks[n] = 'frontier';
          else if (recorded.has(n)) nodeMarks[n] = 'visited';
        }
        const edgeMarks: Record<EdgeId, Mark> = { ...pathEdges };
        for (const t of taken) {
          const id = g.edgeId(t.from, t.to);
          if (id) edgeMarks[id] = 'compare';
        }
        const last = taken.at(-1);
        const pulseEdge = last ? g.edgeId(last.from, last.to) : null;

        const annotations: Record<NodeId, string> = {};
        const annotation = annotated ? held.get(annotated.id) : undefined;
        if (annotation) for (const [n, text] of annotation.values) annotations[n] = text;

        const panels: Panel[] = [];
        if (callsPanel && e.stack.length > 1) {
          panels.push({
            kind: 'chips',
            id: 'calls',
            title: 'Calls',
            chips: e.stack.slice(1).map((f, k) => ({ id: f.id, label: `${f.fn}(${nodesOfCalls[k + 1] ?? '…'})` })),
            ends: ['first', 'latest'],
            empty: 'none',
          });
        }
        for (const { c, items, values } of ordered) {
          if (c === annotated) continue;
          panels.push(c.kind === 'map' ? tablePanel(c, values) : chipsPanel(c, c.kind === 'set' ? inNodeOrder(items, g.nodes) : items));
        }

        const vars: Record<string, VarValue> = {};
        for (const [name, v] of e.stack.at(-1)!.locals) {
          const shown = varOf(v);
          if (shown !== undefined) vars[name] = shown;
        }

        const state: GraphState = {
          directed: g.directed,
          weighted: g.weighted,
          nodes: g.nodes,
          edges: g.edges,
          nodeMarks,
          edgeMarks,
          annotations,
          badges: {},
          annotationLabel: annotation ? annotated!.name : null,
          pulse: pulseEdge ? { edge: pulseEdge, seq: ++pulses } : null,
          panels,
        };
        return { state, clauses: readClauses(g, fetched, taken), stats: { visited: explored.size, edges: edgesTaken }, vars };
      },
      // At a clean finish nothing is being explored any more; after an error, the node it was exploring stays lit.
      settle: (state, _output, failed) => ({
        ...state,
        nodeMarks: failed ? state.nodeMarks : Object.fromEntries(Object.entries(state.nodeMarks).map(([n, m]) => [n, m === 'key' ? 'visited' : m])),
        edgeMarks: pathEdges,
        pulse: null,
      }),
    },
    options,
  );
}

/** The graph as the view draws it, and how to find an edge's id from either end. */
function graphOf(e: GraphEvent) {
  const ids = e.adjacency.map((row) => row.node);
  const at = e.layout ?? Object.fromEntries(Object.entries(circleLayout(ids)).map(([id, p]) => [id, [p.x, p.y] as [number, number]]));
  const nodes: GraphNode[] = ids.map((id) => ({ id, x: at[id]?.[0] ?? 0, y: at[id]?.[1] ?? 0 }));
  const edges: GraphEdge[] = [];
  const byEnds = new Map<string, EdgeId>();
  for (const { node, neighbours } of e.adjacency) {
    for (const { to, weight } of neighbours) {
      if (byEnds.has(`${node}>${to}`)) continue;
      const id = edgeKey(node, to, e.directed);
      edges.push({ id, from: node, to, weight });
      byEnds.set(`${node}>${to}`, id);
      if (!e.directed) byEnds.set(`${to}>${node}`, id);
    }
  }
  return {
    directed: e.directed,
    weighted: e.weighted,
    nodes,
    edges,
    neighbours: new Map(e.adjacency.map((row) => [row.node, row.neighbours.map((n) => n.to)])),
    edgeId: (from: NodeId, to: NodeId) => byEnds.get(`${from}>${to}`) ?? null,
  };
}

/** Reads the learner's memory in terms of the graph: which values are nodes, and what a container holds. */
class Reader {
  /** The graph's own dict (or object) and its neighbour lists, which are never containers. */
  readonly parts = new Set<string>();
  private found = false;

  constructor(
    private readonly graphName: string,
    private readonly nodes: ReadonlySet<NodeId>,
  ) {}

  node(v: MemValue): NodeId | null {
    const text = unquoted(v);
    return text != null && this.nodes.has(text) ? text : null;
  }

  /** Finds the graph argument in memory, the first time a call holds it under its own name. */
  find(e: Step, heap: Heap) {
    if (this.found) return;
    for (const f of e.stack.slice(1)) {
      const v = f.locals.find(([name]) => name === this.graphName)?.[1];
      const o = v && 'ref' in v ? heap.get(v.ref) : undefined;
      if (!o || (o.kind !== 'dict' && o.kind !== 'object')) continue;
      this.found = true;
      this.parts.add(o.id);
      const values = o.kind === 'dict' ? o.entries.map(([, x]) => x) : o.fields.map(([, x]) => x);
      for (const x of values) if ('ref' in x) this.parts.add(x.ref);
      return;
    }
  }

  /** One entry: a node, a pair holding exactly one node ((dist, node), [node, depth]), or anything else as text. */
  item(v: MemValue, heap: Heap): Item {
    const n = this.node(v);
    if (n) return { node: n, label: n };
    const o = 'ref' in v ? heap.get(v.ref) : undefined;
    if (o && (o.kind === 'tuple' || o.kind === 'list') && o.items.length <= 3 && o.items.every((x) => 'prim' in x)) {
      const inside = o.items.map((x) => this.node(x));
      if (inside.filter(Boolean).length === 1) {
        const k = inside.findIndex(Boolean);
        return { node: inside[k], label: inside[k]!, sub: o.items.filter((_, i) => i !== k).map(text).join(', ') };
      }
    }
    return { node: null, label: text(v) };
  }

  /** A container's entries, and for a dict, each node key's value as text. */
  contents(o: HeapObject, heap: Heap): { items: Item[]; values: Map<NodeId, string> } {
    const values = new Map<NodeId, string>();
    if (o.kind === 'dict' || o.kind === 'object') {
      const entries: [MemValue | string, MemValue][] = o.kind === 'dict' ? o.entries : o.fields;
      const items: Item[] = [];
      for (const [k, v] of entries) {
        const n = typeof k === 'string' ? (this.nodes.has(k) ? k : null) : this.node(k);
        if (!n) continue;
        items.push({ node: n, label: n });
        values.set(n, valueText(v, heap));
      }
      return { items, values };
    }
    if (o.kind === 'function') return { items: [], values };
    return { items: o.items.map((x) => this.item(x, heap)), values };
  }

  /** Whether an object could be a container of nodes (whether it holds any is decided over the run). */
  kindOf(o: HeapObject): Container['kind'] | null {
    if (this.parts.has(o.id)) return null;
    if (o.kind === 'list') return 'seq';
    if (o.kind === 'set') return 'set';
    if (o.kind === 'dict') return 'map';
    // A plain JS object used as a dict ({ A: 0 }); not a class instance.
    if (o.kind === 'object' && o.type === 'Object') return 'map';
    return null;
  }
}

/**
 * Every container of nodes the run's variables ever referred to, in order of
 * first appearance, with what kind of container it behaved as over the whole
 * run, so its look never changes halfway.
 */
function survey(steps: readonly Step[], reader: Reader): Map<string, Container> {
  const found = new Map<string, Container & { front: number; end: number; deque: boolean; holds: boolean }>();
  const last = new Map<string, string[]>();
  for (const e of steps) {
    const heap: Heap = new Map(e.heap.map((o) => [o.id, o]));
    reader.find(e, heap);
    for (const f of e.stack) {
      for (const [name, v] of f.locals) {
        if (!('ref' in v)) continue;
        const o = heap.get(v.ref);
        const kind = o ? reader.kindOf(o) : null;
        if (!o || !kind) continue;
        let c = found.get(o.id);
        if (!c) {
          c = { id: o.id, name, kind, work: null, numeric: false, front: 0, end: 0, deque: o.type === 'deque', holds: false };
          found.set(o.id, c);
        }
        const { items, values } = reader.contents(o, heap);
        if (items.some((x) => x.node)) c.holds = true;
        if ([...values.values()].some((x) => x !== '' && Number.isFinite(Number(x)))) c.numeric = true;
        if (c.kind === 'seq') {
          const now = items.map((x) => `${x.label}|${x.sub ?? ''}`);
          const was = last.get(o.id);
          if (was && now.length < was.length) {
            const tail = was.slice(was.length - now.length);
            const head = was.slice(0, now.length);
            const fromFront = tail.every((x, i) => x === now[i]);
            const fromEnd = head.every((x, i) => x === now[i]);
            if (fromFront && !fromEnd) c.front += 1;
            else if (fromEnd && !fromFront) c.end += 1;
            else if (fromFront && fromEnd) {
              c.front += 0.5;
              c.end += 0.5;
            }
          }
          last.set(o.id, now);
        }
      }
    }
  }
  const out = new Map<string, Container>();
  for (const c of found.values()) {
    if (!c.holds) continue;
    let work: Container['work'] = null;
    if (c.kind === 'seq' && (c.front > 0 || c.end > 0 || c.deque)) {
      work = c.front > c.end ? 'queue' : c.end > c.front ? 'stack' : c.deque || /^q|queue/i.test(c.name) ? 'queue' : 'stack';
    }
    out.set(c.id, { id: c.id, name: c.name, kind: c.kind, work, numeric: c.numeric });
  }
  return out;
}

const order = (containers: ReadonlyMap<string, Container>, id: string) => [...containers.keys()].indexOf(id);

/** A set's items in the graph's node order: a set has no order of its own, so its chips shouldn't jump about. */
function inNodeOrder(items: readonly Item[], nodes: readonly GraphNode[]): Item[] {
  const rank = new Map(nodes.map((n, i) => [n.id, i]));
  const at = (x: Item) => (x.node ? rank.get(x.node)! : nodes.length);
  return [...items].sort((a, b) => at(a) - at(b));
}

function chipsPanel(c: Container, items: readonly Item[]): Panel {
  const count = new Map<string, number>();
  const chips: Chip[] = items.map((item) => {
    const k = count.get(item.label) ?? 0;
    count.set(item.label, k + 1);
    return { id: `${item.label}#${k}`, label: item.label, ...(item.sub && { sub: item.sub }) };
  });
  const ends: [string, string] | undefined = c.work === 'queue' ? ['front', 'back'] : c.work === 'stack' ? ['bottom', 'top'] : undefined;
  return { kind: 'chips', id: c.id, title: c.name, chips, ...(ends && { ends }), empty: 'empty' };
}

function tablePanel(c: Container, values: ReadonlyMap<NodeId, string>): Panel {
  const rows: TableRow[] = [...values].map(([n, v]) => ({ id: n, cells: [n, v] }));
  return { kind: 'table', id: c.id, title: c.name, columns: ['key', 'value'], rows };
}

/** A value as a panel or annotation shows it: strings without quotes, other objects by their contents. */
function valueText(v: MemValue, heap: Heap): string {
  if ('prim' in v) return text(v);
  const o = heap.get(v.ref);
  if (!o) return '…';
  if (o.kind === 'list' || o.kind === 'tuple' || o.kind === 'set') {
    const inner = o.items.map((x) => ('prim' in x ? text(x) : '…'));
    const [open, close] = o.kind === 'tuple' ? ['(', ')'] : o.kind === 'set' ? ['{', '}'] : ['[', ']'];
    return `${open}${inner.join(', ')}${o.more > 0 ? ', …' : ''}${close}`;
  }
  return o.kind === 'function' ? o.name : '{…}';
}

function text(v: MemValue): string {
  if (!('prim' in v)) return '…';
  return unquoted(v) ?? v.prim;
}

/** What a line read of the graph, as clauses: "reads A's neighbours (B, C)", "takes the edge A – B". */
function readClauses(g: ReturnType<typeof graphOf>, fetched: readonly NodeId[], taken: readonly { from: NodeId; to: NodeId; weight: number }[]): string[] {
  const out: string[] = [];
  const distinct = [...new Set(fetched)];
  if (distinct.length > 1 && distinct.length === g.nodes.length) out.push('reads every node’s neighbours');
  else if (distinct.length > 1) out.push(`reads the neighbours of ${listWords(distinct)}`);
  else if (distinct.length === 1) {
    const n = distinct[0];
    const around = g.neighbours.get(n) ?? [];
    out.push(`reads ${n}’s neighbours (${around.length > 0 ? around.join(', ') : 'none'})`);
  }
  const sep = g.directed ? '→' : '–';
  const weight = (w: number) => (g.weighted ? ` (weight ${w})` : '');
  if (taken.length === 1) out.push(`takes the edge ${taken[0].from} ${sep} ${taken[0].to}${weight(taken[0].weight)}`);
  else if (taken.length > 1) {
    const from = new Set(taken.map((t) => t.from));
    out.push(from.size === 1 ? `takes ${taken[0].from}’s edges to ${listWords(taken.map((t) => t.to))}` : `takes ${taken.length} edges`);
  }
  return out;
}

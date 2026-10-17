import type { InputExample, InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import { circleLayout } from '@/viz/graph/layout';
import { edgeKey } from '@/viz/graph/tracer';
import type { EdgeId, Graph, NodeId } from '@/viz/graph/types';

/** What every graph algorithm runs on: a graph with fixed positions, plus an optional source and target. */
export type GraphInput = Graph & { start: NodeId | null; target: NodeId | null };

export const MAX_NODES = 10;
export const MAX_EDGES = 30;
export const MIN_WEIGHT = -99;
export const MAX_WEIGHT = 99;

/** What an algorithm accepts, which decides parsing, formatting and random generation. */
export type GraphRules = {
  /** 'either' accepts both, but one graph can't mix them. */
  direction: 'directed' | 'undirected' | 'either';
  weighted: boolean;
  start: boolean;
  target?: boolean;
  /** Algorithm name for error messages, e.g. "Topological sort". */
  name: string;
};

const collator = new Intl.Collator('en', { numeric: true });
export const byLabel = (a: string, b: string) => collator.compare(a, b);

// ───────────────────────────── adjacency ─────────────────────────────

export type Arc = { to: NodeId; weight: number; edge: EdgeId };

/** Outgoing arcs of every node, neighbours in label order (an undirected edge is an arc both ways). */
export function adjacency(g: Graph, { reversed = false }: { reversed?: boolean } = {}): Map<NodeId, Arc[]> {
  const adj = new Map<NodeId, Arc[]>(g.nodes.map((n) => [n.id, []]));
  for (const e of g.edges) {
    const edge = edgeKey(e.from, e.to, g.directed);
    const [from, to] = reversed ? [e.to, e.from] : [e.from, e.to];
    adj.get(from)!.push({ to, weight: e.weight, edge });
    if (!g.directed) adj.get(to)!.push({ to: from, weight: e.weight, edge });
  }
  for (const arcs of adj.values()) arcs.sort((a, b) => byLabel(a.to, b.to));
  return adj;
}

export const nodeIds = (g: Graph) => g.nodes.map((n) => n.id);

// ───────────────────────────── authoring ─────────────────────────────

/**
 * Builds a hand-placed example. `edges` uses the custom text format, so every
 * example is checked by the same parser learners use; `at` gives each node's
 * position in layout units (roughly px; keep centres 70+ apart).
 */
export function authored(
  rules: GraphRules,
  edges: string,
  at: Record<NodeId, readonly [number, number]>,
): GraphInput {
  const parsed = parseGraph(edges, rules);
  if ('error' in parsed) throw new Error(`Bad example "${edges}": ${parsed.error}`);
  const g = parsed.value;
  for (const n of g.nodes) if (!at[n.id]) throw new Error(`Example "${edges}" has no position for ${n.id}`);
  return { ...g, nodes: g.nodes.map((n) => ({ id: n.id, x: at[n.id][0], y: at[n.id][1] })) };
}

export function fixedExample(id: string, label: string, make: () => GraphInput): InputExample<GraphInput> {
  return { id, label, make: () => make(), sized: false };
}

// ───────────────────────────── random ─────────────────────────────

export const LABELS = 'ABCDEFGHIJ'.split('');

export type RandomOptions = {
  directed: boolean;
  weighted: boolean;
  /** Weight range (inclusive). */
  weights?: readonly [number, number];
  /** Only edges that agree with one hidden random order, so there is no cycle (a DAG). */
  dag?: boolean;
  /** Start from a spanning tree so every node is reachable from A (undirected) or connected (ignoring direction). */
  connected?: boolean;
  /** Extra edges beyond the tree, as a fraction of the node count. */
  extra?: number;
  start?: boolean;
  target?: boolean;
};

/** A reproducible random graph with `size` nodes labelled A, B, C…, placed on a circle. */
export function randomGraph(seed: number, size: number, opts: RandomOptions): GraphInput {
  const rng = createRng(seed);
  const n = Math.max(1, Math.min(MAX_NODES, size));
  const ids = LABELS.slice(0, n);
  const [lo, hi] = opts.weights ?? [1, 9];
  const weight = () => (opts.weighted ? lo + Math.floor(rng() * (hi - lo + 1)) : 1);
  const edges: { from: NodeId; to: NodeId; weight: number }[] = [];
  const has = (a: NodeId, b: NodeId) =>
    edges.some((e) => (e.from === a && e.to === b) || (!opts.directed && e.from === b && e.to === a));
  // A random order decides which way DAG edges point.
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Map(order.map((id, i) => [id, i]));
  const add = (a: NodeId, b: NodeId) => {
    if (a === b) return;
    let [from, to] = [a, b];
    if (opts.dag && rank.get(from)! > rank.get(to)!) [from, to] = [to, from];
    if (has(from, to) || (opts.dag && has(to, from))) return;
    edges.push({ from, to, weight: weight() });
  };

  if (opts.connected !== false) {
    // Random spanning tree: attach each node to an earlier one. Directed trees point away from A, so A reaches everything.
    for (let i = 1; i < n; i++) add(ids[Math.floor(rng() * i)], ids[i]);
  }
  const extra = Math.round(n * (opts.extra ?? 0.6));
  for (let tries = 0, added = 0; added < extra && tries < extra * 10 && edges.length < MAX_EDGES; tries++) {
    const before = edges.length;
    add(ids[Math.floor(rng() * n)], ids[Math.floor(rng() * n)]);
    if (edges.length > before) added++;
  }

  const pos = circleLayout(ids);
  return {
    directed: opts.directed,
    weighted: opts.weighted,
    nodes: ids.map((id) => ({ id, ...pos[id] })),
    edges,
    start: opts.start ? ids[0] : null,
    target: opts.target ? ids[n - 1] : null,
  };
}

// ───────────────────────────── text format ─────────────────────────────

const TOKEN = /^([A-Za-z0-9]{1,3})(?:([->])([A-Za-z0-9]{1,3})(?::([+-]?\d+))?)?$/;

/**
 * Parses "A-B:4, B-C:2, A-C:7 | start A" (undirected) or "A>B:4, …" (directed).
 * A lone label adds an isolated node. Weights are optional (default 1) and
 * ignored by unweighted algorithms. Options after "|": start X, target X.
 */
export function parseGraph(text: string, rules: GraphRules): { value: GraphInput } | { error: string } {
  const [body, ...optionParts] = text.replace(/->|→/g, '>').split('|');
  const normalised = body.replace(/\s*([->:])\s*/g, '$1').trim();
  const tokens = normalised.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return { error: 'Enter at least one edge, e.g. A-B:4, B-C:2.' };

  const seen = new Set<NodeId>();
  const edges: { from: NodeId; to: NodeId; weight: number }[] = [];
  const keys = new Set<string>();
  let kind: '-' | '>' | null = null;
  for (const token of tokens) {
    const m = TOKEN.exec(token);
    if (!m) {
      return {
        error: `"${token}" isn't an edge. Write A-B (or A>B for a directed edge) with an optional weight, like A-B:4. Labels are 1–3 letters or digits.`,
      };
    }
    const [, from, op, to, w] = m;
    seen.add(from);
    if (!op) continue;
    seen.add(to);
    if (kind && op !== kind) return { error: 'Use one kind of edge: all undirected (A-B) or all directed (A>B).' };
    kind = op as '-' | '>';
    if (from === to) return { error: `"${token}" is a self-loop, which this visualiser doesn't draw. Connect two different nodes.` };
    const weight = w == null ? 1 : Number(w);
    if (rules.weighted && (weight < MIN_WEIGHT || weight > MAX_WEIGHT)) {
      return { error: `Weights must be whole numbers from ${MIN_WEIGHT} to ${MAX_WEIGHT}.` };
    }
    const key = op === '>' ? `${from}>${to}` : [from, to].sort().join('-');
    if (keys.has(key)) return { error: `The edge ${from}${op}${to} appears twice.` };
    keys.add(key);
    edges.push({ from, to, weight: rules.weighted ? weight : 1 });
  }

  const directed = kind === '>' || (kind == null && rules.direction === 'directed');
  if (rules.direction === 'directed' && kind === '-') {
    return { error: `${rules.name} needs directed edges: write A>B instead of A-B.` };
  }
  if (rules.direction === 'undirected' && kind === '>') {
    return { error: `${rules.name} works on undirected graphs: write A-B instead of A>B.` };
  }
  if (seen.size > MAX_NODES) return { error: `Use at most ${MAX_NODES} nodes (this has ${seen.size}).` };
  if (edges.length > MAX_EDGES) return { error: `Use at most ${MAX_EDGES} edges (this has ${edges.length}).` };

  const ids = [...seen].sort(byLabel);
  let start: NodeId | null = rules.start ? ids[0] : null;
  let target: NodeId | null = rules.target ? ids[ids.length - 1] : null;
  for (const part of optionParts.flatMap((p) => p.split(',')).map((p) => p.trim()).filter(Boolean)) {
    const opt = /^(start|target)\s+([A-Za-z0-9]{1,3})$/i.exec(part);
    if (!opt) return { error: `Unknown option "${part}". After "|" write start A${rules.target ? ', target E' : ''}.` };
    const name = opt[1].toLowerCase();
    const node = opt[2];
    if (name === 'start' && !rules.start) return { error: `${rules.name} doesn't use a start node; remove "${part}".` };
    if (name === 'target' && !rules.target) return { error: `${rules.name} doesn't use a target node; remove "${part}".` };
    if (!seen.has(node)) return { error: `${name} ${node}: there is no node ${node} in the graph.` };
    if (name === 'start') start = node;
    else target = node;
  }

  const pos = circleLayout(ids);
  return {
    value: {
      directed,
      weighted: rules.weighted,
      nodes: ids.map((id) => ({ id, ...pos[id] })),
      edges,
      start,
      target,
    },
  };
}

/** The canonical text for a graph: edges in order, then isolated nodes, then options. */
export function formatGraph(g: GraphInput, rules: GraphRules): string {
  const op = g.directed ? '>' : '-';
  const used = new Set(g.edges.flatMap((e) => [e.from, e.to]));
  const tokens = [
    ...g.edges.map((e) => `${e.from}${op}${e.to}${rules.weighted ? `:${e.weight}` : ''}`),
    ...g.nodes.filter((n) => !used.has(n.id)).map((n) => n.id),
  ];
  const options = [
    ...(rules.start && g.start != null ? [`start ${g.start}`] : []),
    ...(rules.target && g.target != null ? [`target ${g.target}`] : []),
  ];
  return tokens.join(', ') + (options.length ? ` | ${options.join(', ')}` : '');
}

/** Input spec for a graph algorithm: curated examples first, then the custom text box and a size for random graphs. */
export function graphInput(rules: GraphRules, examples: readonly [InputExample<GraphInput>, ...InputExample<GraphInput>[]]): InputSpec<GraphInput> {
  const op = rules.direction === 'directed' ? '>' : '-';
  const w = (n: number) => (rules.weighted ? `:${n}` : '');
  const opts = [rules.start ? 'start A' : '', rules.target ? 'target D' : ''].filter(Boolean).join(', ');
  return {
    examples,
    size: { label: 'Nodes', min: 3, max: MAX_NODES, default: 7 },
    custom: {
      label: `Your own graph (up to ${MAX_NODES} nodes${rules.direction === 'either' ? '; A>B for directed edges' : ''})`,
      placeholder: `e.g. A${op}B${w(4)}, B${op}C${w(2)}, A${op}C${w(7)}, C${op}D${w(3)}${opts ? ` | ${opts}` : ''}`,
      parse: (text) => parseGraph(text, rules),
      format: (g) => formatGraph(g, rules),
    },
  };
}

// ───────────────────────────── authoring helpers ─────────────────────────────

/**
 * Arranges a multiple-choice question so the answer's position varies but is
 * reproducible. Returns null when there is nothing to choose between.
 */
export function choose(answer: string, distractors: readonly string[], salt: number, max = 4): { choices: string[]; answer: number } | null {
  const others = [...new Set(distractors)].filter((d) => d !== answer).slice(0, max - 1);
  if (others.length === 0) return null;
  let h = salt * 2654435761;
  for (const ch of answer) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  const at = (h >>> 0) % (others.length + 1);
  const choices = [...others.slice(0, at), answer, ...others.slice(at)];
  return { choices, answer: at };
}

/** "∞" for unreached distances. */
export const showDist = (d: number) => (d === Infinity ? '∞' : d === -Infinity ? '−∞' : String(d).replace('-', '−'));

/** Weight as written in a sentence, with a real minus sign. */
export const showW = (w: number) => String(w).replace('-', '−');

/** " + 4" or " − 4": adding a weight, written the way you would say it. */
export const plusW = (w: number) => (w < 0 ? `− ${-w}` : `+ ${w}`);

/** "A → B" or "A – B" for narration. */
export const arrow = (directed: boolean) => (directed ? '→' : '–');

export const list = (ids: readonly string[]) =>
  ids.length <= 1 ? (ids[0] ?? '') : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;

// A tree run (a 'lines' run on a tree argument) on the tree view. Tree nodes
// are the objects in memory with `left` and `right` fields (LeetCode's
// TreeNode, or the learner's own class), labelled by `val` (or value, key,
// data). The shape is redrawn from memory at every step, so a node the code
// makes appears on its own and slides into place once it is linked in.
// Nothing is guessed from names:
// - the current node (key) is the innermost call's tree variable that changed
//   most recently (`node`, `cur`, `root`); none while that variable is None;
// - a paused call's node, or a node held in a list (a stack or queue of
//   nodes), is waiting (frontier), and the calls' nodes draw the path down;
// - a node that was current and no longer is, is done (visited);
// - a node new at this step is marked as written, and a node the innermost
//   call is returning as found.
// Lists the code holds of nodes or plain values (a stack, a queue, the
// result) are drawn as rows under the tree.

import type { LegendEntry, StatSpec } from '@/engine/module';
import type { Trace, VarValue } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import type { NodeId, TableRow, TreeNode, TreeState } from '@/viz/tree/types';
import { traceSteps, type Step, type StepOptions } from './lines';
import type { HeapObject, MemValue, RunResult } from './protocol';
import { unquoted, varOf } from './traceGraph';

type Heap = ReadonlyMap<string, HeapObject>;
type ObjectHeap = Extract<HeapObject, { kind: 'object' }>;

export const TREE_RUN_STATS: readonly StatSpec[] = [
  { key: 'visited', label: 'Nodes visited' },
  { key: 'calls', label: 'Calls' },
  { key: 'steps', label: 'Steps' },
];

export const TREE_RUN_LEGEND: readonly LegendEntry[] = [
  { neutral: 'Not visited yet' },
  { mark: 'key', label: 'Where your code is now' },
  { mark: 'frontier', label: 'Waiting: a paused call’s node, or in a list' },
  { mark: 'visited', label: 'Visited, and left' },
  { mark: 'write', label: 'Just made' },
  { mark: 'found', label: 'Being returned' },
];

/** Most cells a row under the tree shows. */
const ROW_CELLS = 16;
const LABEL_FIELDS = ['val', 'value', 'key', 'data'];

const isTreeNode = (o: HeapObject | undefined): o is ObjectHeap =>
  o?.kind === 'object' && o.fields.some(([k]) => k === 'left') && o.fields.some(([k]) => k === 'right');

const field = (o: ObjectHeap, name: string) => o.fields.find(([k]) => k === name)?.[1];

/** A tree run on the tree view, or null when nothing ran. Each frame is a step, as on the memory view. */
export function traceTree(result: RunResult, options: StepOptions = {}): Trace<TreeState> | null {
  // Per call: names that have held a tree node, and the step each name last changed at.
  const treeNames = new Map<string, Set<string>>();
  const changedAt = new Map<string, Map<string, number>>();
  const wasCurrent = new Set<string>();
  const known = new Set<string>();
  let index = 0;

  return traceSteps(
    result,
    {
      picture: (e, { prev, seen }) => {
        index += 1;
        const heap: Heap = new Map(e.heap.map((o) => [o.id, o]));
        const isNode = (v: MemValue | undefined): v is { ref: string } => v != null && 'ref' in v && isTreeNode(heap.get(v.ref));

        // Each call's current node: its tree variable that changed most recently (null while that is None).
        const nodeOfCall = e.stack.map((f) => {
          const before = prev?.stack.find((p) => p.id === f.id);
          const names = treeNames.get(f.id) ?? new Set<string>();
          treeNames.set(f.id, names);
          const changes = changedAt.get(f.id) ?? new Map<string, number>();
          changedAt.set(f.id, changes);
          let best: { at: number; value: MemValue } | null = null;
          for (const [name, value] of f.locals) {
            if (isNode(value)) names.add(name);
            if (!names.has(name)) continue;
            const old = before?.locals.find(([n]) => n === name)?.[1];
            if (!old || !same(old, value)) changes.set(name, index);
            const at = changes.get(name) ?? index;
            // Ties go to the name bound later: node = root makes node current.
            if (!best || at >= best.at) best = { at, value };
          }
          return best && isNode(best.value) ? best.value.ref : null;
        });
        for (const id of [...treeNames.keys()]) {
          if (!e.stack.some((f) => f.id === id)) {
            treeNames.delete(id);
            changedAt.delete(id);
          }
        }

        const { shape, parent } = shapeOf(e, heap, seen);
        const current = nodeOfCall.at(-1) ?? null;
        const waiting = new Set(nodeOfCall.slice(0, -1).filter((n): n is string => n != null));

        // Lists of nodes or plain values, as rows; their nodes are waiting.
        const table: TableRow[] = [];
        const listed = new Set<string>();
        for (const f of e.stack) {
          for (const [name, v] of f.locals) {
            const o = 'ref' in v ? heap.get(v.ref) : undefined;
            if (!o || listed.has(o.id) || !(o.kind === 'list' || o.kind === 'set')) continue;
            if (!o.items.every((x) => 'prim' in x || isNode(x))) continue;
            listed.add(o.id);
            const cells = o.items.slice(0, ROW_CELLS).map((x, k) => {
              const cell = { id: `${o.id}:${k}`, label: isNode(x) ? labelOf(heap.get(x.ref) as ObjectHeap) : text(x) };
              if (isNode(x)) waiting.add(x.ref);
              return isNode(x) ? { ...cell, node: x.ref } : cell;
            });
            if (o.items.length > ROW_CELLS || o.more > 0) cells.push({ id: `${o.id}:more`, label: '…' });
            table.push({ id: o.id, label: name, cells });
          }
        }

        const marks: Record<string, MarkKey> = {};
        for (const id of Object.keys(shape.nodes)) {
          if (id === current) marks[id] = 'key';
          else if (waiting.has(id)) marks[id] = 'frontier';
          // New after the first tree appeared: the argument's nodes all arrive with the call.
          else if (!known.has(id) && known.size > 0) marks[id] = 'write';
          else if (wasCurrent.has(id)) marks[id] = 'visited';
        }
        const returning = e.event === 'return' ? e.stack.at(-1)!.returning : undefined;
        if (isNode(returning)) marks[returning.ref] = 'found';
        if (current) wasCurrent.add(current);
        for (const id of Object.keys(shape.nodes)) known.add(id);

        // The path down through the calls' nodes, where each is the last one's child.
        const path = nodeOfCall.filter((n): n is string => n != null);
        const pathEdges = path.filter((id, k) => k > 0 && parent.get(id) === path[k - 1]);

        const vars: Record<string, VarValue> = {};
        for (const [name, v] of e.stack.at(-1)!.locals) {
          const shown = varOf(v);
          if (shown !== undefined) vars[name] = shown;
        }

        const state: TreeState = {
          ...shape,
          ...(table.length > 0 && { table }),
          marks,
          pathEdges,
          probe: null,
          output: null,
          description: describe(shape, marks),
          emptyLabel: 'No tree nodes in memory yet.',
        };
        return { state, stats: { visited: wasCurrent.size }, vars };
      },
      // At a clean finish nothing is current or new any more; after an error, the node it was at stays lit.
      settle: (state, _output, failed) => {
        if (failed) return state;
        const marks: Record<string, MarkKey> = {};
        for (const [id, m] of Object.entries(state.marks)) if (m !== 'write') marks[id] = m === 'key' || m === 'found' ? 'visited' : m;
        return { ...state, marks, pathEdges: [], description: describe({ roots: state.roots ?? [], nodes: state.nodes }, marks) };
      },
    },
    options,
  );
}

/**
 * The tree nodes in memory as a forest, oldest root first, and each node's
 * parent. A node two parents point at keeps the first (a cycle or a shared
 * node is a bug the learner should see as a missing edge, not a crash).
 */
function shapeOf(e: Step, heap: Heap, seen: ReadonlyMap<string, number>) {
  // Oldest first, so the argument's root stays the first tree and a node made later sits beside it.
  const tree = e.heap.filter(isTreeNode).sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0));
  const childRefs = new Set<string>();
  for (const o of tree) {
    for (const side of ['left', 'right']) {
      const v = field(o, side);
      if (v && 'ref' in v && isTreeNode(heap.get(v.ref))) childRefs.add(v.ref);
    }
  }
  const nodes: Record<NodeId, TreeNode> = {};
  const parent = new Map<NodeId, NodeId>();
  const roots: NodeId[] = [];
  const place = (id: string) => {
    const stack = [id];
    nodes[id] = blank(heap.get(id) as ObjectHeap);
    while (stack.length > 0) {
      const at = stack.pop()!;
      const o = heap.get(at) as ObjectHeap;
      const children = ['left', 'right'].map((side) => {
        const v = field(o, side);
        if (!v || !('ref' in v) || !isTreeNode(heap.get(v.ref)) || nodes[v.ref]) return null;
        nodes[v.ref] = blank(heap.get(v.ref) as ObjectHeap);
        parent.set(v.ref, at);
        stack.push(v.ref);
        return v.ref;
      });
      nodes[at] = { ...nodes[at], children: children.some(Boolean) ? children : [] };
    }
  };
  for (const o of tree) {
    if (childRefs.has(o.id) || nodes[o.id]) continue;
    roots.push(o.id);
    place(o.id);
  }
  // Nodes only reachable round a cycle: start from the first of them.
  for (const o of tree) {
    if (nodes[o.id]) continue;
    roots.push(o.id);
    place(o.id);
  }
  return { shape: { root: roots[0] ?? null, roots, nodes, strip: null }, parent };
}

function blank(o: ObjectHeap): TreeNode {
  return { shape: 'round', cells: [{ id: `${o.id}:v`, label: labelOf(o) }], children: [] };
}

function labelOf(o: ObjectHeap): string {
  const named = LABEL_FIELDS.map((k) => field(o, k)).find((v) => v != null);
  const v = named ?? o.fields.map(([, x]) => x).find((x) => 'prim' in x);
  return v ? text(v) : '•';
}

function text(v: MemValue): string {
  if (!('prim' in v)) return '…';
  return unquoted(v) ?? v.prim;
}

const same = (a: MemValue, b: MemValue) => ('prim' in a ? 'prim' in b && a.prim === b.prim : 'ref' in b && a.ref === b.ref);

/** What a screen reader hears: the tree level by level, then what is highlighted. */
function describe(shape: { roots: readonly NodeId[]; nodes: Readonly<Record<NodeId, TreeNode>> }, marks: Readonly<Record<string, MarkKey>>): string {
  const label = (id: NodeId) => shape.nodes[id].cells[0]?.label ?? '•';
  const count = Object.keys(shape.nodes).length;
  if (count === 0) return 'No tree nodes in memory yet.';
  const order: NodeId[] = [];
  const queue = [...shape.roots];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const c of shape.nodes[id].children) if (c) queue.push(c);
  }
  const trees = shape.roots.length === 1 ? 'A tree' : `${shape.roots.length} separate trees`;
  const parts = [`${trees} of ${count} node${count === 1 ? '' : 's'}, level by level: ${order.map(label).join(', ')}.`];
  const named = (mark: MarkKey) => Object.keys(marks).filter((id) => marks[id] === mark && shape.nodes[id]).map(label);
  const current = named('key');
  if (current.length > 0) parts.push(`Current node: ${current.join(', ')}.`);
  const waiting = named('frontier');
  if (waiting.length > 0) parts.push(`Waiting: ${waiting.join(', ')}.`);
  const made = named('write');
  if (made.length > 0) parts.push(`Just made: ${made.join(', ')}.`);
  const returned = named('found');
  if (returned.length > 0) parts.push(`Being returned: ${returned.join(', ')}.`);
  return parts.join(' ');
}

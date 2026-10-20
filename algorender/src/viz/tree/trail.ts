import type { NodeId, TreeState } from './types';

/** One decision on the way down: "45 < 50 ← left". The node being compared now has no decision yet: "45 vs 40". */
export type TrailStep = { id: NodeId; text: string; current: boolean };

/**
 * The decision trail beside a search (V3), read from the frame: the probe's
 * key, where it is, and the keys on the way down to it. One step per node
 * passed, saying which way the key sent the walk; the node it is at now shows
 * the comparison only, so a Predict question about it isn't answered early.
 *
 * Only for walks that follow search-tree order (a binary search tree, an AVL
 * tree, a B-tree). Returns null when there is no numeric probe or when a step
 * doesn't match the comparison, e.g. a deletion's walk to the successor.
 */
export function decisionTrail(state: TreeState): TrailStep[] | null {
  const probe = state.probe;
  if (!probe || state.search) return null;
  const key = Number(probe.label);
  if (!Number.isFinite(key) || !state.nodes[probe.at]) return null;

  const parent = new Map<NodeId, NodeId>();
  for (const [id, node] of Object.entries(state.nodes)) for (const c of node.children) if (c != null) parent.set(c, id);
  const path: NodeId[] = [probe.at];
  for (let p = parent.get(probe.at); p != null; p = parent.get(p)) path.unshift(p);

  const keysOf = (id: NodeId) => state.nodes[id].cells.map((c) => Number(c.label));
  const steps: TrailStep[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const node = state.nodes[path[i]];
    const keys = keysOf(path[i]);
    if (keys.length === 0 || keys.some((k) => !Number.isFinite(k))) return null;
    const slot = node.children.indexOf(path[i + 1]);
    const text = node.shape === 'box' ? boxStep(key, keys, slot) : roundStep(key, keys[0], slot, node.children.length);
    if (!text) return null;
    steps.push({ id: path[i], text, current: false });
  }
  const here = keysOf(probe.at);
  if (here.length === 0 || here.some((k) => !Number.isFinite(k))) return null;
  steps.push({ id: probe.at, text: here.length === 1 ? `${key} vs ${here[0]}` : `${key} vs ${here.join(' · ')}`, current: true });
  return steps;
}

/** A binary node: smaller goes left, larger goes right. Null when the walk went the other way. */
function roundStep(key: number, nodeKey: number, slot: number, slots: number): string | null {
  if (slots !== 2) return null;
  if (key < nodeKey && slot === 0) return `${key} < ${nodeKey} ← left`;
  if (key > nodeKey && slot === 1) return `${key} > ${nodeKey} → right`;
  return null;
}

/** A B-tree node: the child between the two keys the search key falls between. */
function boxStep(key: number, keys: readonly number[], slot: number): string | null {
  const expected = keys.filter((k) => k < key).length;
  if (slot !== expected || keys.includes(key)) return null;
  if (slot === 0) return `${key} < ${keys[0]} ↓ child 1`;
  if (slot === keys.length) return `${key} > ${keys.at(-1)} ↓ child ${slot + 1}`;
  return `${keys[slot - 1]} < ${key} < ${keys[slot]} ↓ child ${slot + 1}`;
}

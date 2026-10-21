import type { StatSpec } from '@/engine/module';
import type { Chip, Graph, Mark, NodeId, Region, RegionTone } from '@/viz/graph/types';
import { adjacency } from './model';

/**
 * True single-source distances by plain Bellman–Ford, or null when a negative
 * cycle is reachable. Used to tell the learner when Dijkstra got it wrong.
 */
export function trueDistances(g: Graph, s: NodeId): Map<NodeId, number> | null {
  const dist = new Map(g.nodes.map((n) => [n.id, Infinity]));
  dist.set(s, 0);
  const adj = adjacency(g);
  const relaxAll = () => {
    let changed = false;
    for (const [u, arcs] of adj) {
      for (const { to, weight } of arcs) {
        if (dist.get(u)! + weight < dist.get(to)!) {
          dist.set(to, dist.get(u)! + weight);
          changed = true;
        }
      }
    }
    return changed;
  };
  for (let i = 0; i < g.nodes.length - 1; i++) if (!relaxAll()) break;
  return relaxAll() ? null : dist;
}

export const VISITED: StatSpec = { key: 'visited', label: 'Nodes visited' };
export const EDGES: StatSpec = { key: 'edges', label: 'Edges examined' };
export const RELAXATIONS: StatSpec = { key: 'relaxations', label: 'Relaxations' };

/** A binary min-heap: O(log n) push and pop. Dijkstra and Prim use it as their priority queue. */
export class MinHeap<T> {
  private readonly a: T[] = [];
  constructor(private readonly less: (x: T, y: T) => boolean) {}

  get size() {
    return this.a.length;
  }

  /** Contents, smallest first (for display; the heap itself is only partially ordered). */
  sorted(): T[] {
    return [...this.a].sort((x, y) => (this.less(x, y) ? -1 : this.less(y, x) ? 1 : 0));
  }

  push(x: T) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Chips for a list of nodes, each with an optional value and mark. */
export function nodeChips(
  ids: readonly NodeId[],
  opts: { sub?: (id: NodeId) => string | undefined; mark?: (id: NodeId, index: number) => Mark | undefined; key?: (id: NodeId, index: number) => string } = {},
): Chip[] {
  return ids.map((id, i) => ({
    id: opts.key ? opts.key(id, i) : id,
    label: id,
    ...(opts.sub?.(id) != null && { sub: opts.sub(id) }),
    ...(opts.mark?.(id, i) && { mark: opts.mark(id, i) }),
  }));
}

/** Tints for neighbouring regions, in turn, so two next to each other differ. */
const REGION_TONES: readonly RegionTone[] = ['sky', 'mint', 'butter', 'lilac', 'peach', 'teal', 'rose'];

/** BFS levels as regions behind the graph (V4): every node at one distance from the start in one soft band. */
export function levelRegions(level: ReadonlyMap<NodeId, number>): Region[] {
  const byLevel = new Map<number, NodeId[]>();
  for (const [id, k] of level) byLevel.set(k, [...(byLevel.get(k) ?? []), id]);
  return [...byLevel].sort(([a], [b]) => a - b).map(([k, members]) => ({ id: `level-${k}`, label: `level ${k}`, members, tone: REGION_TONES[k % REGION_TONES.length] }));
}

/** Strongly connected components as regions, named S1, S2… as in the components panel. */
export function componentRegions(components: readonly (readonly NodeId[])[]): Region[] {
  return components.map((members, i) => ({ id: `S${i + 1}`, label: `S${i + 1}`, members, tone: REGION_TONES[i % REGION_TONES.length] }));
}

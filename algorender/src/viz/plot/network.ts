import type { NetNode } from './types';

/**
 * Positions for a layered diagram: each inner array is one column, left to
 * right, its ids spread evenly top to bottom and centred on the tallest
 * column. Returns x and y per id, in NetworkView's layout units.
 */
export function layered(columns: readonly (readonly string[])[], { dx = 120, dy = 64 } = {}): Map<string, Pick<NetNode, 'x' | 'y'>> {
  const tallest = Math.max(...columns.map((c) => c.length));
  const at = new Map<string, Pick<NetNode, 'x' | 'y'>>();
  columns.forEach((column, c) => {
    const offset = ((tallest - column.length) * dy) / 2;
    column.forEach((id, r) => at.set(id, { x: c * dx, y: offset + r * dy }));
  });
  return at;
}

/**
 * Columns for a computation graph given each node's inputs: a node sits one
 * column right of its deepest input, so every arrow points right.
 */
export function depthColumns(inputs: ReadonlyMap<string, readonly string[]>, order: readonly string[]): string[][] {
  const depth = new Map<string, number>();
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const d = Math.max(-1, ...(inputs.get(id) ?? []).map(visit)) + 1;
    depth.set(id, d);
    return d;
  };
  order.forEach(visit);
  const columns: string[][] = [];
  for (const id of order) (columns[depth.get(id)!] ??= []).push(id);
  return columns;
}

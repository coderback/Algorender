import type { ViewKind } from '@/engine/module';
import type { ArrayState } from './array/types';
import type { GraphState } from './graph/types';
import type { GridState } from './grid/types';
import type { HashState } from './hash/types';
import type { LinearState } from './linear/types';
import type { MemoryState } from './memory/types';
import type { PlotPart, PlotState } from './plot/types';
import type { TextState } from './text/types';
import type { TreeState } from './tree/types';

/**
 * The stage's caption (V0): what the view holds and its size, in a few words,
 * e.g. "Graph · 6 nodes · weighted, undirected". It sits above the stage well
 * and names it for screen readers, so it is read from the frame's state alone.
 */
export function stageCaption(view: ViewKind, state: unknown): string {
  switch (view) {
    case 'array':
      return arrayCaption(state as ArrayState);
    case 'graph':
      return graphCaption(state as GraphState);
    case 'tree':
      return treeCaption(state as TreeState);
    case 'linear':
      return linearCaption(state as LinearState);
    case 'hash':
      return hashCaption(state as HashState);
    case 'grid':
      return gridCaption(state as GridState);
    case 'text':
      return textCaption(state as TextState);
    case 'memory':
      return memoryCaption(state as MemoryState);
    case 'plot':
      return plotCaption(state as PlotState);
  }
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function arrayCaption(s: ArrayState): string {
  // The array is the longest lane; the others are buffers, a key or a target.
  const size = Math.max(0, ...s.lanes.map((l) => l.slots.length));
  return `Array · ${count(size, 'value')}`;
}

function graphCaption(s: GraphState): string {
  const kind = [s.weighted && 'weighted', s.directed ? 'directed' : 'undirected'].filter(Boolean).join(', ');
  return `Graph · ${count(s.nodes.length, 'node')} · ${kind}`;
}

function treeCaption(s: TreeState): string {
  const n = Object.keys(s.nodes).length;
  if (s.search) return `Call tree · ${count(n, 'call')}`;
  if (n === 0) return 'Tree · empty';
  if (s.roots && s.roots.length > 1) return `Forest · ${count(s.roots.length, 'tree')} · ${count(n, 'node')}`;
  return `Tree · ${count(n, 'node')}`;
}

const SLOT_NAME = { array: 'Dynamic array', stack: 'Stack', queue: 'Queue', deque: 'Deque' } as const;

function linearCaption(s: LinearState): string {
  if (s.layout === 'list') return `Linked list · ${count(Object.keys(s.nodes).length, 'node')}`;
  const row = s.rows[0];
  const used = row ? row.slots.filter((id) => id != null).length : 0;
  const name = s.ring ? `${SLOT_NAME[s.layout]} · ring buffer` : SLOT_NAME[s.layout];
  return `${name} · ${used} of ${count(row?.slots.length ?? 0, 'slot')} used`;
}

function hashCaption(s: HashState): string {
  if (s.type === 'bloom') return `Bloom filter · ${count(s.bits.length, 'bit')} · k = ${s.k}`;
  const tables = s.tables.length > 1 ? ` · ${s.tables.length} tables` : '';
  return `Hash table · ${count(s.size, 'key')} · ${count(s.buckets, 'bucket')}${tables}`;
}

const LOOK_NAME = { table: 'Table', board: 'Board', timeline: 'Timeline' } as const;

function gridCaption(s: GridState): string {
  const tables = s.parts.filter((p) => p.kind === 'table');
  const first = tables[0];
  if (!first) return s.parts.some((p) => p.kind === 'meter') ? 'Meters' : 'Lists';
  const size = first.look === 'timeline' ? count(first.rows.length, 'row') : `${first.rows.length} × ${first.cols.length}`;
  const more = tables.length > 1 ? ` · ${tables.length} tables` : '';
  return `${LOOK_NAME[first.look]} · ${size}${more}`;
}

function textCaption(s: TextState): string {
  const [text, pattern] = s.rows.filter((r) => r.kind === 'chars');
  if (!text) return `Numbers · ${count(s.rows[0]?.cells.length ?? 0, 'value')}`;
  const p = pattern ? ` · pattern of ${pattern.cells.length}` : '';
  return `Text · ${count(text.cells.length, 'character')}${p}`;
}

function memoryCaption(s: MemoryState): string {
  return `Memory · ${count(s.frames.length, 'frame')} · ${count(s.heap.length, 'object')}`;
}

/** A plot part as a noun: its labels are sentences, so the caption names the kind of drawing instead. */
function plotNoun(p: PlotPart): string | null {
  switch (p.kind) {
    case 'plane':
      return p.equal === false ? 'chart' : 'plane';
    case 'image':
      return `${p.width} × ${p.height} image`;
    case 'network':
      return `network of ${count(p.nodes.length, 'node')}`;
    case 'bits':
      return count(p.bits.length, 'bit');
    case 'tokens':
      return count(p.tokens.length, 'token');
    default:
      // Matrices and readouts sit beside the drawing; they don't name the stage.
      return null;
  }
}

function plotCaption(s: PlotState): string {
  const nouns: string[] = [];
  const times = new Map<string, number>();
  // A second row of tokens (the next round, the cache) belongs to the first; the caption names it once.
  const parts = s.parts.filter((p, i) => p.kind !== 'tokens' || s.parts.findIndex((q) => q.kind === 'tokens') === i);
  for (const noun of parts.map(plotNoun)) {
    if (!noun) continue;
    if (!times.has(noun)) nouns.push(noun);
    times.set(noun, (times.get(noun) ?? 0) + 1);
  }
  // Two charts read "2 charts"; counted nouns ("12 tokens") stay as they are.
  const words = nouns.map((n) => (times.get(n)! > 1 && /^[a-z]/.test(n) ? `${times.get(n)} ${n}s` : n));
  const text = words.length ? words.join(' · ') : 'plot';
  return text[0].toUpperCase() + text.slice(1);
}

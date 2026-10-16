import type { MemValue } from '@/workspace/protocol';
import { extendOrder, NO_ORDER, orderHeap, type SeenOrder } from './order';
import type { MemoryState } from './types';

// Plain-text descriptions of a memory diagram for screen readers (rendered
// sr-only in each panel; the drawing is aria-hidden). Object ids mean nothing
// to people, so objects are named by type and order of appearance ("list 1",
// "dict 2", "Point 3"), and functions by their names ("function add").

/**
 * A spoken name for every object in the heap. Pass the view's `seen` order so
 * names stay put across steps; without it, objects are numbered in heap order.
 */
export function objectNames(heap: MemoryState['heap'], seen: SeenOrder = NO_ORDER): Map<string, string> {
  const order = extendOrder(seen, heap);
  const number = new Map(order.numbered.map((id, i) => [id, i + 1]));
  const fnNames = heap.flatMap((h) => (h.object.kind === 'function' ? [h.object.name] : []));
  const repeats = new Map<string, number>();
  const names = new Map<string, string>();
  for (const { object: o } of orderHeap(heap, order)) {
    if (o.kind !== 'function') {
      names.set(o.id, `${o.type} ${number.get(o.id)}`);
      continue;
    }
    // Two functions with one name (two lambdas, say) get a count to tell them apart.
    const k = (repeats.get(o.name) ?? 0) + 1;
    repeats.set(o.name, k);
    names.set(o.id, fnNames.filter((n) => n === o.name).length > 1 ? `${o.type} ${o.name} ${k}` : `${o.type} ${o.name}`);
  }
  return names;
}

/** A value as words: a primitive as the language prints it, a reference by the object's name. */
function valueText(v: MemValue, names: Map<string, string>): string {
  return 'ref' in v ? (names.get(v.ref) ?? 'an object not shown') : v.prim;
}

function binding(name: string, v: MemValue, names: Map<string, string>): string {
  return `${name} ${'ref' in v ? 'refers to' : 'is'} ${valueText(v, names)}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The call stack, outermost first: "Global frame: nums refers to list 1. add, the current frame: a is 2, b is 3." */
export function describeFrames(state: MemoryState, seen?: SeenOrder): string {
  if (state.frames.length === 0) return 'No frames.';
  const names = objectNames(state.heap, seen);
  const calls = new Map<string, number>();
  for (const f of state.frames) calls.set(f.fn, (calls.get(f.fn) ?? 0) + 1);
  const nth = new Map<string, number>();
  return state.frames
    .map((f) => {
      const k = (nth.get(f.fn) ?? 0) + 1;
      nth.set(f.fn, k);
      // Recursion puts one function on the stack several times: number its calls, outermost first.
      const about = [calls.get(f.fn)! > 1 ? `${f.fn} (call ${k})` : f.fn];
      if (f.active) about.push('the current frame');
      if (f.returning) about.push(`returning ${valueText(f.returning, names)}`);
      const locals = f.locals.map((l) => `${binding(l.name, l.value, names)}${l.changed ? ' (changed)' : ''}`);
      return `${about.join(', ')}: ${locals.join(', ') || 'no names yet'}.`;
    })
    .join(' ');
}

/** Every object, in order of appearance: "Function add. List 1 holds 3, 1, 2." */
export function describeObjects(state: MemoryState, seen?: SeenOrder): string {
  const order = extendOrder(seen ?? NO_ORDER, state.heap);
  const names = objectNames(state.heap, order);
  const sentences = orderHeap(state.heap, order).map(({ object: o, fresh, changed }) => {
    const name = `${capital(names.get(o.id)!)}${fresh ? ' (new)' : changed ? ' (changed)' : ''}`;
    if (o.kind === 'function') return `${name}.`;
    const more = o.more > 0 ? `, and ${o.more} more` : '';
    if (o.kind === 'dict') {
      if (o.entries.length === 0) return o.more > 0 ? `${name} holds ${o.more} entries not shown.` : `${name} is empty.`;
      return `${name} maps ${o.entries.map(([k, v]) => `${valueText(k, names)} to ${valueText(v, names)}`).join(', ')}${more}.`;
    }
    if (o.kind === 'object') {
      if (o.fields.length === 0) return o.more > 0 ? `${name} has ${o.more} fields not shown.` : `${name} has no fields.`;
      return `${name}: ${o.fields.map(([f, v]) => binding(f, v, names)).join(', ')}${more}.`;
    }
    if (o.items.length === 0) return o.more > 0 ? `${name} holds ${o.more} items not shown.` : `${name} is empty.`;
    return `${name} holds ${o.items.map((v) => valueText(v, names)).join(', ')}${more}.`;
  });
  return sentences.join(' ') || 'No objects.';
}

/**
 * The whole picture in words, frames then objects: "Global frame: nums refers
 * to list 1, total is 5. add, the current frame: a is 2, b is 3. List 1 holds
 * 3, 1, 2." Printed output is left out: the view shows it as text.
 */
export function describeMemory(state: MemoryState, seen?: SeenOrder): string {
  return `${describeFrames(state, seen)} ${describeObjects(state, seen)}`;
}

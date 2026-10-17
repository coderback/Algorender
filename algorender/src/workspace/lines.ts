// A 'lines' run (memory at every line) as a trace: a frame per step, narrated
// by what the line that ran did. The memory view draws memory itself
// (traceLines); the graph and tree views draw a structure from the same steps
// (traceGraph.ts, traceTree.ts) and add what memory alone can't show, such as
// the edges the code took.

import type { Frame, Trace, VarValue } from '@/engine/types';
import type { MemoryState } from '@/viz/memory/types';
import type { HeapObject, Json, MemValue, RunEvent, RunResult, StackFrame } from './protocol';

export type Step = Extract<RunEvent, { kind: 'step' }>;

/** What a view sees at a step. */
export type StepContext = {
  /** The step before, or null at the first. */
  prev: Step | null;
  /** Events since the step before, other than prints, in order (a graph's reads). */
  between: readonly RunEvent[];
  /** Everything printed so far: the same array as at the step before when nothing new was printed. */
  output: string[];
  /** Every object seen so far, this step's included, in order of first appearance. */
  seen: ReadonlyMap<string, number>;
};

/** What a view makes of a step. */
export type StepPicture<S> = {
  state: S;
  /** What the line did that memory doesn't show ("follows the edge A – B"), said before its changes to memory. */
  clauses?: readonly string[];
  /** Running totals beyond steps and calls. */
  stats?: Record<string, number>;
  vars?: Record<string, VarValue>;
};

export type StepView<S> = {
  picture: (e: Step, context: StepContext) => StepPicture<S>;
  /** The closing frame's state, with nothing flagged as just changed; \`failed\` when the run ended in an error. */
  settle: (state: S, output: string[], failed: boolean) => S;
};

export type StepOptions = {
  /** Frames kept before the trace is cut short (the run itself may have gone further). */
  maxFrames?: number;
  /** The code that ran: narration quotes the condition an if or while line tested. */
  code?: string;
};

/**
 * A 'lines' run on some view, or null when nothing ran: a frame per step,
 * showing the view just before the highlighted line runs, narrated by what
 * changed since the step before (what the line that ran did, a call, a
 * return, an exception). The last frame says how the run ended.
 */
export function traceSteps<S>(result: RunResult, view: StepView<S>, { maxFrames = 3_000, code = '' }: StepOptions = {}): Trace<S> | null {
  const last = result.events.findLast((e): e is Step => e.kind === 'step');
  if (!last) return null;

  const frames: Frame<S>[] = [];
  let truncated = false;
  const output: string[] = [];
  let shown: string[] = [];
  let printedSince: string[] = [];
  let between: RunEvent[] = [];
  let prev: Step | null = null;
  // Every object seen so far, in order of first appearance: the memory view keeps that order, so boxes stay put.
  const seen = new Map<string, number>();
  const calls = new Set<string>();
  let steps = 0;
  const source = code.split('\n');

  for (const e of result.events) {
    if (e.kind === 'print') {
      output.push(e.text);
      printedSince.push(e.text);
      continue;
    }
    if (e.kind !== 'step') {
      between.push(e);
      continue;
    }
    if (frames.length >= maxFrames) {
      truncated = true;
      break;
    }
    steps += 1;
    for (const f of e.stack.slice(1)) calls.add(f.id);
    const before = new Map(seen);
    for (const o of e.heap) if (!seen.has(o.id)) seen.set(o.id, seen.size);
    if (printedSince.length > 0 || frames.length === 0) shown = [...output];
    const picture = view.picture(e, { prev, between, output: shown, seen });
    const note = narrate(prev, e, printedSince, before, source, picture.clauses ?? []);
    frames.push({ state: picture.state, line: e.line - 1, note, vars: picture.vars ?? {}, stats: { steps, calls: calls.size, ...picture.stats } });
    prev = e;
    printedSince = [];
    between = [];
  }

  // Prints after the last step shown (a run cut short mid-line) still belong in the output.
  const end = frames.at(-1)!;
  const state = view.settle(end.state, printedSince.length > 0 ? [...output] : shown, result.error != null);
  if (result.error) {
    const where = result.error.line == null ? '' : `Line ${result.error.line}: `;
    frames.push({ ...end, state, line: result.error.line == null ? null : result.error.line - 1, note: `${where}${result.error.message}`, checkpoint: undefined });
  } else {
    // The run ended inside the entry function (its return), or at the end of the top level.
    const returned = result.returned == null ? '' : ` and returned ${jsonText(result.returned)}`;
    const note = last.stack.length > 1 ? `Your function finished${returned}.` : 'The program finished.';
    frames.push({ ...end, state, line: null, note, checkpoint: undefined });
  }
  return { frames, truncated: truncated || result.error?.kind === 'limit' };
}

/**
 * A 'lines' run for the memory view, or null when nothing ran. Names and
 * objects that changed since the step before are flagged; prints accumulate
 * in `output`.
 */
export function traceLines(result: RunResult, options: StepOptions = {}): Trace<MemoryState> | null {
  return traceSteps(result, { picture: (e, { prev, output, seen }) => ({ state: memoryState(e, prev, output, seen) }), settle: settled }, options);
}

export const sameValue = (a: MemValue, b: MemValue): boolean =>
  'prim' in a ? 'prim' in b && a.prim === b.prim && a.type === b.type : 'ref' in b && a.ref === b.ref;

/** Memory at a step, with what changed since the step before flagged. */
function memoryState(e: Step, prev: Step | null, output: string[], seen: ReadonlyMap<string, number>): MemoryState {
  const framesBefore = new Map((prev?.stack ?? []).map((f) => [f.id, f]));
  const objectsBefore = new Map((prev?.heap ?? []).map((o) => [o.id, o]));
  const frames = e.stack.map((f, k): MemoryState['frames'][number] => {
    const was = framesBefore.get(f.id);
    const locals = f.locals.map(([name, value]) => {
      const old = was?.locals.find(([n]) => n === name)?.[1];
      return { name, value, changed: prev != null && !(old && sameValue(old, value)) };
    });
    const frame: MemoryState['frames'][number] = { id: f.id, fn: f.fn, locals, active: k === e.stack.length - 1 };
    if (f.returning) frame.returning = f.returning;
    return frame;
  });
  const heap = [...e.heap]
    .sort((a, b) => seen.get(a.id)! - seen.get(b.id)!)
    .map((object) => {
      const old = objectsBefore.get(object.id);
      return { object, changed: old != null && JSON.stringify(old) !== JSON.stringify(object), fresh: prev != null && old == null };
    });
  return { frames, heap, output };
}

/** The same memory with nothing flagged as just changed, for the closing frame. */
function settled(state: MemoryState, output: string[]): MemoryState {
  return {
    frames: state.frames.map((f) => ({ ...f, locals: f.locals.map((l) => ({ ...l, changed: false })) })),
    heap: state.heap.map((h) => ({ ...h, changed: false, fresh: false })),
    output,
  };
}

/** At most this many changes are named in one note; the rest are counted. */
const NAMED_CHANGES = 3;

/**
 * One sentence on what happened between the step before and this one.
 * \`extra\` is what the line did beyond memory (a view's clauses), said first.
 */
function narrate(
  prev: Step | null,
  e: Step,
  prints: readonly string[],
  seen: ReadonlyMap<string, number>,
  source: readonly string[],
  extra: readonly string[] = [],
): string {
  const top = e.stack.at(-1)!;
  if (!prev) return `The program starts at line ${e.line}.`;
  const heap = new Map(e.heap.map((o) => [o.id, o]));
  const was = prev.stack.find((f) => f.id === top.id);

  if (e.event === 'exception') {
    const passedUp = prev.event === 'exception' && !e.stack.some((f) => f.id === prev.stack.at(-1)!.id);
    if (!passedUp) return `Line ${e.line} raises ${e.message ?? 'an error'}.`;
    const where = e.stack.length === 1 ? 'the top-level code' : top.fn;
    return `The ${errorName(prev.message)} isn't caught in ${prev.stack.at(-1)!.fn}, so it passes up to line ${e.line} in ${where}.`;
  }
  if (e.event === 'return' && top.returning) {
    const returns = `${top.fn} returns ${memText(top.returning, heap, e.stack.at(-2))}`;
    // A function that falls off its end after changing something: say both.
    const did = [...extra, ...(was && prev.event === 'line' ? changes(prev, e, was, top, heap, seen) : [])];
    return did.length === 0 ? `${returns}.` : `Line ${was?.line ?? e.line} ${listWords(did.slice(0, NAMED_CHANGES - 1))}, and ${returns}.`;
  }
  if (!was) {
    // A frame that wasn't there: a call, from the frame under it (or, after the top level ended, the entry call).
    const caller = e.stack.at(-2)!;
    const call = `${top.fn}(${top.locals.map(([, v]) => memText(v, heap, caller)).join(', ')})`;
    if (prev.event === 'return' && prev.stack.length === 1) return `Your function is called: ${call}.`;
    return `Line ${caller.line} ${listWords([...extra, `calls ${call}`])}.`;
  }
  if (prev.event === 'exception') return `The ${errorName(prev.message)} is caught, so line ${e.line} runs next.`;

  // The line that ran is the one this frame was on at the step before.
  const ran = was.line;
  const clauses = [...extra, ...changes(prev, e, was, top, heap, seen), ...prints.map((text) => `prints “${text}”`)];
  if (clauses.length === 0) {
    if (e.event === 'return') return `Line ${ran} runs.`;
    const tested = e.line !== ran ? testedCondition(source[ran - 1]) : null;
    // The body starts on the next line, so going there means the test passed.
    if (tested) return e.line === ran + 1 ? `Line ${ran}: ${tested}? Yes, so line ${e.line} runs next.` : `Line ${ran}: ${tested}? No, so line ${e.line} is next.`;
    return `Line ${ran} runs, and line ${e.line} is next.`;
  }
  const named =
    clauses.length > NAMED_CHANGES ? [...clauses.slice(0, NAMED_CHANGES - 1), `makes ${clauses.length - NAMED_CHANGES + 1} more changes`] : clauses;
  return `Line ${ran} ${listWords(named)}.`;
}

/**
 * The condition an if, elif or while line tests, when its body starts on the
 * next line: `n <= 1` from `if n <= 1:` or `} else if (n <= 1) {`.
 */
export function testedCondition(line: string | undefined): string | null {
  const m = line && /^\s*(?:\}\s*)?(?:else\s+if|elif|if|while)\b\s*(.*?)\s*[:{]\s*$/.exec(line);
  if (!m) return null;
  let condition = m[1].trim();
  if (condition.startsWith('(') && condition.endsWith(')') && balanced(condition.slice(1, -1))) condition = condition.slice(1, -1).trim();
  return condition || null;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    depth += c === '(' ? 1 : c === ')' ? -1 : 0;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** "ValueError" from "ValueError: negative". */
function errorName(message: string | undefined): string {
  const name = message?.split(':')[0].trim();
  return name && /^[\w.]+$/.test(name) ? name : 'error';
}

/** What a line did to its frame's names and to the objects in memory, as clauses: "sets total to 5". */
function changes(
  prev: Step,
  e: Step,
  was: StackFrame,
  now: StackFrame,
  heap: ReadonlyMap<string, HeapObject>,
  seen: ReadonlyMap<string, number>,
): string[] {
  const out: string[] = [];
  const before = new Map(prev.heap.map((o) => [o.id, o]));
  // Objects a name's clause already describes, so their contents aren't described again.
  const covered = new Set<string>();
  for (const [name, value] of now.locals) {
    const old = was.locals.find(([n]) => n === name)?.[1];
    if (old && sameValue(old, value)) continue;
    if ('prim' in value) {
      out.push(`sets ${name} to ${value.prim}`);
      continue;
    }
    covered.add(value.ref);
    const obj = heap.get(value.ref);
    if (!obj) out.push(`sets ${name}`);
    else if (!seen.has(value.ref)) out.push(obj.kind === 'function' && obj.name === name ? `defines ${name}` : `sets ${name} to a new ${objectText(obj, heap)}`);
    else {
      const other = otherName(e, now, name, value.ref);
      out.push(other ? `makes ${other} and ${name} name the same ${kindWord(obj)}` : `sets ${name} to the ${objectText(obj, heap)}`);
    }
  }
  for (const obj of e.heap) {
    const old = before.get(obj.id);
    if (!old || covered.has(obj.id) || JSON.stringify(old) === JSON.stringify(obj)) continue;
    out.push(mutation(old, obj, nameOf(obj.id, e, now, heap), heap));
  }
  return out;
}

/** Another name for the object, in this frame first, then in the frames below it. */
function otherName(e: Step, now: StackFrame, name: string, ref: string): string | null {
  for (const f of [now, ...e.stack.toReversed()]) {
    for (const [n, v] of f.locals) if ((f !== now || n !== name) && 'ref' in v && v.ref === ref) return n;
  }
  return null;
}

/** How to refer to an object: a name for it, a name's item or field ("grid[0]", "p.next"), or its kind. */
function nameOf(id: string, e: Step, now: StackFrame, heap: ReadonlyMap<string, HeapObject>): string {
  const frames = [now, ...e.stack.toReversed()];
  for (const f of frames) for (const [n, v] of f.locals) if ('ref' in v && v.ref === id) return n;
  for (const f of frames) {
    for (const [n, v] of f.locals) {
      const o = 'ref' in v ? heap.get(v.ref) : undefined;
      if (!o) continue;
      const isIt = (x: MemValue) => 'ref' in x && x.ref === id;
      if (o.kind === 'list' || o.kind === 'tuple') {
        const i = o.items.findIndex(isIt);
        if (i >= 0) return `${n}[${i}]`;
      } else if (o.kind === 'dict') {
        const entry = o.entries.find(([, x]) => isIt(x));
        if (entry) return `${n}[${memText(entry[0], heap)}]`;
      } else if (o.kind === 'object') {
        const field = o.fields.find(([, x]) => isIt(x));
        if (field) return `${n}.${field[0]}`;
      }
    }
  }
  const obj = heap.get(id);
  return `a ${obj ? kindWord(obj) : 'value'}`;
}

/** What changed inside an object, as a clause: "appends 4 to nums", "sets p.x to 3". */
function mutation(old: HeapObject, now: HeapObject, name: string, heap: ReadonlyMap<string, HeapObject>): string {
  const text = (v: MemValue) => memText(v, heap);
  if ((now.kind === 'list' || now.kind === 'tuple') && old.kind === now.kind && old.more === 0 && now.more === 0) {
    const [a, b] = [old.items, now.items];
    if (b.length === a.length + 1 && a.every((x, i) => sameValue(x, b[i]))) return `appends ${text(b.at(-1)!)} to ${name}`;
    // Its only item: neither the front nor the end says more than the other.
    if (a.length === 1 && b.length === 0) return `removes ${text(a[0])}, its only item, from ${name}`;
    if (b.length === a.length - 1 && b.every((x, i) => sameValue(x, a[i]))) return `removes ${text(a.at(-1)!)} from the end of ${name}`;
    if (b.length === a.length - 1 && b.every((x, i) => sameValue(x, a[i + 1]))) return `removes ${text(a[0])} from the front of ${name}`;
    if (b.length === a.length + 1 && a.every((x, i) => sameValue(x, b[i + 1]))) return `puts ${text(b[0])} at the front of ${name}`;
    if (a.length === b.length) {
      const diff = a.flatMap((x, i) => (sameValue(x, b[i]) ? [] : [i]));
      if (diff.length === 1) return `sets ${name}[${diff[0]}] to ${text(b[diff[0]])}`;
      const [i, j] = diff;
      if (diff.length === 2 && sameValue(a[i], b[j]) && sameValue(a[j], b[i])) return `swaps ${name}[${i}] and ${name}[${j}]`;
    }
  } else if (now.kind === 'set' && old.kind === 'set') {
    const added = now.items.filter((x) => !old.items.some((y) => sameValue(x, y)));
    const removed = old.items.filter((x) => !now.items.some((y) => sameValue(x, y)));
    if (added.length === 1 && removed.length === 0) return `adds ${text(added[0])} to ${name}`;
    if (removed.length === 1 && added.length === 0) return `removes ${text(removed[0])} from ${name}`;
  } else if (now.kind === 'dict' && old.kind === 'dict') {
    const set = now.entries.filter(([k, v]) => !old.entries.some(([k2, v2]) => sameValue(k, k2) && sameValue(v, v2)));
    const removed = old.entries.filter(([k]) => !now.entries.some(([k2]) => sameValue(k, k2)));
    if (set.length === 1 && removed.length === 0) return `sets ${name}[${text(set[0][0])}] to ${text(set[0][1])}`;
    if (removed.length === 1 && set.length === 0) return `removes ${text(removed[0][0])} from ${name}`;
  } else if (now.kind === 'object' && old.kind === 'object') {
    const set = now.fields.filter(([k, v]) => !old.fields.some(([k2, v2]) => k === k2 && sameValue(v, v2)));
    const removed = old.fields.filter(([k]) => !now.fields.some(([k2]) => k === k2));
    if (set.length === 1 && removed.length === 0) return `sets ${name}.${set[0][0]} to ${text(set[0][1])}`;
    if (removed.length === 1 && set.length === 0) return `deletes ${name}.${removed[0][0]}`;
  }
  return `changes ${name}`;
}

/** A value in a sentence: a primitive as written, a function by name, another object by a name for it or its contents. */
export function memText(v: MemValue, heap: ReadonlyMap<string, HeapObject>, frame?: StackFrame): string {
  if ('prim' in v) return v.prim;
  const named = frame?.locals.find(([, x]) => 'ref' in x && x.ref === v.ref);
  if (named) return named[0];
  const obj = heap.get(v.ref);
  if (!obj) return '…';
  return obj.kind === 'function' ? obj.name : contents(obj, heap);
}

/** The words for an object's kind: list, array, dict, map, set, tuple, object, function, class, or its type. */
function kindWord(obj: HeapObject): string {
  if (obj.kind === 'function') return obj.type === 'class' ? 'class' : 'function';
  const builtIn: Record<string, string> = { Array: 'array', Map: 'map', Set: 'set', Object: 'object' };
  return builtIn[obj.type] ?? obj.type;
}

/** "list [1, 2, 3]", "Point (x: 1)", "function add", "TreeNode(5)". */
function objectText(obj: HeapObject, heap: ReadonlyMap<string, HeapObject>): string {
  if (treeNodeText(obj)) return treeNodeText(obj)!;
  return obj.kind === 'function' ? `${kindWord(obj)} ${obj.name}` : `${kindWord(obj)} ${contents(obj, heap)}`;
}

/** A tree node (an object with left and right) as its type and value, as print shows it: "TreeNode(5)". */
function treeNodeText(obj: HeapObject): string | null {
  if (obj.kind !== 'object' || !obj.fields.some(([k]) => k === 'left') || !obj.fields.some(([k]) => k === 'right')) return null;
  const value = obj.fields.find(([k]) => k === 'val' || k === 'value' || k === 'key' || k === 'data')?.[1];
  return `${obj.type}(${value && 'prim' in value ? value.prim : '…'})`;
}

/** Characters of contents a note shows before it cuts them short. */
const CONTENTS_SHOWN = 30;

/** An object's contents, short: "[1, 2, 3]", "{'a': 1}", "(x: 1, y: 2)"; nested objects as "[…]". */
function contents(obj: HeapObject, heap: ReadonlyMap<string, HeapObject>): string {
  const inner = (v: MemValue): string => {
    if ('prim' in v) return v.prim;
    const o = heap.get(v.ref);
    if (!o) return '…';
    if (o.kind === 'function') return o.name;
    return o.kind === 'list' ? '[…]' : o.kind === 'tuple' ? '(…)' : '{…}';
  };
  let parts: string[];
  let [open, close] = ['[', ']'];
  if (obj.kind === 'function') return obj.name;
  const node = treeNodeText(obj);
  if (node) return node;
  if (obj.kind === 'dict') {
    parts = obj.entries.map(([k, v]) => `${inner(k)}: ${inner(v)}`);
    [open, close] = ['{', '}'];
  } else if (obj.kind === 'object') {
    parts = obj.fields.map(([k, v]) => `${k}: ${inner(v)}`);
    [open, close] = obj.type === 'Object' ? ['{', '}'] : ['(', ')'];
  } else {
    parts = obj.items.map(inner);
    if (obj.kind === 'tuple') [open, close] = ['(', ')'];
    if (obj.kind === 'set') [open, close] = ['{', '}'];
  }
  const shown: string[] = [];
  let length = 0;
  for (const part of parts) {
    if (shown.length > 0 && length + part.length > CONTENTS_SHOWN) break;
    shown.push(part);
    length += part.length + 2;
  }
  const cut = shown.length < parts.length || obj.more > 0;
  return `${open}${shown.join(', ')}${cut ? ', …' : ''}${close}`;
}


/** "a", "a and b", "a, b and c". */
export function listWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function jsonText(v: Json): string {
  return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v).replace(/,/g, ', ');
}

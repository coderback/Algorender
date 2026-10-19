import { defineStructure, type Args, type OperationSpec, type StatSpec } from '@/engine/module';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import { MERGES, SPLITS, keyArg, plural, seededKeys } from '@/structures/trees/shared';
import {
  bptFrom,
  createBPlusTree,
  deleteSteps,
  height,
  insertSteps,
  keysOf,
  leafChain,
  maxKeys,
  minChildren,
  minLeafKeys,
  rangeSteps,
  searchSteps,
  type BPlusTree,
  type InternalPage,
  type PageId,
  type Step,
} from '@/systems/bplus-tree';
import { TreeTracer, treeSnapshot, type TreeDrawing } from '@/viz/tree/tracer';
import { linkId, type NodeId, type TreeNode, type TreeState } from '@/viz/tree/types';

// A B+ tree as a database index, driven by insert, delete, search and range.
// It looks like the B-tree visualiser on purpose; what differs is what it
// teaches: every key sits in a leaf, the keys above are separator copies that
// only steer, and the leaves are linked, so a range scan walks along them.
// The tree itself is src/systems/bplus-tree.ts, which lists each operation's
// steps with the tree after each; this module narrates those steps.

type Model = BPlusTree<string>;
type Op = OperationSpec<Model, TreeState>;

export const MAX_KEYS_TOTAL = 30;
const PAGES: StatSpec = { key: 'pages', label: 'Page reads' };
const STATS = ['pages', 'splits', 'merges'];
const EMPTY = 'The tree is empty';

/** A key in a leaf, and a separator copy of a key in an internal node: different cells, so a copy-up shows both. */
const leafCell = (key: number) => `k${key}`;
const sepCell = (key: number) => `s${key}`;
const show = (keys: readonly number[]) => `[${keys.join(', ')}]`;
const rowOf = (key: number) => `row ${key}`;
const keysAt = (m: Model, id: PageId) => m.pages[id].keys;
const isLeafPage = (m: Model, id: PageId) => m.pages[id].kind === 'leaf';
const treeName = (order: number) => `B+ tree of order ${order}`;

const drawing: TreeDrawing<Model> = {
  empty: 'The tree is empty. Insert a key to create the first leaf.',
  shape: (m) => {
    const nodes: Record<NodeId, TreeNode> = {};
    for (const [id, p] of Object.entries(m.pages)) {
      nodes[id] =
        p.kind === 'leaf'
          ? { shape: 'box', cells: p.keys.map((k) => ({ id: leafCell(k), label: String(k) })), children: [] }
          : { shape: 'box', cells: p.keys.map((k) => ({ id: sepCell(k), label: String(k) })), children: p.children };
    }
    const chain = leafChain(m);
    const links = chain.slice(1).map((to, i) => ({ from: chain[i], to }));
    return { root: m.root, nodes, strip: null, links };
  },
  describe: (m) => {
    const limits = `a node holds up to ${maxKeys(m.order)} keys`;
    if (m.root == null) return `Empty ${treeName(m.order)}: ${limits}.`;
    const chain = leafChain(m);
    const root = m.pages[m.root];
    return `${treeName(m.order)} (${limits}) with ${plural(m.size, 'key')} in ${leafCount(chain.length)}, height ${height(m)}. ${
      root.kind === 'leaf' ? 'The root is a leaf.' : `Root separators ${show(root.keys)}.`
    } Leaves, linked left to right: ${chain.map((id) => show(keysAt(m, id))).join(' → ')}.`;
  },
};

/** "Below 30", "From 30, below 60", "60 or more": the key range each child of a node covers. */
const rangeName = (keys: readonly number[], i: number) =>
  i === 0 ? `Below ${keys[0]}` : i === keys.length ? `${keys[i - 1]} or more` : `From ${keys[i - 1]}, below ${keys[i]}`;

/** "45 ≥ 30 and 45 < 60": the comparisons that pick the child. */
function scanPhrase(keys: readonly number[], key: number, i: number): string {
  const parts = keys.slice(0, i).map((k) => `${key} ≥ ${k}`);
  if (i < keys.length) parts.push(`${key} < ${keys[i]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}


/**
 * Frames for the reads on the way down (`read` steps), two per internal
 * page (look, then go down) and one for the leaf. Returns the path and the
 * index of the first step after the reads. `leafQuestion` adds a question to
 * the leaf's frame.
 */
function* descent(
  t: TreeTracer<Model>,
  steps: readonly Step<string>[],
  key: number,
  opts: { line: number; downLine?: number; leafLine?: number; what: string; leafNote?: (keys: readonly number[]) => string; leafQuestion?: Checkpoint },
): Generator<Frame<TreeState>, { path: NodeId[]; next: number }> {
  const path: NodeId[] = [];
  let i = 0;
  for (; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind !== 'read') break;
    const m = t.model;
    path.push(s.page);
    t.count('pages');
    const keys = keysAt(m, s.page);
    const vars: Record<string, VarValue> = { [opts.what]: key, page: show(keys), 'page reads': t.stats.pages };
    if (s.index == null) {
      yield t.frame({
        line: opts.leafLine ?? opts.line,
        note: opts.leafNote
          ? opts.leafNote(keys)
          : `Read the leaf ${show(keys)}. Leaves hold the keys themselves, each with its row.`,
        marks: { visited: path.slice(0, -1) },
        path,
        probe: { label: String(key), at: s.page },
        vars,
        checkpoint: opts.leafQuestion,
      });
      continue;
    }
    yield t.frame({
      line: opts.line,
      note:
        path.length === 1
          ? `Read the root page, ${show(keys)}. Its separators split everything below into ${keys.length + 1} key ranges, one per child.`
          : `Read the page ${show(keys)}.`,
      marks: { visited: path.slice(0, -1) },
      path,
      probe: { label: String(key), at: s.page },
      vars,
      checkpoint: {
        question: `Which child does ${key} go down to from ${show(keys)}?`,
        choices: Array.from({ length: keys.length + 1 }, (_, j) => rangeName(keys, j)),
        answer: s.index,
      },
    });
    const child = s.child!;
    yield t.frame({
      line: opts.downLine ?? opts.line,
      note: `${scanPhrase(keys, key, s.index)}, so ${key} belongs to the child for keys ${rangeName(keys, s.index).toLowerCase()}${
        keys.includes(key) ? ` (a key equal to a separator lives to its right)` : ''
      }: go down to ${show(keysAt(m, child))}.`,
      marks: { visited: path, compare: keys.slice(0, s.index + 1).map(sepCell) },
      path: [...path, child],
      probe: { label: String(key), at: s.page },
      vars,
    });
  }
  return { path, next: i };
}

/** Siblings of `page` under `parent` in `m`, as "left sibling is [..]" phrases and ids. */
function siblingsOf(m: Model, parent: PageId, page: PageId) {
  const p = m.pages[parent] as InternalPage;
  const ci = p.children.indexOf(page);
  const left = ci > 0 ? p.children[ci - 1] : null;
  const right = ci < p.children.length - 1 ? p.children[ci + 1] : null;
  const words = [left && `left sibling is ${show(keysAt(m, left))}`, right && `right sibling is ${show(keysAt(m, right))}`].filter(Boolean).join(' and its ');
  return { left, right, words };
}

const minPhrase = (m: Model, id: PageId) =>
  isLeafPage(m, id) ? `${minLeafKeys(m.order)} keys` : `${minChildren(m.order)} children`;
const sizePhrase = (m: Model, id: PageId) => {
  const p = m.pages[id];
  return p.kind === 'leaf' ? plural(p.keys.length, 'key') : `${p.children.length} ${p.children.length === 1 ? 'child' : 'children'}`;
};
/** A page by its keys, or in words when it has none left. */
const pageName = (m: Model, id: PageId) => {
  const keys = keysAt(m, id);
  return keys.length ? show(keys) : isLeafPage(m, id) ? 'The now empty leaf' : 'The page, left with no separators,';
};
const leafCount = (n: number) =>`${n} ${n === 1 ? 'leaf' : 'leaves'}`;

// ───────────────────────────── insert ─────────────────────────────

const insert: Op = {
  id: 'insert',
  label: 'Insert',
  args: [keyArg('Key', 35)],
  pseudocode: [
    'insert(key):',
    '  leaf ← descend to key’s leaf',
    '  if key is in leaf: replace its value',
    '  else add key to leaf, in order',
    '  while node has m keys (overflow):',
    '    if node is a leaf:',
    '      move the right half to a new leaf',
    '      link it; copy its first key up',
    '    else:',
    '      move the middle key up',
    '    if node was the root: grow a root',
    '    node ← parent',
  ],
  disabledReason: (m) => (m.size >= MAX_KEYS_TOTAL ? `The tree is full (${MAX_KEYS_TOTAL} keys), the most this view draws clearly` : null),
  *run(model, args) {
    const key = Number(args.key);
    const max = maxKeys(model.order);
    const steps = insertSteps(model, key, rowOf(key));
    const t = new TreeTracer(model, drawing, STATS);
    const add = steps.find((s) => s.kind === 'add');
    const { next } = yield* descent(t, steps, key, {
      line: 1,
      what: 'key',
      leafNote: (keys) => `Reached the leaf ${show(keys)}: in a B+ tree every key lives in a leaf, so this is where ${key} goes.`,
      leafQuestion:
        add?.kind === 'add'
          ? { question: `Will ${show(keysAt(model, add.page))} have to split once ${key} is added?`, choices: ['Yes, it overflows', 'No, it has room'], answer: add.overflow ? 0 : 1 }
          : undefined,
    });

    for (let i = next; i < steps.length; i++) {
      const s = steps[i];
      const before = t.model;
      t.model = s.tree;
      if (s.kind === 'create') {
        yield t.frame({
          line: 3,
          note: `The tree is empty, so ${key} starts the root: a single leaf that can hold up to ${max} keys.`,
          marks: { key: [leafCell(key)] },
          vars: { key, 'max keys': max },
        });
      } else if (s.kind === 'update') {
        yield t.frame({
          line: 2,
          note: `${key} is already in the leaf. An index on a unique key stores each key once, so only its row is replaced; nothing moves.`,
          marks: { found: [leafCell(key)] },
          probe: { label: String(key), at: s.page },
          vars: { key, row: rowOf(key) },
        });
      } else if (s.kind === 'add') {
        const keys = keysAt(s.tree, s.page);
        yield t.frame({
          line: 3,
          note: `Add ${key} to the leaf in sorted order: ${show(keys)}. ${
            s.overflow ? `That is ${keys.length} keys, one more than the ${max} a node may hold.` : `It holds ${keys.length} of at most ${max} keys, so nothing else changes.`
          }`,
          marks: { key: [leafCell(key)], ...(s.overflow && { reject: [s.page] }) },
          vars: { key, keys: keys.length, 'max keys': max },
        });
      } else if (s.kind === 'split') {
        const keys = keysAt(before, s.page);
        const leaf = s.level === 'leaf';
        // Before: the overflowing node, and which key goes up.
        t.model = before;
        yield t.frame({
          line: 4,
          note: leaf
            ? `${show(keys)} holds ${keys.length} keys, too many, so it splits into two leaves of about half each, and the parent needs a separator to tell them apart.`
            : `The internal page ${show(keys)} now holds ${keys.length} separators, too many, so it splits around its middle separator.`,
          marks: { reject: [s.page] },
          vars: { keys: keys.length, 'max keys': max },
          checkpoint: {
            question: leaf ? `Which key is copied up into the parent?` : `Which separator moves up into the parent?`,
            choices: keys.map(String),
            answer: keys.indexOf(s.separator),
          },
        });
        t.model = s.tree;
        t.count('splits');
        const parent = s.newRoot ? 'a new root' : `the parent, ${show(keysAt(s.tree, s.parent))}`;
        const grows = s.newRoot ? ` The root itself split, so the tree grows a level at the top, and every leaf stays at the same depth.` : '';
        const ripple = s.parentOverflow ? ` The parent now holds ${keysAt(s.tree, s.parent).length} separators, too many, so it splits as well.` : '';
        yield t.frame({
          line: s.newRoot ? 10 : leaf ? 7 : 9,
          note: leaf
            ? `The right half, ${show(keysAt(s.tree, s.right))}, moves to a new leaf, linked in after the left half. Its first key, ${s.separator}, is copied up into ${parent}: a copy, because every key must stay in a leaf; above, ${s.separator} is only a signpost (${s.separator} or more go right).${grows}${ripple}`
            : `${s.separator} moves up into ${parent}, leaving ${show(keysAt(s.tree, s.page))} and ${show(keysAt(s.tree, s.right))}. Unlike a leaf split, it leaves this page: separators are only signposts, and each is needed once.${grows}${ripple}`,
          marks: {
            pivot: [sepCell(s.separator), leaf ? leafCell(s.separator) : null],
            ...(leaf && { visited: [linkId(s.page, s.right)] }),
            ...(s.parentOverflow && { reject: [s.parent] }),
          },
          vars: { separator: s.separator, height: height(s.tree) },
        });
      }
    }
    return t.model;
  },
};

// ───────────────────────────── search ─────────────────────────────

const search: Op = {
  id: 'search',
  label: 'Search',
  args: [keyArg('Key', 30)],
  pseudocode: [
    'search(key):',
    '  node ← root',
    '  while node is internal:',
    '    i ← how many separators ≤ key',
    '    node ← children[i]',
    '  if key is in the leaf: return it',
    '  return missing',
  ],
  disabledReason: (m) => (m.root == null ? EMPTY : null),
  *run(model, args) {
    const key = Number(args.key);
    const steps = searchSteps(model, key);
    const t = new TreeTracer(model, drawing, STATS);
    const { path, next } = yield* descent(t, steps, key, { line: 3, downLine: 4, leafLine: 5, what: 'key' });
    const s = steps[next];
    if (s?.kind === 'found') {
      yield t.frame({
        line: 5,
        note: `Found ${key} in the leaf, with its row, after reading ${plural(path.length, 'page')}: one per level. A B+ tree of order 100 or more is this shallow even with millions of keys.`,
        marks: { visited: path.slice(0, -1), found: [leafCell(key)] },
        path,
        vars: { key, found: true, row: s.value, 'page reads': t.stats.pages },
      });
    } else if (s?.kind === 'missing' && s.page) {
      const leafKeys = keysAt(model, s.page);
      const stale = path.slice(0, -1).some((id) => keysAt(model, id).includes(key));
      yield t.frame({
        line: 6,
        note: `${key} isn't in the leaf ${show(leafKeys)}, and every key lives in a leaf, so it isn't stored.${
          stale ? ` The ${key} above is only a leftover separator from a deleted key: separators are copies and prove nothing.` : ''
        }`,
        marks: { visited: path.slice(0, -1), ...(stale && { pivot: [sepCell(key)] }) },
        path,
        vars: { key, found: false, 'page reads': t.stats.pages },
      });
    }
    return model;
  },
};

// ───────────────────────────── range ─────────────────────────────

const rangeArgs = (args: Args) => ({ from: Number(args.from), to: Number(args.to) });

const range: Op = {
  id: 'range',
  label: 'Range scan',
  args: [
    { name: 'from', label: 'From', type: 'int', min: 1, max: 99, default: 20 },
    { name: 'to', label: 'To', type: 'int', min: 1, max: 99, default: 45 },
  ],
  pseudocode: [
    'range(from, to):',
    '  leaf ← descend to from’s leaf',
    '  loop:',
    '    output leaf’s keys in [from, to]',
    '    if its last key > to: stop',
    '    if it is the last leaf: stop',
    '    leaf ← leaf.next (one page read)',
  ],
  disabledReason: (m, args) => {
    if (m.root == null) return EMPTY;
    if (args && Number(args.from) > Number(args.to)) return 'From must not be more than To';
    return null;
  },
  *run(model, args) {
    const { from, to } = rangeArgs(args);
    const steps = rangeSteps(model, from, to);
    const t = new TreeTracer(model, drawing, STATS);
    const leaves = steps.filter((s) => s.kind === 'scan').length;
    const choices = ['1', '2', '3', '4', '5 or more'];
    const { path, next } = yield* descent(t, steps, from, {
      line: 1,
      what: 'from',
      leafNote: (keys) => `Reached the leaf ${show(keys)}: the only leaf where keys from ${from} could start. One descent finds the start of the range; from here the scan never goes back up.`,
      leafQuestion: { question: `How many leaves will this scan of ${from} to ${to} read in all?`, choices, answer: Math.min(leaves, 5) - 1 },
    });
    const out: string[] = [];
    const read: NodeId[] = [];
    const followed: string[] = [];
    for (let i = next; i < steps.length; i++) {
      const s = steps[i];
      if (s.kind !== 'scan') continue;
      if (read.length > 0) {
        const prev = read[read.length - 1];
        followed.push(linkId(prev, s.page));
        t.count('pages');
        yield t.frame({
          line: 6,
          note: `${show(keysAt(model, prev))} ends at ${keysAt(model, prev).at(-1)}, not past ${to}, so the range may go on: follow the link to the next leaf, ${show(keysAt(model, s.page))}, without going back up the tree. One more page read.`,
          marks: { visited: [...path.slice(0, -1), ...read, ...followed], found: out.map((k) => leafCell(Number(k))) },
          probe: { label: `${from}–${to}`, at: s.page },
          output: { label: 'In range', items: [...out] },
          vars: { from, to, 'page reads': t.stats.pages },
        });
      }
      read.push(s.page);
      out.push(...s.taken.map(String));
      const keys = keysAt(model, s.page);
      const last = keys[keys.length - 1];
      yield t.frame({
        line: 3,
        note: s.taken.length
          ? `Output the keys of ${show(keys)} from ${from} to ${to}: ${s.taken.join(', ')}. ${s.taken.length === keys.length ? 'The whole leaf is in range.' : ''}`.trim()
          : `No key of ${show(keys)} is between ${from} and ${to}.`,
        marks: { visited: [...path.slice(0, -1), ...read.slice(0, -1), ...followed], found: out.map((k) => leafCell(Number(k))) },
        probe: { label: `${from}–${to}`, at: s.page },
        output: { label: 'In range', items: [...out] },
        vars: { from, to, 'page reads': t.stats.pages },
      });
      if (s.stop) {
        const past = last > to;
        yield t.frame({
          line: past ? 4 : 5,
          note: `${
            past ? `${last}, this leaf's last key, is past ${to}, so no later leaf can hold anything in range: stop.` : `This is the last leaf, so stop.`
          } ${plural(out.length, 'key')} in ${plural(t.stats.pages, 'page read')}: ${plural(path.length - 1, 'internal page')} on the way down, then ${leafCount(read.length)} along the chain.`,
          marks: { visited: [...path.slice(0, -1), ...read, ...followed], found: out.map((k) => leafCell(Number(k))) },
          output: { label: 'In range', items: [...out] },
          vars: { from, to, found: out.length, 'page reads': t.stats.pages },
        });
      }
    }
    return model;
  },
};

// ───────────────────────────── delete ─────────────────────────────

const remove: Op = {
  id: 'delete',
  label: 'Delete',
  // Only stored keys: searching shows how a missing key is ruled out.
  args: [{ name: 'key', label: 'Key', type: 'choice', options: (m) => keysOf(m).map(String) }],
  pseudocode: [
    'delete(key):',
    '  leaf ← descend to key’s leaf',
    '  remove key; separators may keep it',
    '  while node is below the minimum:',
    '    if a sibling can spare an entry:',
    '      borrow it, fix the separator',
    '    else merge with a sibling and',
    '      take their separator out of',
    '      the parent (internal: pull down)',
    '    node ← parent',
    '  if root has one child: drop root',
  ],
  disabledReason: (m) => (m.root == null ? EMPTY : null),
  *run(model, args) {
    const key = Number(args.key);
    const steps = deleteSteps(model, key);
    const t = new TreeTracer(model, drawing, STATS);
    const removed = steps.find((s) => s.kind === 'remove');
    const { path, next } = yield* descent(t, steps, key, {
      line: 1,
      what: 'key',
      leafNote: (keys) => `Reached the leaf ${show(keys)}, which holds ${key}.`,
      leafQuestion:
        removed?.kind === 'remove' && removed.page !== model.root
          ? {
              question: `Will ${show(keysAt(model, removed.page))} fall below the minimum of ${minLeafKeys(model.order)} keys without ${key}?`,
              choices: ['Yes, it will be short', 'No, it keeps enough'],
              answer: removed.underflow ? 0 : 1,
            }
          : undefined,
    });

    for (let i = next; i < steps.length; i++) {
      const s = steps[i];
      const before = t.model;
      if (s.kind === 'missing') {
        yield t.frame({ line: 2, note: `${key} is not stored, so nothing changes.`, marks: { visited: path }, vars: { key } });
      } else if (s.kind === 'emptied') {
        t.model = s.tree;
        yield t.frame({ line: 2, note: `${key} was the last key, so the root leaf is empty and the tree is now empty.`, vars: { key } });
      } else if (s.kind === 'remove') {
        t.model = s.tree;
        const keys = keysAt(s.tree, s.page);
        const stays =
          s.stays != null
            ? ` A copy of ${key} still sits above as a separator. It can stay: it still divides the keys correctly (smaller to its left, at least ${key} to its right), and leaving it saves rewriting that page.`
            : '';
        const fine =
          s.page === s.tree.root
            ? ` The leaf is the root, which may hold as few as one key, so nothing more needs fixing.`
            : s.underflow
              ? ` The leaf now holds ${plural(keys.length, 'key')}, fewer than the minimum of ${minLeafKeys(s.tree.order)}.`
              : ` It still holds ${plural(keys.length, 'key')}, at least the minimum of ${minLeafKeys(s.tree.order)}, so nothing more needs fixing.`;
        yield t.frame({
          line: 2,
          note: `Remove ${key} (and its row) from the leaf: ${keys.length ? show(keys) : 'it is now empty'}.${stays}${fine}`,
          marks: { visited: path.slice(0, -1), ...(s.stays != null && { pivot: [sepCell(s.stays)] }), ...(s.underflow && { reject: [s.page] }) },
          path,
          vars: { key, keys: keys.length, 'min keys': minLeafKeys(s.tree.order) },
        });
      } else if (s.kind === 'borrow' || s.kind === 'merge') {
        // First: the short node, its siblings, and the question.
        const sib = siblingsOf(before, s.parent, s.page);
        const what = s.level === 'leaf' ? 'a key' : 'a child';
        yield t.frame({
          line: 3,
          note: `${pageName(before, s.page)} has ${sizePhrase(before, s.page)}, fewer than the minimum of ${minPhrase(before, s.page)}. Its ${sib.words}.`,
          marks: { reject: [s.page], compare: [sib.left, sib.right] },
          vars: { 'min keys': minLeafKeys(before.order), 'min children': minChildren(before.order) },
          checkpoint: { question: `Can a sibling spare ${what}?`, choices: ['Yes: borrow one', 'No: merge'], answer: s.kind === 'borrow' ? 0 : 1 },
        });
        t.model = s.tree;
        t.count('merges');
        if (s.kind === 'borrow') {
          const { from, to } = s.separator;
          const note =
            s.level === 'leaf'
              ? s.side === 'left'
                ? `The left sibling can spare a key: borrow ${s.moved}, its largest. The separator between them must now let ${s.moved} through to the right, so the parent's ${from} becomes ${to}.`
                : `The right sibling can spare a key: borrow ${s.moved}, its smallest. The separator between them becomes ${to}, the right sibling's new first key (it was ${from}).`
              : `The ${s.side} sibling can spare a child, so rotate through the parent: the separator ${from} comes down into the short page, the sibling's ${s.side === 'left' ? 'last' : 'first'} child moves across with it, and the sibling's ${s.moved} goes up to replace ${from}.`;
          yield t.frame({
            line: 5,
            note,
            marks: {
              write: s.level === 'leaf' ? [leafCell(s.moved)] : [sepCell(from)],
              pivot: [sepCell(to)],
            },
            vars: { borrowed: s.moved, separator: to },
          });
        } else {
          const merged = keysAt(s.tree, s.keep);
          const parentKeys = keysAt(s.tree, s.parent);
          const parentState =
            s.parent === s.tree.root
              ? parentKeys.length === 0
                ? ''
                : ` The parent is the root, which may hold as few as one separator.`
              : s.parentUnderflow
                ? ` The parent is now short itself, so fix it next.`
                : ` The parent still has enough children, so nothing more needs fixing.`;
          yield t.frame({
            line: s.level === 'leaf' ? 7 : 8,
            note:
              s.level === 'leaf'
                ? `Neither sibling can spare a key, so merge the two leaves into one, ${show(merged)}, and the chain now skips the emptied leaf. The separator ${s.separator} between them leaves the parent: one leaf needs no signpost.${parentState}`
                : `Neither sibling can spare a child, so merge the two pages, pulling the parent's separator ${s.separator} down between them: ${show(merged)}.${parentState}`,
            marks: {
              write: s.level === 'leaf' ? [] : [sepCell(s.separator)],
              ...(s.parentUnderflow && s.parent !== s.tree.root && { reject: [s.parent] }),
            },
            vars: { merged: show(merged) },
          });
        }
      } else if (s.kind === 'shrink') {
        t.model = s.tree;
        yield t.frame({
          line: 10,
          note: `The root gave its last separator to the merge and has a single child, so drop it: ${show(keysAt(s.tree, s.root))} becomes the root. The tree is a level shorter, and every leaf is still at the same depth.`,
          vars: { height: height(s.tree) },
        });
      }
    }
    return t.model;
  },
};

// ───────────────────────────── module ─────────────────────────────

const build = (order: number, keys: readonly number[]): Model => bptFrom(order, keys.map((k) => [k, rowOf(k)] as const));
const empty = (order: number): Model => createBPlusTree<string>(order);

const SAMPLE = [50, 20, 80, 10, 30, 60, 90, 40, 70, 25, 35];
const SMALL = [10, 20, 30, 40, 50, 60, 70];

export const bPlusTree = defineStructure<Model, TreeState>({
  kind: 'structure',
  slug: 'b-plus-tree',
  view: 'tree',
  initial: [
    { id: 'order-4', label: 'Order 4 (up to 3 keys), 11 keys', make: () => build(4, SAMPLE) },
    { id: 'order-3', label: 'Order 3 (up to 2 keys), 7 keys', make: () => build(3, SMALL) },
    { id: 'order-6', label: 'Order 6 (up to 5 keys), 18 keys', make: () => build(6, Array.from({ length: 18 }, (_, i) => (i + 1) * 5)) },
    { id: 'empty', label: 'Empty, order 4', make: () => empty(4) },
    { id: 'random', label: 'Random, order 4 (14 keys)', make: (seed) => build(4, seededKeys(seed, 14)) },
  ],
  snapshot: (m) => treeSnapshot(drawing, m),
  operations: [insert, search, range, remove],
  stats: [PAGES, SPLITS, MERGES],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'compare', label: 'Separator compared, or a sibling' },
    { mark: 'visited', label: 'Page read, or link followed' },
    { mark: 'key', label: 'Key being inserted' },
    { mark: 'reject', label: 'Too many or too few entries' },
    { mark: 'pivot', label: 'Separator: copied up, moved or kept' },
    { mark: 'write', label: 'Moved by a borrow or merge' },
    { mark: 'found', label: 'Found, or in range' },
  ],
  content: {
    idea: 'A B+ tree is the index inside almost every database. Every key, with its row, lives in a leaf; the nodes above hold only separator keys, copies that steer a search, and the leaves are linked in order. A lookup reads one page per level, and a range scan finds its first key once, then walks along the leaves.',
    invariant:
      'Every leaf is at the same depth and holds its keys in order; a separator k sends keys below k left and keys of at least k right; every node but the root is at least half full; and the leaf links visit every key in sorted order.',
    whenToUse:
      'Database indexes and file systems (PostgreSQL, MySQL’s InnoDB, SQLite, NTFS): a node fills a disk page, so with hundreds of keys per node three or four page reads reach any of millions of rows, and ORDER BY or BETWEEN queries read the leaves in order. Writes that land all over the key space cost random page writes; LSM trees trade read speed for faster writes there.',
    traits: [
      { label: 'Few page reads per lookup', good: true },
      { label: 'Fast range scans along the leaves', good: true },
      { label: 'Random writes rewrite pages in place', good: false },
      { label: 'Separators repeat leaf keys', good: null },
    ],
    experiments: [
      { example: 'order-4', prompt: 'Insert 36: the leaf splits and 36 or a neighbour is copied up, yet stays in its leaf. Compare with the B-tree, where the median moves up.' },
      { example: 'order-4', prompt: 'Range scan 20 to 60: one descent, then the scan follows the leaf links. Count the page reads.' },
      { example: 'order-4', prompt: 'Delete a key that is also a separator, like 30 or 50: the leaf loses it, but the separator copy can stay.' },
      { example: 'order-6', prompt: 'Search any key: 18 keys, yet only two page reads. Fat nodes keep the tree shallow.' },
      { example: 'order-3', prompt: 'Delete 10: no sibling can spare a key, so two leaves merge, and then two internal pages. Then delete 50: this time its leaf borrows a key from a sibling.' },
    ],
  },
});

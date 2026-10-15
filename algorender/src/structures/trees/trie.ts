import { defineStructure, type Args, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { TreeTracer, treeSnapshot, type TreeDrawing } from '@/viz/tree/tracer';
import type { NodeId, TreeNode, TreeState } from '@/viz/tree/types';
import { plural } from './shared';

/** A trie node: its children by letter, and whether the path to it spells a stored word. */
export type TrieNode = { readonly children: Readonly<Record<string, NodeId>>; readonly end: boolean };
/**
 * Node ids are "^" plus the prefix the node spells ("^", "^c", "^ca"), so a
 * node keeps its identity across inserts and deletes.
 */
export type Trie = { readonly nodes: Readonly<Record<NodeId, TrieNode>> };

type Op = OperationSpec<Trie, TreeState>;
type F = Frame<TreeState>;

export const ROOT = '^';
export const MAX_WORD = 10;
export const MAX_TRIE_NODES = 60;
const STATS = ['lookups', 'created', 'removed'];
const NO_WORDS = 'The trie has no words yet';

const prefixOf = (id: NodeId) => id.slice(ROOT.length);
const q = (s: string) => `"${s}"`;
/** A node by the prefix it spells; the root spells nothing. */
const nodeName = (prefix: string, start = false) => (prefix ? q(prefix) : start ? 'The root' : 'the root');
const letters = (node: TrieNode) => Object.keys(node.children).sort();

export const emptyTrie = (): Trie => ({ nodes: { [ROOT]: { children: {}, end: false } } });

/** Every stored word, in alphabetical order (children are visited a to z). */
export function wordsOf(trie: Trie, from: NodeId = ROOT): string[] {
  const out: string[] = [];
  const walk = (id: NodeId) => {
    const n = trie.nodes[id];
    if (n.end) out.push(prefixOf(id));
    for (const c of letters(n)) walk(n.children[c]);
  };
  if (trie.nodes[from]) walk(from);
  return out;
}

/** Normalises a word to lower case, or explains why it can't be stored. */
export function readWord(raw: string): { word: string } | { error: string } {
  const word = raw.trim().toLowerCase();
  if (!/^[a-z]+$/.test(word)) return { error: `use only the letters a–z` };
  if (word.length > MAX_WORD) return { error: `use at most ${MAX_WORD} letters` };
  return { word };
}

const drawing: TreeDrawing<Trie> = {
  empty: 'The trie is empty.',
  shape: (trie) => {
    const nodes: Record<NodeId, TreeNode> = {};
    const walk = (id: NodeId) => {
      const n = trie.nodes[id];
      const kids = letters(n).map((c) => n.children[c]);
      nodes[id] = {
        shape: 'round',
        cells: [],
        children: kids,
        ...(id !== ROOT && { edgeLabel: id[id.length - 1] }),
        ...(n.end && { terminal: true }),
      };
      kids.forEach(walk);
    };
    walk(ROOT);
    return { root: ROOT, nodes, strip: null };
  },
  describe: (trie) => {
    const words = wordsOf(trie);
    return words.length === 0
      ? 'Trie with no words: just the root.'
      : `Trie with ${plural(words.length, 'word')} in ${plural(Object.keys(trie.nodes).length, 'node')}: ${words.join(', ')}. A double ring marks the end of a word.`;
  },
};

/** "ca[r]t": the word with the next letter to match in brackets. */
const progress = (word: string, i: number) => (i >= word.length ? word : `${word.slice(0, i)}[${word[i]}]${word.slice(i + 1)}`);

/** Up to three stored words through a node, for narration. */
function sample(trie: Trie, id: NodeId): string {
  const words = wordsOf(trie, id);
  return words.length <= 3 ? words.join(', ') : `${words.slice(0, 3).join(', ')}…`;
}

/** Ids of the nodes on a word's path, root first, as far as the path exists. */
function pathOf(trie: Trie, word: string): NodeId[] {
  const path = [ROOT];
  for (const c of word) {
    const next = trie.nodes[path[path.length - 1]].children[c];
    if (!next) break;
    path.push(next);
  }
  return path;
}

/** Why the text in `field` can't be used as a word, or null (also while the form's input doesn't parse yet). */
function badWord(args: Args | undefined, field: string): string | null {
  if (!args) return null;
  const raw = String(args[field]).trim();
  const read = readWord(raw);
  return 'error' in read ? `Can't use ${q(raw)}: ${read.error}` : null;
}

const tooBig = (trie: Trie) =>
  Object.keys(trie.nodes).length > MAX_TRIE_NODES ? `The trie is full (over ${MAX_TRIE_NODES} nodes), the most this view draws clearly` : null;
const noWords = (trie: Trie) => (wordsOf(trie).length === 0 ? NO_WORDS : null);

// The `'error' in read` returns below are unreachable from the explorer and
// URL replay, which check disabledReason (badWord) first.

// ───────────────────────────── insert ─────────────────────────────

const insert: Op = {
  id: 'insert',
  label: 'Insert',
  args: [{ name: 'word', label: 'Word', type: 'text', maxLength: MAX_WORD, placeholder: 'e.g. cart' }],
  pseudocode: [
    'insert(word):',
    '  node ← root',
    '  for each letter c in word:',
    '    if node has no child c:',
    '      add a child for c',
    '    node ← node.child[c]',
    '  mark node as the end of a word',
  ],
  disabledReason: (trie, args) => tooBig(trie) ?? badWord(args, 'word'),
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    const read = readWord(String(args.word));
    if ('error' in read) return model;
    const { word } = read;
    yield t.frame({
      line: 1,
      note: `Start at the root. Each letter of ${q(word)} is one step down, so the path to its last node spells the word.`,
      marks: { key: [ROOT] },
      probe: { label: progress(word, 0), at: ROOT },
      vars: { word },
    });
    const path = [ROOT];
    let creating = false;
    for (let i = 0; i < word.length; i++) {
      const c = word[i];
      const at = path[path.length - 1];
      const node = t.model.nodes[at];
      const prefix = word.slice(0, i);
      const next = prefixOf(at) + c;
      t.count('lookups');
      if (node.children[c]) {
        path.push(node.children[c]);
        yield t.frame({
          line: 5,
          note: `${nodeName(prefix, true)} already has a child for ${q(c)}, shared with ${sample(t.model, node.children[c])}, so follow it.`,
          marks: { visited: path.slice(0, -1), key: [path[path.length - 1]] },
          path,
          probe: { label: progress(word, i + 1), at: path[path.length - 1] },
          vars: { word, c, prefix: next },
        });
        continue;
      }
      const id = ROOT + next;
      t.model = {
        nodes: { ...t.model.nodes, [at]: { ...node, children: { ...node.children, [c]: id } }, [id]: { children: {}, end: false } },
      };
      t.count('created');
      path.push(id);
      const first = !creating;
      creating = true;
      yield t.frame({
        line: 4,
        note: `${nodeName(prefix, true)} has no child for ${q(c)} yet, so add a node for ${q(next)}.${
          first && i < word.length - 1 ? ' From here on, every letter needs a new node.' : ''
        }`,
        marks: { visited: path.slice(0, -1), write: [id] },
        path,
        probe: { label: progress(word, i + 1), at: id },
        vars: { word, c, prefix: next },
      });
    }
    const endId = path[path.length - 1];
    if (t.model.nodes[endId].end) {
      yield t.frame({
        line: 6,
        note: `${q(word)} is already marked as a word, so nothing changes.`,
        marks: { visited: path.slice(0, -1), found: [endId] },
        path,
        vars: { word },
      });
      return model;
    }
    t.model = { nodes: { ...t.model.nodes, [endId]: { ...t.model.nodes[endId], end: true } } };
    const below = letters(t.model.nodes[endId]).length;
    yield t.frame({
      line: 6,
      note: `Mark the node for ${q(word)} as the end of a word (the double ring).${
        below ? ` It already led on to longer words, so without the mark ${q(word)} would only be a prefix.` : ''
      }`,
      marks: { visited: path.slice(0, -1), found: [endId] },
      path,
      vars: { word, length: word.length },
    });
    return t.model;
  },
};

// ───────────────────────────── search ─────────────────────────────

const search: Op = {
  id: 'search',
  label: 'Search',
  args: [{ name: 'word', label: 'Word', type: 'text', maxLength: MAX_WORD, placeholder: 'e.g. car' }],
  pseudocode: [
    'search(word):',
    '  node ← root',
    '  for each letter c in word:',
    '    if node has no child c:',
    '      return false',
    '    node ← node.child[c]',
    '  return node is the end of a word',
  ],
  disabledReason: (trie, args) => noWords(trie) ?? badWord(args, 'word'),
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    const read = readWord(String(args.word));
    if ('error' in read) return model;
    const { word } = read;
    const path = [ROOT];
    for (let i = 0; i < word.length; i++) {
      const c = word[i];
      const at = path[path.length - 1];
      const node = model.nodes[at];
      const prefix = word.slice(0, i);
      t.count('lookups');
      const next = node.children[c];
      if (!next) {
        yield t.frame({
          line: 4,
          note: `${nodeName(prefix, true)} has no child for ${q(c)}: no stored word starts with ${q(prefix + c)}, so ${q(word)} is not in the trie.`,
          marks: { visited: path.slice(0, -1), reject: [at] },
          path,
          probe: { label: progress(word, i), at },
          vars: { word, c, found: false },
        });
        return model;
      }
      path.push(next);
      const last = i === word.length - 1;
      yield t.frame({
        line: 5,
        note: last
          ? `Follow ${q(c)} to ${q(word)}: every letter matched.`
          : `${i === 0 ? 'Start at the root. ' : ''}Follow ${q(c)} to ${q(prefix + c)}.`,
        marks: { visited: path.slice(0, -1), key: [next] },
        path,
        probe: { label: progress(word, i + 1), at: next },
        vars: { word, c },
        ...(last && {
          checkpoint: {
            question: `Is ${q(word)} a stored word, or only a prefix?`,
            choices: ['A stored word', 'Only a prefix'],
            answer: model.nodes[next].end ? 0 : 1,
          },
        }),
      });
    }
    const endId = path[path.length - 1];
    const end = model.nodes[endId].end;
    yield t.frame({
      line: 6,
      note: end
        ? `The node for ${q(word)} is marked as the end of a word: found, after ${plural(word.length, 'step')}, one per letter.`
        : `The node for ${q(word)} is not marked as a word end: it is only a prefix of ${sample(model, endId)}. Not found.`,
      marks: end ? { visited: path.slice(0, -1), found: [endId] } : { visited: path.slice(0, -1), reject: [endId] },
      path,
      vars: { word, found: end },
    });
    return model;
  },
};

// ─────────────────────────── autocomplete ──────────────────────────

const autocomplete: Op = {
  id: 'prefix',
  label: 'Autocomplete',
  args: [{ name: 'prefix', label: 'Prefix', type: 'text', maxLength: MAX_WORD, placeholder: 'e.g. ca' }],
  pseudocode: [
    'wordsWithPrefix(p):',
    '  node ← root',
    '  for each letter c in p:',
    '    if node has no child c: return []',
    '    node ← node.child[c]',
    '  collect(node, p)',
    '',
    'collect(node, s):',
    '  if node ends a word: output s',
    '  for each child c, in a–z order:',
    '    collect(node.child[c], s + c)',
  ],
  disabledReason: (trie, args) => noWords(trie) ?? badWord(args, 'prefix'),
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    const read = readWord(String(args.prefix));
    if ('error' in read) return model;
    const p = read.word;
    const found: string[] = [];
    const output = () => ({ label: `Words starting with ${q(p)}`, items: [...found] });
    const path = [ROOT];
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      const at = path[path.length - 1];
      const node = model.nodes[at];
      t.count('lookups');
      const next = node.children[c];
      if (!next) {
        yield t.frame({
          line: 3,
          note: `${nodeName(p.slice(0, i), true)} has no child for ${q(c)}, so no stored word starts with ${q(p)}.`,
          marks: { visited: path.slice(0, -1), reject: [at] },
          path,
          probe: { label: progress(p, i), at },
          output: output(),
          vars: { prefix: p, matches: 0 },
        });
        return model;
      }
      path.push(next);
      const last = i === p.length - 1;
      yield t.frame({
        line: 4,
        note: last
          ? `Follow ${q(c)} to ${q(p)}. Every word below this node starts with ${q(p)}, so collect them all.`
          : `Follow ${q(c)} to ${q(p.slice(0, i + 1))}.`,
        marks: { visited: path.slice(0, -1), key: [next] },
        path,
        probe: { label: progress(p, i + 1), at: next },
        output: output(),
        vars: { prefix: p },
        ...(last && {
          checkpoint: {
            question: `Is ${q(p)} itself a stored word?`,
            choices: ['Yes, a word', 'No, only a prefix'],
            answer: model.nodes[next].end ? 0 : 1,
          },
        }),
      });
    }

    const done: NodeId[] = [];
    const prefixPath = [...path];
    function* collect(id: NodeId, trail: NodeId[]): Generator<F, void> {
      const n = model.nodes[id];
      const s = prefixOf(id);
      const kids = letters(n);
      const childText = kids.length ? ` Then its ${kids.length === 1 ? 'child' : 'children'} in a–z order: ${kids.join(', ')}.` : '';
      if (n.end) found.push(s);
      done.push(id);
      yield t.frame({
        line: n.end ? 8 : 9,
        note: n.end
          ? `${q(s)} ends a word: output it.${childText}`
          : `${q(s)} is not a word itself.${childText}`,
        marks: {
          visited: [...prefixPath.slice(0, -1), ...done.filter((d) => !model.nodes[d].end && d !== id)],
          found: done.filter((d) => model.nodes[d].end),
          key: n.end ? [] : [id],
        },
        path: trail,
        output: output(),
        vars: { s, matches: found.length },
      });
      for (const c of kids) yield* collect(n.children[c], [...trail, n.children[c]]);
    }
    yield* collect(path[path.length - 1], path);

    yield t.frame({
      line: 5,
      note: `${plural(found.length, 'word')} ${found.length === 1 ? 'starts' : 'start'} with ${q(p)}: ${found.join(', ')}. They come out in alphabetical order because children are visited a to z.`,
      marks: { visited: prefixPath, found: found.map((w) => ROOT + w) },
      path: prefixPath,
      output: output(),
      vars: { prefix: p, matches: found.length },
    });
    return model;
  },
};

// ───────────────────────────── delete ─────────────────────────────

const remove: Op = {
  id: 'delete',
  label: 'Delete',
  // Only stored words: Search shows how a missing word or a bare prefix is ruled out.
  args: [{ name: 'word', label: 'Word', type: 'choice', options: (trie) => wordsOf(trie) }],
  pseudocode: [
    'delete(word):',
    '  node ← end of word’s path',
    '  node.end ← false',
    '  while node ≠ root and node is unused:',
    '    remove node;  node ← its parent',
  ],
  disabledReason: noWords,
  *run(model, args) {
    const t = new TreeTracer(model, drawing, STATS);
    const word = String(args.word);
    const full = pathOf(model, word);
    const endId = full[full.length - 1];
    if (full.length <= word.length || !model.nodes[endId].end) return model; // unreachable: the word is a choice
    for (let i = 1; i < full.length; i++) {
      t.count('lookups');
      const path = full.slice(0, i + 1);
      yield t.frame({
        line: 1,
        note: `${i === 1 ? `Walk down the letters of ${q(word)}. ` : ''}Follow ${q(word[i - 1])} to ${q(word.slice(0, i))}.`,
        marks: { visited: path.slice(0, -1), key: [path[path.length - 1]] },
        path,
        probe: { label: progress(word, i), at: path[path.length - 1] },
        vars: { word },
      });
    }

    t.model = { nodes: { ...model.nodes, [endId]: { ...model.nodes[endId], end: false } } };
    const hasKids = letters(model.nodes[endId]).length > 0;
    yield t.frame({
      line: 2,
      note: `Unmark ${q(word)} as a word end: its double ring goes. Nodes that no other word needs can now be removed too.`,
      marks: { visited: full.slice(0, -1), key: [endId] },
      path: full,
      vars: { word },
      checkpoint: {
        question: `Will the node for ${q(word)} be removed?`,
        choices: ['Yes, nothing needs it', 'No, it is still needed'],
        answer: hasKids ? 1 : 0,
      },
    });

    let depth = full.length - 1;
    for (;;) {
      const id = full[depth];
      const n = t.model.nodes[id];
      const kids = letters(n);
      if (id === ROOT || kids.length > 0 || n.end) {
        yield t.frame({
          line: 3,
          note:
            id === ROOT
              ? 'Back at the root, which always stays. Done.'
              : n.end
                ? `${q(prefixOf(id))} is itself a stored word, so it stays. Done.`
                : `${q(prefixOf(id))} still leads to ${sample(t.model, id)}, so it stays. Done.`,
          marks: { visited: full.slice(0, depth), key: [id] },
          path: full.slice(0, depth + 1),
          vars: { word },
        });
        return t.model;
      }
      const parentId = full[depth - 1];
      const parent = t.model.nodes[parentId];
      const c = id[id.length - 1];
      const children = { ...parent.children };
      delete children[c];
      const nodes = { ...t.model.nodes, [parentId]: { ...parent, children } };
      delete nodes[id];
      t.model = { nodes };
      t.count('removed');
      depth -= 1;
      yield t.frame({
        line: 4,
        note: `${q(prefixOf(id))} has no children and ends no word, so nothing needs it: remove it and step up to ${nodeName(prefixOf(parentId))}.`,
        marks: { visited: full.slice(0, depth), key: [parentId] },
        path: full.slice(0, depth + 1),
        vars: { word },
      });
    }
  },
};

// ───────────────────────────── module ─────────────────────────────

export function buildTrie(words: readonly string[]): Trie {
  const nodes: Record<NodeId, TrieNode> = { ...emptyTrie().nodes };
  for (const word of words) {
    let at = ROOT;
    for (const c of word) {
      const next = at + c;
      if (!nodes[next]) {
        nodes[at] = { ...nodes[at], children: { ...nodes[at].children, [c]: next } };
        nodes[next] = { children: {}, end: false };
      }
      at = next;
    }
    nodes[at] = { ...nodes[at], end: true };
  }
  return { nodes };
}

const WORDS = ['ant', 'ape', 'apple', 'apply', 'bat', 'bath', 'bake', 'bell', 'belt', 'can', 'cane', 'cart', 'cat', 'dot', 'dove', 'ear', 'eat', 'tea', 'team', 'tear', 'ten', 'tent', 'to', 'toe', 'top'];

function randomWords(seed: number, count: number): string[] {
  const rng = createRng(seed);
  const pool = [...WORDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const trie = defineStructure<Trie, TreeState>({
  kind: 'structure',
  slug: 'trie',
  view: 'tree',
  initial: [
    { id: 'dictionary', label: 'Small dictionary', make: () => buildTrie(['car', 'card', 'care', 'cat', 'do', 'dog', 'dot']) },
    { id: 'empty', label: 'Empty', make: () => emptyTrie() },
    { id: 'shared', label: 'Long shared prefix', make: () => buildTrie(['inter', 'internal', 'internet', 'interval', 'into']) },
    { id: 'random', label: 'Random words (6)', make: (seed) => buildTrie(randomWords(seed, 6)) },
  ],
  snapshot: (tr) => treeSnapshot(drawing, tr),
  operations: [insert, search, autocomplete, remove],
  stats: [
    { key: 'lookups', label: 'Child lookups' },
    { key: 'created', label: 'Nodes added' },
    { key: 'removed', label: 'Nodes removed' },
  ],
  legend: [
    { neutral: 'Not involved' },
    { mark: 'visited', label: 'On the path' },
    { mark: 'key', label: 'Current node' },
    { mark: 'write', label: 'New node' },
    { mark: 'found', label: 'Word found / output' },
    { mark: 'reject', label: 'Dead end: letter or word missing' },
  ],
  content: {
    idea: 'A trie stores words letter by letter along paths from the root: each edge is a letter, so the path to a node spells a prefix. Words that share a prefix share those nodes, and a double ring marks a node where a stored word ends. Looking up a word of length m takes m steps, however many words are stored.',
    invariant: 'The path from the root to any node spells that node’s prefix; a node is marked exactly when its prefix is a stored word; and every leaf ends a word, so no branch leads nowhere.',
    whenToUse:
      'Autocomplete, spell checkers, word games and IP routing (longest-prefix match): anything that asks "which words start with…?". It trades memory (a node per letter) for lookups that depend only on the word’s length. Try Autocomplete with "ca" on the small dictionary, or search for "ca" itself.',
    traits: [
      { label: 'O(m) lookup for a word of length m', good: true },
      { label: 'Prefix queries come for free', good: true },
      { label: 'A node per letter: memory-hungry', good: false },
    ],
    experiments: [
      { example: 'dictionary', prompt: 'Search for "ca": the path exists, but is it a word?' },
      { example: 'dictionary', prompt: 'Delete "card", then "car": why does one remove a node and the other only a ring?' },
      { example: 'shared', prompt: 'Five words, but count the nodes: a shared prefix is stored once.' },
    ],
  },
});

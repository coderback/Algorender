// Realistic memory diagrams, one step each, for tests and for checking the
// view by eye. Values are written the way the runtimes write them: Python
// `'hi'`/`True`/`None`, JavaScript `"hi"`/`true`/`null`.
import type { Language, MemValue } from '@/workspace/protocol';
import type { MemoryState } from './types';

export type MemoryFixture = {
  slug: string;
  title: string;
  language: Language;
  code: string;
  /** Which step of the code the state shows. */
  at: string;
  state: MemoryState;
};

const num = (n: number): MemValue => ({ prim: String(n), type: 'number' });
const py = (s: string): MemValue => ({ prim: `'${s}'`, type: 'string' });
const js = (s: string): MemValue => ({ prim: JSON.stringify(s), type: 'string' });
const bool = (b: boolean, language: 'python' | 'javascript'): MemValue => ({
  prim: language === 'python' ? (b ? 'True' : 'False') : String(b),
  type: 'boolean',
});
const ref = (id: string): MemValue => ({ ref: id });
const local = (name: string, value: MemValue, changed = false) => ({ name, value, changed });
const nums = (...ns: number[]) => ns.map(num);

export const MEMORY_FIXTURES: MemoryFixture[] = [
  {
    slug: 'straight-line',
    title: 'A list grows',
    language: 'python',
    code: 'nums = [3, 1, 2]\nnums.append(4)\ntotal = sum(nums)',
    at: 'Before line 3: the append has just changed the list.',
    state: {
      frames: [{ id: 'f0', fn: 'Global frame', locals: [local('nums', ref('o1'))], active: true }],
      heap: [{ object: { id: 'o1', kind: 'list', type: 'list', items: nums(3, 1, 2, 4), more: 0 }, changed: true, fresh: false }],
      output: [],
    },
  },
  {
    slug: 'recursion',
    title: 'Three calls deep',
    language: 'python',
    code: 'def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nresult = fact(3)',
    at: 'fact(1) returning, with fact(3) and fact(2) waiting on it.',
    state: {
      frames: [
        { id: 'f0', fn: 'Global frame', locals: [local('fact', ref('o1'))], active: false },
        { id: 'f1', fn: 'fact', locals: [local('n', num(3))], active: false },
        { id: 'f2', fn: 'fact', locals: [local('n', num(2))], active: false },
        { id: 'f3', fn: 'fact', locals: [local('n', num(1))], active: true, returning: num(1) },
      ],
      heap: [{ object: { id: 'o1', kind: 'function', type: 'function', name: 'fact' }, changed: false, fresh: false }],
      output: [],
    },
  },
  {
    slug: 'aliasing',
    title: 'Two names, one list',
    language: 'python',
    code: 'a = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)',
    at: 'After print(a): appending through b changed the list a names too.',
    state: {
      frames: [{ id: 'f0', fn: 'Global frame', locals: [local('a', ref('o1')), local('b', ref('o1'))], active: true }],
      heap: [{ object: { id: 'o1', kind: 'list', type: 'list', items: nums(1, 2, 3, 4), more: 0 }, changed: false, fresh: false }],
      output: ['[1, 2, 3, 4]'],
    },
  },
  {
    slug: 'objects',
    title: 'A dict, an instance and nested lists',
    language: 'python',
    code: [
      'class Point:',
      '    def __init__(self, x, y):',
      '        self.x = x',
      '        self.y = y',
      '',
      'p = Point(1, 2)',
      "p.tags = ['start', 'corner']",
      "ages = {'ann': 31, 'bob': 27}",
      'grid = [[1, 2], [3, 4]]',
    ].join('\n'),
    at: 'After the last line: grid and its two rows are new.',
    state: {
      frames: [
        {
          id: 'f0',
          fn: 'Global frame',
          // The class itself, shown the way a runtime might: a function-like box named "class Point".
          locals: [local('Point', ref('o1')), local('p', ref('o2')), local('ages', ref('o4')), local('grid', ref('o5'), true)],
          active: true,
        },
      ],
      heap: [
        { object: { id: 'o1', kind: 'function', type: 'class', name: 'Point' }, changed: false, fresh: false },
        {
          object: { id: 'o2', kind: 'object', type: 'Point', fields: [['x', num(1)], ['y', num(2)], ['tags', ref('o3')]], more: 0 },
          changed: false,
          fresh: false,
        },
        { object: { id: 'o3', kind: 'list', type: 'list', items: [py('start'), py('corner')], more: 0 }, changed: false, fresh: false },
        {
          object: { id: 'o4', kind: 'dict', type: 'dict', entries: [[py('ann'), num(31)], [py('bob'), num(27)]], more: 0 },
          changed: false,
          fresh: false,
        },
        { object: { id: 'o5', kind: 'list', type: 'list', items: [ref('o6'), ref('o7')], more: 0 }, changed: false, fresh: true },
        { object: { id: 'o6', kind: 'list', type: 'list', items: nums(1, 2), more: 0 }, changed: false, fresh: true },
        { object: { id: 'o7', kind: 'list', type: 'list', items: nums(3, 4), more: 0 }, changed: false, fresh: true },
      ],
      output: [],
    },
  },
  {
    slug: 'long-list',
    title: 'A long array, cut short',
    language: 'javascript',
    code: 'const squares = Array.from({ length: 100 }, (_, i) => i * i);\nconst label = "squares";\nlet done = false;',
    at: 'After the last line: only the first 25 squares are shown.',
    state: {
      frames: [
        {
          id: 'f0',
          fn: 'Global frame',
          locals: [local('squares', ref('o1')), local('label', js('squares')), local('done', bool(false, 'javascript'), true)],
          active: true,
        },
      ],
      heap: [
        {
          object: { id: 'o1', kind: 'list', type: 'Array', items: Array.from({ length: 25 }, (_, i) => num(i * i)), more: 75 },
          changed: false,
          fresh: false,
        },
      ],
      output: [],
    },
  },
  {
    slug: 'fresh-and-changed',
    title: 'Unpacking makes a new list',
    language: 'python',
    code: 'def split_first(nums):\n    head, *rest = nums\n    return head, rest\n\nnums = [4, 8, 15, 16]\nprint(nums)\nfirst, others = split_first(nums)',
    at: 'Inside split_first, just after head, *rest = nums.',
    state: {
      frames: [
        { id: 'f0', fn: 'Global frame', locals: [local('split_first', ref('o1')), local('nums', ref('o2'))], active: false },
        {
          id: 'f1',
          fn: 'split_first',
          locals: [local('nums', ref('o2')), local('head', num(4), true), local('rest', ref('o3'), true)],
          active: true,
        },
      ],
      heap: [
        { object: { id: 'o1', kind: 'function', type: 'function', name: 'split_first' }, changed: false, fresh: false },
        { object: { id: 'o2', kind: 'list', type: 'list', items: nums(4, 8, 15, 16), more: 0 }, changed: false, fresh: false },
        { object: { id: 'o3', kind: 'list', type: 'list', items: nums(8, 15, 16), more: 0 }, changed: false, fresh: true },
      ],
      output: ['[4, 8, 15, 16]'],
    },
  },
  {
    slug: 'tuple-and-set',
    title: 'A tuple, a set and an empty list',
    language: 'python',
    code: "point = (3, 4)\nseen = {'a', 'b'}\nempty = []\nfound = None\nok = True",
    at: 'After the last line.',
    state: {
      frames: [
        {
          id: 'f0',
          fn: 'Global frame',
          locals: [
            local('point', ref('o1')),
            local('seen', ref('o2')),
            local('empty', ref('o3')),
            local('found', { prim: 'None', type: 'none' }),
            local('ok', bool(true, 'python'), true),
          ],
          active: true,
        },
      ],
      heap: [
        { object: { id: 'o1', kind: 'tuple', type: 'tuple', items: nums(3, 4), more: 0 }, changed: false, fresh: false },
        { object: { id: 'o2', kind: 'set', type: 'set', items: [py('a'), py('b')], more: 0 }, changed: false, fresh: false },
        { object: { id: 'o3', kind: 'list', type: 'list', items: [], more: 0 }, changed: false, fresh: false },
      ],
      output: [],
    },
  },
  {
    slug: 'parameter',
    title: 'A function changes its caller’s list',
    language: 'python',
    code: 'def add(items, x):\n    items.append(x)\n\nnums = [1, 2]\nadd(nums, 3)',
    at: 'Inside add, after the append: items and nums are one list, so nums has changed too.',
    state: {
      frames: [
        { id: 'f0', fn: 'Global frame', locals: [local('add', ref('o1')), local('nums', ref('o2'))], active: false },
        { id: 'f1', fn: 'add', locals: [local('items', ref('o2')), local('x', num(3))], active: true, returning: { prim: 'None', type: 'none' } },
      ],
      heap: [
        { object: { id: 'o1', kind: 'function', type: 'function', name: 'add' }, changed: false, fresh: false },
        { object: { id: 'o2', kind: 'list', type: 'list', items: nums(1, 2, 3), more: 0 }, changed: true, fresh: false },
      ],
      output: [],
    },
  },
  {
    slug: 'closure',
    title: 'A closure outlives its frame',
    language: 'python',
    code: 'def counter():\n    count = 0\n    def tick():\n        nonlocal count\n        count += 1\n        return count\n    return tick\n\nc = counter()\nc()\nc()',
    at: 'After the second c(): counter’s frame is long gone, but tick still holds count.',
    state: {
      frames: [{ id: 'f0', fn: 'Global frame', locals: [local('counter', ref('o1')), local('c', ref('o2'))], active: true }],
      heap: [
        { object: { id: 'o1', kind: 'function', type: 'function', name: 'counter' }, changed: false, fresh: false },
        { object: { id: 'o2', kind: 'function', type: 'function', name: 'tick', captured: [['count', num(2)]] }, changed: true, fresh: false },
      ],
      output: [],
    },
  },
  {
    slug: 'mutable-default',
    title: 'One default list for every call',
    language: 'python',
    code: 'def add(x, items=[]):\n    items.append(x)\n    return items\n\na = add(1)\nb = add(2)',
    at: 'After both calls: the default list lives on the function, so a and b are the same list.',
    state: {
      frames: [{ id: 'f0', fn: 'Global frame', locals: [local('add', ref('o1')), local('a', ref('o2')), local('b', ref('o2'), true)], active: true }],
      heap: [
        { object: { id: 'o1', kind: 'function', type: 'function', name: 'add', defaults: [['items', ref('o2')]] }, changed: false, fresh: false },
        { object: { id: 'o2', kind: 'list', type: 'list', items: nums(1, 2), more: 0 }, changed: false, fresh: false },
      ],
      output: [],
    },
  },
];

export function fixture(slug: string): MemoryFixture {
  const found = MEMORY_FIXTURES.find((f) => f.slug === slug);
  if (!found) throw new Error(`No memory fixture "${slug}"`);
  return found;
}

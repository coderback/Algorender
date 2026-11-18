import type { TaskInput } from '@/tasks/schema';

// The Python track, unit 4 (Collections): each topic's tasks, in the order its
// strip shows them. The first is the prediction the topic itself asks.
// (L2's batch 2 wrote lists, references and tuples; batch 3 adds the rest.)

export const PYTHON_COLLECTIONS: TaskInput[] = [
  // ── py-lists ────────────────────────────────────────────────
  {
    slug: 'py-list-ops',
    kind: 'output',
    title: 'A list, changed step by step',
    concept: 'py-lists',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`append` adds to the end; `items[1] = 0` replaces the item at index 1; `pop(0)` takes out the item at index 0.',
      'Indexes count from 0, and `-1` is the last item.',
      'Python prints a list in square brackets, with a comma and a space between the items.',
    ],
    vary: { a: ['2', '9', '5'] },
    code: { python: 'items = [«a», 4, 7]\nitems.append(items[0] + 1)\nitems[1] = 0\nitems.pop(0)\nprint(items)\nprint(len(items), items[-1])\n' },
  },
  {
    slug: 'py-list-average',
    kind: 'function',
    title: 'The average of a list',
    concept: 'py-lists',
    prompt: 'Write `average(nums)`, which returns the average of a list of numbers (it always has at least one). `average([1, 2, 3])` returns `2.0`.',
    hints: ['`sum(nums)` adds the list up, and `len(nums)` counts its items.', 'Divide with `/`, so the answer is a float.'],
    starter: { python: 'def average(nums):\n    return 0\n' },
    solution: { python: 'def average(nums):\n    return sum(nums) / len(nums)\n' },
    check: { kind: 'function', entry: { python: 'average' }, calls: [[[1, 2, 3]], [[10]], [[2, 3]], [[-4, 4, 9]]], compare: 'float' },
  },
  {
    slug: 'py-evens-only',
    kind: 'function',
    title: 'Keep the even numbers',
    concept: 'py-lists',
    prompt: 'Write `evens(nums)`, which returns a **new** list of the even numbers in `nums`, in the same order. `evens([1, 2, 3, 4])` returns `[2, 4]`, and a list with none gives `[]`.',
    hints: ['Start with an empty list, `result = []`.', 'Loop over `nums`, and `append` each number whose remainder by 2 is 0.', 'Return `result` after the loop.'],
    starter: { python: 'def evens(nums):\n    result = []\n    return result\n' },
    solution: { python: 'def evens(nums):\n    result = []\n    for n in nums:\n        if n % 2 == 0:\n            result.append(n)\n    return result\n' },
    check: { kind: 'function', entry: { python: 'evens' }, calls: [[[1, 2, 3, 4]], [[]], [[7, 9]], [[0, -2, 5, 8]]] },
  },
  {
    slug: 'py-words-backwards',
    kind: 'program',
    title: 'Last word first',
    concept: 'py-lists',
    prompt: 'Read a whole number `n`, then `n` words, one per line. Print the words last first, one per line. For `3`, then `red`, `green`, `blue`:\n\n```\nblue\ngreen\nred\n```',
    hints: ['Collect the words in a list with `append`.', '`words[::-1]` is a new list with the items in reverse order; loop over it with `for`.'],
    starter: { python: 'n = int(input())\nwords = []\n' },
    solution: { python: 'n = int(input())\nwords = []\nfor i in range(n):\n    words.append(input())\nfor w in words[::-1]:\n    print(w)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'Three colours', stdin: '3\nred\ngreen\nblue\n' },
        { name: 'One word', stdin: '1\nhello\n' },
        { name: 'No words', stdin: '0\n', hidden: true },
        { name: 'Five words', stdin: '5\na\nb\nc\nd\ne\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-append-none',
    kind: 'bug',
    title: 'Squares that vanish',
    concept: 'py-lists',
    prompt: 'This program reads a number `n` and should print the list of the squares of 0 to n − 1. For 3 that is `[0, 1, 4]`. Fix it.',
    symptom: "For 3 it stops at line 4 with AttributeError: 'NoneType' object has no attribute 'append'. For 1 it prints None.",
    explanation:
      '`append` changes the list in place and gives back `None`. `nums = nums.append(...)` adds the square, then points `nums` at that `None`, so the next turn has no list to append to. Call `nums.append(...)` on its own line, without `nums =`.',
    hints: ['What does `nums.append(...)` give back? Print it to see.', 'Drop the `nums = ` in front of the append.'],
    starter: { python: 'nums = []\nn = int(input())\nfor i in range(n):\n    nums = nums.append(i * i)\nprint(nums)\n' },
    solution: { python: 'nums = []\nn = int(input())\nfor i in range(n):\n    nums.append(i * i)\nprint(nums)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '3', stdin: '3\n' },
        { name: '1', stdin: '1\n' },
        { name: '0', stdin: '0\n', hidden: true },
        { name: '6', stdin: '6\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-first-last-rest',
    kind: 'fill',
    title: 'First, last and the rest',
    concept: 'py-lists',
    prompt:
      'Read a number `n` (1 or more), then `n` whole numbers. Fill the gaps so the program prints the first number, the last, and a list of all but the first. For `3`, then `5`, `6`, `7`:\n\n```\n5\n7\n[6, 7]\n```',
    hints: ['Index 0 is the first item; a negative index counts from the end.', 'A slice `nums[start:]` runs from `start` to the end.'],
    solution: { python: 'nums = []\nn = int(input())\nfor i in range(n):\n    nums.«1:append»(int(input()))\nprint(nums[«2:0»])\nprint(nums[«3:-1»])\nprint(nums[«4:1»:])\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '5, 6, 7', stdin: '3\n5\n6\n7\n' },
        { name: 'Just 9', stdin: '1\n9\n' },
        { name: 'Four numbers', stdin: '4\n1\n2\n3\n4\n', hidden: true },
      ],
    },
  },

  // ── py-references ───────────────────────────────────────────
  {
    slug: 'py-alias-or-copy',
    kind: 'output',
    title: 'Two names or two lists?',
    concept: 'py-references',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`b = a` gives the list a second name; it doesn’t make a new list.',
      '`a[:]` is a slice of the whole list: a new list with the same items.',
      '`==` asks whether two lists hold the same items; `is` asks whether they are the very same list.',
    ],
    vary: { x: ['1', '5', '9'] },
    code: { python: 'a = [«x», 2]\nb = a\nc = a[:]\nb.append(3)\nc[0] = 0\nprint(a)\nprint(c)\nprint(a == b, a is c)\n' },
  },
  {
    slug: 'py-shared-default',
    kind: 'bug',
    title: 'Lists that won’t stay apart',
    concept: 'py-references',
    prompt: '`start_list(first)` should give back a new list holding just `first`. The program reads two words and makes a list from each. For `pen` and `cup` it should print:\n\n```\n[\'pen\']\n[\'cup\']\n```\n\nFix it.',
    symptom: "For pen and cup it prints ['pen', 'cup'] twice: both lists hold both words.",
    explanation:
      'A default value is made once, when `def` runs, and kept on the function. Every call that leaves `items` out gets that same list, so both calls append to it and both return it. Use `items=None` as the default, and make a fresh list inside: `if items is None: items = []`.',
    hints: ['When is the `[]` in the `def` line made: on every call, or once?', 'Make the default `None`, and inside the function set `items = []` when it is `None`.'],
    starter: { python: 'def start_list(first, items=[]):\n    items.append(first)\n    return items\n\na = start_list(input())\nb = start_list(input())\nprint(a)\nprint(b)\n' },
    solution: {
      python: 'def start_list(first, items=None):\n    if items is None:\n        items = []\n    items.append(first)\n    return items\n\na = start_list(input())\nb = start_list(input())\nprint(a)\nprint(b)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'pen and cup', stdin: 'pen\ncup\n' },
        { name: 'The same word twice', stdin: 'same\nsame\n' },
        { name: 'a and b', stdin: 'a\nb\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-with-item',
    kind: 'tests',
    title: 'Add without changing',
    concept: 'py-references',
    prompt:
      'Write `with_item(items, x)`, which returns a **new** list: the items of `items` with `x` added at the end. The list passed in must not change:\n\n```python\nnums = [1, 2]\nmore = with_item(nums, 3)\nprint(nums, more)   # [1, 2] [1, 2, 3]\n```',
    hints: ['`items` is the caller’s own list, not a copy: appending to it changes theirs.', 'Copy it first with `items.copy()` (or `items[:]`), then append to the copy and return that.'],
    starter: { python: 'def with_item(items, x):\n    items.append(x)\n    return items\n' },
    solution: { python: 'def with_item(items, x):\n    result = items.copy()\n    result.append(x)\n    return result\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_adds_at_the_end():\n    assert with_item([1, 2], 3) == [1, 2, 3]\n\n\ndef test_leaves_the_list_passed_in():\n    nums = [1, 2]\n    with_item(nums, 3)\n    assert nums == [1, 2]\n\n\ndef test_gives_back_a_new_list():\n    nums = [4]\n    assert with_item(nums, 5) is not nums\n',
      },
    },
  },
  {
    slug: 'py-copy-grid',
    kind: 'tests',
    title: 'Copy a grid, rows and all',
    concept: 'py-references',
    prompt:
      'A grid is a list of rows, each row a list. Write `copy_grid(grid)`, which returns a copy you can change without changing the original: not even its rows.\n\nThe starter’s `grid.copy()` copies only the outer list. The rows inside are still shared.',
    hints: ['Start a new empty list, then append a copy of each row to it.', 'A row’s copy is `row.copy()` (or `row[:]`).'],
    starter: { python: 'def copy_grid(grid):\n    return grid.copy()\n' },
    solution: { python: 'def copy_grid(grid):\n    result = []\n    for row in grid:\n        result.append(row.copy())\n    return result\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_same_cells():\n    assert copy_grid([[1, 2], [3, 4]]) == [[1, 2], [3, 4]]\n\n\ndef test_changing_a_cell_leaves_the_original():\n    grid = [[1, 2], [3, 4]]\n    copy = copy_grid(grid)\n    copy[0][0] = 9\n    assert grid == [[1, 2], [3, 4]]\n\n\ndef test_rows_are_new_lists():\n    grid = [[0], [0]]\n    copy = copy_grid(grid)\n    assert copy[1] is not grid[1]\n',
      },
    },
  },
  {
    slug: 'py-is-or-equal',
    kind: 'choice',
    title: 'The very same list?',
    concept: 'py-references',
    prompt: 'You want to know whether `a` and `b` name the very same list, so that a change made through one would show through the other. Which do you write?',
    choices: ['a is b', 'a == b', 'a = b'],
    answer: 0,
    why: '`is` asks whether two names point at one object. `==` only asks whether the two lists hold equal items, which two separate lists can. `a = b` isn’t a question at all: it points `a` at `b`’s list.',
  },

  // ── py-tuples ───────────────────────────────────────────────
  {
    slug: 'py-swap-unpack',
    kind: 'output',
    title: 'Swapping and unpacking',
    concept: 'py-tuples',
    prompt: 'Type exactly what this prints.',
    hints: [
      'In `a, b = b, a + b`, Python works out the whole right side first, using the old `a` and `b`, and only then points the names at the results.',
      'Python prints a tuple in round brackets.',
    ],
    vary: { p: ['1', '2', '5'], q: ['2', '3', '0'] },
    code: { python: 'a, b = «p», «q»\na, b = b, a + b\npair = (a, b)\nfirst, second = pair\nprint(pair)\nprint(first * 2, second)\n' },
  },
  {
    slug: 'py-min-max-pair',
    kind: 'function',
    title: 'Smallest and largest together',
    concept: 'py-tuples',
    prompt: 'Write `min_max(nums)`, which returns a tuple of the smallest and the largest number in a list (it always has at least one), with a loop of your own rather than `min` and `max` (the check only compares answers). `min_max([3, 1, 2])` returns `(1, 3)`.',
    hints: ['Start both the smallest and the largest at `nums[0]`.', 'Loop over `nums`, updating each when a number beats it.', '`return lo, hi` gives back both, as one tuple.'],
    starter: { python: 'def min_max(nums):\n    lo = nums[0]\n    hi = nums[0]\n    return lo\n' },
    solution: { python: 'def min_max(nums):\n    lo = nums[0]\n    hi = nums[0]\n    for n in nums:\n        if n < lo:\n            lo = n\n        if n > hi:\n            hi = n\n    return lo, hi\n' },
    check: { kind: 'function', entry: { python: 'min_max' }, calls: [[[3, 1, 2]], [[5]], [[-1, -5, 0, 4]], [[2, 2, 2]]] },
  },
  {
    slug: 'py-fib-swap',
    kind: 'fill',
    title: 'Fibonacci with a swap',
    concept: 'py-tuples',
    prompt:
      'Fill the gaps so the program prints the first `n` Fibonacci numbers (0, 1, 1, 2, 3, 5…), one per line, for the `n` it reads. Each turn moves the pair along: the new first is the old second, and the new second is the sum of the two.',
    hints: ['The pair starts as 0 and 1.', 'One line moves both: `a, b = b, a + b`. The right side uses the old values of both.'],
    solution: { python: 'n = int(input())\na, b = «1:0», «2:1»\nfor i in range(n):\n    print(a)\n    a, b = «3:b», «4:a + b»\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'The first 5', stdin: '5\n' },
        { name: 'Just the first', stdin: '1\n' },
        { name: 'The first 10', stdin: '10\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-move-point',
    kind: 'bug',
    title: 'A point that won’t move',
    concept: 'py-tuples',
    prompt: 'This program reads a point’s x and y and should print it moved one step to the right, as a tuple: for 3 and 4, `(4, 4)`. Fix it.',
    symptom: "It stops at line 2 with TypeError: 'tuple' object does not support item assignment.",
    explanation:
      'A tuple can’t be changed once it’s made: no item can be replaced, added or removed. Make a new tuple instead, and point the name at it: `point = (point[0] + 1, point[1])`.',
    hints: ['Can you change an item of a tuple?', 'Build a new tuple from the old one’s items, with x one bigger.'],
    starter: { python: 'point = (int(input()), int(input()))\npoint[0] = point[0] + 1\nprint(point)\n' },
    solution: { python: 'point = (int(input()), int(input()))\npoint = (point[0] + 1, point[1])\nprint(point)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '3 and 4', stdin: '3\n4\n' },
        { name: 'The origin', stdin: '0\n0\n' },
        { name: 'A negative x', stdin: '-2\n5\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-split-minutes',
    kind: 'parsons',
    title: 'Hours and minutes',
    concept: 'py-tuples',
    prompt: 'Put the lines in order, and indent them, so the program reads a number of minutes and prints it as hours and minutes: for 135, `2 h 15 min`. One line doesn’t belong.',
    hints: ['`split_minutes` gives back two values at once, as a tuple.', 'Unpack the tuple into two names in one line.'],
    solution: { python: 'def split_minutes(total):\n    return total // 60, total % 60\nm = int(input())\nhours, mins = split_minutes(m)\nprint(hours, "h", mins, "min")\n' },
    distractors: { python: ['hours = split_minutes(m)'] },
    check: {
      kind: 'program',
      cases: [
        { name: '135 minutes', stdin: '135\n' },
        { name: 'An hour', stdin: '60\n' },
        { name: '5 minutes', stdin: '5\n' },
      ],
    },
  },
];

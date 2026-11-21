import type { TaskInput } from '@/tasks/schema';

// The Python track, unit 4 (Collections): each topic's tasks, in the order its
// strip shows them. The first is the prediction the topic itself asks.
// (L2's batch 2 wrote lists, references and tuples; batch 3 the rest.)

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
  // ── py-dicts ────────────────────────────────────────────────
  {
    slug: 'py-dict-stock',
    kind: 'output',
    title: 'A stock list',
    concept: 'py-dicts',
    prompt: 'Type exactly what this prints.',
    hints: [
      'Assigning to a new key adds a pair at the end. Assigning to a key already there changes its value, and it keeps its place.',
      '`in` looks only at the keys, and `get` gives back its default when the key is missing.',
      'A loop over a dict visits the keys, in the order they were first added.',
    ],
    vary: { a: ['4', '1', '7'], b: ['5', '3', '0'] },
    code: {
      python:
        'stock = {"pen": «a», "cup": 2}\nstock["mug"] = «b»\nstock["pen"] = stock["pen"] + 1\nprint(len(stock), "mug" in stock, 2 in stock)\nprint(stock.get("bag", 0), stock.get("cup", 0))\nfor item in stock:\n    print(item, stock[item])\n',
    },
  },
  {
    slug: 'py-count-words',
    kind: 'function',
    title: 'Count the words',
    concept: 'py-dicts',
    prompt:
      'Write `count_words(words)`, which takes a list of words and returns a dict from each word to the number of times it appears:\n\n```python\ncount_words(["the", "cat", "the"])   # {\'the\': 2, \'cat\': 1}\n```\n\nAn empty list gives an empty dict.',
    hints: [
      'Start with an empty dict, `counts = {}`, and loop over the words.',
      '`counts.get(w, 0)` gives the count so far, or 0 for a word not seen yet.',
      'Store one more than that: `counts[w] = counts.get(w, 0) + 1`.',
    ],
    starter: { python: 'def count_words(words):\n    counts = {}\n    return counts\n' },
    solution: { python: 'def count_words(words):\n    counts = {}\n    for w in words:\n        counts[w] = counts.get(w, 0) + 1\n    return counts\n' },
    check: {
      kind: 'function',
      entry: { python: 'count_words' },
      calls: [[['the', 'cat', 'the']], [[]], [['hi', 'hi', 'hi']], [['a', 'b', 'c', 'b', 'a', 'b']]],
    },
  },
  {
    slug: 'py-top-scorer',
    kind: 'fill',
    title: 'Who scored most?',
    concept: 'py-dicts',
    prompt:
      'Fill the gaps so `best(scores)` returns the name with the highest score, from a dict of names to scores (all 0 or more). On a tie, the name added first wins, and an empty dict gives `None`. `best({"ann": 3, "bob": 5, "cy": 4})` returns `"bob"`.',
    hints: [
      '`.items()` gives each pair as a tuple, which the `for` line unpacks into two names.',
      'On a tie the first name must stay, so only replace it when the new score is strictly bigger.',
    ],
    solution: {
      python:
        'def best(scores):\n    top_name = None\n    top = -1\n    for «1:name», «2:score» in scores.«3:items()»:\n        if score «4:>» top:\n            top_name = name\n            top = score\n    return top_name\n',
    },
    check: {
      kind: 'function',
      entry: { python: 'best' },
      calls: [[{ ann: 3, bob: 5, cy: 4 }], [{ solo: 0 }], [{ x: 2, y: 2 }], [{}], [{ kai: 1, lu: 9, mo: 9 }]],
    },
  },
  {
    slug: 'py-menu-price',
    kind: 'bug',
    title: 'A menu that crashes',
    concept: 'py-dicts',
    prompt:
      'This program reads the name of something on a café menu and prints its price, or says the café doesn’t sell it. For `tea` it should print `tea costs 2`, and for `chips`, `We don\'t sell chips`. Fix it.',
    symptom: "For chips it stops at line 3 with KeyError: 'chips'.",
    explanation:
      'Reading a key the dict doesn’t have, `prices[item]`, doesn’t give `None`: it stops the program with a `KeyError`, before `is None` is ever checked. Ask whether the key is there first, `if item not in prices:`, or read it with `prices.get(item)`, which gives `None` for a missing key.',
    hints: [
      'What does `prices["chips"]` give when the dict has no `"chips"` key?',
      '`item not in prices` is `True` when the key is missing. Ask that before reading `prices[item]`.',
    ],
    starter: {
      python:
        'prices = {"tea": 2, "cake": 3, "soup": 5}\nitem = input()\nif prices[item] is None:\n    print("We don\'t sell", item)\nelse:\n    print(item, "costs", prices[item])\n',
    },
    solution: {
      python:
        'prices = {"tea": 2, "cake": 3, "soup": 5}\nitem = input()\nif item not in prices:\n    print("We don\'t sell", item)\nelse:\n    print(item, "costs", prices[item])\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'chips, not on the menu', stdin: 'chips\n' },
        { name: 'tea', stdin: 'tea\n' },
        { name: 'soup', stdin: 'soup\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-totals-by-name',
    kind: 'parsons',
    title: 'Who spent what',
    concept: 'py-dicts',
    prompt:
      'Put the lines in order, and indent them, so the program reads how many payments there are, then each payment as a name and an amount, and prints each person’s total, in the order they first paid. For Amy 5, Ben 3, Amy 2 and Cal 10 it prints:\n\n```\nAmy 7\nBen 3\nCal 10\n```\n\nOne line doesn’t belong.',
    hints: [
      'Start with an empty dict, then add each amount to that name’s total so far.',
      'The first time a name turns up it has no total yet. Which way of reading its total copes with that?',
    ],
    solution: {
      python:
        'totals = {}\nn = int(input())\nfor i in range(n):\n    name = input()\n    amount = int(input())\n    totals[name] = totals.get(name, 0) + amount\nfor name, total in totals.items():\n    print(name, total)\n',
    },
    distractors: { python: ['totals[name] = totals[name] + amount'] },
    check: {
      kind: 'program',
      cases: [
        { name: 'Four payments', stdin: '4\nAmy\n5\nBen\n3\nAmy\n2\nCal\n10\n' },
        { name: 'One payment', stdin: '1\nZoe\n7\n' },
        { name: 'One person, three times', stdin: '3\nMo\n1\nMo\n1\nMo\n1\n' },
      ],
    },
  },

  // ── py-sets ─────────────────────────────────────────────────
  {
    slug: 'py-set-predict',
    kind: 'output',
    title: 'Copies, adds and discards',
    concept: 'py-sets',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`set(nums)` keeps each value once, so count the different values in the list.',
      '`add` of a value already in the set changes nothing; `discard` takes a value out if it’s there.',
      '`sorted(s)` gives a list, smallest first, printed in square brackets.',
    ],
    vary: { a: ['1', '2', '3'], b: ['5', '4', '3'], c: ['5', '7', '1'] },
    code: { python: 'nums = [«a», 3, «b», 3, 1]\ns = set(nums)\ns.add(«c»)\ns.discard(3)\nprint(len(nums), len(s))\nprint(sorted(s))\nprint(«b» in s, 3 in s)\n' },
  },
  {
    slug: 'py-unique-in-order',
    kind: 'function',
    title: 'Drop the repeats, keep the order',
    concept: 'py-sets',
    prompt:
      'Write `unique_in_order(items)`, which returns a **new list** of the items with every repeat left out, keeping each item where it first appeared. `unique_in_order([3, 1, 3, 2, 1])` returns `[3, 1, 2]`.\n\n`set(items)` drops the repeats, but it forgets the order, so keep a set of what you have already seen and build the list yourself.',
    hints: [
      'Start with `seen = set()` and `result = []`.',
      'Loop over `items`. If an item is not `in seen`, append it to `result` and add it to `seen`.',
      'Return `result`: the list keeps the order, and the set only answers “seen it before?”.',
    ],
    starter: { python: 'def unique_in_order(items):\n    result = []\n    return result\n' },
    solution: {
      python: 'def unique_in_order(items):\n    seen = set()\n    result = []\n    for x in items:\n        if x not in seen:\n            result.append(x)\n            seen.add(x)\n    return result\n',
    },
    check: {
      kind: 'function',
      entry: { python: 'unique_in_order' },
      calls: [[[3, 1, 3, 2, 1]], [[]], [['b', 'a', 'b', 'c', 'a']], [[7, 7, 7]], [[5, 4, 3]]],
    },
  },
  {
    slug: 'py-missing-letters',
    kind: 'tests',
    title: 'Letters a sentence never uses',
    concept: 'py-sets',
    prompt:
      'Write `missing_letters(sentence)`, which returns the **set** of the letters `a` to `z` that the sentence (all lowercase) doesn’t use:\n\n```python\nprint(sorted(missing_letters("a jazzy quiz")))   # every letter but a, i, j, q, u, y and z\nprint(missing_letters("the quick brown fox jumps over a lazy dog"))   # set(): it uses them all\n```',
    hints: [
      '`set("abcdefghijklmnopqrstuvwxyz")` is the set of all 26 letters.',
      '`set(sentence)` is the set of the characters the sentence uses (spaces too, which does no harm).',
      'Which operator keeps what is in the first set but not the second?',
    ],
    starter: { python: 'def missing_letters(sentence):\n    return set()\n' },
    solution: { python: 'def missing_letters(sentence):\n    return set("abcdefghijklmnopqrstuvwxyz") - set(sentence)\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_hello_world():\n    assert missing_letters("hello world") == set("abcfgijkmnpqstuvxyz")\n\n\ndef test_every_letter_used():\n    assert missing_letters("the quick brown fox jumps over a lazy dog") == set()\n\n\ndef test_empty_sentence():\n    assert missing_letters("") == set("abcdefghijklmnopqrstuvwxyz")\n\n\ndef test_gives_back_a_set():\n    assert isinstance(missing_letters("abc"), set)\n',
      },
    },
  },
  {
    slug: 'py-empty-set-braces',
    kind: 'bug',
    title: 'Counting different words',
    concept: 'py-sets',
    prompt: 'This program reads a whole number `n`, then `n` words, one per line, and should print how many **different** words there were. For `4`, then `red`, `blue`, `red`, `red`, that’s `2`. Fix it.',
    symptom: "For red, blue, red, red it stops at line 4 with AttributeError: 'dict' object has no attribute 'add'.",
    explanation:
      '`{}` is an empty **dict**, not an empty set: dicts had the curly brackets first. A dict has no `add`, so the first word fails. Start with `seen = set()` instead.',
    hints: ['What kind of thing is `{}`? Try `print({})` next to `print(set())`.', 'An empty set is written `set()`.'],
    starter: { python: 'n = int(input())\nseen = {}\nfor i in range(n):\n    seen.add(input())\nprint(len(seen))\n' },
    solution: { python: 'n = int(input())\nseen = set()\nfor i in range(n):\n    seen.add(input())\nprint(len(seen))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'red, blue, red, red', stdin: '4\nred\nblue\nred\nred\n' },
        { name: 'All different', stdin: '3\na\nb\nc\n' },
        { name: 'One word', stdin: '1\nhi\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-first-repeat',
    kind: 'parsons',
    title: 'The first number seen twice',
    concept: 'py-sets',
    prompt:
      'Put the lines in order, and indent them, so the program reads a whole number `n`, then `n` whole numbers, and prints the first number that has already appeared. If none repeats, it prints `none`. For `5`, then `4`, `7`, `2`, `7`, `4`, it prints `7`. One line doesn’t belong.',
    hints: [
      'Keep a set of the numbers seen so far, and ask `x in seen` before adding `x`.',
      'Once a repeat is found, `break` out of the loop.',
      'Which line would make an empty dict instead of an empty set?',
    ],
    solution: {
      python: 'n = int(input())\nseen = set()\nrepeat = "none"\nfor i in range(n):\n    x = int(input())\n    if x in seen:\n        repeat = x\n        break\n    seen.add(x)\nprint(repeat)\n',
    },
    distractors: { python: ['seen = {}'] },
    check: {
      kind: 'program',
      cases: [
        { name: '4, 7, 2, 7, 4', stdin: '5\n4\n7\n2\n7\n4\n' },
        { name: 'No repeats', stdin: '3\n1\n2\n3\n' },
        { name: 'Repeat straight away', stdin: '4\n9\n9\n1\n1\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-film-sets',
    kind: 'fill',
    title: 'Films we’ve both seen',
    concept: 'py-sets',
    prompt:
      'Two friends list the films they’ve seen: first a number, then that many titles, one per line, for Ana, then the same for Ben. Fill the gaps so the program prints, each as a sorted list, the films they’ve both seen, the ones only Ana has seen, and every film either has seen. For Ana’s `Up`, `Jaws`, `Heat` and Ben’s `Jaws`, `Rocky`:\n\n```\n[\'Jaws\']\n[\'Heat\', \'Up\']\n[\'Heat\', \'Jaws\', \'Rocky\', \'Up\']\n```',
    hints: ['Each title goes into the set with the method that puts one item in.', '`&` is in both, `-` in the first but not the second, `|` in either.'],
    solution: {
      python: 'ana = set()\nfor i in range(int(input())):\n    ana.«1:add»(input())\nben = set()\nfor i in range(int(input())):\n    ben.add(input())\nprint(sorted(ana «2:&» ben))\nprint(sorted(ana «3:-» ben))\nprint(sorted(ana «4:|» ben))\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'Up, Jaws, Heat and Jaws, Rocky', stdin: '3\nUp\nJaws\nHeat\n2\nJaws\nRocky\n' },
        { name: 'Nothing in common', stdin: '1\nAlien\n1\nBambi\n' },
        { name: 'Ben has seen none', stdin: '2\nCoco\nCars\n0\n', hidden: true },
      ],
    },
  },

  // ── py-comprehensions ───────────────────────────────────────
  {
    slug: 'py-comprehension-three-ways',
    kind: 'output',
    title: 'Double, filter, choose',
    concept: 'py-comprehensions',
    prompt: 'Type exactly what this prints.',
    hints: [
      'Read each comprehension as a loop: the expression in front is what goes into the new list, once per item.',
      'An `if` at the end is a filter: items that fail it are left out, so that list can be shorter.',
      '`"+" if n > 0 else "-"` at the front is a choice: every item goes in, as one or the other. Python prints strings in a list with single quotes.',
    ],
    vary: { a: ['4', '1', '-6'] },
    code: {
      python:
        'nums = [«a», 5, -2, 8]\ndoubled = [n * 2 for n in nums]\nbig = [n for n in nums if n > 3]\nsigns = ["+" if n > 0 else "-" for n in nums]\nprint(doubled)\nprint(big)\nprint(signs)\nprint(len(nums), len(big))\n',
    },
  },
  {
    slug: 'py-passing-marks',
    kind: 'function',
    title: 'Only the passes',
    concept: 'py-comprehensions',
    prompt:
      'Write `passed(marks, pass_mark)`. `marks` is a dict of names and marks; return a **new** dict of just the names whose mark is `pass_mark` or more, with their marks. `passed({"Ada": 72, "Bo": 45}, 50)` returns `{"Ada": 72}`. Try it as one dict comprehension.',
    hints: [
      '`marks.items()` gives each name with its mark: `for name, mark in marks.items()`.',
      'A dict comprehension is `{key: value for ...}`, and a filter goes at the end: `if mark >= pass_mark`.',
    ],
    starter: { python: 'def passed(marks, pass_mark):\n    return {}\n' },
    solution: { python: 'def passed(marks, pass_mark):\n    return {name: mark for name, mark in marks.items() if mark >= pass_mark}\n' },
    check: {
      kind: 'function',
      entry: { python: 'passed' },
      calls: [
        [{ Ada: 72, Bo: 45, Cy: 50 }, 50],
        [{}, 40],
        [{ Di: 39 }, 40],
        [{ Ed: 100, Flo: 99 }, 0],
      ],
    },
  },
  {
    slug: 'py-clip-or-keep',
    kind: 'fill',
    title: 'Replace some, or keep some?',
    concept: 'py-comprehensions',
    prompt:
      'Read a whole number `n`, then `n` whole numbers. Fill the gaps so the program prints two lists: every number, with each negative one replaced by 0, and then just the numbers above 0. For `4`, then `3`, `-2`, `0`, `5`:\n\n```\n[3, 0, 0, 5]\n[3, 5]\n```',
    hints: [
      'The first list keeps every item, so it needs a choice at the front: `x if ... else 0`.',
      'The second list leaves some items out, so it needs a filter at the end, with no `else`.',
    ],
    solution: {
      python:
        'n = int(input())\nnums = []\nfor i in range(n):\n    nums.append(int(input()))\nclipped = [x «1:if» x > 0 «2:else» 0 «3:for» x in nums]\npositives = [x for x in nums «4:if» x > 0]\nprint(clipped)\nprint(positives)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: '3, -2, 0, 5', stdin: '4\n3\n-2\n0\n5\n' },
        { name: 'All above 0', stdin: '2\n7\n1\n' },
        { name: 'Nothing above 0', stdin: '3\n-4\n0\n-1\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-comprehension-thrown-away',
    kind: 'bug',
    title: 'Readings that won’t filter',
    concept: 'py-comprehensions',
    prompt:
      'This program reads a count `n`, then `n` temperature readings, and should print a list of just the readings of 0 or more. For the readings 3, -1 and 4 that is `[3, 4]`. Fix it.',
    symptom: 'For the readings 3, -1 and 4 it prints [3, -1, 4]: the -1 is still there.',
    explanation:
      'A comprehension builds a **new** list and never changes the one it loops over. On a line of its own, line 5 builds `[3, 4]` and throws it away, so `temps` is printed as it was. Keep the result by pointing the name at it: `temps = [t for t in temps if t >= 0]`.',
    hints: ['Does line 5 change `temps`, or make something new?', 'Point a name at the comprehension’s result: `temps = [...]`.'],
    starter: { python: 'n = int(input())\ntemps = []\nfor i in range(n):\n    temps.append(int(input()))\n[t for t in temps if t >= 0]\nprint(temps)\n' },
    solution: { python: 'n = int(input())\ntemps = []\nfor i in range(n):\n    temps.append(int(input()))\ntemps = [t for t in temps if t >= 0]\nprint(temps)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '3, -1 and 4', stdin: '3\n3\n-1\n4\n' },
        { name: 'Just a 0', stdin: '1\n0\n' },
        { name: 'All below 0', stdin: '2\n-3\n-8\n', hidden: true },
        { name: 'No readings', stdin: '0\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-unique-squares',
    kind: 'tests',
    title: 'Each square once',
    concept: 'py-comprehensions',
    prompt:
      'Write `unique_squares(nums)`, which returns a **set** of the squares of the numbers in `nums`, so a square that comes up twice is there once: `unique_squares([1, -1, 2])` gives `{1, 4}`.\n\nThe starter builds a list. One change of brackets fixes it.',
    hints: ['Curly brackets without a colon make a set comprehension: `{... for n in nums}`.', 'An empty list gives an empty set, which Python writes `set()`.'],
    starter: { python: 'def unique_squares(nums):\n    return [n * n for n in nums]\n' },
    solution: { python: 'def unique_squares(nums):\n    return {n * n for n in nums}\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_each_square_once():\n    assert unique_squares([1, -1, 2]) == {1, 4}\n\n\ndef test_empty_list():\n    assert unique_squares([]) == set()\n\n\ndef test_gives_back_a_set():\n    assert isinstance(unique_squares([3, 3]), set)\n',
      },
    },
  },
  {
    slug: 'py-long-word-sizes',
    kind: 'parsons',
    title: 'Long words and their lengths',
    concept: 'py-comprehensions',
    prompt:
      'Put the lines in order, and indent them, so the program reads `n`, then `n` words, and prints a dict of the words longer than 3 letters, each with its length. For `3`, then `kiwi`, `fig`, `banana`: `{\'kiwi\': 4, \'banana\': 6}`. One line doesn’t belong.',
    hints: ['First collect the words, then keep the long ones with a filter, then build the dict from those.', 'A filter at the end of a comprehension takes no `else`, and an `if` at the front needs one.'],
    solution: {
      python:
        'n = int(input())\nwords = []\nfor i in range(n):\n    words.append(input())\nlong_words = [w for w in words if len(w) > 3]\nsizes = {w: len(w) for w in long_words}\nprint(sizes)\n',
    },
    distractors: { python: ['long_words = [w if len(w) > 3 for w in words]'] },
    check: {
      kind: 'program',
      cases: [
        { name: 'kiwi, fig, banana', stdin: '3\nkiwi\nfig\nbanana\n' },
        { name: 'No long words', stdin: '2\na\nto\n' },
        { name: 'The same word twice', stdin: '2\nmango\nmango\n' },
      ],
    },
  },

  // ── py-sorting ──────────────────────────────────────────────
  {
    slug: 'py-sorted-or-sort',
    kind: 'output',
    title: 'Sorted or sort?',
    concept: 'py-sorting',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`sorted(nums)` makes a new, sorted list and leaves `nums` as it was.',
      '`nums.sort()` sorts `nums` itself, and gives back `None`.',
      '`reverse=True` puts the biggest first.',
    ],
    vary: { a: ['3', '7', '0'] },
    code: { python: 'nums = [«a», 1, 4]\ncopy = sorted(nums)\nprint(nums)\nprint(copy)\nresult = nums.sort(reverse=True)\nprint(nums, result)\n' },
  },
  {
    slug: 'py-longest-first',
    kind: 'function',
    title: 'Longest words first',
    concept: 'py-sorting',
    prompt:
      'Write `longest_first(words)`, which returns a **new** list of the words, longest first. Words of the same length keep the order they had: `longest_first(["to", "be", "or", "not"])` returns `["not", "to", "be", "or"]`.',
    hints: [
      '`sorted` takes `key=` and `reverse=True` together.',
      '`key=len` sorts by each word’s length.',
      'Python’s sort is stable, and stays stable with `reverse=True`, so words that tie keep their order.',
    ],
    starter: { python: 'def longest_first(words):\n    return words\n' },
    solution: { python: 'def longest_first(words):\n    return sorted(words, key=len, reverse=True)\n' },
    check: {
      kind: 'function',
      entry: { python: 'longest_first' },
      calls: [[['fig', 'banana', 'kiwi']], [['to', 'be', 'or', 'not']], [[]], [['same', 'size', 'word']], [['a', 'abc', 'ab', 'xyz']]],
    },
  },
  {
    slug: 'py-sort-none-median',
    kind: 'bug',
    title: 'A middle number that vanishes',
    concept: 'py-sorting',
    prompt:
      'This program reads a count `n` (always odd), then `n` whole numbers, one per line, and should print the middle one once they are in order. For `3`, then `7`, `2`, `9`, that is `7`. Fix it.',
    symptom: "For 3, then 7, 2 and 9, it stops at line 6 with TypeError: 'NoneType' object is not subscriptable.",
    explanation:
      '`sort` sorts the list in place and gives back `None`. `nums = nums.sort()` sorts the numbers, then points `nums` at that `None`, so `nums[n // 2]` has no list to index. Call `nums.sort()` on its own line, or write `nums = sorted(nums)`.',
    hints: ['What does `nums.sort()` give back? Print it to see.', 'Drop the `nums = ` in front of the sort, or use `sorted`.'],
    starter: { python: 'n = int(input())\nnums = []\nfor i in range(n):\n    nums.append(int(input()))\nnums = nums.sort()\nprint(nums[n // 2])\n' },
    solution: { python: 'n = int(input())\nnums = []\nfor i in range(n):\n    nums.append(int(input()))\nnums.sort()\nprint(nums[n // 2])\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '7, 2 and 9', stdin: '3\n7\n2\n9\n' },
        { name: 'Just 5', stdin: '1\n5\n' },
        { name: 'Five numbers with a repeat', stdin: '5\n4\n-1\n10\n4\n0\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-names-any-case',
    kind: 'parsons',
    title: 'Names in dictionary order',
    concept: 'py-sorting',
    prompt:
      'Put the lines in order, and indent them, so the program reads a count `n`, then `n` names, and prints them in dictionary order, one per line, whatever their capitals: `Amy`, `ben`, `Carl`, `zoe`. One line doesn’t belong.',
    hints: ['Collect the names in a list first, then sort.', '`key=str.lower` sorts by each name’s small-letter version.', 'Which gives back a list you can loop over: `sorted(names)` or `names.sort()`?'],
    solution: { python: 'n = int(input())\nnames = []\nfor i in range(n):\n    names.append(input())\nfor name in sorted(names, key=str.lower):\n    print(name)\n' },
    distractors: { python: ['for name in names.sort(key=str.lower):'] },
    check: {
      kind: 'program',
      cases: [
        { name: 'Four names', stdin: '4\nzoe\nAmy\nben\nCarl\n' },
        { name: 'One name', stdin: '1\nSolo\n' },
        { name: 'The same name twice', stdin: '3\nbob\nBob\nann\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-scoreboard-items',
    kind: 'fill',
    title: 'A scoreboard from a dict',
    concept: 'py-sorting',
    prompt:
      'The program reads a count `n`, then `n` players, each as a name on one line and a score on the next, into a dict. Fill the gaps so it prints each player and score, highest score first, and players who tie in name order. For `Ola` 7, `Ben` 9 and `Ade` 7:\n\n```\nBen 9\nAde 7\nOla 7\n```',
    hints: [
      '`scores.items()` gives the dict’s `(name, score)` pairs.',
      'In each pair, `p[0]` is the name and `p[1]` the score.',
      'A tuple key sorts by its first item, then breaks ties with the second. A minus sign puts the biggest score first.',
    ],
    solution: {
      python:
        'scores = {}\nn = int(input())\nfor i in range(n):\n    name = input()\n    scores[name] = int(input())\nfor name, score in sorted(scores.«1:items»(), key=lambda p: («2:-p[1]», «3:p[0]»)):\n    print(name, score)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'Ola, Ben and Ade', stdin: '3\nOla\n7\nBen\n9\nAde\n7\n' },
        { name: 'One player', stdin: '1\nKim\n4\n' },
        { name: 'Two ties', stdin: '4\nzed\n2\nann\n5\nmax\n2\nbo\n5\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-rank-players',
    kind: 'function',
    title: 'Rank the players',
    concept: 'py-sorting',
    prompt:
      'Each player is a pair, `[name, score]`. Write `rank(players)`, which returns a list of the names, highest score first, and players who tie in name order. `rank([["Ola", 7], ["Ben", 9], ["Ade", 7]])` returns `["Ben", "Ade", "Ola"]`, and no players give `[]`.',
    hints: [
      'Sort the pairs first with `sorted` and a key, then collect the names.',
      '`key=lambda p: (-p[1], p[0])` sorts by score, high to low, then by name.',
      'Loop over the sorted pairs and `append` each `p[0]` to a new list.',
    ],
    starter: { python: 'def rank(players):\n    names = []\n    return names\n' },
    solution: {
      python: 'def rank(players):\n    ordered = sorted(players, key=lambda p: (-p[1], p[0]))\n    names = []\n    for p in ordered:\n        names.append(p[0])\n    return names\n',
    },
    check: {
      kind: 'function',
      entry: { python: 'rank' },
      calls: [
        [[['Ola', 7], ['Ben', 9], ['Ade', 7]]],
        [[['Kim', 5]]],
        [[]],
        [[['Cat', 3], ['Bob', 3], ['Amy', 3]]],
        [[['Zed', 10], ['Ann', 2], ['Max', 10], ['Lee', 2]]],
      ],
    },
  },
];

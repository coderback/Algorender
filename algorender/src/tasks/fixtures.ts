import type { TaskInput } from './schema';

// One task of every kind, in Python and JavaScript, for the tests only
// (tasks.test.ts runs each through both real runtimes: the reference passes,
// the starter or a wrong answer fails). Not content: L2's topics bring the
// real ones.

export const FIXTURES: TaskInput[] = [
  {
    slug: 'fixture-choice',
    kind: 'choice',
    title: 'Which prints a number?',
    concept: 'py-numbers',
    prompt: 'Which of these lines prints `7`?',
    choices: ['print("3" + "4")', 'print(3 + 4)', 'print("3 + 4")'],
    answer: 1,
    why: 'Only the numbers 3 and 4 add up to 7; the others join or show text.',
  },
  {
    slug: 'fixture-output',
    kind: 'output',
    title: 'A loop that counts down',
    concept: 'py-while',
    prompt: 'Type what this prints.',
    code: {
      python: 'n = 3\nwhile n > 0:\n    print(n, end=" ")\n    n -= 1\nprint("go")\n',
      javascript: 'let n = 3;\nlet line = "";\nwhile (n > 0) {\n  line += n + " ";\n  n -= 1;\n}\nconsole.log(line + "go");\n',
    },
  },
  {
    slug: 'fixture-program',
    kind: 'program',
    title: 'Add two numbers',
    concept: 'py-input',
    prompt: 'Read two whole numbers, one per line, and print their sum.',
    starter: { python: 'a = input()\nb = input()\nprint(a + b)\n', javascript: 'const a = input();\nconst b = input();\nconsole.log(a + b);\n' },
    solution: {
      python: 'a = int(input("First: "))\nb = int(input("Second: "))\nprint(a + b)\n',
      javascript: 'const a = Number(input("First: "));\nconst b = Number(input("Second: "));\nconsole.log(a + b);\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'small', stdin: '2\n3\n' },
        { name: 'negative', stdin: '-4\n10\n', hidden: true },
      ],
    },
  },
  {
    slug: 'fixture-tokens',
    kind: 'program',
    title: 'Squares on one line',
    concept: 'py-for-range',
    prompt: 'Print the squares of 1 to n, separated by spaces.',
    starter: { python: 'n = int(input())\nfor i in range(n):\n    print(i * i)\n' },
    solution: { python: 'n = int(input())\nfor i in range(1, n + 1):\n    print(i * i, end="  ")\n' },
    check: { kind: 'program', cases: [{ name: 'four', stdin: '4\n' }], checker: { kind: 'tokens' } },
  },
  {
    slug: 'fixture-any-order',
    kind: 'program',
    title: 'The letters in a word',
    concept: 'py-sets',
    prompt: 'Print each different letter of the word on its own line, in any order.',
    starter: { python: 'word = input()\nprint(word)\n' },
    solution: { python: 'word = input()\nfor letter in sorted(set(word)):\n    print(letter)\n' },
    check: { kind: 'program', cases: [{ name: 'banana', stdin: 'banana\n' }], checker: { kind: 'named', name: 'lines-any-order' } },
  },
  {
    slug: 'fixture-function',
    kind: 'function',
    title: 'Add up a list',
    concept: 'py-functions',
    prompt: 'Write `total(numbers)`, which returns the sum of the numbers.',
    starter: { python: 'def total(numbers):\n    return 0\n', javascript: 'function total(numbers) {\n  return 0;\n}\n' },
    solution: {
      python: 'def total(numbers):\n    result = 0\n    for n in numbers:\n        result += n\n    return result\n',
      javascript: 'function total(numbers) {\n  let result = 0;\n  for (const n of numbers) {\n    result += n;\n  }\n  return result;\n}\n',
    },
    check: { kind: 'function', entry: { python: 'total', javascript: 'total' }, calls: [[[1, 2, 3]], [[]], [[-1, 1, 5]]] },
  },
  {
    slug: 'fixture-tests',
    kind: 'tests',
    title: 'A counter',
    concept: 'py-classes',
    prompt: 'Write a class `Counter` whose `tick()` adds one and whose `value` starts at 0.',
    starter: { python: 'class Counter:\n    def __init__(self):\n        self.value = 0\n\n    def tick(self):\n        pass\n', javascript: 'class Counter {\n  constructor() {\n    this.value = 0;\n  }\n\n  tick() {}\n}\n' },
    solution: {
      python: 'class Counter:\n    def __init__(self):\n        self.value = 0\n\n    def tick(self):\n        self.value += 1\n',
      javascript: 'class Counter {\n  constructor() {\n    this.value = 0;\n  }\n\n  tick() {\n    this.value += 1;\n  }\n}\n',
    },
    check: {
      kind: 'tests',
      tests: {
        python: 'def test_starts_at_zero():\n    assert Counter().value == 0\n\n\ndef test_ticks():\n    c = Counter()\n    c.tick()\n    c.tick()\n    assert c.value == 2\n',
        javascript: 'test("starts at zero", () => {\n  expect(new Counter().value).toBe(0);\n});\ntest("ticks", () => {\n  const c = new Counter();\n  c.tick();\n  c.tick();\n  expect(c.value).toBe(2);\n});\n',
      },
    },
  },
  {
    slug: 'fixture-bug',
    kind: 'bug',
    title: 'Count to n',
    concept: 'py-for-range',
    prompt: 'This should print 1 to n, one number per line. Fix it.',
    symptom: 'For 3 it prints 0, 1 and 2.',
    explanation: '`range(n)` starts at 0 and stops before n; `range(1, n + 1)` gives 1 to n.',
    starter: { python: 'n = int(input())\nfor i in range(n):\n    print(i)\n' },
    solution: { python: 'n = int(input())\nfor i in range(1, n + 1):\n    print(i)\n' },
    check: { kind: 'program', cases: [{ name: 'three', stdin: '3\n' }] },
  },
  {
    slug: 'fixture-parsons',
    kind: 'parsons',
    title: 'Even numbers',
    concept: 'py-if',
    prompt: 'Arrange the lines to print the even numbers below 6.',
    solution: { python: 'for i in range(6):\n    if i % 2 == 0:\n        print(i)\n' },
    distractors: { python: ['    if i % 2 == 1:'] },
    check: { kind: 'program', cases: [{ name: 'evens', stdin: '' }] },
  },
  {
    slug: 'fixture-fill',
    kind: 'fill',
    title: 'Shout it',
    concept: 'py-strings-intro',
    prompt: 'Fill the gaps so the program prints the word in capitals with an exclamation mark.',
    solution: { python: 'word = input()\nprint(word.«1:upper»() + «2:"!"»)\n' },
    check: { kind: 'program', cases: [{ name: 'hello', stdin: 'hello\n' }] },
  },
];

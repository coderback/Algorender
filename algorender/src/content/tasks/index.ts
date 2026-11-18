import expectedFile from './expected.json';
import { TaskSchema, type ExpectedFile, type Task, type TaskInput } from '@/tasks/schema';

// The language tracks' tasks (src/tasks/schema.ts). Topics arrive in L2,
// each ending with a strip of its tasks; until then these two are samples
// that prove the path end to end (write a program, predict an output), each
// on its own page under Learn (/learn/tasks/<slug>), linked from nowhere yet
// and left out of the sitemap. Their concepts are the Python track's
// planned topics.
//
// Expected outputs come from running each reference solution, never from
// typing them: `npm run tasks:expected` writes expected.json, and
// tasks.test.ts fails when it is stale.

const SOURCES: TaskInput[] = [
  {
    slug: 'py-greet-by-name',
    kind: 'program',
    title: 'Greet someone by name',
    concept: 'py-input',
    prompt:
      'Write a program that asks for a name with `input()` and then greets that person. For the name `Ada` it prints:\n\n```\nHello, Ada!\n```\n\nYour prompt can say anything you like: what `input()` shows is left out when the output is checked.',
    hints: [
      '`input()` gives back the line that was typed, as a string, so `name` already holds it.',
      'An f-string puts a variable inside text: `f"Hi {name}"`.',
      'Look closely at the expected line: a comma after `Hello`, and `!` at the very end.',
    ],
    starter: { python: 'name = input("What\'s your name? ")\nprint("Hello")\n' },
    solution: { python: 'name = input("What\'s your name? ")\nprint(f"Hello, {name}!")\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'Ada', stdin: 'Ada\n' },
        { name: 'A full name', stdin: 'Grace Hopper\n' },
        { name: 'Another name', stdin: 'Linus\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-two-names-one-value',
    kind: 'output',
    title: 'Two names, one value',
    concept: 'py-variables',
    prompt: 'Read the program, then type exactly what it prints, one line per line of output.',
    hints: ['`y = x` makes `y` name the value `x` names at that moment, 3.', 'Changing `x` afterwards makes `x` name a new number; `y` still names 3.', '`"ab" * 3` repeats the text three times.'],
    code: { python: 'x = 3\ny = x\nx = x + 1\nprint(x, y)\nprint("ab" * y)\n' },
  },
];

export const tasks: readonly Task[] = SOURCES.map((t) => TaskSchema.parse(t));

/** The reference's results for each task's cases (expected.json). */
export const expected = expectedFile as unknown as ExpectedFile;

export function getTask(slug: string): Task | undefined {
  return tasks.find((t) => t.slug === slug);
}

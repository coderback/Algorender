import type { LessonMeta } from './index';

// The Python track's topics (the language tracks, L2): each a short lesson on
// one concept (src/content/units.ts), about five minutes of reading, a
// prediction checked by running the code, then a strip of auto-checked tasks
// (src/content/tasks). The minutes count the tasks too.

export const PYTHON_TOPICS: readonly LessonMeta[] = [
  // Unit 1: Basics
  {
    slug: 'py-first-program',
    title: 'Your first program',
    concept: 'py-first-program',
    summary: 'print, comments, and how Python carries out a program one line at a time, from the top down.',
    minutes: 10,
  },
  {
    slug: 'py-variables',
    title: 'Variables: names for values',
    concept: 'py-variables',
    summary: 'What = really does: a name points at a value, and pointing it somewhere new leaves every other name where it was.',
    minutes: 12,
  },
  {
    slug: 'py-numbers',
    title: 'Numbers: whole, decimal and three kinds of division',
    concept: 'py-numbers',
    summary: 'int and float, the arithmetic operators, why / always gives a float, // and % for whole shares and remainders, and why 0.1 + 0.2 is not quite 0.3.',
    minutes: 12,
  },
  {
    slug: 'py-strings-intro',
    title: 'Strings: working with text',
    concept: 'py-strings-intro',
    summary: 'Text in quotes, joining it with +, repeating it with *, f-strings, len, and picking out characters by index.',
    minutes: 12,
  },
  {
    slug: 'py-input',
    title: 'Reading input',
    concept: 'py-input',
    summary: 'input() waits for a line and always gives back text; int() and float() turn it into a number, and complain when they can’t.',
    minutes: 12,
  },
  {
    slug: 'py-booleans',
    title: 'True and False',
    concept: 'py-booleans',
    summary: 'Comparisons give True or False; and, or and not combine them; and some values count as false on their own.',
    minutes: 14,
  },
  // Unit 2: Control flow
  {
    slug: 'py-if',
    title: 'Making decisions with if',
    concept: 'py-if',
    summary: 'if, elif and else: indented blocks that run only when their condition holds, and why only one branch of a chain ever runs.',
    minutes: 12,
  },
  {
    slug: 'py-while',
    title: 'while loops: repeat until it’s done',
    concept: 'py-while',
    summary: 'A while loop checks its condition before every turn; something in the body has to change, or it never stops.',
    minutes: 12,
  },
  {
    slug: 'py-for-range',
    title: 'for loops and range',
    concept: 'py-for-range',
    summary: 'Walking through a range of numbers or the letters of a string, and why range(5) stops at 4.',
    minutes: 12,
  },
  {
    slug: 'py-break-continue',
    title: 'break, continue and the loop else',
    concept: 'py-break-continue',
    summary: 'Leaving a loop early, skipping to the next turn, and the else that runs only when no break happened.',
    minutes: 12,
  },
  {
    slug: 'py-nested-loops',
    title: 'Loops inside loops',
    concept: 'py-nested-loops',
    summary: 'The inner loop runs all the way through for every turn of the outer one, so the work multiplies; and break leaves only the loop it’s in.',
    minutes: 14,
  },
];

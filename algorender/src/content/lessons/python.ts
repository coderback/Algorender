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
  // Unit 3: Functions
  {
    slug: 'py-functions',
    title: 'Functions: def, return and None',
    concept: 'py-functions',
    summary: 'Naming a piece of work with def, calling it with arguments, and why printing an answer is not the same as returning it.',
    minutes: 14,
  },
  {
    slug: 'py-parameters',
    title: 'Parameters: defaults, keywords and *args',
    concept: 'py-parameters',
    summary: 'Arguments by position or by name, parameters with default values, and a starred parameter that takes any number of arguments.',
    minutes: 12,
  },
  {
    slug: 'py-scope',
    title: 'Scope: local, global and closures',
    concept: 'py-scope',
    summary: 'Which name a line means, why setting a name in a function makes a new one, global and nonlocal, and functions that keep their enclosing names alive.',
    minutes: 15,
  },
  {
    slug: 'py-recursion',
    title: 'Recursion: a function that calls itself',
    concept: 'py-recursion',
    summary: 'Each call with its own frame and names, the base case that stops them, and the work done on the way down and back up.',
    minutes: 14,
  },
  {
    slug: 'py-lambdas',
    title: 'Lambdas and functions as values',
    concept: 'py-lambdas',
    summary: 'Passing a function without calling it, small functions made with lambda, and key= to say what max and min compare.',
    minutes: 14,
  },
  // Unit 4: Collections
  {
    slug: 'py-lists',
    title: 'Lists: ordered and changeable',
    concept: 'py-lists',
    summary: 'Indexing, the methods that change a list in place (and give back None), and slices that make new lists.',
    minutes: 14,
  },
  {
    slug: 'py-references',
    title: 'References: two names, one list',
    concept: 'py-references',
    summary: 'Why = never copies a list, is against ==, shallow and deep copies, lists passed to functions, and the shared default list.',
    minutes: 16,
  },
  {
    slug: 'py-tuples',
    title: 'Tuples: fixed groups and unpacking',
    concept: 'py-tuples',
    summary: 'Groups of values that can’t change, unpacking them into names, swapping in one line, and returning several values at once.',
    minutes: 12,
  },
  {
    slug: 'py-dicts',
    title: 'Dictionaries: looking values up by key',
    concept: 'py-dicts',
    summary: 'Finding a value by its key, adding, changing and removing pairs, why in and for look at the keys, get with a default instead of a KeyError, and counting with a dict.',
    minutes: 14,
  },
  {
    slug: 'py-sets',
    title: 'Sets: unique items and fast membership',
    concept: 'py-sets',
    summary: 'Collections that keep each value once: dropping duplicates, asking `in`, adding and removing items, and combining sets with |, & and -.',
    minutes: 14,
  },
  {
    slug: 'py-comprehensions',
    title: 'Comprehensions: lists, dicts and sets in one line',
    concept: 'py-comprehensions',
    summary: 'Building a list, dict or set from a loop in one expression, the filter at the end against the choice at the front, and when a plain loop is clearer.',
    minutes: 13,
  },
  {
    slug: 'py-sorting',
    title: 'Sorting: sorted, sort and key=',
    concept: 'py-sorting',
    summary: 'A sorted copy or a sort in place (which gives back None), reverse= and key=, tuple keys to sort by several things, and why capitals come first.',
    minutes: 15,
  },
  // Unit 5: Strings
  {
    slug: 'py-string-methods',
    title: 'String methods: tidying, splitting and joining',
    concept: 'py-string-methods',
    summary: 'Why a string method gives back a new string and never changes the old one, strip, lower and replace, split() against split(","), join with the separator first, and find, index, count and the other checks.',
    minutes: 14,
  },
  {
    slug: 'py-formatting',
    title: 'Formatting output: widths, decimals and columns',
    concept: 'py-formatting',
    summary: 'Format specs in f-strings for decimal places, widths, alignment, zero padding, commas and percentages, and why formatting builds new text while the number stays as it was.',
    minutes: 14,
  },
  {
    slug: 'py-regex',
    title: 'Regular expressions: patterns for text',
    concept: 'py-regex',
    summary: 'Patterns for text you can only describe, written as raw strings: re.search for the first match or None, fullmatch to check a whole string, findall to list every match, sub to build a new string, and when a string method is clearer.',
    minutes: 15,
  },
  // Unit 6: Errors
  {
    slug: 'py-exceptions',
    title: 'Handling errors: try, except and tracebacks',
    concept: 'py-exceptions',
    summary: 'Reading a traceback from the bottom up, catching only the errors you expect with try and except, else and finally, asking again until the input is a number, and why a bare except hides your own bugs.',
    minutes: 14,
  },
  {
    slug: 'py-raising',
    title: 'Raising errors: refusing bad input',
    concept: 'py-raising',
    summary: 'Refusing bad input with raise instead of returning a wrong answer, how an error travels up through the callers, choosing ValueError or TypeError, re-raising with a bare raise, an error of your own, and assert against raise.',
    minutes: 15,
  },
];

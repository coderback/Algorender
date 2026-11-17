// Plain-language error explanations (the language tracks' error catalogue,
// v1: Python). A beginner's most common errors, each with what it means and
// where to look, matched on the message the runtime reports. Deterministic
// and free: it answers before any tutor would. It explains, never fixes.
// errors.test.ts makes every entry's message in real Pyodide and checks it
// matches, so a Python upgrade that rewords a message fails there.

import type { Language, RunError } from './protocol';

export type ErrorHelp = {
  /** The error in a few words: "A name Python doesn't know". */
  title: string;
  /** What it means, in a sentence or two. */
  meaning: string;
  /** Where to look for the cause. */
  look: string;
};

type Entry = { id: string; pattern: RegExp; help: (m: RegExpMatchArray) => ErrorHelp };

const q = (s: string | undefined) => (s === undefined ? '' : `\`${s}\``);

/** Python's errors, most specific first: the first entry whose pattern matches answers. */
export const PYTHON_ERRORS: readonly Entry[] = [
  // Limits ------------------------------------------------------------------
  {
    id: 'endless-loop',
    pattern: /^Stopped after [\d,]+ steps/,
    help: () => ({
      title: 'A loop that never ends',
      meaning: 'The program ran so many lines that it was stopped. Almost always a loop whose condition never becomes false.',
      look: 'At the loop on the line marked: does something inside it change what its condition tests, every time round?',
    }),
  },
  {
    id: 'nested-calls',
    pattern: /^Stopped at \d+ nested calls|^RecursionError/,
    help: () => ({
      title: 'Calls that never stop calling',
      meaning: 'A function kept calling itself (or calls went round in a circle) without ever reaching a case that returns without calling again.',
      look: 'At the base case: is there one, and does every call move closer to it?',
    }),
  },
  {
    id: 'timeout',
    pattern: /^Stopped after [\d.]+ s/,
    help: () => ({
      title: 'Still running when time ran out',
      meaning: 'The program was stopped because it took too long, usually a loop that never ends or one that does far more work than needed.',
      look: 'At your loops: does each one end, and how many times does it run?',
    }),
  },

  // Syntax --------------------------------------------------------------------
  {
    id: 'indent-expected',
    pattern: /^IndentationError: expected an indented block/,
    help: () => ({
      title: 'A block with nothing in it',
      meaning: 'A line ending in `:` (an if, a loop, a def) must be followed by at least one line indented further.',
      look: 'At the line before the one marked: indent the lines that belong inside it, or write `pass` there for now.',
    }),
  },
  {
    id: 'indent-unexpected',
    pattern: /^IndentationError: unexpected indent/,
    help: () => ({
      title: 'Indented when it shouldn’t be',
      meaning: 'This line starts further in than the line before it, but nothing above opens a block (no line ending in `:`).',
      look: 'At the start of the marked line: line it up with the lines around it.',
    }),
  },
  {
    id: 'indent-unmatched',
    pattern: /^IndentationError: unindent does not match/,
    help: () => ({
      title: 'Indentation that lines up with nothing',
      meaning: 'This line moves back out, but not as far as any block above it: its spaces don’t match an outer level.',
      look: 'Count the spaces at the start of the marked line and of the block it should belong to; they must be equal.',
    }),
  },
  {
    id: 'tabs',
    pattern: /^TabError/,
    help: () => ({
      title: 'Tabs mixed with spaces',
      meaning: 'Some lines are indented with tabs and others with spaces, so Python can’t tell how deep they are.',
      look: 'At the indentation of the marked line: use spaces only (four a level).',
    }),
  },
  {
    id: 'colon',
    pattern: /^SyntaxError: expected ':'/,
    help: () => ({
      title: 'A missing colon',
      meaning: '`if`, `elif`, `else`, `for`, `while`, `def` and `class` lines end with a colon `:`.',
      look: 'At the end of the marked line.',
    }),
  },
  {
    id: 'string-open',
    pattern: /^SyntaxError: unterminated (?:triple-quoted )?string literal/,
    help: () => ({
      title: 'A string that never ends',
      meaning: 'A string starts with a quote but has no closing quote of the same kind on that line.',
      look: 'At the quotes on the marked line: each `"` needs a matching `"`, and each `\'` a matching `\'`.',
    }),
  },
  {
    id: 'never-closed',
    pattern: /^SyntaxError: '([([{])' was never closed/,
    help: (m) => ({
      title: 'A bracket that is never closed',
      meaning: `An opening ${q(m[1])} has no closing partner, so Python reads on to the end of the file looking for it.`,
      look: 'At the marked line and the brackets on it: count the openings and the closings.',
    }),
  },
  {
    id: 'unmatched',
    pattern: /^SyntaxError: unmatched '([)\]}])'|^SyntaxError: closing parenthesis '([)\]}])' does not match/,
    help: (m) => ({
      title: 'A closing bracket with no partner',
      meaning: `There is a ${q(m[1] ?? m[2])} that doesn’t close anything opened before it, or closes the wrong kind of bracket.`,
      look: 'At the brackets on the marked line: each `(`, `[` and `{` pairs with its own kind.',
    }),
  },
  {
    id: 'print-parens',
    pattern: /^SyntaxError: Missing parentheses in call to 'print'/,
    help: () => ({
      title: 'print needs brackets',
      meaning: 'In Python 3, `print` is a function, so what it prints goes in brackets: `print("hi")`.',
      look: 'At the `print` on the marked line.',
    }),
  },
  {
    id: 'assign-in-condition',
    pattern: /^SyntaxError: invalid syntax\. Maybe you meant '==' or ':=' instead of '='\?/,
    help: () => ({
      title: '= where == was meant',
      meaning: 'A single `=` stores a value in a name. To compare two values, use `==`.',
      look: 'At the condition on the marked line.',
    }),
  },
  {
    id: 'comma',
    pattern: /^SyntaxError: invalid syntax\. Perhaps you forgot a comma\?/,
    help: () => ({
      title: 'A missing comma',
      meaning: 'Two values sit side by side where Python expected a comma between them, as in a list or a call’s arguments.',
      look: 'Between the items on the marked line.',
    }),
  },
  {
    id: 'assign-target',
    pattern: /^SyntaxError: cannot assign to (function call|literal|expression|f-string expression)/,
    help: (m) => ({
      title: 'Storing into something that isn’t a name',
      meaning: `The left of \`=\` must be a name (or an item, like \`xs[0]\`), but here it is a ${m[1]}. To compare two values instead, use \`==\`.`,
      look: 'At the left of `=` on the marked line: is it written the wrong way round, or meant as a comparison?',
    }),
  },
  {
    id: 'outside-function',
    pattern: /^SyntaxError: '(return|yield)' outside function/,
    help: (m) => ({
      title: `${q(m[1])} outside a function`,
      meaning: `${q(m[1])} only means something inside a \`def\`.`,
      look: 'At the indentation of the marked line: is it meant to be inside the function above?',
    }),
  },
  {
    id: 'outside-loop',
    pattern: /^SyntaxError: '(break|continue)' (?:outside loop|not properly in loop)/,
    help: (m) => ({
      title: `${q(m[1])} outside a loop`,
      meaning: `${q(m[1])} only means something inside a \`for\` or \`while\` loop.`,
      look: 'At the indentation of the marked line.',
    }),
  },
  {
    id: 'smart-quote',
    pattern: /^SyntaxError: invalid character '([“”‘’])'/,
    help: (m) => ({
      title: 'A curly quote',
      meaning: `${m[1]} is a typographic quote (word processors make them); Python only knows the straight quotes " and '.`,
      look: 'At the quotes on the marked line: retype them in the editor.',
    }),
  },
  {
    id: 'invalid-character',
    pattern: /^SyntaxError: invalid (?:non-printable )?character/,
    help: () => ({
      title: 'A character Python doesn’t know',
      meaning: 'The line has a symbol that isn’t part of Python, often pasted in from somewhere else.',
      look: 'At the marked line: retype it by hand.',
    }),
  },
  {
    id: 'decimal-literal',
    pattern: /^SyntaxError: invalid (?:decimal|digit)/,
    help: () => ({
      title: 'A number run into letters',
      meaning: 'A number is followed straight away by letters. Names can’t start with a digit, and a number can’t have letters in it.',
      look: 'At the marked line: is a `*` missing (`2x` should be `2 * x`), or a name starting with a digit?',
    }),
  },
  {
    id: 'syntax',
    pattern: /^SyntaxError/,
    help: () => ({
      title: 'Not written the way Python reads it',
      meaning: 'Python couldn’t make sense of this line, so nothing ran.',
      look: 'At the marked line, and the end of the line before it: brackets, quotes, colons and commas.',
    }),
  },

  // Names ---------------------------------------------------------------------
  {
    id: 'unbound-local',
    pattern: /^UnboundLocalError: cannot access local variable '(\w+)'/,
    help: (m) => ({
      title: 'A local name used before it’s set',
      meaning: `${q(m[1])} is assigned somewhere in this function, which makes it the function’s own name everywhere in it, and it hasn’t been given a value yet at this line.`,
      look: `At ${q(m[1])} in this function: give it a value before using it, or pass the outer value in as a parameter.`,
    }),
  },
  {
    id: 'name',
    pattern: /^NameError: name '(\w+)' is not defined(?:\. Did you mean: '(\w+)'\?)?/,
    help: (m) => ({
      title: 'A name Python doesn’t know',
      meaning: `Nothing called ${q(m[1])} exists at this point${m[2] ? `. A similar name, ${q(m[2])}, does` : ''}.`,
      look: `At how ${q(m[1])} is spelled (capitals count), whether it is assigned above this line, and whether text is missing its quotes.`,
    }),
  },

  // Types ---------------------------------------------------------------------
  {
    id: 'str-plus-number',
    pattern: /^TypeError: can only concatenate str \(not "(\w+)"\) to str/,
    help: (m) => ({
      title: 'Joining text to a number',
      meaning: `\`+\` joins two strings, but one side here is a ${m[1]}. Python won’t guess whether you meant text or arithmetic.`,
      look: 'At the `+` on the marked line: wrap the number in `str(…)`, or use an f-string.',
    }),
  },
  {
    id: 'operand-types',
    pattern: /^TypeError: unsupported operand type\(s\) for (\S+): '(\w+)' and '(\w+)'/,
    help: (m) => ({
      title: 'An operator that doesn’t fit the values',
      meaning: `${q(m[1])} can’t combine a ${m[2]} with a ${m[3]}.${m[2] === 'str' || m[3] === 'str' ? ' Text read with input() stays text until you convert it with int() or float().' : ''}${m[2] === 'NoneType' || m[3] === 'NoneType' ? ' None often comes from a function that forgot to return.' : ''}`,
      look: 'At the values on each side of the operator on the marked line: what type is each?',
    }),
  },
  {
    id: 'compare-types',
    pattern: /^TypeError: '([<>]=?)' not supported between instances of '(\w+)' and '(\w+)'/,
    help: (m) => ({
      title: 'Comparing values that don’t compare',
      meaning: `${q(m[1])} can’t order a ${m[2]} against a ${m[3]}.`,
      look: 'At both sides of the comparison: is one of them still text from input()?',
    }),
  },
  {
    id: 'not-callable',
    pattern: /^TypeError: '(\w+)' object is not callable/,
    help: (m) => ({
      title: 'Calling something that isn’t a function',
      meaning: `Brackets after a name call it, but this ${m[1]} isn’t a function. Often a name that used to be a function (like \`sum\` or \`list\`) now holds a value.`,
      look: 'At the name before the brackets on the marked line: what does it hold now?',
    }),
  },
  {
    id: 'not-subscriptable',
    pattern: /^TypeError: '(\w+)' object is not subscriptable/,
    help: (m) => ({
      title: 'Indexing something that has no items',
      meaning: `\`[…]\` takes an item out of a list, string or dict, but this is a ${m[1]}.${m[1] === 'NoneType' ? ' None often comes from a function that forgot to return.' : ''}`,
      look: 'At the value before the `[` on the marked line.',
    }),
  },
  {
    id: 'not-iterable',
    pattern: /^TypeError: (?:cannot unpack non-iterable )?'?(\w+)'? object is not iterable/,
    help: (m) => ({
      title: 'Looping over something that isn’t a collection',
      meaning: `A for loop (or unpacking) needs a list, string, range or similar, but this is a ${m[1]}.${m[1] === 'int' ? ' To count, loop over `range(n)`.' : ''}`,
      look: 'At what follows `in` on the marked line.',
    }),
  },
  {
    id: 'missing-argument',
    pattern: /^TypeError: (\w+)\(\) missing (\d+) required (?:positional|keyword-only) arguments?: (.+)/,
    help: (m) => ({
      title: 'Too few arguments',
      meaning: `${q(`${m[1]}()`)} needs a value for ${m[3]}, but the call didn’t give one.`,
      look: `At the call to ${q(m[1])}, and the parameters in its \`def\`.`,
    }),
  },
  {
    id: 'too-many-arguments',
    pattern: /^TypeError: (\w+)\(\) takes (\d+) positional arguments? but (\d+) (?:were|was) given/,
    help: (m) => ({
      title: 'Too many arguments',
      meaning: `${q(`${m[1]}()`)} takes ${m[2]} but was given ${m[3]}. Inside a class, \`self\` counts as the first.`,
      look: `At the call to ${q(m[1])}, and the parameters in its \`def\`.`,
    }),
  },
  {
    id: 'item-assignment',
    pattern: /^TypeError: '(str|tuple)' object does not support item assignment/,
    help: (m) => ({
      title: `A ${m[1]} can’t be changed`,
      meaning: `${m[1] === 'str' ? 'Strings' : 'Tuples'} can’t be changed in place. Build a new one instead.`,
      look: m[1] === 'str' ? 'At the assignment on the marked line: make a new string (slicing and +), or work on a list of characters.' : 'At the assignment on the marked line: use a list if it must change.',
    }),
  },
  {
    id: 'index-type',
    pattern: /^TypeError: (list|string|tuple) indices must be integers(?: or slices)?, not (\w+)/,
    help: (m) => ({
      title: 'A position that isn’t a whole number',
      meaning: `Items of a ${m[1]} are numbered 0, 1, 2…, so the position must be an int, not a ${m[2]}.${m[2] === 'str' ? ' Text from input() needs int() first; or did you mean a dict?' : ''}${m[2] === 'float' ? ' `/` always gives a float; `//` gives a whole number.' : ''}`,
      look: 'At what is inside the `[…]` on the marked line.',
    }),
  },
  {
    id: 'sequence-times-float',
    pattern: /^TypeError: can't multiply sequence by non-int of type '(\w+)'/,
    help: (m) => ({
      title: 'Repeating text a fractional number of times',
      meaning: `\`*\` with a string or list repeats it, which needs a whole number, not a ${m[1]}.${m[1] === 'str' ? ' Both sides are text: convert input() with int() or float().' : ''}`,
      look: 'At both sides of the `*` on the marked line.',
    }),
  },
  {
    id: 'no-len',
    pattern: /^TypeError: object of type '(\w+)' has no len\(\)/,
    help: (m) => ({
      title: 'Length of something without one',
      meaning: `\`len()\` counts the items of a collection, and a ${m[1]} has none.`,
      look: 'At what is passed to `len` on the marked line.',
    }),
  },
  {
    id: 'unhashable',
    pattern: /^TypeError: (?:unhashable type|cannot use '(\w+)' as a (?:set element|dict key))(?:: '(\w+)')?/,
    help: (m) => ({
      title: 'A changeable value as a key',
      meaning: `Dict keys and set members must not change, so a ${m[2] ?? m[1]} can’t be one. A tuple can.`,
      look: 'At the key or member on the marked line.',
    }),
  },

  // Values --------------------------------------------------------------------
  {
    id: 'int-literal',
    pattern: /^ValueError: invalid literal for int\(\) with base 10: (.+)/,
    help: (m) => ({
      title: 'Text that isn’t a whole number',
      meaning: `\`int()\` turns text like "42" into a number, but ${m[1]} isn’t one.${m[1].includes('.') ? ' It has a decimal point: use float().' : ''}`,
      look: 'At what was typed as input, and at the `int(…)` on the marked line.',
    }),
  },
  {
    id: 'float-literal',
    pattern: /^ValueError: could not convert string to float: (.+)/,
    help: (m) => ({
      title: 'Text that isn’t a number',
      meaning: `\`float()\` turns text like "3.5" into a number, but ${m[1]} isn’t one.`,
      look: 'At what was typed as input, and at the `float(…)` on the marked line.',
    }),
  },
  {
    id: 'unpack-count',
    pattern: /^ValueError: (too many values to unpack|not enough values to unpack)/,
    help: (m) => ({
      title: m[1] === 'too many values to unpack' ? 'More values than names' : 'Fewer values than names',
      meaning: 'Unpacking (`a, b = …`) needs exactly as many values on the right as names on the left.',
      look: 'At the left of `=` on the marked line, and how many items the right really has.',
    }),
  },
  {
    id: 'index-range',
    pattern: /^IndexError: (list|string|tuple|range object) index out of range/,
    help: (m) => ({
      title: 'A position past the end',
      meaning: `The ${m[1].replace(' object', '')} has fewer items than the position asks for. Positions start at 0, so the last is \`len(…) - 1\`.`,
      look: 'At the `[…]` on the marked line: what is the position, and how long is it then? An empty one has no position 0.',
    }),
  },
  {
    id: 'pop-empty',
    pattern: /^IndexError: pop from empty list/,
    help: () => ({
      title: 'Taking from an empty list',
      meaning: '`pop()` takes an item out, but the list has none left.',
      look: 'At the loop or condition around the marked line: check the list isn’t empty first.',
    }),
  },
  {
    id: 'key',
    pattern: /^KeyError: (.+)/,
    help: (m) => ({
      title: 'A key the dictionary doesn’t have',
      meaning: `The dict has no entry for ${m[1]}.`,
      look: 'At the spelling and type of the key (1 and "1" are different keys), or use `.get(key)` or `in` to check first.',
    }),
  },
  {
    id: 'none-attribute',
    pattern: /^AttributeError: 'NoneType' object has no attribute '(\w+)'/,
    help: (m) => ({
      title: 'Using None as if it were a value',
      meaning: `\`.${m[1]}\` was asked of None. A name holds None when it was given the result of something that returns nothing: a function without \`return\`, or a list method like \`sort()\`.`,
      look: 'At where the value before the dot came from.',
    }),
  },
  {
    id: 'attribute',
    pattern: /^AttributeError: '(\w+)' object has no attribute '(\w+)'/,
    help: (m) => ({
      title: `A ${m[1]} has no ${q(m[2])}`,
      meaning: `${q(`.${m[2]}`)} isn’t something a ${m[1]} has.`,
      look: `At the spelling of ${q(m[2])}, and at what type the value before the dot really is.`,
    }),
  },
  {
    id: 'zero-division',
    pattern: /^ZeroDivisionError/,
    help: () => ({
      title: 'Dividing by zero',
      meaning: '`/`, `//` and `%` can’t divide by 0.',
      look: 'At the value on the right of the division on the marked line: can it be 0 here?',
    }),
  },
  {
    id: 'eof-input',
    pattern: /^EOFError/,
    help: () => ({
      title: 'Reading more input than there is',
      meaning: '`input()` asked for another line, but the input had run out.',
      look: 'At how many times `input()` runs: once per line of input given.',
    }),
  },
  {
    id: 'no-module',
    pattern: /^ModuleNotFoundError: No module named '([\w.]+)'/,
    help: (m) => ({
      title: 'A module that isn’t there',
      meaning: `There is no module called ${q(m[1])}: only Python’s standard library and your own files can be imported here.`,
      look: `At the spelling of ${q(m[1])} in the import.`,
    }),
  },
  {
    id: 'import-name',
    pattern: /^ImportError: cannot import name '(\w+)' from '([\w.]+)'/,
    help: (m) => ({
      title: 'A name the module doesn’t have',
      meaning: `${q(m[2])} has nothing called ${q(m[1])}.`,
      look: 'At the spelling of the name, and at the module it should come from.',
    }),
  },
];

/** Plain-language help for an error, or null when the catalogue has none (JS/TS have no catalogue yet). */
export function explainError(language: Language, error: Pick<RunError, 'message'>): ErrorHelp | null {
  if (language !== 'python') return null;
  for (const entry of PYTHON_ERRORS) {
    const m = error.message.match(entry.pattern);
    if (m) return entry.help(m);
  }
  return null;
}

/** Which catalogue entry an error matches (for tests). */
export function errorId(language: Language, message: string): string | null {
  if (language !== 'python') return null;
  return PYTHON_ERRORS.find((e) => e.pattern.test(message))?.id ?? null;
}

import { javascriptLanguage, typescriptLanguage } from '@codemirror/lang-javascript';
import { pythonLanguage } from '@codemirror/lang-python';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exercises } from '@/content/exercises';
import { snippets } from '@/content/snippets';
import { stub } from '@/problems/codegen';
import { loadProblems, solutionIn } from '@/problems/load';
import { missingQuote, syntaxProblems, type CheckedLanguage } from './syntax';

const PARSER = { python: pythonLanguage.parser, javascript: javascriptLanguage.parser, typescript: typescriptLanguage.parser };

function problems(code: string, language: CheckedLanguage) {
  return syntaxProblems(PARSER[language].parse(code), code, language);
}

/** The one problem a snippet has, with the text it underlines. */
function only(code: string, language: CheckedLanguage) {
  const found = problems(code, language);
  expect(found, JSON.stringify(found)).toHaveLength(1);
  return { ...found[0], text: code.slice(found[0].from, found[0].to) };
}

describe('syntax problems', () => {
  it('finds nothing wrong in good code, including the tricky parts', () => {
    const python = [
      'def f(nums: list[int]) -> int:\n    """A docstring (with a bracket\n    that spans lines."""\n    total = 0  # a comment (\n    for i, n in enumerate(nums):\n        if n % 2 == 0:\n            total += n\n        elif n < 0:\n            continue\n        else:\n            pass\n    return total\n',
      "x = {\n    'a':\n        1,\n}\ns = f'{x[\"a\"]:>{3}} {{literal}}'\ny = (1 +\n     2)\nz = 1 + \\\n    2\n",
      'class A:\n    @staticmethod\n    def m(a, *args, **kw):\n        return lambda b: [c for c in args if c]\n\n\nmatch 3:\n    case 1 | 2:\n        pass\n    case _:\n        pass\n',
      'if True: pass\nwhile False:\n\tpass\ntry:\n    pass\nexcept (ValueError, KeyError) as e:\n    raise\nfinally:\n    pass\n',
    ];
    const javascript = [
      'function f(nums) {\n  const s = `sum: ${nums.reduce((a, b) => a + b, 0)} {not a brace}`;\n  const r = /[(]+/g; // ( in a comment\n  /* { in a block comment */\n  return { s, r, n: nums?.length ?? 0 };\n}\n',
      'class A {\n  #p = 1;\n  static m() { return this.#p; }\n}\nlabel: for (;;) break label;\nconst [a, ...rest] = [1, 2];\n',
      // The grammar rejects destructuring into members; the swap is too common to flag.
      'if (a[i] > a[j]) {\n  [a[i], a[j]] = [a[j], a[i]];\n}\n',
    ];
    const typescript = [
      'function f<T extends object>(xs: T[], k: keyof T): Map<string, T> | null {\n  const m = new Map<string, T>();\n  type P = { a: string; b?: number[] };\n  return xs.length > 0 ? m : null;\n}\ninterface Q { n: number }\nenum E { A, B }\n',
    ];
    for (const code of python) expect(problems(code, 'python'), code).toEqual([]);
    for (const code of javascript) expect(problems(code, 'javascript'), code).toEqual([]);
    for (const code of [...javascript, ...typescript]) expect(problems(code, 'typescript'), code).toEqual([]);
  });

  it('finds nothing wrong in any code we ship: problem stubs and solutions, exercises and snippets', () => {
    const checked: CheckedLanguage[] = ['python', 'javascript', 'typescript'];
    const shipped: [string, CheckedLanguage, string][] = [];
    for (const problem of loadProblems()) {
      for (const language of checked) {
        shipped.push([`${problem.slug} stub`, language, stub(problem, language)]);
        shipped.push([`${problem.slug} solution`, language, solutionIn(problem, language)]);
      }
    }
    for (const exercise of exercises) {
      for (const language of checked) {
        shipped.push([`${exercise.slug} starter`, language, exercise.starter[language]]);
        shipped.push([`${exercise.slug} solution`, language, exercise.solution[language]]);
      }
    }
    for (const snippet of snippets) {
      for (const [language, code] of Object.entries(snippet.code)) shipped.push([`${snippet.id} snippet`, language as CheckedLanguage, code]);
    }
    const wrong = shipped.filter(([, language, code]) => problems(code, language).length > 0).map(([name, language, code]) => `${name} (${language}): ${JSON.stringify(problems(code, language))}`);
    expect(wrong).toEqual([]);
    expect(shipped.length).toBeGreaterThan(500);
  });

  describe('Python', () => {
    it('asks for the colon a block needs', () => {
      const p = only('def f(x):\n    if x > 1\n        return x\n    return 0\n', 'python');
      expect(p).toMatchObject({ line: 2, text: '1', message: 'A line that starts with “if” must end with a colon (:).' });
      expect(only('for i in range(3)  # count\n    print(i)\n', 'python')).toMatchObject({ line: 1, message: 'A line that starts with “for” must end with a colon (:).' });
    });

    it('spells elif for a learner coming from JavaScript', () => {
      expect(only('if x:\n    pass\nelse if y:\n    pass\n', 'python')).toMatchObject({ line: 3, text: 'else if', message: 'Python writes “elif”, not “else if”.' });
    });

    it('points at the bracket that is never closed, not where the parser gave up', () => {
      expect(only('def f(x):\n    return g(x, 2\n\nprint(1)\n', 'python')).toMatchObject({ line: 2, text: '(', message: 'This ( is never closed. Add a ) to match it.' });
      expect(only('x = [1, 2, 3\ny = 4\n', 'python')).toMatchObject({ line: 1, text: '[', message: 'This [ is never closed. Add a ] to match it.' });
    });

    it('points at a bracket that closes nothing', () => {
      expect(only('def f(x):\n    return x)\n', 'python')).toMatchObject({ line: 2, text: ')', message: 'This ) has no ( before it to close.' });
    });

    it('finds a string without its closing quote', () => {
      expect(only("s = 'abc\nprint(s)\n", 'python')).toMatchObject({ line: 1, text: "'", message: "This string is missing its closing quote (')." });
      expect(only('s = f"{x}\n', 'python')).toMatchObject({ line: 1, text: 'f"', message: 'This string is missing its closing quote (").' });
      expect(only("s = '''abc\nprint(s)\n", 'python')).toMatchObject({ line: 1, message: "This string is missing its closing quote (''')." });
    });

    it('explains indents: one too many, one missing, and one that lines up with nothing', () => {
      expect(only('def f(x):\n    y = 1\n      z = 2\n    return y\n', 'python')).toMatchObject({
        line: 3,
        text: 'z',
        message: 'This line is indented more than the line above it, which doesn’t end with a colon (:) to start a block.',
      });
      expect(only('def f(x):\nreturn x\n', 'python')).toMatchObject({ line: 2, text: 'return', message: 'The line after a colon (:) must be indented.' });
      expect(only('def f(x):\n    if x:\n        y = 1\n  z = 2\n', 'python')).toMatchObject({ line: 4, text: 'z', message: 'This line’s indent doesn’t line up with any block above it.' });
    });

    it('says what is missing after an operator', () => {
      expect(only('x = 1 +\n', 'python')).toMatchObject({ line: 1, text: '+', message: 'Something is missing after “+”.' });
    });

    it('asks for the body of a block left empty at the end of the code, as it is being typed', () => {
      for (const code of ['def f(x):', 'def f(x):\n', 'def f(x):\n    ', 'class A:\n    def m(self):\n']) {
        expect(only(code, 'python'), code).toMatchObject({ text: ':', message: 'Python needs an indented line after this colon (:).' });
      }
      expect(only('if x:\n    pass\nelse:\n\n', 'python')).toMatchObject({ line: 3, text: ':' });
    });
  });

  describe('JavaScript and TypeScript', () => {
    it('finds the bracket a condition never closes', () => {
      for (const language of ['javascript', 'typescript'] as const) {
        expect(only('function f(x) {\n  if (x > 1 {\n    return x;\n  }\n  return 0;\n}\n', language)).toMatchObject({ line: 2, text: '(', message: 'This ( is never closed. Add a ) to match it.' });
      }
      expect(only('function f(nums: number[], k: number: number {\n  return 1;\n}\n', 'typescript')).toMatchObject({ line: 1, text: '(' });
    });

    it('finds a block that is never closed, and a brace too many', () => {
      expect(only('function f(x) {\n  return x;\n', 'javascript')).toMatchObject({ line: 1, text: '{', message: 'This { is never closed. Add a } to match it.' });
      expect(only('function f(x) {\n  return x;\n}}\n', 'javascript')).toMatchObject({ line: 3, text: '}', message: 'This } has no { before it to close.' });
    });

    it('finds strings and template strings without their closing quote', () => {
      expect(only("const s = 'abc;\nconsole.log(s);\n", 'javascript')).toMatchObject({ line: 1, text: "'", message: "This string is missing its closing quote (')." });
      expect(only('const t = `abc\n', 'javascript')).toMatchObject({ line: 1, text: '`', message: 'This string is missing its closing quote (`).' });
    });

    it('names a token that does not belong', () => {
      expect(only('let x = = 3;\n', 'javascript')).toMatchObject({ line: 1, text: '=', message: 'JavaScript didn’t expect “=” here.' });
      expect(only('function f(x) {\n  retrun x;\n}\n', 'javascript')).toMatchObject({ line: 2, text: 'x', message: 'JavaScript didn’t expect “x” here.' });
      expect(only('let x = 1 +;\n', 'typescript')).toMatchObject({ line: 1, text: '+', message: 'Something is missing after “+”.' });
      expect(only('if (x) {\n} else if {\n}\n', 'javascript')).toMatchObject({ line: 2, text: 'if', message: 'Something is missing after “if”.' });
    });

    it('names the last thing written when the code stops mid-statement', () => {
      expect(only('const x = \n', 'javascript')).toMatchObject({ line: 1, text: '=', message: 'Something is missing after “=”.' });
      expect(only('if (x)\n', 'typescript')).toMatchObject({ line: 1, text: ')', message: 'Something is missing after “)”.' });
    });
  });

  it('keeps one problem per line, in order', () => {
    const found = problems('a = (1,\nb = 2)\nc = )\n', 'python');
    expect(found.map((p) => p.line)).toEqual([...new Set(found.map((p) => p.line))].sort((a, b) => a - b));
  });

  it('never throws, and always underlines something inside the code, on mangled code', () => {
    const sources: [CheckedLanguage, string][] = loadProblems()
      .slice(0, 12)
      .flatMap((p) => [['python', solutionIn(p, 'python')] as [CheckedLanguage, string], ['typescript', solutionIn(p, 'typescript')] as [CheckedLanguage, string]]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: sources.length - 1 }), fc.array(fc.tuple(fc.nat(), fc.nat({ max: 4 }), fc.constantFrom('', '(', ')', ':', '"', "'", '\n', '    ', '{', '}', 'if ', '=')), { maxLength: 4 }), (which, edits) => {
        const [language, original] = sources[which];
        let code = original;
        for (const [at, cut, insert] of edits) {
          const pos = at % (code.length + 1);
          code = code.slice(0, pos) + insert + code.slice(pos + cut);
        }
        for (const p of problems(code, language)) {
          expect(p.from).toBeGreaterThanOrEqual(0);
          expect(p.to).toBeGreaterThan(p.from);
          expect(p.to).toBeLessThanOrEqual(code.length);
          expect(code.slice(0, p.from).split('\n').length).toBe(p.line);
          expect(p.message).toMatch(/^[A-Z].*[.]$/);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('missing quotes', () => {
  it('reads string prefixes, triple quotes and escapes', () => {
    expect(missingQuote("'abc'", 'String')).toBeNull();
    expect(missingQuote("''", 'String')).toBeNull();
    expect(missingQuote("rb'x'", 'String')).toBeNull();
    expect(missingQuote('"""a"b"""', 'String')).toBeNull();
    expect(missingQuote("'a\\''", 'String')).toBeNull();
    expect(missingQuote("'a\\'", 'String')).toEqual({ quote: "'", at: 1 });
    expect(missingQuote('f"x', 'FormatString')).toEqual({ quote: '"', at: 2 });
    expect(missingQuote("'''a'", 'String')).toEqual({ quote: "'''", at: 3 });
    expect(missingQuote('`a${b}`', 'TemplateString')).toBeNull();
    expect(missingQuote('`a', 'TemplateString')).toEqual({ quote: '`', at: 1 });
  });
});

// The error catalogue against real Python: every entry's error is made by
// running a snippet in Pyodide (as the browser does), and the message it
// reports must match that entry, so a Python upgrade that rewords a message
// fails here rather than leaving learners without help.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { errorId, explainError, PYTHON_ERRORS } from './errors';
import { DEFAULT_LIMITS, type RunResult } from './protocol';
import { HARNESS } from './python/harness';

let run: (code: string, stdin?: string) => RunResult;

beforeAll(async () => {
  const pyodide = await loadPyodide({ env: { PYTHONHASHSEED: '0' } });
  pyodide.runPython(HARNESS);
  const runRequest = pyodide.globals.get('run_request') as (json: string) => string;
  run = (code, stdin = '') =>
    JSON.parse(runRequest(JSON.stringify({ language: 'python', code, entry: '', args: [], limits: { ...DEFAULT_LIMITS, maxSteps: 2000 }, mode: 'program', stdin })));
}, 120_000);

/** A snippet that makes each entry's error. */
const MAKES: Record<string, string> = {
  'endless-loop': 'while True:\n    pass\n',
  'nested-calls': 'def f(n):\n    return f(n + 1)\nf(0)\n',
  'indent-expected': 'if True:\nprint(1)\n',
  'indent-unexpected': 'x = 1\n    y = 2\n',
  'indent-unmatched': 'if True:\n        x = 1\n    y = 2\n',
  tabs: 'if True:\n\tx = 1\n        y = 2\n',
  colon: 'if 1 > 0\n    print(1)\n',
  'string-open': 'print("hi)\n',
  'never-closed': 'print((1, 2)\n',
  unmatched: 'x = 1)\n',
  'print-parens': 'print "hi"\n',
  'assign-in-condition': 'x = 1\nif x = 1:\n    pass\n',
  comma: 'xs = [1 2]\n',
  'assign-target': 'len(x) = 3\n',
  'outside-function': 'return 3\n',
  'outside-loop': 'break\n',
  'smart-quote': 'print(“hi”)\n',
  'invalid-character': 'x = 1 € 2\n',
  'decimal-literal': 'x = 2y\n',
  syntax: 'x = = 1\n',
  'unbound-local': 'n = 1\ndef f():\n    n += 1\nf()\n',
  name: 'count = 1\nprint(cuont)\n',
  'str-plus-number': 'print("age " + 3)\n',
  'operand-types': 'print(3 + "4")\n',
  'compare-types': 'print("3" < 4)\n',
  'not-callable': 'sum = 3\nsum([1, 2])\n',
  'not-subscriptable': 'x = None\nx[0]\n',
  'not-iterable': 'for i in 5:\n    pass\n',
  'missing-argument': 'def f(a, b):\n    return a\nf(1)\n',
  'too-many-arguments': 'def f(a):\n    return a\nf(1, 2)\n',
  'item-assignment': 's = "abc"\ns[0] = "x"\n',
  'index-type': 'xs = [1, 2]\nxs["0"]\n',
  'sequence-times-float': 'print("ab" * 1.5)\n',
  'no-len': 'len(5)\n',
  unhashable: 'd = {[1]: 2}\n',
  'int-literal': 'n = int(input())\n',
  'float-literal': 'n = float(input())\n',
  'unpack-count': 'a, b = 1, 2, 3\n',
  'index-range': 'xs = [1]\nxs[3]\n',
  'pop-empty': 'xs = []\nxs.pop()\n',
  key: 'd = {"a": 1}\nd["b"]\n',
  'none-attribute': 'xs = [3, 1].sort()\nxs.append(2)\n',
  attribute: 'xs = [1]\nxs.push(2)\n',
  'zero-division': 'print(1 / 0)\n',
  'eof-input': 'a = input()\nb = input()\n',
  'no-module': 'import numpyy\n',
  'import-name': 'from math import squareroot\n',
};

describe('the Python error catalogue', () => {
  it('has a snippet for every entry but the timeout (which only the runner makes)', () => {
    expect(Object.keys(MAKES).sort()).toEqual(PYTHON_ERRORS.map((e) => e.id).filter((id) => id !== 'timeout').sort());
  });

  for (const [id, code] of Object.entries(MAKES)) {
    it(`explains ${id}`, () => {
      const r = run(code, id.endsWith('literal') ? 'x\n' : 'only\n');
      expect(r.error, `${id} made no error`).not.toBeNull();
      expect(errorId('python', r.error!.message), r.error!.message).toBe(id);
      const help = explainError('python', r.error!)!;
      for (const text of [help.title, help.meaning, help.look]) expect(text.length).toBeGreaterThan(5);
    });
  }

  it('matches the runner’s timeout and says nothing for other languages', () => {
    expect(errorId('python', 'Stopped after 8 s: the code was still running. Is there a loop that never ends?')).toBe('timeout');
    expect(explainError('javascript', { message: 'TypeError: x is not a function' })).toBeNull();
  });
});

// The learner's own test: typed values read back exactly, every real test
// typed out reads back as itself, and wrong input is named plainly.

import { describe, expect, it } from 'vitest';
import type { RunResult } from '@/workspace/protocol';
import { CALLS, customCase, customError, customText, LiteralError, MAX_CUSTOM, parseLiteral, readCustom, valueError, type CustomText } from './custom';
import { ownMismatch, verdict, type ProblemSpec } from './judge';
import { PROBLEM_LANGUAGE_IDS } from './languages';
import { getProblem, loadProblems, specFor } from './load';

const spec = (slug: string): ProblemSpec => specFor(getProblem(slug)!);

describe('typed values', () => {
  it('reads JSON and what Python and Go write', () => {
    expect(parseLiteral(' [1, -2, 3.5, 1e3] ')).toEqual([1, -2, 3.5, 1000]);
    expect(parseLiteral('[None, True, False, null, true, false, nil]')).toEqual([null, true, false, null, true, false, null]);
    expect(parseLiteral(`['it\\'s', "say \\"hi\\"", 'tab\\there', '\\u00e9\\x41']`)).toEqual(["it's", 'say "hi"', 'tab\there', 'éA']);
    expect(parseLiteral('[[1, 2,], [],\n [3]]')).toEqual([[1, 2], [], [3]]);
    expect(parseLiteral('"a ] b"')).toBe('a ] b');
  });

  it('says what is wrong with text that is not a value', () => {
    const fails = (text: string, message: RegExp) => expect(() => parseLiteral(text)).toThrow(message);
    fails('', /missing/);
    fails('[1, 2', /missing its closing \]/);
    fails('[1 2]', /Expected a comma or \] but found “2”/);
    fails('[1,,2]', /Unexpected “,”/);
    fails('abc', /abc isn’t a value: put a string in quotes, like "abc"/);
    fails('"abc', /missing its closing "/);
    fails('{1: 2}', /write lists in \[ \]/);
    fails('1 2', /Unexpected “2” after the value/);
    fails('"\\q"', /Unknown escape/);
    expect(() => parseLiteral('[')).toThrow(LiteralError);
  });

  it('checks values against the types a signature uses', () => {
    expect(valueError('int', 3, 'python', '')).toBeNull();
    expect(valueError('int', 2.5, 'python', '')).toBe('Should be a whole number, not 2.5.');
    expect(valueError('int', 2 ** 31, 'java', 'n')).toMatch(/^n is 2147483648, too big for an int/);
    expect(valueError('long', 2 ** 31, 'java', '')).toBeNull();
    expect(valueError('long', 2 ** 60, 'java', '')).toMatch(/too big: whole numbers here go up to 2\^53/);
    expect(valueError('bool', 1, 'python', '')).toBe('Should be True or False, not 1.');
    expect(valueError('string', 5, 'javascript', 's')).toBe('s should be a string in quotes, not 5.');
    expect(valueError('int[]', [1, 'x'], 'python', '')).toBe("Item 2 should be a whole number, not 'x'.");
    expect(valueError('int[][]', [[1], [2, true]], 'javascript', '')).toBe('Row 2, item 2 should be a whole number, not true.');
    expect(valueError('string[]', 'abc', 'python', '')).toBe("Should be a list of strings in quotes, not 'abc'.");
    expect(valueError('ListNode', [1, 2], 'go', '')).toBeNull();
  });

  it('checks a tree is in level order, with a root and a parent for every value', () => {
    expect(valueError('TreeNode', [], 'python', '')).toBeNull();
    expect(valueError('TreeNode', [3, 9, 20, null, null, 15, 7], 'python', '')).toBeNull();
    expect(valueError('TreeNode', [null, 1], 'python', '')).toMatch(/^The first value is the root, so it can’t be None/);
    expect(valueError('TreeNode', [1, null, null, 2], 'javascript', '')).toMatch(/^Item 4 has no parent/);
    expect(valueError('TreeNode', [1, 'a'], 'python', '')).toBe("Item 2 should be a whole number or None, not 'a'.");
  });
});

/** Every test of every problem, typed out in every language. */
const everyCase = loadProblems().flatMap((problem) => {
  const s = specFor(problem);
  return s.cases.map((test) => ({ spec: s, test }));
});

describe('typed tests', () => {
  it('starts from the first example, and every test typed out reads back as itself in every language', () => {
    expect(customText(spec('two-sum'), 'python')).toEqual({ nums: '[3, 9, 14, 5]', target: '8' });
    for (const language of PROBLEM_LANGUAGE_IDS) {
      for (const { spec: s, test } of everyCase) {
        const read = readCustom(s, customText(s, language, test), language);
        if (!read.ok) throw new Error(`${s.slug} ${test.id} in ${language}: ${JSON.stringify(read.errors)}`);
        expect(read.test.input ?? read.test.calls, `${s.slug} ${test.id} ${language}`).toEqual(test.input ?? test.calls);
      }
    }
  });

  it('names each field that is wrong, and keeps tests under the size limit', () => {
    const twoSum = spec('two-sum');
    expect(readCustom(twoSum, { nums: '[1, 2', target: '' }, 'python')).toEqual({
      ok: false,
      errors: { nums: 'A list is missing its closing ].', target: 'Type a value for target: a whole number.' },
    });
    const huge = `[${Array.from({ length: 10_000 }, () => 12345).join(', ')}]`;
    const read = readCustom(twoSum, { nums: huge, target: '1' }, 'python');
    expect(read.ok ? null : read.errors['']).toMatch(/too big to run here/);
  });

  it('reads a design problem’s calls however the method names are written', () => {
    const minStack = spec('min-stack');
    const text = (calls: string): CustomText => ({ [CALLS]: calls });
    const read = readCustom(minStack, text('s = MinStack()\n\ns.push(3)\npush(-1)\nget_min()\nGetMin();\nobj.pop()'), 'python');
    expect(read.ok && read.test.calls).toEqual([['MinStack'], ['push', 3], ['push', -1], ['getMin'], ['getMin'], ['pop']]);
    const error = (calls: string) => {
      const r = readCustom(minStack, text(calls), 'python');
      return r.ok ? null : r.errors[CALLS];
    };
    expect(error('')).toMatch(/^Write the calls, one per line, starting with the one that makes the object: MinStack\(\)/);
    expect(error('push(1)')).toBe('Line 1 should make the object: MinStack().');
    expect(error('MinStack()\n\npeek()')).toBe('Line 3: a MinStack has no method called peek. Its methods are push, pop, top and get_min.');
    expect(error('MinStack()\nMinStack()')).toBe('Line 2: only the first line makes a MinStack.');
    expect(error('MinStack()\npush()')).toBe('Line 2: push takes one argument, not 0.');
    expect(error('MinStack()\npush("a")')).toBe("Line 2: val should be a whole number, not 'a'.");
    expect(error('MinStack()\npush(1')).toBe('Line 2: write a call, like push(…).');
    expect(error('MinStack()\npush([1)')).toBe('Line 2: A list is missing its closing ].');
  });
});

describe('the server’s check of a custom test', () => {
  it('accepts the problem’s parameters, typed right, and nothing else', () => {
    const twoSum = spec('two-sum');
    expect(customError(twoSum, { input: { nums: [1, 2], target: 3 } }, 'java')).toBeNull();
    expect(customError(twoSum, { input: { nums: [1, 2] } }, 'java')).toBe('target has no value.');
    expect(customError(twoSum, { input: { nums: [1, 2], target: 3, k: 1 } }, 'java')).toBe('There’s no parameter called k.');
    expect(customError(twoSum, { input: { nums: [1, 'x'], target: 3 } }, 'java')).toBe('nums, item 2 should be a whole number, not "x".');
    expect(customError(twoSum, { input: [1, 2] }, 'java')).toMatch(/gives each parameter a value/);
    expect(customError(twoSum, { input: { nums: Array(MAX_CUSTOM).fill(1), target: 3 } }, 'java')).toMatch(/limited to 50,000 characters/);
  });

  it('accepts a design problem’s calls, constructor first', () => {
    const minStack = spec('min-stack');
    expect(customError(minStack, { calls: [['MinStack'], ['push', 3], ['getMin']] }, 'go')).toBeNull();
    expect(customError(minStack, { calls: [['push', 3]] }, 'go')).toBe('Call 1 should make a MinStack.');
    expect(customError(minStack, { calls: [['MinStack'], ['peek']] }, 'go')).toBe('Call 2: there’s no method called peek.');
    expect(customError(minStack, { calls: [['MinStack'], ['push', 'a']] }, 'go')).toBe('Call 2: val should be a whole number, not "a".');
    expect(customError(minStack, { input: {} }, 'go')).toMatch(/list of calls/);
  });
});

describe('running a custom test', () => {
  const result = (r: Partial<RunResult>): RunResult => ({ events: [], arrays: {}, ms: 4, returned: null, error: null, ...r });

  it('shows the answer, with nothing to judge it by', () => {
    const twoSum = spec('two-sum');
    const test = customCase({ input: { nums: [3, 3], target: 6 } });
    expect(verdict(twoSum, test, result({ returned: [0, 1] }), 'python')).toEqual({ status: 'ran', message: 'Ran.', got: [0, 1], ms: 4 });
    expect(verdict(twoSum, test, result({ error: { kind: 'runtime', message: 'IndexError', line: 3 } }), 'python')).toMatchObject({ status: 'error', message: 'Line 3: IndexError' });
    expect(verdict(twoSum, test, result({ error: { kind: 'timeout', message: 'Too slow', line: null } }), 'python').status).toBe('timeout');
  });

  it('shows a design problem’s answers up to the call that failed', () => {
    const minStack = spec('min-stack');
    const test = customCase({ calls: [['MinStack'], ['push', 3], ['pop'], ['getMin']] });
    expect(verdict(minStack, test, result({ returned: [null, null, null, 3] }), 'python')).toMatchObject({ status: 'ran', got: [null, null, null, 3] });
    expect(verdict(minStack, test, result({ returned: [null, null, null], error: { kind: 'runtime', message: 'IndexError: list index out of range', line: 9 } }), 'python')).toEqual({
      status: 'error',
      message: 'Call 4, get_min(), failed: line 9: IndexError: list index out of range',
      got: [null, null, null],
      ms: 4,
    });
  });
});

describe('comparing your own test with the expected answer', () => {
  it('compares as the judge does, naming what differs without repeating both answers', () => {
    const twoSum = spec('two-sum');
    const test = customCase({ input: { nums: [2, 7, 11], target: 9 } });
    // Several right answers: the check decides, so either order is right.
    expect(ownMismatch(twoSum, test, [1, 0], [0, 1], 'python')).toBeNull();
    expect(ownMismatch(twoSum, test, [0, 2], [0, 1], 'python')).toBe('nums[0] + nums[2] is 13, not 9.');
    const closest = spec('k-closest-points');
    const points = customCase({ input: { points: [[1, 1], [2, 2], [5, 5]], k: 2 } });
    expect(ownMismatch(closest, points, [[2, 2], [1, 1]], [[1, 1], [2, 2]], 'python')).toBeNull();
    expect(ownMismatch(closest, points, [[5, 5], [1, 1]], [[1, 1], [2, 2]], 'python')).toBe('It has different items from the expected answer (the order doesn’t matter).');
    const reverse = spec('reverse-linked-list');
    expect(ownMismatch(reverse, customCase({ input: { head: [1, 2] } }), [1, 2], [2, 1], 'python')).toBe('It differs from the expected answer.');
  });

  it('names a design problem’s first call that differs, up to one that failed', () => {
    const minStack = spec('min-stack');
    const test = customCase({ calls: [['MinStack'], ['push', 3], ['push', 1], ['getMin'], ['pop'], ['getMin']] });
    const expected = [null, null, null, 1, null, 3];
    expect(ownMismatch(minStack, test, expected, expected, 'java')).toBeNull();
    expect(ownMismatch(minStack, test, [null, null, null, 1, null, 1], expected, 'java')).toBe('Call 6, getMin(), should give 3, not 1.');
    // The run stopped at call 5: only the calls before it are compared.
    expect(ownMismatch(minStack, test, [null, null, null, 1], expected, 'python')).toBeNull();
  });
});

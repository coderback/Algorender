// The checkers and the output diff: pure, so tested directly, with
// properties over random outputs.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { observations, type MasteryGraph } from '@/progress/mastery';
import type { ProgressEvent } from '@/progress/events';
import { checkOutput, CheckerSchema, normaliseLines, withoutPrompts, type Checker } from './checkers';
import { diffRows, firstColumn, outputLines, visible } from './diff';
import { TaskSchema } from './schema';

const lines: Checker = { kind: 'lines', prompts: 'ignore' };
const out = (stdout: string, prompts: [number, number][] = []) => ({ stdout, prompts });
const text = fc.array(fc.stringMatching(/^[a-z0-9 ,.!]{0,8}$/), { maxLength: 6 }).map((ls) => ls.join('\n'));

describe('checkers', () => {
  it('pass any output against itself, whatever the checker', () => {
    fc.assert(
      fc.property(text, (s) => {
        for (const kind of ['lines', 'tokens', 'float'] as const) expect(checkOutput(CheckerSchema.parse({ kind }), out(s), out(s), '')).toBeNull();
      }),
    );
  });

  it('lines: ignore spaces at line ends and blank lines at the end, but nothing else', () => {
    fc.assert(
      fc.property(text, (s) => {
        const padded = `${s.split('\n').map((l) => `${l}  `).join('\n')}\n\n`;
        expect(checkOutput(lines, out(padded), out(s), '')).toBeNull();
      }),
    );
    expect(checkOutput(lines, out('Hello,Ada!\n'), out('Hello, Ada!\n'), '')).toBe('Line 1 differs.');
    expect(checkOutput(lines, out('a\n'), out('a\nb\n'), '')).toBe('Line 2 is missing.');
    expect(checkOutput(lines, out('a\nb\n'), out('a\n'), '')).toBe("Line 2 wasn't expected: the output should end before it.");
    expect(checkOutput(lines, out(' a\n'), out('a\n'), '')).toBe('Line 1 differs.');
  });

  it('leave prompts out of both sides unless told to keep them', () => {
    expect(checkOutput(lines, out('Name? Hi Ada\n', [[0, 6]]), out('Who are you?Hi Ada\n', [[0, 12]]), '')).toBeNull();
    expect(checkOutput({ kind: 'lines', prompts: 'keep' }, out('Name? Hi Ada\n', [[0, 6]]), out('Who? Hi Ada\n', [[0, 5]]), '')).toBe('Line 1 differs.');
  });

  it('withoutPrompts removes exactly the prompt spans', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.stringMatching(/^[a-z ]{0,5}$/), fc.stringMatching(/^[A-Z?]{0,4}$/)), { maxLength: 5 }), (parts) => {
        let stdout = '';
        const prompts: [number, number][] = [];
        for (const [said, prompt] of parts) {
          stdout += said;
          prompts.push([stdout.length, stdout.length + prompt.length]);
          stdout += prompt;
        }
        expect(withoutPrompts(stdout, prompts)).toBe(parts.map(([said]) => said).join(''));
      }),
    );
  });

  it('tokens and float: spacing never matters, numbers within the tolerance do', () => {
    expect(checkOutput({ kind: 'tokens', prompts: 'ignore' }, out('1  4\n9 16'), out('1 4 9 16\n'), '')).toBeNull();
    expect(checkOutput({ kind: 'tokens', prompts: 'ignore' }, out('1 4 9'), out('1 4 9 16'), '')).toMatch(/stops early/);
    expect(checkOutput(CheckerSchema.parse({ kind: 'float', tolerance: 1e-3 }), out('3.1416'), out('3.14159'), '')).toBeNull();
    expect(checkOutput(CheckerSchema.parse({ kind: 'float', tolerance: 1e-3 }), out('3.2'), out('3.14159'), '')).toBe('Expected “3.14159” where the output has “3.2”.');
  });

  it('contains and regex: wording around the answer may vary', () => {
    expect(checkOutput(CheckerSchema.parse({ kind: 'contains', text: ['42'] }), out('The answer is 42!'), out('42'), '')).toBeNull();
    expect(checkOutput(CheckerSchema.parse({ kind: 'contains', text: ['42'] }), out('The answer is 41'), out('42'), '')).toBe('The output should contain “42”.');
    expect(checkOutput(CheckerSchema.parse({ kind: 'regex', pattern: '^hi,? ada!?$', flags: 'im' }), out('Hi Ada\n'), out(''), '')).toBeNull();
  });

  it('named: asks the named check, and refuses one that does not exist', () => {
    const named = { even: (_: string, got: string) => (Number(got) % 2 === 0 ? null : 'Odd.') };
    expect(checkOutput(CheckerSchema.parse({ kind: 'named', name: 'even' }), out('4\n'), out('2\n'), '', named)).toBeNull();
    expect(checkOutput(CheckerSchema.parse({ kind: 'named', name: 'even' }), out('3\n'), out('2\n'), '', named)).toBe('Odd.');
    expect(() => checkOutput(CheckerSchema.parse({ kind: 'named', name: 'nope' }), out(''), out(''), '', named)).toThrow();
  });

  it('normaliseLines treats \\r\\n as \\n', () => {
    expect(normaliseLines('a\r\nb  \r\n\r\n')).toEqual(['a', 'b']);
  });
});

describe('the output diff', () => {
  it('marks the first line that differs, whitespace and all', () => {
    const { rows, first } = diffRows('Hello, Ada!\n', 'Hello,Ada!\n');
    expect(first).toBe(0);
    expect(rows[0]).toEqual({ n: 1, expected: 'Hello,·Ada!⏎', got: 'Hello,Ada!⏎', same: false });
    expect(firstColumn(rows[0].expected, rows[0].got)).toBe(6);
  });

  it('shows a missing final newline and a missing line', () => {
    const { rows, first } = diffRows('a\nb\n', 'a\nb');
    expect(first).toBe(1);
    expect(rows[1]).toMatchObject({ expected: 'b⏎', got: 'b' });
    expect(diffRows('a\nb\n', 'a\n').rows[1]).toMatchObject({ expected: 'b⏎', got: null, same: false });
  });

  it('agrees with plain comparison: no first difference exactly when the texts are equal', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(diffRows(a, b).first === null).toBe(a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n'));
      }),
    );
  });

  it('makes tabs and spaces visible and keeps the text otherwise', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z \t]{0,10}$/), (s) => {
        const shown = visible({ text: s, newline: false });
        expect(shown.length).toBe(s.length);
        expect(shown).not.toMatch(/[ \t]/);
      }),
    );
    expect(outputLines('')).toEqual([]);
  });
});

describe('the task schema', () => {
  it('refuses a program task checked by tests, and an answer past the choices', () => {
    expect(() =>
      TaskSchema.parse({ slug: 'x-1', kind: 'program', title: 'abc', concept: 'py-input', prompt: 'Do the thing.', starter: { python: '' }, solution: { python: '' }, check: { kind: 'tests', tests: { python: '' } } }),
    ).toThrow(/checked as a program/);
    expect(() => TaskSchema.parse({ slug: 'x-2', kind: 'choice', title: 'abc', concept: 'py-input', prompt: 'Pick one.', choices: ['a', 'b'], answer: 2, why: 'Because it is so.' })).toThrow(/not one of the choices/);
  });

  it('refuses a task whose check has nothing for a language it offers', () => {
    expect(() =>
      TaskSchema.parse({
        slug: 'x-3',
        kind: 'function',
        title: 'abc',
        concept: 'py-input',
        prompt: 'Write it.',
        starter: { python: '', javascript: '' },
        solution: { python: '', javascript: '' },
        check: { kind: 'function', entry: { python: 'f' }, calls: [[1]] },
      }),
    ).toThrow(/nothing for javascript/);
  });
});

describe('task.checked as mastery evidence', () => {
  const graph: MasteryGraph = { concepts: [], lessons: {}, exercises: {}, problems: {}, tasks: { greet: 'py-input' } };
  const event = (at: string, passed: boolean, n: number): ProgressEvent => ({
    id: `0192f0c0-0000-7000-8000-${String(n).padStart(12, '0')}`,
    kind: 'task.checked',
    at,
    data: { task: 'greet', kind: 'program', language: 'python', passed, tests: 3, failed: passed ? 0 : 1 },
  });

  it('counts once per task, day and outcome', () => {
    const obs = observations(
      [event('2026-11-17T10:00:00Z', false, 1), event('2026-11-17T10:01:00Z', false, 2), event('2026-11-17T10:02:00Z', true, 3), event('2026-11-18T10:00:00Z', true, 4)],
      graph,
    );
    expect(obs.map((o) => [o.concept, o.item, o.correct, o.source])).toEqual([
      ['py-input', 'task:greet', false, 'task'],
      ['py-input', 'task:greet', true, 'task'],
      ['py-input', 'task:greet', true, 'task'],
    ]);
  });
});

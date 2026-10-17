// The server judge's plain parts, without a sandbox: how tests are written
// for the drivers, and how a run's output files become verdicts. (The
// drivers themselves run in src/server/judge/judge.test.ts.)

import { describe, expect, it } from 'vitest';
import { getProblem, specFor } from '../load';
import { encodeCase, encodeCases, encodeValue } from './encode';
import { readOutput, runSeconds, sandboxFiles, type SandboxOutput } from '.';
import { MARKER } from './shared';

describe('the test input', () => {
  it('writes values as typed tokens, strings by their UTF-8 length', () => {
    expect(encodeValue('int', -7)).toBe('-7');
    expect(encodeValue('long', 2 ** 52)).toBe('4503599627370496');
    expect(encodeValue('float', 0.5)).toBe('0.5');
    expect(encodeValue('bool', true)).toBe('true');
    expect(encodeValue('string', 'a b\nc')).toBe('5:a b\nc');
    expect(encodeValue('string', 'é')).toBe('2:é');
    expect(encodeValue('int[][]', [[1, 2], [], [3]])).toBe('3 2 1 2 0 1 3');
    expect(encodeValue('string[]', ['', 'hi'])).toBe('2 0: 2:hi');
    expect(encodeValue('TreeNode', [1, null, 2])).toBe('3 1 null 2');
    expect(encodeValue('TreeNode', [])).toBe('0');
    expect(encodeValue('ListNode', [4, 5])).toBe('2 4 5');
  });

  it('refuses values that don’t fit the type', () => {
    expect(() => encodeValue('int', 1.5)).toThrow();
    expect(() => encodeValue('int[]', 3)).toThrow();
    expect(() => encodeValue('string', 3)).toThrow();
  });

  it('writes a design problem’s calls as method indexes, the constructor first', () => {
    const spec = specFor(getProblem('min-stack')!);
    expect(encodeCase(spec, { id: 't', label: 'T', group: 'test', expected: null, calls: [['MinStack'], ['push', -2], ['getMin'], ['pop']] })).toBe('4 0 1 -2 4 2');
  });

  it('puts the count first and one test per line', () => {
    const spec = specFor(getProblem('two-sum')!);
    const tests = spec.cases.slice(0, 2);
    const text = encodeCases(spec, tests);
    expect(text.split('\n')[0]).toBe('2');
    expect(text.split('\n')).toHaveLength(4);
  });
});

describe('reading a run', () => {
  const spec = specFor(getProblem('reverse-linked-list')!);
  const tests = spec.cases.filter((c) => c.group === 'example');
  const seconds = runSeconds(spec, 'java', tests);
  const out = (o: Partial<SandboxOutput>): SandboxOutput => ({ status: 'run 0 1', compile: '', stdout: '', stderr: '', answers: '', ...o });
  const line = (i: number, rest: object) => JSON.stringify({ i, ms: 2, ...rest });

  it('gives every language’s sandbox the driver, the learner’s file, the tests and the script', () => {
    expect(Object.keys(sandboxFiles(spec, 'java', 'class Solution {}', tests)).sort()).toEqual(['ListNode.java', 'Main.java', 'Solution.java', 'TreeNode.java', 'judge.sh', 'tests.txt']);
    expect(Object.keys(sandboxFiles(spec, 'cpp', '', tests)).sort()).toEqual(['judge.sh', 'main.cpp', 'tests.txt']);
    expect(Object.keys(sandboxFiles(spec, 'go', '', tests)).sort()).toEqual(['go.mod', 'judge.sh', 'main.go', 'nodes.go', 'solution.go', 'tests.txt']);
  });

  it('judges each answer, and splits the prints by test', () => {
    const answers = tests.map((t, i) => line(i, { v: i === 1 ? [9] : t.expected })).join('\n');
    const stdout = `${MARKER}0\nfirst\n${MARKER}1\nsecond\nthird\n`;
    const { checked, skipped, fatal } = readOutput(spec, 'java', tests, out({ answers, stdout }), seconds);
    expect(fatal).toBeNull();
    expect(skipped).toBe(0);
    expect(checked.map((c) => c.verdict.status)).toEqual(tests.map((_, i) => (i === 1 ? 'fail' : 'pass')));
    expect(checked[0].output).toEqual(['first']);
    expect(checked[1].output).toEqual(['second', 'third']);
  });

  it('reports a compile error once, at the learner’s line, with the compiler’s words', () => {
    const compile = 'Solution.java:3: error: \';\' expected\n        int x = 1\n                 ^\n1 error\n';
    const { checked, skipped, fatal } = readOutput(spec, 'java', tests, out({ status: 'compile', compile }), seconds);
    expect(fatal).toEqual({ kind: 'compile', line: 3, message: "Solution.java:3: error: ';' expected\n        int x = 1\n                 ^" });
    expect(checked).toEqual([]);
    expect(skipped).toBe(tests.length);
  });

  it('turns a slow answer into a timeout and stops there', () => {
    const answers = [line(0, { v: tests[0].expected, ms: 99_999 }), line(1, { v: tests[1].expected })].join('\n');
    const { checked, skipped } = readOutput(spec, 'java', tests, out({ answers }), seconds);
    expect(checked.map((c) => c.verdict.status)).toEqual(['timeout']);
    expect(skipped).toBe(tests.length - 1);
  });

  it('calls a run killed at its time limit a timeout, and one killed early a memory problem', () => {
    const answers = line(0, { v: tests[0].expected });
    const timedOut = readOutput(spec, 'cpp', tests, out({ answers, status: `run 137 ${seconds}` }), seconds);
    expect(timedOut.checked.map((c) => c.verdict.status)).toEqual(['pass', 'timeout']);
    const memory = readOutput(spec, 'cpp', tests, out({ answers, status: 'run 137 1' }), seconds);
    expect(memory.checked[1].verdict).toMatchObject({ status: 'error', message: 'The program was stopped: it used too much memory.' });
  });

  it('stops at a crash the driver reported, and explains a Go fatal error from its output', () => {
    const crash = readOutput(spec, 'cpp', tests, out({ answers: JSON.stringify({ i: 0, x: 1, e: 'Segmentation fault: …' }), status: 'run 1 0' }), seconds);
    expect(crash.checked).toHaveLength(1);
    expect(crash.checked[0].verdict).toMatchObject({ status: 'error', message: 'Segmentation fault: …' });
    const stderr = 'runtime: goroutine stack exceeds 268435456-byte limit\nfatal error: stack overflow\n\ngoroutine 1 [running]:\nmain.reverseList(...)\n\tsolution.go:4 +0x1d\n';
    const overflow = readOutput(spec, 'go', tests, out({ stderr, status: 'run 2 0' }), seconds);
    expect(overflow.checked[0].verdict).toMatchObject({ status: 'error', message: expect.stringMatching(/^Line 4: Stack overflow/) });
  });

  it('allows each test its own limit in all, within bounds', () => {
    expect(runSeconds(spec, 'java', tests)).toBeGreaterThanOrEqual(6);
    expect(runSeconds(spec, 'go', spec.cases)).toBeLessThanOrEqual(21);
  });
});

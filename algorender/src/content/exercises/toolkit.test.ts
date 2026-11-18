// The math toolkit's bug hunt must name the bug from what each runtime really
// returns: Python stops with a math domain error, and JavaScript's −∞ comes back
// as the string '-Infinity' (JSON has no infinity).

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import type { Language, RunResult } from '@/workspace/protocol';
import { getExercise, testRequest } from '.';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

describe('the log-probability bug hunt', () => {
  const exercise = getExercise('log-probability')!;
  const sentence = exercise.tests.find((t) => t.name.startsWith('a 120-word sentence'))!;

  it.each(['python', 'javascript', 'typescript'] as Language[])('%s: the buggy starter is told its product underflowed', (language) => {
    const request = testRequest(exercise, language, exercise.starter[language], sentence.input);
    const result: RunResult = language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
    const verdict = exercise.check(sentence.input, result);
    expect(verdict.pass).toBe(false);
    expect(verdict.message).toMatch(language === 'python' ? /math\.log2 was given 0/ : /underflowed to 0/);
  });
});

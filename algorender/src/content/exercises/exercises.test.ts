// Every exercise must be solvable as written: its reference solution passes
// every judged test in every language, its starter does not, and the Python
// and JavaScript solutions make the same comparisons, swaps and writes, so the
// picture is the same whichever language a learner picks.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import { DEFAULT_LIMITS, LANGUAGES, type Language, type RunEvent, type RunRequest, type RunResult } from '@/workspace/protocol';
import { traceRun } from '@/workspace/trace';
import { argsFor, exercises, type Exercise, type ExerciseInput } from '.';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

const LANGS = Object.keys(LANGUAGES) as Language[];

function run(exercise: Exercise, language: Language, code: string, input: ExerciseInput): RunResult {
  const request: RunRequest = {
    language,
    code,
    entry: language === 'python' ? exercise.entry.python : exercise.entry.js,
    args: argsFor(input),
    limits: DEFAULT_LIMITS,
  };
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

/** What the learner sees happen to the array, without the language-specific lines and variables. */
const actions = (r: RunResult) =>
  r.events.map((e: RunEvent) => {
    const rest: Partial<RunEvent> = { ...e };
    delete rest.line;
    delete rest.vars;
    return rest;
  });

describe.each(exercises.map((e) => [e.slug, e] as const))('%s', (_slug, exercise) => {
  it('has examples, tests, hints and a visualiser to compare with', () => {
    expect(exercise.examples.length).toBeGreaterThan(0);
    expect(exercise.tests.length).toBeGreaterThan(0);
    expect(exercise.hints.length).toBeGreaterThan(0);
    expect(new Set(exercise.examples.map((x) => x.id)).size).toBe(exercise.examples.length);
  });

  for (const language of LANGS) {
    it(`${language}: the solution passes every test`, () => {
      for (const test of exercise.tests) {
        const verdict = exercise.check(test.input, run(exercise, language, exercise.solution[language], test.input));
        expect(verdict, `${test.name}: ${verdict.message}`).toMatchObject({ pass: true });
      }
    });

    it(`${language}: the starter runs but doesn't pass`, () => {
      const results = exercise.tests.map((t) => run(exercise, language, exercise.starter[language], t.input));
      expect(results.map((r) => r.error)).toEqual(results.map(() => null));
      expect(exercise.tests.some((t, i) => !exercise.check(t.input, results[i]).pass)).toBe(true);
    });

    it(`${language}: every example plays as a trace`, () => {
      for (const example of exercise.examples) {
        const result = run(exercise, language, exercise.solution[language], example.input);
        expect(result.error).toBeNull();
        expect(traceRun(result, { markSortedAtEnd: exercise.markSortedAtEnd })!.frames.length).toBeGreaterThan(1);
      }
    });
  }

  it('Python, JavaScript and TypeScript solutions do the same things to the array', () => {
    for (const { input } of [...exercise.examples, ...exercise.tests]) {
      const python = actions(run(exercise, 'python', exercise.solution.python, input));
      expect(actions(run(exercise, 'javascript', exercise.solution.javascript, input))).toEqual(python);
      expect(actions(run(exercise, 'typescript', exercise.solution.typescript, input))).toEqual(python);
    }
  });
});

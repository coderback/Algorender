// Every exercise must be solvable as written: its reference solution passes
// every judged test in every language, its starter does not, and the Python
// and JavaScript solutions make the same comparisons, swaps and writes, so the
// picture is the same whichever language a learner picks.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import { DEFAULT_LIMITS, LANGUAGES, LINE_LIMITS, type Language, type RunEvent, type RunMode, type RunRequest, type RunResult } from '@/workspace/protocol';
import { traceFor } from '@/workspace/trace';
import { exercises, stripBlanks, watchedByLine, type Exercise } from '.';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

const LANGS = Object.keys(LANGUAGES) as Language[];

function run(exercise: Exercise, language: Language, code: string, input: unknown, mode: RunMode = 'visual'): RunResult {
  const request: RunRequest = {
    language,
    code,
    entry: language === 'python' ? exercise.entry.python : exercise.entry.js,
    args: exercise.args(input),
    limits: mode === 'lines' ? LINE_LIMITS : DEFAULT_LIMITS,
    mode,
  };
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

/** What the learner sees happen to the array, without the language-specific lines and variables. */
const actions = (r: RunResult) =>
  r.events.map((e: RunEvent) => {
    const rest: Record<string, unknown> = { ...e };
    delete rest.line;
    delete rest.vars;
    return rest;
  });

describe.each(exercises.map((e) => [e.slug, e] as const))('%s', (_slug, exercise) => {
  it('marks its blanks on the exact solution', () => {
    for (const language of LANGS) {
      if (exercise.blanks) expect(stripBlanks(exercise.blanks[language])).toBe(exercise.solution[language]);
    }
    for (const stage of exercise.fades ?? []) {
      for (const n of stage) expect(exercise.blanks?.python).toContain(`«${n}:`);
    }
  });

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

    it(`${language}: the starter doesn't pass`, () => {
      const results = exercise.tests.map((t) => run(exercise, language, exercise.starter[language], t.input));
      // A stub runs cleanly and just doesn't do the job; a bug hunt's code may crash or never finish.
      if (exercise.kind !== 'bug') expect(results.map((r) => r.error)).toEqual(results.map(() => null));
      expect(exercise.tests.some((t, i) => !exercise.check(t.input, results[i]).pass)).toBe(true);
    });

    it(`${language}: every example plays as a trace on the exercise's own view`, () => {
      for (const example of exercise.examples) {
        // A graph or tree is watched line by line, and drawn on its own view from the steps.
        const byLine = watchedByLine(exercise, example.input);
        const result = run(exercise, language, exercise.solution[language], example.input, byLine ? 'lines' : 'visual');
        expect(result.error).toBeNull();
        const shown = traceFor(result, { markSortedAtEnd: exercise.markSortedAtEnd, code: exercise.solution[language] })!;
        expect(shown.trace.frames.length).toBeGreaterThan(1);
        if (byLine) expect(['graph', 'tree']).toContain(shown.view);
        else expect(['array', 'grid']).toContain(shown.view);
      }
    });

    it(`${language}: every example plays line by line within the limits`, () => {
      for (const example of exercise.examples) {
        const result = run(exercise, language, exercise.solution[language], example.input, 'lines');
        expect(result.error, example.id).toBeNull();
        expect(traceFor(result, { view: 'memory' })?.view).toBe('memory');
      }
    });
  }

  it('Python, JavaScript and TypeScript solutions do the same things to the arrays, tables and graphs', () => {
    for (const { input } of [...exercise.examples, ...exercise.tests]) {
      const python = actions(run(exercise, 'python', exercise.solution.python, input));
      expect(actions(run(exercise, 'javascript', exercise.solution.javascript, input))).toEqual(python);
      expect(actions(run(exercise, 'typescript', exercise.solution.typescript, input))).toEqual(python);
    }
  });
});

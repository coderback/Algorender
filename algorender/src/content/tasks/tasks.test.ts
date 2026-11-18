// Every task, through the real runtimes (Pyodide for Python, the JS runtime
// for JS/TS), checked by the same code the browser uses (src/tasks/check.ts):
// the reference passes, the starter (or a wrong answer) fails, and the
// expected outputs in expected.json are exactly what the reference prints.
// With TASKS_WRITE=1 (npm run tasks:expected) it writes expected.json
// instead of comparing, so expected outputs are never typed by hand.
//
// The fixtures (src/tasks/fixtures.ts) cover every kind in Python and JS.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { checkChoice, checkCode, checkPrediction, expectedRun, callRequest, programRequest, type Runner } from '@/tasks/check';
import { FIXTURES } from '@/tasks/fixtures';
import { TaskSchema, taskLanguages, type ExpectedFile, type Task, type TaskExpected, type TaskLanguage } from '@/tasks/schema';
import { blankNumbers, fillTemplate, parseBlanks } from '@/workspace/formats/blanks';
import { assemble, parsonsLines } from '@/workspace/formats/parsons';
import { runJs } from '@/workspace/js/runtime';
import type { RunRequest, RunResult } from '@/workspace/protocol';
import { HARNESS } from '@/workspace/python/harness';
import { TASK_CHECKS } from './checks';
import { expected, tasks } from './index';

const WRITE = process.env.TASKS_WRITE === '1';

let python: (request: RunRequest) => RunResult;
const runner = (language: TaskLanguage): Runner => async (request) => (language === 'python' ? python(request) : runJs(request));

beforeAll(async () => {
  const pyodide = await loadPyodide({ env: { PYTHONHASHSEED: '0' } });
  pyodide.runPython(HARNESS);
  const runRequest = pyodide.globals.get('run_request') as (json: string) => string;
  python = (request) => JSON.parse(runRequest(JSON.stringify(request)));
}, 120_000);

/** What a code task's reference gives its check, run now. */
async function referenceResults(task: Task, language: TaskLanguage): Promise<TaskExpected> {
  if (!('check' in task)) return {};
  const run = runner(language);
  const code = referenceCode(task, language);
  const check = task.check;
  if (check.kind === 'program') {
    const cases = [];
    for (const c of check.cases) {
      const r = await run(programRequest(language, code, c));
      expect(r.error, `${task.slug} (${language}): the reference fails on “${c.name}”`).toBeNull();
      cases.push(expectedRun(r));
    }
    return { cases };
  }
  if (check.kind === 'function') {
    const returns = [];
    for (const args of check.calls) {
      const r = await run(callRequest(language, code, check, args));
      expect(r.error, `${task.slug} (${language}): the reference fails on a call`).toBeNull();
      returns.push(r.returned);
    }
    return { returns };
  }
  return {};
}

/** The code a task's reference amounts to (parsons and fill tasks: their solution assembled). */
function referenceCode(task: Task, language: TaskLanguage): string {
  if (task.kind === 'fill') {
    const segments = parseBlanks(task.solution[language]!);
    return fillTemplate(segments, new Set(), {});
  }
  return 'solution' in task ? task.solution[language]! : '';
}

/** A wrong answer for each kind: the starter, or a scrambled or empty one. */
function wrongCode(task: Task, language: TaskLanguage): string {
  if (task.kind === 'parsons') {
    const lines = parsonsLines(task.solution[language]!, task.distractors[language] ?? []);
    // The right lines in reverse order, unindented.
    return assemble(lines.filter((l) => !l.distractor).reverse().map((l) => ({ id: l.id, indent: 0 })), lines, language);
  }
  if (task.kind === 'fill') {
    const segments = parseBlanks(task.solution[language]!);
    return fillTemplate(segments, new Set(blankNumbers(segments)), {});
  }
  return 'starter' in task ? task.starter[language]! : '';
}

const all = [...tasks, ...FIXTURES.map((t) => TaskSchema.parse(t))];

describe('tasks', () => {
  it('have unique slugs, real concepts, and every kind among the fixtures', () => {
    const slugs = all.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const ids = new Set(loadConcepts().concepts.map((c) => c.id));
    for (const t of all) expect(ids.has(t.concept), `${t.slug}: no concept ${t.concept}`).toBe(true);
    expect(new Set(FIXTURES.map((t) => t.kind))).toEqual(new Set(['choice', 'output', 'program', 'function', 'tests', 'bug', 'parsons', 'fill']));
  });

  it('name only checkers that exist', () => {
    for (const t of all) {
      if ('check' in t && t.check.kind === 'program' && t.check.checker.kind === 'named') expect(TASK_CHECKS[t.check.checker.name], t.slug).toBeDefined();
    }
  });

  it.skipIf(WRITE)('keep expected outputs only for published tasks', () => {
    expect(Object.keys(expected).sort()).toEqual(tasks.filter((t) => 'check' in t && t.check.kind !== 'tests').map((t) => t.slug).sort());
  });

  const written: ExpectedFile = {};

  for (const task of all) {
    const published = tasks.includes(task);
    for (const language of taskLanguages(task)) {
      if (task.kind === 'choice' && language !== 'python') continue;
      it(`${task.slug} (${language}): the reference passes and a wrong answer fails`, async () => {
        const run = runner(language);
        if (task.kind === 'choice') {
          expect(checkChoice(task, task.answer).passed).toBe(true);
          expect(checkChoice(task, (task.answer + 1) % task.choices.length).passed).toBe(false);
          return;
        }
        if (task.kind === 'output') {
          const printed = (await run(programRequest(language, task.code[language]!, { stdin: task.stdin }))).stdout ?? '';
          expect(printed.length).toBeGreaterThan(0);
          expect((await checkPrediction(task, language, printed, run)).passed).toBe(true);
          // Typing it without the final newline, or with spaces at line ends, is still right.
          expect((await checkPrediction(task, language, printed.replace(/\n$/, '').replace(/\n/g, '  \n'), run)).passed).toBe(true);
          expect((await checkPrediction(task, language, `${printed}x`, run)).passed).toBe(false);
          return;
        }
        const results = await referenceResults(task, language);
        if (published && task.check.kind !== 'tests') {
          if (WRITE) (written[task.slug] ??= {})[language] = results;
          else expect(expected[task.slug]?.[language], `${task.slug} (${language}): expected.json is stale; run npm run tasks:expected`).toEqual(results);
        }
        const good = await checkCode(task.check, language, referenceCode(task, language), results, run, TASK_CHECKS);
        expect(good.passed, JSON.stringify(good, null, 1)).toBe(true);
        expect(good.failed).toBe(0);
        const bad = await checkCode(task.check, language, wrongCode(task, language), results, run, TASK_CHECKS);
        expect(bad.passed).toBe(false);
        expect(bad.failed).toBeGreaterThan(0);
      });
    }
  }

  if (WRITE) {
    it('writes expected.json', () => {
      const file = path.join(process.cwd(), 'src/content/tasks/expected.json');
      writeFileSync(file, `${JSON.stringify(written, null, 2)}\n`);
    });
  }
});

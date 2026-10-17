// Every problem, checked end to end: the file validates, its links resolve,
// its stubs parse in every language and fail its tests, and its reference
// solutions pass every test (examples, edge cases and random ones) in Python
// (real Pyodide), TypeScript and JavaScript, through the same judge the
// browser uses.
//
// PROBLEMS=two-sum,min-stack npm test -- problems   checks only those.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { getVisualiserBySlug } from '@/data/visualisers';
import { entryName, stub } from '@/problems/codegen';
import { judgeRequest, verdict, watchRequest, type CaseVerdict } from '@/problems/judge';
import { loadProblems, solutionIn, specFor } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { replayTrace } from '@/problems/replay';
import { HARNESS } from '@/workspace/python/harness';
import { runJs } from '@/workspace/js/runtime';
import { LANGUAGES, type Language, type RunRequest, type RunResult } from '@/workspace/protocol';
import { CHECKS } from './checks';
import { GENERATORS } from './generators';

let runPython: (json: string) => string;

beforeAll(async () => {
  const pyodide = await loadPyodide();
  pyodide.runPython(HARNESS);
  runPython = pyodide.globals.get('run_request');
}, 120_000);

const run = (request: RunRequest): RunResult =>
  request.language === 'python' ? (JSON.parse(runPython(JSON.stringify(request))) as RunResult) : runJs(request);

const only = process.env.PROBLEMS?.split(',').map((s) => s.trim());
const problems = loadProblems().filter((p) => !only || only.includes(p.slug));
const languages = Object.keys(LANGUAGES) as Language[];

describe('the problem set', () => {
  it('loads', () => {
    expect(problems.length).toBeGreaterThan(0);
  });

  it('has a generator for exactly the problems that ask for random tests', () => {
    const all = loadProblems();
    for (const slug of Object.keys(GENERATORS)) expect(all.find((p) => p.slug === slug)?.generated, slug).toBeDefined();
  });
});

describe.each(problems.map((p) => [p.slug, p] as const))('%s', (_slug, problem) => {
  const spec = specFor(problem);

  it('links to visualisers that exist, and names a known check', () => {
    for (const v of problem.visualisers) expect(getVisualiserBySlug(v), v).toBeDefined();
    if (problem.check) expect(CHECKS[problem.check], problem.check).toBeDefined();
    for (const p of problem.patterns) expect(PATTERNS[p]).toBeDefined();
  });

  it('names its parameters in every test, and calls a design problem correctly', () => {
    for (const c of spec.cases) {
      if (problem.signature) {
        expect(Object.keys(c.input ?? {}).sort(), c.id).toEqual(problem.signature.params.map((p) => p.name).sort());
      } else {
        const calls = c.calls ?? [];
        expect(calls[0]?.[0], c.id).toBe(problem.design!.class);
        const methods = new Map(problem.design!.methods.map((m) => [m.name, m]));
        expect(calls[0].length - 1, `${c.id} constructor arguments`).toBe(problem.design!.init.length);
        for (const [method, ...args] of calls.slice(1)) {
          expect(methods.has(method), `${c.id}: ${method}`).toBe(true);
          expect(args.length, `${c.id}: ${method} arguments`).toBe(methods.get(method)!.params.length);
        }
        expect((c.expected as unknown[]).length, `${c.id}: one answer per call`).toBe(calls.length);
      }
    }
  });

  it('travels light: its tests stay small enough to send with the page', () => {
    expect(JSON.stringify(spec).length).toBeLessThan(200_000);
  });

  it.each(languages)('has a stub in %s that runs and fails some test', (language) => {
    const code = stub(problem, language);
    expect(code).toContain(entryName(problem, language));
    const results = spec.cases.map((c) => run(judgeRequest(spec, c, language, code)));
    for (const r of results) expect(r.error?.kind, r.error?.message).not.toBe('syntax');
    const verdicts = spec.cases.map((c, i) => verdict(spec, c, results[i], language));
    expect(verdicts.some((v) => v.status !== 'pass')).toBe(true);
  });

  it.each(languages)('has a solution in %s that passes every test', (language) => {
    const code = solutionIn(problem, language);
    const failures: string[] = [];
    for (const c of spec.cases) {
      const v: CaseVerdict = verdict(spec, c, run(judgeRequest(spec, c, language, code)), language);
      if (v.status !== 'pass') failures.push(`${c.id}: ${v.message}`);
    }
    expect(failures).toEqual([]);
  });

  it.each(languages)('replays its examples in %s on its own view and line by line', (language) => {
    const code = solutionIn(problem, language);
    for (const c of spec.cases.filter((c) => c.group === 'example')) {
      for (const memory of [false, true]) {
        const r = run(watchRequest(spec, c, language, code, memory));
        expect(r.error, `${c.id}${memory ? ' (memory)' : ''}: ${r.error?.message}`).toBeNull();
        const trace = replayTrace(r, code, spec.view, memory);
        expect(trace?.trace.frames.length, `${c.id}${memory ? ' (memory)' : ''}: no frames`).toBeGreaterThan(0);
        if (memory) expect(trace?.view).toBe('memory');
      }
    }
  });
});

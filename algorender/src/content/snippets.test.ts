// Every snippet a lesson traces must run cleanly, line by line, in every
// language it offers, and give the memory view something to step through.

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from '@/workspace/js/runtime';
import { HARNESS } from '@/workspace/python/harness';
import { LANGUAGES, LINE_LIMITS, type Language, type RunRequest, type RunResult } from '@/workspace/protocol';
import { traceFor } from '@/workspace/trace';
import { snippets } from './snippets';

let runPython: (json: string) => string;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(HARNESS);
  runPython = py.globals.get('run_request');
}, 120_000);

function run(language: Language, code: string): RunResult {
  const request: RunRequest = { language, code, entry: '', args: [], limits: LINE_LIMITS, mode: 'lines' };
  return language === 'python' ? JSON.parse(runPython(JSON.stringify(request))) : runJs(request);
}

describe.each(snippets.map((s) => [s.id, s] as const))('%s', (_id, snippet) => {
  it('offers at least one language', () => {
    expect(Object.keys(snippet.code).length).toBeGreaterThan(0);
  });

  for (const language of (Object.keys(LANGUAGES) as Language[]).filter((l) => snippet.code[l] != null)) {
    it(`${language}: runs cleanly and plays on the memory view`, () => {
      const result = run(language, snippet.code[language]!);
      expect(result.error).toBeNull();
      const traced = traceFor(result, { code: snippet.code[language] });
      expect(traced?.view).toBe('memory');
      expect(traced!.trace.frames.length).toBeGreaterThan(5);
      for (const frame of traced!.trace.frames) expect(frame.note.length).toBeGreaterThan(0);
    });
  }
});

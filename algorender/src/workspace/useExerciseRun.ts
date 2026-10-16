'use client';

import { useCallback, useState } from 'react';
import type { Exercise, Verdict } from '@/content/exercises';
import { DEFAULT_LIMITS, LINE_LIMITS, type Language, type RunMode, type RunResult } from './protocol';
import { traceFor, type RunTrace } from './trace';
import { useRuntime } from './useRuntime';

export type Outcome = {
  id: number;
  code: string;
  language: Language;
  example: string;
  /** How the example ran: its effect on the collections, or every line with memory. */
  mode: RunMode;
  result: RunResult;
  /** What the stage plays (array, grid or memory view), or null when nothing ran. */
  run: RunTrace | null;
  /** Null when the tests couldn't run at all (a syntax error, no entry function). */
  verdicts: { name: string; verdict: Verdict }[] | null;
};

/** Whether every judged test passed. */
export const allPass = (o: Outcome | null) => o?.verdicts != null && o.verdicts.length > 0 && o.verdicts.every((v) => v.verdict.pass);

/**
 * Runs a learner's code for an exercise: once on the chosen example (the run
 * they watch), then on every judged test. Shared by every exercise format, so
 * each stage only decides how the learner produces the code.
 */
export function useExerciseRun(exercise: Exercise, language: Language) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [running, setRunning] = useState(false);
  const [frameLine, setFrameLine] = useState<number | null>(null);

  const { runtime, runtimeState, runtimeDetail } = useRuntime(language);

  const run = useCallback(
    async (
      code: string,
      example: string,
      { tests = true, mode = 'visual' }: { tests?: boolean; mode?: RunMode } = {},
    ): Promise<Outcome | null> => {
      if (running) return null;
      setRunning(true);
      const entry = language === 'python' ? exercise.entry.python : exercise.entry.js;
      const call = (input: unknown, m: RunMode = 'visual') =>
        runtime.run({ language, code, entry, args: exercise.args(input), limits: m === 'lines' ? LINE_LIMITS : DEFAULT_LIMITS, mode: m });

      // Only the run the learner watches records every line; the tests just need the effects.
      const shown = exercise.examples.find((e) => e.id === example) ?? exercise.examples[0];
      const result = await call(shown.input, mode);
      // A syntax error or a missing function fails every test the same way; say it once.
      const unrunnable = result.error?.kind === 'syntax' || (result.error != null && result.events.length === 0);
      let verdicts: Outcome['verdicts'] = null;
      if (tests && !unrunnable && result.error?.kind !== 'timeout') {
        verdicts = [];
        for (const test of exercise.tests) {
          const r = await call(test.input);
          verdicts.push({ name: test.name, verdict: exercise.check(test.input, r) });
          // A timeout restarts the runner; don't pay that again for every test.
          if (r.error?.kind === 'timeout') break;
        }
      }
      const next: Outcome = {
        id: Date.now(),
        code,
        language,
        example: shown.id,
        mode,
        result,
        run: traceFor(result, { markSortedAtEnd: exercise.markSortedAtEnd, pointers: exercise.pointers, code }),
        verdicts,
      };
      setOutcome(next);
      setFrameLine(null);
      setRunning(false);
      return next;
    },
    [exercise, language, runtime, running],
  );

  const onFrame = useCallback(
    (index: number) => {
      const line = outcome?.run?.trace.frames[index]?.line;
      setFrameLine(line == null ? null : line + 1);
    },
    [outcome],
  );

  const clear = useCallback(() => setOutcome(null), []);

  return { outcome, running, run, clear, onFrame, frameLine, runtimeState, runtimeDetail, busy: running || runtimeState === 'loading' };
}

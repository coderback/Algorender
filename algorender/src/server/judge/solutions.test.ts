// Every problem's Java, C++ and Go reference solutions pass all its tests on
// the server judge, and the generated stubs fail its examples (the same
// checks problems.test.ts makes in the browser's languages). Each check
// compiles a program, so this runs only when asked: JUDGE_SOLUTIONS=1 for all
// of them (CI), or PROBLEMS=two-sum,min-stack for a few. It needs Docker and
// the algorender-judge image (npm run judge:image).

import { describe, expect, it } from 'vitest';
import { stub } from '@/problems/codegen';
import type { ServerLanguage } from '@/problems/languages';
import { loadProblems, specFor } from '@/problems/load';
import { dockerAvailable, dockerSandbox } from './docker';
import { judgeInSandbox } from './sandbox';

const only = process.env.PROBLEMS?.split(',').map((s) => s.trim());
const wanted = process.env.JUDGE_SOLUTIONS === '1' || only !== undefined;
const available = wanted && (await dockerAvailable());
const LANGUAGES: ServerLanguage[] = ['java', 'cpp', 'go'];
const TIMEOUT = 180_000;

const problems = loadProblems().filter((p) => !only || only.includes(p.slug));

describe.skipIf(!available)('reference solutions on the server judge', () => {
  if (only) {
    it('finds every problem asked for', () => {
      expect(only.filter((slug) => !problems.some((p) => p.slug === slug))).toEqual([]);
    });
  }

  for (const problem of problems) {
    describe(problem.slug, () => {
      const spec = specFor(problem);
      for (const language of LANGUAGES) {
        it(`passes every test in ${language}`, async () => {
          const solution = problem.solutions[language];
          expect(solution, `${problem.slug} has no ${language} solution`).toBeTypeOf('string');
          const result = await judgeInSandbox(dockerSandbox, spec, language, solution!, spec.cases);
          expect(result.fatal?.message ?? null).toBeNull();
          expect(result.checked.filter((c) => c.verdict.status !== 'pass').map((c) => `${c.id}: ${c.verdict.message}`)).toEqual([]);
          expect(result.checked).toHaveLength(spec.cases.length);
        }, TIMEOUT);

        it(`fails the ${language} stub`, async () => {
          const examples = spec.cases.filter((c) => c.group === 'example');
          const result = await judgeInSandbox(dockerSandbox, spec, language, stub(spec, language), examples);
          expect(result.fatal != null || result.checked.some((c) => c.verdict.status !== 'pass')).toBe(true);
        }, TIMEOUT);
      }
    });
  }
});

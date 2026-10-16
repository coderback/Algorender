// Loads the problems (src/content/problems/*.yaml) on the server: validates
// each file, and works out the answers to its random tests by running its
// TypeScript solution through the JS runtime's judge mode, here in trusted
// code. Results are cached for the life of the process (a build, a test run).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { transform } from 'sucrase';
import { parse } from 'yaml';
import { GENERATORS } from '@/content/problems/generators';
import { runJs } from '@/workspace/js/runtime';
import type { Json, Language } from '@/workspace/protocol';
import { answerOf, judgeRequest, type JudgeCase, type ProblemSpec, type ReplayView } from './judge';
import { PATTERN_IDS } from './patterns';
import { Rng } from './random';
import { ProblemSchema, type Problem } from './schema';

const DIR = path.join(process.cwd(), 'src/content/problems');
const DIFFICULTY = { easy: 0, medium: 1, hard: 2 } as const;

let problems: Problem[] | null = null;

/** Every problem, by main pattern (in PATTERN_IDS order), then difficulty, then title. */
export function loadProblems(): Problem[] {
  if (!problems) {
    problems = readdirSync(DIR)
      .filter((f) => f.endsWith('.yaml'))
      .map((file) => {
        const slug = file.replace(/\.yaml$/, '');
        const parsed = ProblemSchema.safeParse(parse(readFileSync(path.join(DIR, file), 'utf8')));
        if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
        return { ...parsed.data, slug };
      })
      .sort(
        (a, b) =>
          PATTERN_IDS.indexOf(a.patterns[0]) - PATTERN_IDS.indexOf(b.patterns[0]) ||
          DIFFICULTY[a.difficulty] - DIFFICULTY[b.difficulty] ||
          a.title.localeCompare(b.title),
      );
  }
  return problems;
}

export function getProblem(slug: string): Problem | undefined {
  return loadProblems().find((p) => p.slug === slug);
}

/** Where a failing test is watched, when the problem doesn't say. */
export function replayView(problem: Problem): ReplayView {
  if (problem.view) return problem.view;
  const types = problem.signature?.params.map((p) => p.type) ?? [];
  if (types.includes('TreeNode')) return 'tree';
  if (types.includes('int[]')) return 'array';
  if (types.includes('int[][]')) return 'grid';
  return 'memory';
}

const specs = new Map<string, ProblemSpec>();

/** What the browser needs to judge a problem: examples, tests and random tests, each with its answer. */
export function specFor(problem: Problem): ProblemSpec {
  const cached = specs.get(problem.slug);
  if (cached) return cached;
  const base: ProblemSpec = {
    slug: problem.slug,
    title: problem.title,
    ...(problem.signature && { signature: problem.signature }),
    ...(problem.design && { design: problem.design }),
    compare: problem.compare,
    ...(problem.check && { check: problem.check }),
    timeLimitMs: problem.timeLimitMs,
    view: replayView(problem),
    cases: [],
  };
  const fixed = (group: 'example' | 'test', label: string) => (t: Problem['tests'][number], i: number): JudgeCase => ({
    id: `${group}-${i + 1}`,
    label: `${label} ${i + 1}`,
    group,
    ...(t.input && { input: t.input }),
    ...(t.calls && { calls: t.calls as JudgeCase['calls'] }),
    expected: t.output,
    ...(t.explanation && { explanation: t.explanation }),
  });
  const spec: ProblemSpec = {
    ...base,
    cases: [...problem.examples.map(fixed('example', 'Example')), ...problem.tests.map(fixed('test', 'Test')), ...randomCases(problem, base)],
  };
  specs.set(problem.slug, spec);
  return spec;
}

/** The problem's random tests, answered by its TypeScript solution. */
function randomCases(problem: Problem, spec: ProblemSpec): JudgeCase[] {
  if (!problem.generated) return [];
  const generate = GENERATORS[problem.slug];
  if (!generate) throw new Error(`${problem.slug}: asks for generated tests but has no generator`);
  const rng = new Rng(problem.generated.seed);
  return Array.from({ length: problem.generated.count }, (_, i) => {
    const made = generate(rng, i);
    const draft: JudgeCase = { id: `random-${i + 1}`, label: `Random test ${i + 1}`, group: 'random', ...made, expected: null };
    return { ...draft, expected: answer(problem, spec, draft) };
  });
}

/** The reference solution in a language: JavaScript is the TypeScript one with its types stripped. */
export function solutionIn(problem: Problem, language: Language): string {
  if (language === 'python') return problem.solutions.python;
  if (language === 'typescript') return problem.solutions.typescript;
  return transform(problem.solutions.typescript, { transforms: ['typescript'], disableESTransforms: true }).code;
}

/** The reference answer to a test: the TypeScript solution's, run in judge mode. */
export function answer(problem: Problem, spec: ProblemSpec, test: JudgeCase): Json {
  const request = judgeRequest(spec, test, 'typescript', problem.solutions.typescript);
  const result = runJs(request);
  if (result.error) throw new Error(`${problem.slug} ${test.id}: the reference solution failed: ${result.error.message}`);
  return answerOf(spec, result);
}

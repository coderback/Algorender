// The production sandbox, for real: Two Sum in each language through Vercel
// Sandbox. It costs sandbox time on the project's account, so it runs only
// when asked, with credentials and the snapshot in the environment:
//   node --env-file=.env.local node_modules/vitest/vitest.mjs run src/server/judge/vercel.test.ts
// (after `vercel env pull`, which writes VERCEL_OIDC_TOKEN and JUDGE_SNAPSHOT_ID).

import { describe, expect, it } from 'vitest';
import type { ServerLanguage } from '@/problems/languages';
import { getProblem, specFor } from '@/problems/load';
import { judgeInSandbox } from './sandbox';
import { vercelSandbox } from './vercel';

const sandbox = process.env.JUDGE_SNAPSHOT_ID && (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN) ? vercelSandbox() : null;

describe.skipIf(!sandbox)('the Vercel sandbox', () => {
  const problem = getProblem('two-sum')!;
  const spec = specFor(problem);

  it.each(['java', 'cpp', 'go'] as ServerLanguage[])('judges the reference solution in %s', async (language) => {
    const result = await judgeInSandbox(sandbox!, spec, language, problem.solutions[language], spec.cases);
    expect(result.fatal).toBeNull();
    expect(result.checked.filter((c) => c.verdict.status !== 'pass').map((c) => `${c.id}: ${c.verdict.message}`)).toEqual([]);
    expect(result.checked).toHaveLength(spec.cases.length);
  }, 180_000);
});

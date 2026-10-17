// The production sandbox: a Vercel Sandbox (a Firecracker microVM) per run,
// started from a snapshot that already has g++, a JDK and Go
// (scripts/judge-snapshot.mjs makes it; JUDGE_SNAPSHOT_ID names it), with
// no network. It is stopped as soon as the run's files are read back, so a
// run is billed for seconds.
//
// Credentials: on Vercel the project's OIDC token, automatically; elsewhere
// VERCEL_TOKEN, VERCEL_TEAM_ID and VERCEL_PROJECT_ID (or VERCEL_OIDC_TOKEN
// from `vercel env pull`).

import { Sandbox as VercelSandbox } from '@vercel/sandbox';
import type { SandboxOutput } from '@/problems/drivers';
import type { ServerLanguage } from '@/problems/languages';
import { OUTPUT_CHARS } from './docker';
import type { Sandbox } from './sandbox';

/**
 * The run's folder, relative to the sandbox user's working folder (which
 * depends on the image: /vercel on Ubuntu, not the documented
 * /vercel/sandbox). writeFiles, runCommand and readFileToBuffer all resolve
 * relative paths against it.
 */
const DIR = 'judge';

/** Compiling gets this long on top of the run's own limit; the VM is stopped after this whatever happens. */
const COMPILE_SECONDS = 45;

function credentials() {
  const { VERCEL_TOKEN: token, VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId } = process.env;
  return token && teamId && projectId ? { token, teamId, projectId } : {};
}

/** The Vercel sandbox, or null when no snapshot is configured. */
export function vercelSandbox(): Sandbox | null {
  const snapshotId = process.env.JUDGE_SNAPSHOT_ID;
  if (!snapshotId) return null;
  return {
    name: 'vercel',
    async run(files: Record<string, string>, language: ServerLanguage, seconds: number): Promise<SandboxOutput> {
      const budget = (COMPILE_SECONDS + seconds) * 1000;
      const sandbox = await VercelSandbox.create({
        source: { type: 'snapshot', snapshotId },
        resources: { vcpus: 2 },
        timeout: budget + 30_000,
        networkPolicy: 'deny-all',
        ...credentials(),
      });
      try {
        await sandbox.writeFiles(Object.entries(files).map(([name, content]) => ({ path: `${DIR}/${name}`, content })));
        await sandbox.runCommand({ cmd: 'sh', args: [`${DIR}/judge.sh`, language, String(seconds)], signal: AbortSignal.timeout(budget) });
        const read = async (name: string) => (await sandbox.readFileToBuffer({ path: `${DIR}/${name}` }))?.toString('utf8') ?? '';
        const [status, compile, stdout, stderr, answers] = await Promise.all(['status.txt', 'compile.txt', 'stdout.txt', 'stderr.txt', 'answers.jsonl'].map(read));
        return { status, compile, stdout: stdout.slice(0, OUTPUT_CHARS), stderr: stderr.slice(-OUTPUT_CHARS), answers };
      } finally {
        await sandbox.stop().catch(() => {});
      }
    },
  };
}

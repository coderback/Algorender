// The server judge: runs Java, C++ and Go solutions in a sandbox and judges
// them here, in trusted code, against answers that never enter the sandbox.
// Python, JavaScript and TypeScript stay in the browser (src/workspace/).
//
// A sandbox compiles and runs a folder of files (src/problems/drivers/):
// Vercel Sandbox in production (a Firecracker microVM per run, made from a
// snapshot with the toolchains), Docker locally. JUDGE_SANDBOX picks one;
// by default Vercel on Vercel, Docker elsewhere.

import { readOutput, runSeconds, sandboxFiles, type SandboxOutput, type ServerVerdicts } from '@/problems/drivers';
import type { JudgeCase, ProblemSpec } from '@/problems/judge';
import type { ServerLanguage } from '@/problems/languages';

export interface Sandbox {
  name: string;
  /** Writes the files into a fresh folder, runs `sh judge.sh <language> <seconds>` there, and reads back what it wrote. */
  run(files: Record<string, string>, language: ServerLanguage, seconds: number): Promise<SandboxOutput>;
}

/** Judges code against some of a problem's tests in one sandbox run. */
export async function judgeInSandbox(sandbox: Sandbox, spec: ProblemSpec, language: ServerLanguage, code: string, tests: JudgeCase[]): Promise<ServerVerdicts> {
  const seconds = runSeconds(spec, language, tests);
  const output = await sandbox.run(sandboxFiles(spec, language, code, tests), language, seconds);
  // judge.sh always writes a status, so its absence is the sandbox failing, not the learner's code.
  if (!output.status.trim()) throw new Error(`The ${sandbox.name} sandbox ran nothing (no status file).`);
  return readOutput(spec, language, tests, output, seconds);
}

/** Which sandbox this server uses, or null when the server judge is off (JUDGE_SANDBOX=off). */
export async function serverSandbox(): Promise<Sandbox | null> {
  const choice = process.env.JUDGE_SANDBOX ?? (process.env.VERCEL ? 'vercel' : 'docker');
  if (choice === 'vercel') return (await import('./vercel')).vercelSandbox();
  if (choice === 'docker') {
    const docker = await import('./docker');
    // Asking Docker takes a moment; the answer is kept for a minute.
    if (!dockerCheck || Date.now() - dockerCheck.at > 60_000) dockerCheck = { at: Date.now(), available: docker.dockerAvailable() };
    return (await dockerCheck.available) ? docker.dockerSandbox : null;
  }
  return null;
}

let dockerCheck: { at: number; available: Promise<boolean> } | null = null;

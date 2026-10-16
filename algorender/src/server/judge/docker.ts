// The local sandbox: a throwaway container from the algorender-judge image
// (judge/Dockerfile) with no network, capped memory, CPU and processes, and
// no capabilities. Used in development and by the solution tests; Vercel
// Sandbox does this job in production (vercel.ts).

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SandboxOutput } from '@/problems/drivers';
import type { ServerLanguage } from '@/problems/languages';
import type { Sandbox } from './sandbox';

export const DOCKER_IMAGE = process.env.JUDGE_DOCKER_IMAGE ?? 'algorender-judge';

/** Compiling gets this long on top of the run's own limit. */
const COMPILE_SECONDS = 60;

function exec(file: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20 }, (error, _stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stderr: String(stderr) });
    });
  });
}

/** Whether Docker is running and the judge image has been built. */
export async function dockerAvailable(): Promise<boolean> {
  const { code } = await exec('docker', ['image', 'inspect', DOCKER_IMAGE, '--format', '{{.Id}}'], 10_000);
  return code === 0;
}

export const dockerSandbox: Sandbox = {
  name: 'docker',
  async run(files: Record<string, string>, language: ServerLanguage, seconds: number): Promise<SandboxOutput> {
    const dir = await mkdtemp(path.join(tmpdir(), 'algorender-judge-'));
    try {
      await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(dir, name), content)));
      const { code, stderr } = await exec(
        'docker',
        [
          'run',
          '--rm',
          '--network=none',
          '--memory=2g',
          '--memory-swap=2g',
          '--cpus=2',
          '--pids-limit=256',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '-v',
          `${dir}:/judge`,
          '-w',
          '/judge',
          DOCKER_IMAGE,
          'sh',
          'judge.sh',
          language,
          String(seconds),
        ],
        (COMPILE_SECONDS + seconds + 30) * 1000,
      );
      if (code !== 0) throw new Error(`docker run failed (${code}): ${stderr.trim().slice(0, 500)}`);
      const read = (name: string) => readFile(path.join(dir, name), 'utf8').catch(() => '');
      const [status, compile, stdout, errors, answers] = await Promise.all(['status.txt', 'compile.txt', 'stdout.txt', 'stderr.txt', 'answers.jsonl'].map(read));
      return { status, compile, stdout: stdout.slice(0, OUTPUT_CHARS), stderr: errors.slice(-OUTPUT_CHARS), answers };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

/** The most of the learner's prints (and the end of their errors) read back. */
export const OUTPUT_CHARS = 200_000;

// Writes src/content/tasks/expected.json: every published task's expected
// outputs, made by running its reference solution in the real runtimes
// (src/content/tasks/tasks.test.ts with TASKS_WRITE=1), so no expected
// output is ever typed by hand. Run it after changing a task's cases or
// reference: npm run tasks:expected
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', 'src/content/tasks/tasks.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, TASKS_WRITE: '1' },
});
process.exit(result.status ?? 1);

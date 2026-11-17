// Trains the models too slow to train in the browser and writes their weights
// to public/models/<name>.json, which are committed and fetched only by the
// pages that need them (src/ml/weights.ts):
//   npm run models                     (every model)
//   npm run models -- diffusion        (just one)
//   npm run models -- diffusion --fast (its quick config, for iterating on the
//                                       training code: written to .data/models/,
//                                       which is git-ignored, never to public/)
// Training is deterministic from each trainer's seed, so a rerun with the same
// config writes the same file. src/ml/pretrained.test.ts fails when a trainer's
// config no longer matches the weights on disk.
//
// Plain node can't import the app's TypeScript (path aliases, extensionless
// imports), so the trainers are bundled with esbuild first, as the JS worker is.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(os.tmpdir(), `algorender-train-${process.pid}`);
const outfile = path.join(outdir, 'train.mjs');

await build({
  entryPoints: [path.join(root, 'src/ml/train/index.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  logLevel: 'warning',
});

try {
  const { trainers, configHash } = await import(pathToFileURL(outfile).href);
  const args = process.argv.slice(2);
  const fast = args.includes('--fast');
  const only = args.filter((a) => !a.startsWith('--'));
  const names = only.length ? only : Object.keys(trainers);
  for (const name of names) {
    const trainer = trainers[name];
    if (!trainer) throw new Error(`No trainer "${name}" (have: ${Object.keys(trainers).join(', ')})`);
    const config = fast ? trainer.fast : trainer.config;
    const started = performance.now();
    const { loss, weights } = trainer.train((step, l) => console.log(`  ${name}: step ${step}, loss ${l.toFixed(4)}`), config);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const file = path.join(root, fast ? '.data/models' : 'public/models', `${name}.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    const json = JSON.stringify({ name, hash: configHash(config), config, loss, weights });
    writeFileSync(file, `${json}\n`);
    console.log(`${name}${fast ? ' (fast)' : ''}: loss ${loss} in ${seconds} s, ${(json.length / 1024).toFixed(1)} KB → ${path.relative(root, file)}`);
  }
} finally {
  rmSync(outdir, { recursive: true, force: true });
}

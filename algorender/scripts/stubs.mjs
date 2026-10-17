// Prints a problem's generated starter code in each language (or one):
//   node --no-warnings scripts/stubs.mjs two-sum [java|cpp|go|python|javascript|typescript]
// Handy when writing reference solutions: start from the stub's signature.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { stub } from '../src/problems/codegen.ts';

const [slug, only] = process.argv.slice(2);
if (!slug) {
  console.error('usage: node scripts/stubs.mjs <problem-slug> [language]');
  process.exit(1);
}
const problem = parse(readFileSync(new URL(`../src/content/problems/${slug}.yaml`, import.meta.url), 'utf8'));
// The schema's defaults (load.ts applies them through Zod).
if (problem.design) {
  problem.design.init ??= [];
  for (const m of problem.design.methods) m.params ??= [];
}
for (const language of only ? [only] : ['python', 'javascript', 'typescript', 'java', 'cpp', 'go']) {
  console.log(`// ---- ${language}\n${stub(problem, language)}`);
}

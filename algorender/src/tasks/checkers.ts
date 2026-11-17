// Checkers: how a program's output is compared with the expected output, in
// trusted code (never in the sandbox), as the judge's comparators are. A
// language task's program case names one (src/tasks/schema.ts):
//
//   lines     (the default) exact, after trimming spaces at the end of each
//             line and blank lines at the end
//   tokens    the same words in the same order, however they are spaced
//   float     tokens, with numbers equal within a tolerance
//   contains  the output contains each of the given texts (early topics,
//             where the wording around the answer may vary)
//   regex     the output matches a pattern
//   named     a function in src/content/tasks/checks.ts, for tasks with
//             several right answers
//
// Prompts (what input(prompt) wrote) are left out before comparing unless a
// checker says `prompts: 'keep'`, so a learner's own prompt wording never
// fails a case. The result also carries a line diff for the UI (diff.ts).

import { z } from 'zod';

export const CheckerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lines'), prompts: z.enum(['ignore', 'keep']).default('ignore') }),
  z.object({ kind: z.literal('tokens'), prompts: z.enum(['ignore', 'keep']).default('ignore') }),
  z.object({ kind: z.literal('float'), tolerance: z.number().positive().default(1e-6), prompts: z.enum(['ignore', 'keep']).default('ignore') }),
  z.object({ kind: z.literal('contains'), text: z.array(z.string().min(1)).min(1), prompts: z.enum(['ignore', 'keep']).default('ignore') }),
  z.object({ kind: z.literal('regex'), pattern: z.string().min(1), flags: z.string().regex(/^[imsu]*$/).default(''), prompts: z.enum(['ignore', 'keep']).default('ignore') }),
  z.object({ kind: z.literal('named'), name: z.string().regex(/^[a-z][a-z0-9-]*$/), prompts: z.enum(['ignore', 'keep']).default('ignore') }),
]);
export type Checker = z.output<typeof CheckerSchema>;
export type CheckerInput = z.input<typeof CheckerSchema>;

export const DEFAULT_CHECKER: Checker = { kind: 'lines', prompts: 'ignore' };

/**
 * A named checker: why `got` (stdout, prompts left out) is wrong for this
 * stdin, given what the reference wrote; null when it is right.
 */
export type NamedCheck = (stdin: string, got: string, expected: string) => string | null;

/** stdout with each prompt cut out ([start, end) in UTF-16 units, as runtimes report them). */
export function withoutPrompts(stdout: string, prompts: readonly (readonly [number, number])[] = []): string {
  let out = '';
  let at = 0;
  for (const [start, end] of [...prompts].sort((a, b) => a[0] - b[0])) {
    if (start < at) continue;
    out += stdout.slice(at, start);
    at = end;
  }
  return out + stdout.slice(at);
}

/** Output as the 'lines' checker reads it: \r\n as \n, spaces at line ends and blank lines at the end gone. */
export function normaliseLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines;
}

const tokens = (text: string) => text.split(/\s+/).filter(Boolean);

function sameNumber(a: string, b: string, tolerance: number): boolean {
  if (a === b) return true;
  const [x, y] = [Number(a), Number(b)];
  if (!Number.isFinite(x) || !Number.isFinite(y) || a.trim() === '' || b.trim() === '') return false;
  return Math.abs(x - y) <= tolerance * Math.max(1, Math.abs(x));
}

/** What a run produced, as a checker needs it. */
export type Output = { stdout: string; prompts?: [number, number][] };

/**
 * Checks a program's output against the expected (the reference's, run on
 * the same stdin). Null when it passes, else one line on why, for the learner.
 */
export function checkOutput(
  checker: Checker,
  got: Output,
  expected: Output,
  stdin: string,
  named: Readonly<Record<string, NamedCheck>> = {},
): string | null {
  const shown = (o: Output) => (checker.prompts === 'keep' ? o.stdout : withoutPrompts(o.stdout, o.prompts));
  const mine = shown(got);
  const theirs = shown(expected);
  switch (checker.kind) {
    case 'lines': {
      const [a, b] = [normaliseLines(mine), normaliseLines(theirs)];
      const k = firstDifference(a, b);
      if (k === null) return null;
      return k >= a.length ? `Line ${k + 1} is missing.` : k >= b.length ? `Line ${k + 1} wasn't expected: the output should end before it.` : `Line ${k + 1} differs.`;
    }
    case 'tokens':
    case 'float': {
      const [a, b] = [tokens(mine), tokens(theirs)];
      const tolerance = checker.kind === 'float' ? checker.tolerance : 0;
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        if (k >= a.length) return `The output stops early: “${b[k]}” and what follows are missing.`;
        if (k >= b.length) return `“${a[k]}” wasn't expected: the output should end before it.`;
        const same = checker.kind === 'float' ? sameNumber(b[k], a[k], tolerance) : a[k] === b[k];
        if (!same) return `Expected “${b[k]}” where the output has “${a[k]}”.`;
      }
      return null;
    }
    case 'contains': {
      const missing = checker.text.find((t) => !mine.includes(t));
      return missing === undefined ? null : `The output should contain “${missing}”.`;
    }
    case 'regex':
      return new RegExp(checker.pattern, checker.flags).test(mine) ? null : 'The output doesn’t have the expected form.';
    case 'named': {
      const check = named[checker.name];
      if (!check) throw new Error(`No named check called ${checker.name}`);
      return check(stdin, mine, theirs);
    }
  }
}

/** The index of the first line that differs, or null when the lists are equal. */
export function firstDifference(a: readonly string[], b: readonly string[]): number | null {
  for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) return k;
  return null;
}

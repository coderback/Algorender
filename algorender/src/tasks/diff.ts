// The output diff a failed program case shows: expected and actual output
// side by side, line by line, with whitespace made visible (· for a space,
// → for a tab, ⏎ at each line's end) and the first differing line marked.
// Early learners mostly fail on formatting (a missing space, an extra blank
// line), so the diff matters more than the verdict. Pure; OutputDiff.tsx
// draws it.

/** One row of the diff: the expected line and the actual one (null: none there). */
export type DiffRow = { n: number; expected: string | null; got: string | null; same: boolean };

/** Splits output into lines, keeping whether each ended with a newline (the last may not). */
export function outputLines(text: string): { text: string; newline: boolean }[] {
  if (text === '') return [];
  const parts = text.replace(/\r\n?/g, '\n').split('\n');
  const last = parts.pop()!;
  const lines = parts.map((t) => ({ text: t, newline: true }));
  if (last !== '') lines.push({ text: last, newline: false });
  return lines;
}

/** A line with its whitespace shown: spaces as ·, tabs as →, and ⏎ when it ends with a newline. */
export function visible(line: { text: string; newline: boolean }): string {
  return line.text.replace(/ /g, '·').replace(/\t/g, '→') + (line.newline ? '⏎' : '');
}

/**
 * The rows of a diff, line by line (no realignment: learners' mistakes are
 * almost always in place, and a shifted line is still shown where it is).
 * Lines compare exactly, whitespace and all; `first` is the first row that
 * differs, or null.
 */
export function diffRows(expected: string, got: string): { rows: DiffRow[]; first: number | null } {
  const a = outputLines(expected);
  const b = outputLines(got);
  const rows: DiffRow[] = [];
  let first: number | null = null;
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    const e = a[k] ? visible(a[k]) : null;
    const g = b[k] ? visible(b[k]) : null;
    const same = e === g;
    if (!same && first === null) first = k;
    rows.push({ n: k + 1, expected: e, got: g, same });
  }
  return { rows, first };
}

/** Where two lines first differ (a column), for marking it; null when one is missing. */
export function firstColumn(expected: string | null, got: string | null): number | null {
  if (expected === null || got === null) return null;
  const n = Math.min(expected.length, got.length);
  for (let k = 0; k < n; k++) if (expected[k] !== got[k]) return k;
  return expected.length === got.length ? null : n;
}

// Fill-in-the-blank code: a solution with spans marked «n:text». A stage hides
// some blanks (the learner types them) and shows the rest as plain code.

export type Segment = { kind: 'text'; text: string } | { kind: 'blank'; n: number; answer: string };

const MARK = /«(\d+):([^»]*)»/g;

export function parseBlanks(marked: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of marked.matchAll(MARK)) {
    if (m.index > at) out.push({ kind: 'text', text: marked.slice(at, m.index) });
    out.push({ kind: 'blank', n: Number(m[1]), answer: m[2] });
    at = m.index + m[0].length;
  }
  if (at < marked.length) out.push({ kind: 'text', text: marked.slice(at) });
  return out;
}

/** The blank numbers in a template, in order of first appearance. */
export function blankNumbers(segments: readonly Segment[]): number[] {
  return [...new Set(segments.flatMap((s) => (s.kind === 'blank' ? [s.n] : [])))];
}

/** The program a learner's answers make: hidden blanks take their answers, the others their own text. */
export function fillTemplate(segments: readonly Segment[], hidden: ReadonlySet<number>, answers: Readonly<Record<number, string>>): string {
  return segments.map((s) => (s.kind === 'text' ? s.text : hidden.has(s.n) ? (answers[s.n] ?? '') : s.answer)).join('');
}

/** Splits segments into lines, keeping blanks whole (a blank never spans lines). */
export function segmentLines(segments: readonly Segment[]): Segment[][] {
  const lines: Segment[][] = [[]];
  for (const s of segments) {
    if (s.kind === 'blank') {
      lines.at(-1)!.push(s);
      continue;
    }
    s.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ kind: 'text', text: part });
    });
  }
  // A trailing newline leaves an empty last line; drop it.
  if (lines.length > 1 && lines.at(-1)!.length === 0) lines.pop();
  return lines;
}

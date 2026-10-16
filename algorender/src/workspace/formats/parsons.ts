// Parsons problems: the solution's lines, shuffled (with a few wrong ones),
// for the learner to put in order. Python's indentation is part of the puzzle;
// JavaScript's is derived from the braces, since it doesn't change meaning.

import { createRng } from '@/engine/random';
import type { Language } from '../protocol';

export type ParsonsLine = {
  id: string;
  text: string;
  /** Indent level in the reference solution (Python), 0 for distractors. */
  indent: number;
  distractor: boolean;
};

export type Placed = { id: string; indent: number };

const PY_INDENT = 4;

/** The solution's non-blank lines plus distractors, each with a stable id. */
export function parsonsLines(solution: string, distractors: readonly string[] = []): ParsonsLine[] {
  const lines = solution
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l, i): ParsonsLine => {
      const lead = l.length - l.trimStart().length;
      return { id: `l${i}`, text: l.trim(), indent: Math.round(lead / PY_INDENT), distractor: false };
    });
  return [...lines, ...distractors.map((text, i) => ({ id: `d${i}`, text: text.trim(), indent: 0, distractor: true }))];
}

/** A shuffle that is the same for the same seed, and never leaves the lines in their original order. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const out = [...items];
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length < 2 || out.some((x, i) => x !== items[i])) return out;
  }
  return out;
}

/** A small stable hash, to seed each puzzle from its exercise and language. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The program the learner's arrangement makes. */
export function assemble(placed: readonly Placed[], lines: readonly ParsonsLine[], language: Language): string {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const texts = placed.map((p) => ({ text: byId.get(p.id)!.text, indent: p.indent }));
  if (language === 'python') return texts.map((t) => ' '.repeat(PY_INDENT * t.indent) + t.text).join('\n') + '\n';
  return braceIndented(texts.map((t) => t.text)).join('\n') + '\n';
}

/** Indents JS by brace depth: a line starting with } closes before it prints, one ending with { opens after. */
export function braceIndented(lines: readonly string[]): string[] {
  let depth = 0;
  return lines.map((line) => {
    if (/^[}\])]/.test(line)) depth = Math.max(0, depth - 1);
    const out = '  '.repeat(depth) + line;
    if (/[{[(]$/.test(line)) depth++;
    return out;
  });
}

/**
 * The first position where the arrangement departs from the reference
 * solution (order, or indentation in Python), or null if it matches. An opt-in
 * hint after a failed run; the tests are the real judge, since other orders can
 * be right too.
 */
export function firstMisplaced(placed: readonly Placed[], lines: readonly ParsonsLine[], language: Language): number | null {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const reference = lines.filter((l) => !l.distractor);
  for (let i = 0; i < Math.max(placed.length, reference.length); i++) {
    const p = placed[i];
    const want = reference[i];
    if (!p || !want) return i;
    const got = byId.get(p.id)!;
    if (got.text !== want.text || (language === 'python' && p.indent !== want.indent)) return i;
  }
  return null;
}

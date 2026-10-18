// What lessons say about assessment, read from the MDX on the server like
// their quizzes (quizzes.ts):
// - `<Misconception id="…" title="…" probes={[…]}>correction</Misconception>`:
//   a common mistake, the prose that corrects it, and questions that probe
//   for it later. Each probe names its `trap`, the choice the mistake leads
//   to; quiz questions point at mistakes with `traps: { choice: id }`.
// - `<ExplainBack id="…" prompt="…" rubric={[…]} example="…" />`: a prompt to
//   explain the idea back in the learner's own words, the points a good
//   answer covers, and one example answer.
// Attribute values are literals, parsed with acorn and read as data, never run.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseExpressionAt } from 'acorn';
import type * as ES from 'estree';
import type { Question } from '@/components/lesson/Quiz';
import { lessons } from './index';
import { literal } from './quizzes';

/** A question that probes for a mistake: `trap` is the choice the mistake leads to. */
export type Probe = Omit<Question, 'traps'> & { trap: number };

export type LessonMisconception = {
  lesson: string;
  id: string;
  title: string;
  /** The correction, as Markdown (the element's children). */
  correction: string;
  probes: Probe[];
};

export type ExplainPrompt = { lesson: string; id: string; prompt: string; rubric: string[]; example: string };

type Tag = { attrs: Record<string, unknown>; children: string | null };

/**
 * Every `<Name …>` element in an MDX source: its attributes (strings, or the
 * literal value of `{…}`) and its children's source (null when self-closing).
 */
export function tagsIn(source: string, name: string, lesson: string): Tag[] {
  const out: Tag[] = [];
  for (const match of source.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
    let i = match.index + name.length + 1;
    const attrs: Record<string, unknown> = {};
    let selfClosing = false;
    for (;;) {
      while (/\s/.test(source[i])) i++;
      if (source.startsWith('/>', i)) {
        selfClosing = true;
        i += 2;
        break;
      }
      if (source[i] === '>') {
        i++;
        break;
      }
      const attr = /^[A-Za-z][\w-]*/.exec(source.slice(i))?.[0];
      if (!attr) throw new Error(`${lesson}: can't read the attributes of a <${name}>`);
      i += attr.length;
      if (source[i] !== '=') {
        attrs[attr] = true;
        continue;
      }
      i++;
      if (source[i] === '"') {
        const close = source.indexOf('"', i + 1);
        attrs[attr] = source.slice(i + 1, close);
        i = close + 1;
      } else if (source[i] === '{') {
        const expr = parseExpressionAt(source, i + 1, { ecmaVersion: 'latest' }) as unknown as ES.Expression & { end: number };
        attrs[attr] = literal(expr, lesson);
        i = source.indexOf('}', expr.end) + 1;
      } else {
        throw new Error(`${lesson}: <${name} ${attr}=…> must be a "string" or a {literal}`);
      }
    }
    let children: string | null = null;
    if (!selfClosing) {
      const close = source.indexOf(`</${name}>`, i);
      if (close < 0) throw new Error(`${lesson}: a <${name}> is never closed`);
      children = source.slice(i, close).trim();
    }
    out.push({ attrs, children });
  }
  return out;
}

const str = (v: unknown, what: string, lesson: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${lesson}: ${what} must be a non-empty string`);
  return v;
};

/** The misconceptions in one lesson's MDX source. */
export function misconceptionsIn(lesson: string, source: string): LessonMisconception[] {
  return tagsIn(source, 'Misconception', lesson).map(({ attrs, children }) => ({
    lesson,
    id: str(attrs.id, 'a <Misconception> id', lesson),
    title: str(attrs.title, 'a <Misconception> title', lesson),
    correction: children ?? '',
    probes: (attrs.probes ?? []) as Probe[],
  }));
}

/** The explain-it-back prompts in one lesson's MDX source. */
export function promptsIn(lesson: string, source: string): ExplainPrompt[] {
  return tagsIn(source, 'ExplainBack', lesson).map(({ attrs }) => ({
    lesson,
    id: str(attrs.id, 'an <ExplainBack> id', lesson),
    prompt: str(attrs.prompt, 'an <ExplainBack> prompt', lesson),
    rubric: (attrs.rubric ?? []) as string[],
    example: str(attrs.example, 'an <ExplainBack> example', lesson),
  }));
}

const read = (slug: string) => readFileSync(path.join(process.cwd(), 'src/content/lessons', `${slug}.mdx`), 'utf8');

let mistakes: LessonMisconception[] | null = null;
let prompts: ExplainPrompt[] | null = null;

/** Every lesson's misconceptions, in lesson order. */
export function lessonMisconceptions(): LessonMisconception[] {
  mistakes ??= lessons.flatMap((l) => misconceptionsIn(l.slug, read(l.slug)));
  return mistakes;
}

/** Every lesson's explain-it-back prompts, in lesson order. */
export function lessonPrompts(): ExplainPrompt[] {
  prompts ??= lessons.flatMap((l) => promptsIn(l.slug, read(l.slug)));
  return prompts;
}

export const getMisconception = (lesson: string, id: string) => lessonMisconceptions().find((m) => m.lesson === lesson && m.id === id);
export const getPrompt = (lesson: string, id: string) => lessonPrompts().find((p) => p.lesson === lesson && p.id === id);

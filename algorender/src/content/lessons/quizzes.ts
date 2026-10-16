// Every lesson's quiz questions, read from the MDX on the server, so the
// review queue can ask them again later (src/progress/review.ts). A lesson
// writes `<Quiz id="…" questions={[{ q, choices, answer, why }, …]} />` with
// literal values; the `questions` expression is parsed with acorn and read as
// data, never run.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseExpressionAt } from 'acorn';
import type * as ES from 'estree';
import type { Question } from '@/components/lesson/Quiz';
import { lessons } from './index';

export type LessonQuiz = { lesson: string; quiz: string; questions: Question[] };

let cache: LessonQuiz[] | null = null;

/** Every `<Quiz>` in every lesson, in lesson order. */
export function lessonQuizzes(): LessonQuiz[] {
  cache ??= lessons.flatMap((l) => quizzesIn(l.slug, readFileSync(path.join(process.cwd(), 'src/content/lessons', `${l.slug}.mdx`), 'utf8')));
  return cache;
}

/** The quizzes in one lesson's MDX source. */
export function quizzesIn(lesson: string, source: string): LessonQuiz[] {
  const out: LessonQuiz[] = [];
  for (const match of source.matchAll(/<Quiz\b/g)) {
    const start = match.index;
    const tag = source.slice(start, source.indexOf('questions=', start));
    const id = /\bid="([a-z0-9-]+)"/.exec(tag)?.[1] ?? 'quiz';
    const at = source.indexOf('questions={', start);
    if (at < 0) throw new Error(`${lesson}: a <Quiz> without questions={…}`);
    const expr = parseExpressionAt(source, at + 'questions={'.length, { ecmaVersion: 'latest' }) as unknown as ES.Expression;
    out.push({ lesson, quiz: id, questions: literal(expr, lesson) as Question[] });
  }
  return out;
}

/** A literal expression's value: arrays, objects, strings, numbers, booleans, null. */
function literal(node: ES.Node, lesson: string): unknown {
  switch (node.type) {
    case 'ArrayExpression':
      return node.elements.map((e) => (e ? literal(e, lesson) : null));
    case 'ObjectExpression':
      return Object.fromEntries(
        node.properties.map((p) => {
          if (p.type !== 'Property' || p.computed) throw new Error(`${lesson}: quiz questions must be plain objects`);
          const key = p.key.type === 'Identifier' ? p.key.name : String(literal(p.key, lesson));
          return [key, literal(p.value, lesson)];
        }),
      );
    case 'Literal':
      return node.value;
    case 'TemplateLiteral':
      if (node.expressions.length > 0) throw new Error(`${lesson}: quiz text can't use \${…}`);
      return node.quasis.map((q) => q.value.cooked).join('');
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value;
      break;
  }
  throw new Error(`${lesson}: quiz questions must be literal values, not ${node.type}`);
}

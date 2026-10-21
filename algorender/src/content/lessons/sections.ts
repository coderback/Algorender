import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sectionId } from '@/components/lesson/steps';

// A lesson's sections, read from its MDX source on the server (like the
// quizzes and common mistakes), for the table of contents and the progress
// bar in the lesson's header.

export type LessonSection = { step: string; title: string; id: string };

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

export function lessonSections(slug: string): LessonSection[] {
  const source = readFileSync(path.join(process.cwd(), 'src/content/lessons', `${slug}.mdx`), 'utf8');
  return [...source.matchAll(/<Section\b[^>]*>/g)].flatMap(([tag]) => {
    const step = attr(tag, 'step');
    const title = attr(tag, 'title');
    return step && title ? [{ step, title, id: sectionId(title) }] : [];
  });
}

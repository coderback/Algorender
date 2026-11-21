import expectedFile from './expected.json';
import { TaskSchema, type ExpectedFile, type Task, type TaskInput } from '@/tasks/schema';
import { PYTHON_BASICS } from './python-basics';
import { PYTHON_COLLECTIONS } from './python-collections';
import { PYTHON_CONTROL } from './python-control';
import { PYTHON_ERRORS } from './python-errors';
import { PYTHON_FUNCTIONS } from './python-functions';
import { PYTHON_STRINGS } from './python-strings';

// The language tracks' tasks (src/tasks/schema.ts), one file per unit of a
// track (src/content/units.ts). A topic (a lesson on a language track) ends
// with a strip of its concept's tasks, in the order listed here, and each
// task also has its own page under Learn (/learn/tasks/<slug>).
//
// Expected outputs come from running each reference solution (and each
// variant of an output task's snippet), never from typing them:
// `npm run tasks:expected` writes expected.json, and tasks.test.ts fails when
// it is stale.

const SOURCES: TaskInput[] = [...PYTHON_BASICS, ...PYTHON_CONTROL, ...PYTHON_FUNCTIONS, ...PYTHON_COLLECTIONS, ...PYTHON_STRINGS, ...PYTHON_ERRORS];

export const tasks: readonly Task[] = SOURCES.map((t) => TaskSchema.parse(t));

/** The reference's results for each task's cases (expected.json). */
export const expected = expectedFile as unknown as ExpectedFile;

export function getTask(slug: string): Task | undefined {
  return tasks.find((t) => t.slug === slug);
}

/** A topic's tasks, in the order its strip shows them. */
export function topicTasks(concept: string): Task[] {
  return tasks.filter((t) => t.concept === concept);
}

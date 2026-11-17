// Milestone projects (src/content/projects), from the events alone: a part is
// done once its exercise's write (or bug) stage has passed, and a project is
// complete once every part is. Like mastery, a pure projection, so it needs no
// event of its own and every device agrees.

import { projects as allProjects, type Project } from '@/content/projects';
import type { ProgressEvent } from './events';

/** The exercise stages that count as building a part: writing it, or fixing it. */
const BUILDS = new Set(['write', 'bug']);

/** When each exercise was first built (its write or bug stage passed). Events must be in time order. */
export function builtExercises(events: readonly ProgressEvent[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) if (e.kind === 'exercise.passed' && BUILDS.has(e.data.stage) && !out.has(e.data.exercise)) out.set(e.data.exercise, e.at);
  return out;
}

export type ProjectProgress = {
  /** Parts done, in the project's order. */
  done: string[];
  /** The first part not yet done (the next to build), or null when complete. */
  next: string | null;
  complete: boolean;
  /** When the last part was done, once complete. */
  at?: string;
};

export function projectProgress(project: Project, built: ReadonlyMap<string, string>): ProjectProgress {
  const done = project.parts.filter((p) => built.has(p));
  const next = project.parts.find((p) => !built.has(p)) ?? null;
  const complete = project.parts.length > 0 && next === null;
  const at = complete ? project.parts.map((p) => built.get(p)!).sort().at(-1) : undefined;
  return { done, next, complete, ...(at && { at }) };
}

/** Every complete project, with when it was completed. Events must be in time order. */
export function completedProjects(events: readonly ProgressEvent[], list: readonly Project[] = allProjects): Map<string, string> {
  const built = builtExercises(events);
  const out = new Map<string, string>();
  for (const p of list) {
    const progress = projectProgress(p, built);
    if (progress.at) out.set(p.slug, progress.at);
  }
  return out;
}

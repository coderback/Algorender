'use client';

import { FiCheck, FiCheckCircle } from 'react-icons/fi';
import { markComplete, useProgress } from './progress';

/** "Mark as complete" at the end of a lesson. Remembered in this browser. */
export function LessonComplete({ slug }: { slug: string }) {
  const done = useProgress().completed.includes(slug);
  return (
    <button
      type="button"
      aria-pressed={done}
      onClick={() => markComplete(slug, !done)}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
        done ? 'bg-good text-white hover:bg-good-strong' : 'bg-accent text-white hover:bg-accent-strong'
      }`}
    >
      {done ? <FiCheckCircle aria-hidden /> : <FiCheck aria-hidden />}
      {done ? 'Completed' : 'Mark as complete'}
    </button>
  );
}

/** A small "done" tick for lesson cards on the learn page. */
export function CompletedTick({ slug }: { slug: string }) {
  const done = useProgress().completed.includes(slug);
  if (!done) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good-ink">
      <FiCheckCircle aria-hidden /> Done
    </span>
  );
}

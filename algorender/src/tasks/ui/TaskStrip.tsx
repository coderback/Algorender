'use client';

import Link from 'next/link';
import { FiArrowRight, FiCheckCircle, FiCircle, FiRotateCw } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { useProgressSnapshot, useTaskProgress } from '@/progress/hooks';
import { KIND_LABEL, type TaskKind } from '../schema';

export type StripTask = { slug: string; title: string; kind: TaskKind };

/**
 * A topic's tasks, in order (the language tracks' proposal, §2c): a tile each,
 * with its kind and whether it is done, tried or still to do, each opening the
 * task on its own page. The learner can stop after any of them.
 */
export function TaskStrip({ tasks, label }: { tasks: readonly StripTask[]; label: string }) {
  const { ready } = useProgressSnapshot();
  const progress = useTaskProgress();
  const done = ready ? tasks.filter((t) => progress[t.slug]?.passed).length : 0;
  const next = ready ? tasks.find((t) => !progress[t.slug]?.passed) : tasks[0];
  return (
    <section id="tasks" aria-label={label} className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted" aria-live="polite">
        {ready ? `${done} of ${tasks.length} done` : `${tasks.length} tasks`}
        {ready && done === tasks.length && tasks.length > 0 ? ': every task in this topic passes.' : '. Stop after any of them, and come back for the rest.'}
      </p>
      <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {tasks.map((t, k) => {
          const p = ready ? progress[t.slug] : undefined;
          const state = p?.passed ? 'done' : p ? 'tried' : 'todo';
          const Icon = state === 'done' ? FiCheckCircle : state === 'tried' ? FiRotateCw : FiCircle;
          return (
            <li key={t.slug}>
              <Link
                href={`/learn/tasks/${t.slug}`}
                data-task-state={state}
                className={cx(
                  'group flex h-full items-start gap-3 rounded-tile p-4 transition-colors duration-150 ease-standard',
                  state === 'done' ? 'bg-good-soft' : 'bg-surface hover:bg-subtle',
                  next?.slug === t.slug && state !== 'done' && 'ring-2 ring-accent ring-inset',
                )}
              >
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken font-mono text-sm font-semibold text-ink">
                  {k + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs font-semibold text-ink-muted">{KIND_LABEL[t.kind]}</span>
                  <span className="font-semibold text-ink group-hover:underline">{t.title}</span>
                  <span className={cx('mt-1 inline-flex items-center gap-1.5 text-xs font-semibold', state === 'done' ? 'text-good-ink' : state === 'tried' ? 'text-warn-ink' : 'text-ink-muted')}>
                    <Icon aria-hidden className="size-3.5" />
                    {state === 'done' ? 'Done' : state === 'tried' ? 'Tried, not passing yet' : next?.slug === t.slug ? 'Up next' : 'To do'}
                  </span>
                </span>
                <FiArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiChevronLeft } from 'react-icons/fi';
import { getConcept } from '@/content/concepts';
import { expected, getTask, tasks } from '@/content/tasks';
import { trackLabel } from '@/data/tracks';
import { TaskPlayer } from '@/tasks/ui/TaskPlayer';

// A language task on its own page (src/tasks/). Topics (L2) will end with a
// strip of their tasks; until then the sample tasks live only here, left out
// of the sitemap and of search engines.

export const dynamicParams = false;

export function generateStaticParams() {
  return tasks.map((t) => ({ task: t.slug }));
}

type Props = { params: Promise<{ task: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const task = getTask((await params).task);
  return task ? { title: `${task.title} | Learn | Algorender`, robots: { index: false } } : {};
}

export default async function TaskPage({ params }: Props) {
  const task = getTask((await params).task);
  if (!task) notFound();
  const concept = getConcept(task.concept);
  const crumb = ['Learn', concept ? trackLabel(concept.track) : null, concept?.title].filter(Boolean).join(' · ');
  return (
    <main className="min-h-dvh">
      <header className="px-3 pt-3 sm:px-4">
        <div className="flex items-center gap-3 rounded-card bg-surface py-2.5 pr-3 pl-2.5 sm:gap-4">
          <Link
            href="/learn"
            aria-label="Back to Learn"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sunken text-ink transition-colors duration-150 ease-standard hover:bg-line-soft"
          >
            <FiChevronLeft aria-hidden className="size-5" />
          </Link>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-ink-muted">{crumb}</span>
            <h1 className="truncate text-base font-bold text-ink sm:text-[17px]">{task.title}</h1>
          </div>
        </div>
      </header>
      <TaskPlayer task={task} expected={expected[task.slug] ?? {}} />
    </main>
  );
}

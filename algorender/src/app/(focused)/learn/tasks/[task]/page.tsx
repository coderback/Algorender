import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiArrowRight, FiChevronLeft } from 'react-icons/fi';
import { getConcept } from '@/content/concepts';
import { getLesson } from '@/content/lessons';
import { expected, getTask, tasks, topicTasks } from '@/content/tasks';
import { trackLabel } from '@/data/tracks';
import { KIND_LABEL } from '@/tasks/schema';
import { TaskPlayer } from '@/tasks/ui/TaskPlayer';

// A language task on its own page (src/tasks/), reached from its topic's
// strip (<TaskStrip /> at the end of the topic's lesson). The header leads
// back to the topic; under the task, the previous and next ones in the strip.

export const dynamicParams = false;

export function generateStaticParams() {
  return tasks.map((t) => ({ task: t.slug }));
}

type Props = { params: Promise<{ task: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const task = getTask((await params).task);
  if (!task) return {};
  const concept = getConcept(task.concept);
  return {
    title: `${task.title} | ${concept?.title ?? 'Learn'} | Algorender`,
    description: `${KIND_LABEL[task.kind]}: a ${concept ? `${trackLabel(concept.track)} task on ${concept.title.toLowerCase()}` : 'task'}, checked in your browser.`,
  };
}

export default async function TaskPage({ params }: Props) {
  const task = getTask((await params).task);
  if (!task) notFound();
  const concept = getConcept(task.concept);
  const lesson = concept?.lesson ? getLesson(concept.lesson) : undefined;
  const back = lesson ? { href: `/learn/${lesson.slug}`, label: `Back to ${concept!.title}` } : { href: '/learn', label: 'Back to Learn' };
  const strip = topicTasks(task.concept);
  const at = strip.findIndex((t) => t.slug === task.slug);
  const [previous, next] = [strip[at - 1], strip[at + 1]];
  const crumb = ['Learn', concept ? trackLabel(concept.track) : null, concept?.title, strip.length > 1 ? `Task ${at + 1} of ${strip.length}` : null].filter(Boolean).join(' · ');
  return (
    <main className="min-h-dvh">
      <header className="px-3 pt-3 sm:px-4">
        <div className="flex items-center gap-3 rounded-card bg-surface py-2.5 pr-3 pl-2.5 sm:gap-4">
          <Link
            href={back.href}
            aria-label={back.label}
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
      {(previous || next || lesson) && (
        <nav aria-label="This topic’s tasks" className="flex flex-wrap items-center justify-between gap-3 px-3 pb-10 sm:px-4">
          {previous ? (
            <Link href={`/learn/tasks/${previous.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle">
              <FiArrowLeft aria-hidden /> <span className="sr-only">Previous task: </span>
              {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/learn/tasks/${next.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">
              <span className="sr-only">Next task: </span>
              {next.title} <FiArrowRight aria-hidden />
            </Link>
          ) : (
            lesson && (
              <Link href={`/learn/${lesson.slug}#tasks`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">
                Back to the topic’s tasks <FiArrowRight aria-hidden />
              </Link>
            )
          )}
        </nav>
      )}
    </main>
  );
}

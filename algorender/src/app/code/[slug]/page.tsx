import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { exercises, getExercise } from '@/content/exercises';
import { getVisualiserBySlug } from '@/data/visualisers';
import { Hints } from '@/workspace/Hints';
import { InlineText } from '@/workspace/InlineText';
import { Workspace } from '@/workspace/Workspace';

export const dynamicParams = false;

export function generateStaticParams() {
  return exercises.map((e) => ({ slug: e.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const exercise = getExercise((await params).slug);
  if (!exercise) return {};
  return { title: `${exercise.title} | Algorender`, description: `${exercise.summary} In Python, JavaScript or TypeScript.` };
}

const EYEBROW = { write: 'Code it yourself', modify: 'Change the code', bug: 'Find the bug' } as const;

export default async function ExercisePage({ params }: Props) {
  const exercise = getExercise((await params).slug);
  if (!exercise) notFound();
  const visualiser = getVisualiserBySlug(exercise.visualiser);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/code" className="mb-4 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
        <FiArrowLeft aria-hidden /> All exercises
      </Link>
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wider text-accent-ink uppercase">{EYEBROW[exercise.kind]}</div>
          <h1 className="text-3xl font-bold text-ink">{exercise.title}</h1>
          <div className="mt-2 max-w-3xl space-y-2 text-ink-soft">
            {exercise.task.map((p, i) => (
              <p key={i}>
                <InlineText text={p} />
              </p>
            ))}
          </div>
        </div>
        <aside aria-label="Help with this exercise" className="space-y-3 self-start rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
          {visualiser && (
            <Link href={`/visualisers/${exercise.visualiser}`} className="flex items-center justify-between gap-2 text-sm text-accent-ink hover:underline">
              Watch the reference {visualiser.name} first <FiArrowRight aria-hidden />
            </Link>
          )}
          <Hints hints={exercise.hints} />
        </aside>
      </div>
      <Workspace slug={exercise.slug} />
    </main>
  );
}

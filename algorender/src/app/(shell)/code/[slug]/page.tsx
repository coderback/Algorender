import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FiArrowRight } from 'react-icons/fi';
import { DetailHeader } from '@/components/explorer/DetailHeader';
import { ButtonLink } from '@/components/ui/Button';
import { TrackCard } from '@/components/ui/Card';
import { exercises, getExercise } from '@/content/exercises';
import { getVisualiserBySlug } from '@/data/visualisers';
import { Hints } from '@/workspace/Hints';
import { InlineText } from '@/workspace/InlineText';
import { tutorConfig } from '@/server/tutor/config';
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

const CRUMB = { write: 'Code it · Write it', modify: 'Code it · Change it', bug: 'Code it · Find the bug' } as const;

export default async function ExercisePage({ params }: Props) {
  const exercise = getExercise((await params).slug);
  if (!exercise) notFound();
  const visualiser = getVisualiserBySlug(exercise.visualiser);

  return (
    <main className="flex flex-col gap-5 px-4 pb-6 md:px-0 md:pt-1">
      <div className="flex flex-col gap-3">
        <DetailHeader root={{ href: '/code', label: 'Practice' }} crumb={CRUMB[exercise.kind]} title={exercise.title} />
        <div className="flex max-w-[900px] flex-col gap-2 text-base leading-relaxed text-ink-soft">
          {exercise.task.map((p, i) => (
            <p key={i}>
              <InlineText text={p} />
            </p>
          ))}
        </div>
      </div>
      <Workspace
        slug={exercise.slug}
        tutor={tutorConfig() !== null}
        aside={
          <>
            <Hints hints={exercise.hints} card />
            {visualiser && (
              <TrackCard track="peach" dense as="div" className="gap-2.5">
                <span className="text-[13px] font-semibold">Brush up first</span>
                <strong className="font-display text-title-card text-track-peach-title">Watch the reference {visualiser.name}</strong>
                <ButtonLink href={`/visualisers/${exercise.visualiser}`} size="s" className="w-fit" trailing={<FiArrowRight aria-hidden />}>
                  Open the visualiser
                </ButtonLink>
              </TrackCard>
            )}
          </>
        }
      />
    </main>
  );
}

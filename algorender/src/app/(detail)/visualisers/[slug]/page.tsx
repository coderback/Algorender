import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { FiBookOpen, FiCode } from 'react-icons/fi';
import { sorting } from '@/algorithms/sorting';
import { ConceptStatus } from '@/components/explorer/ConceptStatus';
import { DetailHeader } from '@/components/explorer/DetailHeader';
import { Visualiser } from '@/components/explorer/Visualiser';
import { ButtonLink } from '@/components/ui/Button';
import { Card, TrackCard } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { exerciseForVisualiser } from '@/content/exercises';
import { getLesson } from '@/content/lessons';
import { masteryGraph } from '@/content/mastery';
import { loadProblems } from '@/problems/load';
import { getVisualiserBySlug } from '@/data/visualisers';
import { TRACK_CLASSES, trackColour } from '@/data/tracks';
import { getModule, modules } from '@/registry';

// Serves every visualiser ported to the trace engine.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(modules).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = getVisualiserBySlug(slug);
  if (!meta) return {};
  return {
    title: `${meta.name}: step-by-step visualisation | Algorender`,
    description: `${meta.description} Step through it forwards and backwards with synced pseudo-code and narration, and test yourself by predicting each step.`,
  };
}

export default async function VisualiserPage({ params }: Props) {
  const { slug } = await params;
  const visualiser = getModule(slug);
  const meta = getVisualiserBySlug(slug);
  if (!visualiser || !meta) notFound();
  const { idea, invariant, whenToUse, traits } = visualiser.content;
  const isAlgorithm = meta.type === 'algorithm';
  const cost = 'timeComplexity' in meta ? meta : null;
  const exercise = exerciseForVisualiser(slug);
  const problems = loadProblems().filter((p) => p.visualisers.includes(slug)).slice(0, 4);
  const graph = masteryGraph();
  // The concept that teaches it sets the page's colour, its status and its lesson, as on its Explore tile.
  const concept = graph.concepts.find((c) => !c.planned && c.visualisers.includes(slug));
  const colour = trackColour(concept?.track ?? (meta.type === 'systems' || meta.type === 'math' ? meta.type : ''));
  const c = TRACK_CLASSES[colour];
  const lesson = concept?.lesson ? getLesson(concept.lesson) : undefined;
  const race = sorting.some((a) => a.slug === slug) ? { href: '/compare', label: 'Race it against other sorts' } : undefined;

  const details = (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]" aria-label="Understanding it">
      <TrackCard track="lilac" as="article" className="gap-2.5">
        <h2 className="font-display text-[22px] font-bold text-track-lilac-title">What stays true</h2>
        <p className="text-[15px] leading-relaxed text-track-lilac-title">{invariant}</p>
        <p className="text-[13px] leading-normal">
          An invariant like this is what you would use to prove it correct, and the fastest way to predict its next step.
        </p>
      </TrackCard>
      <TrackCard track="butter" as="article" className="gap-2.5">
        <h2 className="font-display text-[22px] font-bold text-track-butter-title">When to use it</h2>
        <p className="text-[15px] leading-relaxed text-track-butter-title">{whenToUse}</p>
        {problems.length > 0 && (
          <p className="mt-auto text-[13px]">
            Practise it:{' '}
            {problems.map((p, i) => (
              <span key={p.slug}>
                {i > 0 && ' · '}
                <Link href={`/practice/${p.slug}`} className="font-semibold text-track-butter-title underline underline-offset-2 hover:no-underline">
                  {p.title}
                </Link>
              </span>
            ))}
          </p>
        )}
      </TrackCard>
      <Card as="article" className="gap-3">
        <h2 className="font-display text-[22px] font-bold">{cost ? 'Cost and properties' : 'Properties'}</h2>
        {cost && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-1.5 text-sm">
            <dt className="text-ink-muted">Best</dt>
            <dd className="font-mono">{cost.timeComplexity.best}</dd>
            <dt className="text-ink-muted">Average</dt>
            <dd className="font-mono">{cost.timeComplexity.average}</dd>
            <dt className="text-ink-muted">Worst</dt>
            <dd className="font-mono">{cost.timeComplexity.worst}</dd>
            <dt className="text-ink-muted">Space</dt>
            <dd className="font-mono">{cost.spaceComplexity}</dd>
          </dl>
        )}
        {traits.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {traits.map((t) => (
              <li
                key={t.label}
                className={cx(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  t.good === true ? 'bg-good-soft text-good-ink' : t.good === false ? 'bg-warn-soft text-warn-ink' : 'bg-sunken text-ink-soft',
                )}
              >
                {t.label}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );

  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-6 md:px-0 md:pt-1">
      <DetailHeader
        crumb={meta.category}
        back="/explore"
        title={meta.name}
        eyebrowClass={c.ink}
        chips={
          <>
            <span className={cx('rounded-full px-3 py-[5px] text-[13px] font-semibold', c.bg, c.ink)}>{meta.category}</span>
            {concept && <ConceptStatus graph={graph} concept={concept.id} />}
          </>
        }
        description={idea}
        actions={
          <>
            {cost && (
              <dl className="hidden gap-2 sm:flex">
                <CostTile label={isAlgorithm ? 'Average time' : 'Typical operation'} value={cost.timeComplexity.average} />
                <CostTile label="Space" value={cost.spaceComplexity} />
              </dl>
            )}
            {lesson && (
              <ButtonLink href={`/learn/${lesson.slug}`} kind="onTrack" size="l" className={PHONE_M} icon={<FiBookOpen aria-hidden />}>
                Lesson · {lesson.minutes} min
              </ButtonLink>
            )}
            {exercise && (
              <ButtonLink href={`/code/${exercise.slug}`} size="l" className={PHONE_M} icon={<FiCode aria-hidden />} title="Write it yourself in Python, JavaScript or TypeScript">
                Write it yourself
              </ButtonLink>
            )}
          </>
        }
      />

      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-card bg-surface" aria-label="Loading visualiser" />}>
        <Visualiser slug={slug} colour={colour} next={race} details={details} />
      </Suspense>
    </main>
  );
}

/** Large buttons, medium on phones so both actions fit on one row. */
const PHONE_M = 'h-11 px-4 text-sm sm:h-13 sm:px-[22px] sm:text-[15px]';

function CostTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-surface px-3.5 py-2">
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="font-mono text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

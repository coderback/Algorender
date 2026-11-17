import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Checkpoint } from '@/components/learn/Checkpoint';
import { LearnHeader } from '@/components/learn/LearnHeader';
import { TrackCard, trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { checkpointPools } from '@/content/checkpoints';
import { loadConcepts } from '@/content/concepts';
import { getStage, stages } from '@/content/stages';

// A stage's checkpoint on the math and ML path (src/progress/checkpoint.ts).
export const dynamicParams = false;

export function generateStaticParams() {
  return stages.map((s) => ({ stage: String(s.id) }));
}

type Props = { params: Promise<{ stage: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stage = getStage(Number((await params).stage));
  if (!stage) return {};
  return {
    title: `Checkpoint ${stage.id}: ${stage.title} | Algorender`,
    description: `A short mixed round of questions on ${stage.title.toLowerCase()}: mostly common mistakes the lessons don’t ask, to see whether the ideas carry over.`,
  };
}

export default async function CheckpointPage({ params }: Props) {
  const stage = getStage(Number((await params).stage));
  if (!stage) notFound();
  const { concepts } = loadConcepts();
  const pools = checkpointPools(stage.id);
  const titles = Object.fromEntries(concepts.map((c) => [c.id, c.title]));
  const live = new Set(concepts.filter((c) => !c.planned).map((c) => c.id));
  const covered = stage.concepts.filter((id) => live.has(id));
  const colour = stage.id <= 4 ? 'rose' : 'lime';

  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <LearnHeader active="path" title={false} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <TrackCard track={colour} as="section" aria-labelledby="checkpoint-title" className="gap-6 rounded-[36px] p-7 sm:p-9">
          <h1 id="checkpoint-title" className="text-eyebrow uppercase">
            Checkpoint {stage.id} of {stages.length}
          </h1>
          <p className={cx('font-display text-[clamp(28px,3vw,40px)] leading-[1.05] font-bold tracking-[-0.025em]', trackTitle(colour))}>{stage.title}</p>
          <p className="text-[15px] leading-relaxed">{stage.summary}</p>
          <p className="text-[13px]">
            {covered.length} of its {stage.concepts.length} concepts have lessons so far; the checkpoint asks about those, and grows as the rest arrive.
          </p>
        </TrackCard>
        <Checkpoint pools={pools} titles={titles} covered={covered} />
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayHeader } from '@/components/play/PlayHeader';
import { getVisualiserBySlug } from '@/data/visualisers';
import { BeTheAlgorithm } from '@/play/be-the-algorithm/BeTheAlgorithm';
import { isSupported, SUPPORTED } from '@/play/be-the-algorithm/moves';

export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED.map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const nameOf = (slug: string): string => getVisualiserBySlug(slug)?.name ?? slug;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return isSupported(slug)
    ? { title: `Be ${nameOf(slug).toLowerCase()} | Algorender`, description: `Make each swap ${nameOf(slug).toLowerCase()} makes, on a fresh random input every round.` }
    : {};
}

export default async function BeTheAlgorithmRoundPage({ params }: Props) {
  const { slug } = await params;
  if (!isSupported(slug)) notFound();
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PlayHeader
        active="/play/be-the-algorithm"
        title={`Be ${nameOf(slug).toLowerCase()}`}
        intro="Pick the two bars it swaps next, then say when it is done. The link holds the round, so you can share it."
      />
      <BeTheAlgorithm slug={slug} />
    </main>
  );
}

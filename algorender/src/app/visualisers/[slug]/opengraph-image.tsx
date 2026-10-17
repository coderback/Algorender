import { getVisualiserBySlug } from '@/data/visualisers';
import { OG_SIZE, ogCard } from '@/lib/og';
import { modules } from '@/registry';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'An Algorender visualiser';

export function generateStaticParams() {
  return Object.keys(modules).map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const meta = getVisualiserBySlug((await params).slug);
  return ogCard({
    eyebrow: meta?.category ?? 'Visualiser',
    title: meta?.name ?? 'Algorender',
    detail: meta
      ? `${meta.type === 'algorithm' ? 'Time' : 'Typical operation'} ${meta.timeComplexity.average} · space ${meta.spaceComplexity}. Step through it and predict each move.`
      : 'Step through it and predict each move.',
  });
}

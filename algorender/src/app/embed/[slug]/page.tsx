import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { FiArrowUpRight } from 'react-icons/fi';
import { Visualiser } from '@/components/explorer/Visualiser';
import { getVisualiserBySlug } from '@/data/visualisers';
import { getModule, modules } from '@/registry';

// Chrome-less visualiser for <iframe> embeds in blogs, notes and course pages.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(modules).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = getVisualiserBySlug(slug);
  return { title: meta ? `${meta.name} | Algorender` : 'Algorender', robots: { index: false } };
}

export default async function EmbedPage({ params }: Props) {
  const { slug } = await params;
  const meta = getVisualiserBySlug(slug);
  if (!getModule(slug) || !meta) notFound();

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-page p-3 text-ink sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em] sm:text-[26px]">{meta.name}</h1>
        <a href={`/visualisers/${slug}`} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
          Open in Algorender <FiArrowUpRight aria-hidden />
        </a>
      </div>
      <Suspense fallback={<div className="h-[520px] animate-pulse rounded-card bg-surface" aria-label="Loading visualiser" />}>
        <Visualiser slug={slug} variant="embed" />
      </Suspense>
    </main>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
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
    <main className="min-h-screen bg-gray-50 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-gray-900">{meta.name}</h1>
        <a
          href={`/visualisers/${slug}`}
          target="_blank"
          rel="noopener"
          className="text-xs text-blue-700 hover:text-blue-900"
        >
          Open in Algorender ↗
        </a>
      </div>
      <Suspense fallback={<div className="h-[520px] animate-pulse rounded-xl bg-white" aria-label="Loading visualiser" />}>
        <Visualiser slug={slug} variant="embed" />
      </Suspense>
    </main>
  );
}

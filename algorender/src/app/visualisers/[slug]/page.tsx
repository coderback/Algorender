import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import Header from '@/components/Header';
import { Explorer } from '@/components/explorer/Explorer';
import { algorithms, getAlgorithm } from '@/algorithms';
import { getVisualiserBySlug } from '@/data/visualisers';

// Serves every visualiser ported to the trace engine. Legacy pages still live in
// their own static folders under app/visualisers/ until they are ported.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(algorithms).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = getVisualiserBySlug(slug);
  if (!meta) return {};
  return {
    title: `${meta.name}: step-by-step visualisation | Algorender`,
    description: `${meta.description} Step through ${meta.name.toLowerCase()} forwards and backwards with synced pseudo-code and narration.`,
  };
}

export default async function VisualiserPage({ params }: Props) {
  const { slug } = await params;
  const algo = getAlgorithm(slug);
  const meta = getVisualiserBySlug(slug);
  if (!algo || !meta) notFound();
  const { idea, invariant, whenToUse, properties } = algo.content;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/?tab=algorithms"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900"
        >
          <FiArrowLeft aria-hidden /> All algorithms
        </Link>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-700">{meta.category}</div>
            <h1 className="text-3xl font-bold text-gray-900">{meta.name}</h1>
            <p className="mt-1 max-w-3xl text-gray-600">{idea}</p>
          </div>
          <dl className="flex shrink-0 flex-wrap gap-2 text-sm">
            <Chip label="Average time" value={meta.timeComplexity.average} />
            <Chip label="Space" value={meta.spaceComplexity} />
          </dl>
        </div>

        <Suspense fallback={<div className="h-[640px] animate-pulse rounded-xl bg-white" aria-label="Loading visualiser" />}>
          <Explorer slug={slug} />
        </Suspense>

        <section className="mt-8 grid gap-4 lg:grid-cols-3" aria-label="Understanding it">
          <Card title="What stays true">
            <p>{invariant}</p>
            <p className="mt-2 text-sm text-gray-500">
              An invariant like this is what you would use to prove the algorithm correct, and the fastest way to
              predict its next step.
            </p>
          </Card>
          <Card title="When to use it">
            <p>{whenToUse}</p>
          </Card>
          <Card title="Cost and properties">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-gray-500">Best</dt>
              <dd className="font-mono">{meta.timeComplexity.best}</dd>
              <dt className="text-gray-500">Average</dt>
              <dd className="font-mono">{meta.timeComplexity.average}</dd>
              <dt className="text-gray-500">Worst</dt>
              <dd className="font-mono">{meta.timeComplexity.worst}</dd>
              <dt className="text-gray-500">Extra space</dt>
              <dd className="font-mono">{meta.spaceComplexity}</dd>
            </dl>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <Property on={properties.stable} yes="Stable" no="Not stable" />
              <Property on={properties.inPlace} yes="In place" no="Needs extra memory" />
              <Property on={properties.comparisonBased} yes="Comparison-based" no="No comparisons" />
            </ul>
          </Card>
        </section>
      </main>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5">
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="font-mono font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 text-gray-700 shadow-xs">
      <h2 className="mb-2 font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function Property({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <li className={`rounded-full px-2.5 py-1 ${on ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
      {on ? yes : no}
    </li>
  );
}

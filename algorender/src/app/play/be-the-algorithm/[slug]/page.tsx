import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft } from 'react-icons/fi';
import Header from '@/components/Header';
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
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href="/play/be-the-algorithm" className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
            <FiArrowLeft aria-hidden /> Be the algorithm
          </Link>
        </nav>
        <header className="mb-6 max-w-3xl">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Be the algorithm</div>
          <h1 className="text-3xl font-bold text-ink">Be {nameOf(slug).toLowerCase()}</h1>
          <p className="mt-2 text-ink-soft">Make every swap it makes, in order, then say when it is done. Select two bars and swap them.</p>
        </header>
        <BeTheAlgorithm slug={slug} />
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import Header from '@/components/Header';
import { DesignCanvas } from '@/components/design/DesignCanvas';
import { compact, pct, targetList } from '@/components/design/format';
import { caseStudies, getCaseStudy } from '@/content/designs';
import { Markdown } from '@/problems/ui/Markdown';
import type { CaseStudy } from '@/systems/design/types';

export function generateStaticParams() {
  return caseStudies.map((c) => ({ slug: c.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const study = getCaseStudy((await params).slug);
  if (!study) return {};
  return { title: `${study.title} | System design | Algorender`, description: `${study.summary} Design it on a canvas and check it against the targets with simulated traffic.` };
}

export default async function CaseStudyPage({ params }: Props) {
  const study = getCaseStudy((await params).slug);
  if (!study) notFound();
  const next = caseStudies[caseStudies.indexOf(study) + 1];

  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/design" className="mb-4 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
          <FiArrowLeft aria-hidden /> All case studies
        </Link>
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Brief study={study} />
          <div className="min-w-0">
            <DesignCanvas initial={study.start} study={study} />
          </div>
        </div>
        {next && (
          <p className="mt-8 text-sm">
            <Link href={`/design/${next.slug}`} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
              Next case: {next.title} <FiArrowRight aria-hidden />
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}

function Brief({ study }: { study: CaseStudy }) {
  const w = study.workload;
  return (
    <article aria-labelledby="study-title" className="space-y-5 self-start rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
      <header>
        <div className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Case study</div>
        <h1 id="study-title" className="mt-1 text-2xl font-bold text-ink">
          {study.title}
        </h1>
      </header>
      <Markdown text={study.brief} />
      <section aria-labelledby="requirements">
        <h2 id="requirements" className="text-sm font-semibold text-ink">
          Requirements
        </h2>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
          {study.requirements.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="traffic">
        <h2 id="traffic" className="text-sm font-semibold text-ink">
          Traffic
        </h2>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
          <li>{compact(w.rps)} requests a second, {pct(w.readShare)} of them reads</li>
          <li>
            {compact(w.keys)} distinct keys, {w.skew === 0 ? 'all equally popular' : w.skew >= 0.8 ? 'a few of them very hot' : 'some hotter than others'}
          </li>
          {w.spike && (
            <li>
              A spike to {w.spike.factor}× for {w.spike.seconds} s from {w.spike.at} s
            </li>
          )}
        </ul>
      </section>
      <section aria-labelledby="targets">
        <h2 id="targets" className="text-sm font-semibold text-ink">
          Targets
        </h2>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
          {targetList(study.targets).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}

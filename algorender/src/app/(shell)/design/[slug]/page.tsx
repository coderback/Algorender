import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowRight } from 'react-icons/fi';
import { PassedChip } from '@/components/design/CaseStudies';
import { DesignCanvas } from '@/components/design/DesignCanvas';
import { caseColour, compact, pct, targetList } from '@/components/design/format';
import { TrackCard } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES } from '@/data/tracks';
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
  const index = caseStudies.indexOf(study);
  const next = caseStudies[index + 1];

  return (
    <main className="flex flex-col gap-4 px-4 pb-6 md:px-0 md:pt-1">
      <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm md:flex">
        <Link href="/practice" className="font-semibold text-accent-ink hover:underline">
          Practice
        </Link>
        <span aria-hidden className="text-ink-faint">
          /
        </span>
        <Link href="/design" className="font-semibold text-accent-ink hover:underline">
          System design
        </Link>
        <span aria-hidden className="text-ink-faint">
          /
        </span>
        <span className="text-ink-muted">Case study {index + 1}</span>
      </nav>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Brief study={study} index={index} next={next} />
        <div className="min-w-0">
          <DesignCanvas initial={study.start} study={study} />
        </div>
      </div>
    </main>
  );
}

function Brief({ study, index, next }: { study: CaseStudy; index: number; next?: CaseStudy }) {
  const w = study.workload;
  const colour = caseColour(index);
  const c = TRACK_CLASSES[colour];
  return (
    <TrackCard track={colour} as="article" aria-labelledby="study-title" className="gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-surface/70 px-2.5 py-1 text-xs font-semibold">Case study {index + 1}</span>
        <PassedChip slug={study.slug} />
      </div>
      <h1 id="study-title" className={cx('font-display text-[30px] leading-[1.1] font-bold tracking-[-0.02em]', c.title)}>
        {study.title}
      </h1>
      <div className="text-[15px] leading-relaxed [&_a]:font-semibold [&_a]:underline">
        <Markdown text={study.brief} />
      </div>
      <section aria-labelledby="requirements" className="flex flex-col gap-1.5">
        <h2 id="requirements" className={cx('text-sm font-semibold', c.title)}>
          Requirements
        </h2>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
          {study.requirements.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="traffic" className="flex flex-col gap-1 rounded-well bg-surface/60 p-4 text-sm">
        <h2 id="traffic" className={cx('font-semibold', c.title)}>
          Traffic
        </h2>
        <p>
          {compact(w.rps)} requests a second, {pct(w.readShare)} reads
        </p>
        <p>
          {compact(w.keys)} distinct keys, {w.skew === 0 ? 'all equally popular' : w.skew >= 0.8 ? 'a few of them very hot' : 'some hotter than others'}
        </p>
        {w.spike && (
          <p>
            A spike to {w.spike.factor}× for {w.spike.seconds} s from {w.spike.at} s
          </p>
        )}
      </section>
      <section aria-labelledby="targets" className="flex flex-col gap-1 rounded-well bg-surface/60 p-4 text-sm">
        <h2 id="targets" className={cx('font-semibold', c.title)}>
          Targets
        </h2>
        <ul className="flex flex-col divide-y divide-surface/80">
          {targetList(study.targets).map((t, i) => (
            <li key={i} className="py-1.5">
              {t}
            </li>
          ))}
        </ul>
      </section>
      {next && (
        <Link href={`/design/${next.slug}`} className={cx('inline-flex items-center gap-1 text-sm font-semibold hover:underline', c.title)}>
          Next case: {next.title} <FiArrowRight aria-hidden />
        </Link>
      )}
    </TrackCard>
  );
}

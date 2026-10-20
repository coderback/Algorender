import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowRight, FiChevronRight } from 'react-icons/fi';
import { CaseStudies } from '@/components/design/CaseStudies';
import { targetList } from '@/components/design/format';
import { PracticeHeader } from '@/components/practice/PracticeHeader';
import { buttonClass } from '@/components/ui/Button';
import { caseStudies } from '@/content/designs';
import { drillRound } from '@/systems/design/estimation';

export const metadata: Metadata = {
  title: 'System design | Algorender',
  description:
    'Design systems on a canvas and run simulated traffic through them: load balancers, app servers, caches, databases with replicas and shards, queues and rate limiters, with p99 latency, errors and cost.',
};

export default function DesignPage() {
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PracticeHeader
        active="design"
        title="System design"
        intro="Wire up clients, servers, caches, queues and databases, then run real traffic through them. Each case teaches one trade-off."
      />

      <CaseStudies cases={caseStudies.map((c) => ({ slug: c.slug, title: c.title, summary: c.summary, targets: targetList(c.targets).length }))} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Link href="/design/sandbox" className="group flex flex-col gap-3 rounded-card bg-feature p-6 text-on-feature sm:p-7">
          <span className="text-eyebrow font-semibold text-track-teal-bar uppercase">Free canvas</span>
          <strong className="font-display text-[26px] leading-[1.15] font-bold">Build anything, set the traffic, crash machines, share it as a link</strong>
          <span className={buttonClass({ kind: 'onFeature' }) + ' mt-2 w-fit'}>
            Open the canvas <FiArrowRight aria-hidden className="transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
          </span>
        </Link>
        <Link href="/design/estimate" className="group flex flex-col gap-3 rounded-card bg-track-butter p-6 text-track-butter-ink sm:p-7">
          <span className="text-sm font-semibold">Estimation drills · {drillRound(1).length} questions</span>
          <strong className="font-display text-[26px] leading-[1.15] font-bold text-track-butter-title">Requests, storage and servers, to the nearest power of ten</strong>
          <span className={buttonClass({ kind: 'primary' }) + ' mt-2 w-fit'}>Start a drill</span>
        </Link>
      </div>

      <details className="group rounded-card bg-surface px-6 py-4 text-sm text-ink-soft">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <FiChevronRight aria-hidden className="transition-transform duration-150 ease-standard group-open:rotate-90" />
          How the simulator works
        </summary>
        <ul className="mt-3 mb-2 flex list-disc flex-col gap-1.5 pl-9 leading-relaxed">
          <li>Every request is simulated one by one, with seeded randomness, so the same design and seed always give the same numbers.</li>
          <li>Each server is a queue in front of a few workers: when requests arrive faster than the workers finish them, the queue grows and latency climbs long before the server is “full”.</li>
          <li>The cache is a real LRU or LFU cache that evicts keys, spread over nodes by consistent hashing; shards are placed the same way. The rate limiter is a token bucket.</li>
          <li>Replicas apply writes a little late, so a read there can return an old value: that is what “stale reads” counts. Writes that skip the cache leave stale copies in it too.</li>
          <li>Costs are rough monthly prices per machine, to compare designs rather than to budget.</li>
        </ul>
      </details>
    </main>
  );
}

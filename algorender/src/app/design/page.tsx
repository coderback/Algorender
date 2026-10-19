import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowRight, FiEdit3, FiHash } from 'react-icons/fi';
import Header from '@/components/Header';
import { targetList } from '@/components/design/format';
import { caseStudies } from '@/content/designs';

export const metadata: Metadata = {
  title: 'System design | Algorender',
  description:
    'Design systems on a canvas and run simulated traffic through them: load balancers, app servers, caches, databases with replicas and shards, queues and rate limiters, with p99 latency, errors and cost.',
};

export default function DesignPage() {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-8 max-w-3xl">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Systems</div>
          <h1 className="text-3xl font-bold text-ink">System design</h1>
          <p className="mt-2 text-ink-soft">
            Wire clients, load balancers, app servers, caches, databases and queues together, then run traffic through the design and watch what it does:
            latency at the median and the tail, errors, stale reads and cost, and what breaks when a machine crashes or traffic spikes.
          </p>
        </header>

        <section aria-labelledby="cases" className="mb-10">
          <h2 id="cases" className="mb-3 text-xl font-semibold text-ink">
            Case studies
          </h2>
          {caseStudies.length === 0 ? (
            <p className="text-ink-soft">Case studies with targets to meet are on their way. Until then, try the free canvas below.</p>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2">
              {caseStudies.map((c, i) => (
                <li key={c.slug}>
                  <Link href={`/design/${c.slug}`} className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line">
                    <span className="text-xs font-semibold text-ink-muted">Case {i + 1}</span>
                    <span className="font-semibold text-ink">{c.title}</span>
                    <span className="mt-1 text-sm text-ink-soft">{c.summary}</span>
                    <span className="mt-2 text-xs text-ink-muted">{targetList(c.targets).length} targets</span>
                    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-ink">
                      Design it <FiArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="more" className="mb-10">
          <h2 id="more" className="mb-3 text-xl font-semibold text-ink">
            Practise
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <Link href="/design/sandbox" className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <FiEdit3 aria-hidden className="text-accent-ink" /> Free canvas
                </span>
                <span className="mt-1 text-sm text-ink-soft">No targets: build anything, set the traffic yourself, crash machines and share the design as a link.</span>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-ink">
                  Open the canvas <FiArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
            <li>
              <Link href="/design/estimate" className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <FiHash aria-hidden className="text-accent-ink" /> Estimation drills
                </span>
                <span className="mt-1 text-sm text-ink-soft">Back-of-the-envelope practice: requests a second, storage and bandwidth from a few facts, to the nearest power of ten.</span>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-ink">
                  Start a drill <FiArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          </ul>
        </section>

        <details className="rounded-xl border border-line-soft bg-surface p-4 text-sm text-ink-soft">
          <summary className="cursor-pointer font-medium text-ink">How the simulator works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Every request is simulated one by one, with seeded randomness, so the same design and seed always give the same numbers.</li>
            <li>Each server is a queue in front of a few workers: when requests arrive faster than the workers finish them, the queue grows and latency climbs long before the server is “full”.</li>
            <li>The cache is a real LRU or LFU cache that evicts keys, spread over nodes by consistent hashing; shards are placed the same way. The rate limiter is a token bucket.</li>
            <li>Replicas apply writes a little late, so a read there can return an old value: that is what “stale reads” counts. Writes that skip the cache leave stale copies in it too.</li>
            <li>Costs are rough monthly prices per machine, to compare designs rather than to budget.</li>
          </ul>
        </details>
      </main>
    </div>
  );
}

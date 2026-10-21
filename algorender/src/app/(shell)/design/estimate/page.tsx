import type { Metadata } from 'next';
import Link from 'next/link';
import { EstimationRound } from '@/components/design/EstimationDrill';
import { DetailHeader } from '@/components/explorer/DetailHeader';
import { Card, TrackCard } from '@/components/ui/Card';
import { LATENCY_NUMBERS, LATENCY_SOURCE } from '@/systems/design/estimation';

export const metadata: Metadata = {
  title: 'Estimation drills | Algorender',
  description:
    'Back-of-the-envelope practice: requests a second from daily users, storage a year, bandwidth, servers and cache memory, judged to the nearest power of ten, with the latency numbers every engineer should know.',
};

export default function EstimatePage() {
  return (
    <main className="flex flex-col gap-5 px-4 pb-6 md:px-0 md:pt-1">
      <div className="flex flex-col gap-3">
        <DetailHeader root={{ href: '/design', label: 'System design' }} crumb="Estimation drills" title="Estimation drills" />
        <p className="max-w-[900px] text-base leading-relaxed text-ink-soft">
          Before designing a system, size it: how many requests a second, how much data, how many machines. The aim is the right power of ten in a
          minute, with round numbers you can multiply in your head. The{' '}
          <Link href="/learn/estimation" className="font-semibold text-accent-ink underline underline-offset-2 hover:no-underline">
            estimation lesson
          </Link>{' '}
          explains the method.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
        <EstimationRound initialSeed={1} />

        <aside className="flex min-w-0 flex-col gap-4">
          <TrackCard track="butter" as="section" aria-labelledby="how" className="gap-3">
            <h2 id="how" className="font-display text-title-card text-track-butter-title">
              How to estimate
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
              <li>Write down what you know, with units: users, actions a day, bytes each.</li>
              <li>Round everything to one significant figure or a power of ten. A day is about 10^5 seconds; a year about 400 days.</li>
              <li>Multiply the powers of ten and the leading digits separately: 5 × 10^7 users × 20 = 10^9 a day, so 10^4 a second.</li>
              <li>Provision for the peak, not the average, and leave headroom: servers run best well below 100%.</li>
              <li>Sanity-check against something you know, such as a server handling a few thousand simple requests a second.</li>
            </ul>
          </TrackCard>

          <Card aria-labelledby="verdicts" className="gap-3">
            <h2 id="verdicts" className="font-display text-title-card">
              Three verdicts
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="rounded-[14px] bg-good-soft px-3.5 py-2.5 text-good-ink">
                <span className="font-semibold text-good-title">Spot on:</span> within 2×, all an estimate needs.
              </li>
              <li className="rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-warn-ink">
                <span className="font-semibold text-warn-title">Right order of magnitude:</span> within 10×.
              </li>
              <li className="rounded-[14px] bg-bad-soft px-3.5 py-2.5 text-bad-ink">
                <span className="font-semibold text-bad-title">Off:</span> more than 10× out; the working shows the step that went astray.
              </li>
            </ul>
          </Card>

          <Card aria-labelledby="numbers" className="gap-3">
            <h2 id="numbers" className="font-display text-title-card">
              Latency numbers to know
            </h2>
            <p className="text-[13px] text-ink-muted">{LATENCY_SOURCE}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Approximate latencies of common operations, fastest first</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Operation
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      About
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LATENCY_NUMBERS.map((n) => (
                    <tr key={n.operation} className="border-b border-line-soft last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                        {n.operation}
                        {n.note && <span className="block text-xs text-ink-muted">{n.note}</span>}
                      </th>
                      <td className="py-2 text-right font-mono whitespace-nowrap text-ink">{n.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}

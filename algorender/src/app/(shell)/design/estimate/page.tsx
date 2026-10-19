import type { Metadata } from 'next';
import Link from 'next/link';
import { EstimationRound } from '@/components/design/EstimationDrill';
import { LATENCY_NUMBERS, LATENCY_SOURCE } from '@/systems/design/estimation';

export const metadata: Metadata = {
  title: 'Estimation drills | Algorender',
  description:
    'Back-of-the-envelope practice: requests a second from daily users, storage a year, bandwidth, servers and cache memory, judged to the nearest power of ten, with the latency numbers every engineer should know.',
};

export default function EstimatePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">System design</div>
        <h1 className="text-3xl font-bold text-ink">Estimation drills</h1>
        <p className="mt-2 text-ink-soft">
          Before designing a system, size it: how many requests a second, how much data, how many machines. The aim is the right power of ten
          in a minute, with round numbers you can multiply in your head. The{' '}
          <Link href="/learn/estimation" className="font-medium text-accent-ink underline decoration-accent-line underline-offset-2">
            estimation lesson
          </Link>{' '}
          explains the method.
        </p>
      </header>

      <section aria-labelledby="how" className="mb-8 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 id="how" className="mb-2 text-lg font-semibold text-ink">
          How to estimate
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>Write down what you know, with units: users, actions a day, bytes each.</li>
          <li>Round everything to one significant figure or a power of ten. A day is about 10^5 seconds; a year about 400 days.</li>
          <li>Multiply the powers of ten and the leading digits separately: 5 × 10^7 users × 20 = 10^9 a day, so 10^4 a second.</li>
          <li>Provision for the peak, not the average, and leave headroom: servers run best well below 100%.</li>
          <li>Sanity-check against something you know, such as a server handling a few thousand simple requests a second.</li>
        </ul>
      </section>

      <EstimationRound initialSeed={1} />

      <section aria-labelledby="numbers" className="mt-10">
        <h2 id="numbers" className="mb-2 text-lg font-semibold text-ink">
          Latency numbers to know
        </h2>
        <p className="mb-3 text-sm text-ink-soft">{LATENCY_SOURCE}</p>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Approximate latencies of common operations, fastest first</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  Operation
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  About
                </th>
              </tr>
            </thead>
            <tbody>
              {LATENCY_NUMBERS.map((n) => (
                <tr key={n.operation} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink">
                    {n.operation}
                    {n.note && <span className="block text-xs text-ink-muted">{n.note}</span>}
                  </th>
                  <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap text-ink">{n.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

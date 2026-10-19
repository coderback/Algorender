import type { Metadata } from 'next';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import Header from '@/components/Header';
import { DesignCanvas } from '@/components/design/DesignCanvas';
import { starterDesign } from '@/systems/design';

export const metadata: Metadata = {
  title: 'Free design canvas | System design | Algorender',
  description: 'Build a system from load balancers, app servers, caches, databases and queues, run simulated traffic through it and share it as a link.',
};

export default function SandboxPage() {
  return (
    <div className="min-h-screen bg-subtle">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/design" className="mb-4 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
          <FiArrowLeft aria-hidden /> System design
        </Link>
        <header className="mb-5 max-w-3xl">
          <h1 className="text-3xl font-bold text-ink">Free design canvas</h1>
          <p className="mt-2 text-ink-soft">
            Start from clients, a load balancer, two app servers and a database. Raise the traffic until something saturates, then add what fixes it:
            more instances, a cache, replicas, shards, a queue or a rate limiter. The link always holds your current design.
          </p>
        </header>
        <section aria-labelledby="canvas-title">
          <h2 id="canvas-title" className="sr-only">
            Your design
          </h2>
          <DesignCanvas initial={starterDesign()} />
        </section>
      </main>
    </div>
  );
}

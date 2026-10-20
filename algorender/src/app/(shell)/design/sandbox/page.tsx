import type { Metadata } from 'next';
import { DesignCanvas } from '@/components/design/DesignCanvas';
import { DetailHeader } from '@/components/explorer/DetailHeader';
import { starterDesign } from '@/systems/design';

export const metadata: Metadata = {
  title: 'Free design canvas | System design | Algorender',
  description: 'Build a system from load balancers, app servers, caches, databases and queues, run simulated traffic through it and share it as a link.',
};

export default function SandboxPage() {
  return (
    <main className="flex flex-col gap-5 px-4 pb-6 md:px-0 md:pt-1">
      <div className="flex flex-col gap-3">
        <DetailHeader root={{ href: '/design', label: 'System design' }} crumb="Free canvas" title="Free design canvas" />
        <p className="max-w-[900px] text-base leading-relaxed text-ink-soft">
          Start from clients, a load balancer, two app servers and a database. Raise the traffic until something saturates, then add what fixes it:
          more instances, a cache, replicas, shards, a queue or a rate limiter. The link always holds your current design.
        </p>
      </div>
      <section aria-labelledby="canvas-title">
        <h2 id="canvas-title" className="sr-only">
          Your design
        </h2>
        <DesignCanvas initial={starterDesign()} />
      </section>
    </main>
  );
}

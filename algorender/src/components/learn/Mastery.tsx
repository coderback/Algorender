'use client';

import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { FiArrowRight, FiAward, FiCompass, FiTrendingUp } from 'react-icons/fi';
import { useMastery, useProgressSnapshot } from '@/progress/hooks';
import { isReady, nextSteps, type ConceptMastery, type MasteryConcept, type MasteryGraph } from '@/progress/mastery';

// Mastery on the concept map: a status on every concept card and the next
// steps at the top, from the learner's own events. Everything waits for the
// progress store, so the server and first client render show none of it.

const GraphContext = createContext<MasteryGraph | null>(null);

export function MasteryProvider({ graph, children }: { graph: MasteryGraph; children: ReactNode }) {
  return <GraphContext.Provider value={graph}>{children}</GraphContext.Provider>;
}

function useGraph(): MasteryGraph {
  const graph = useContext(GraphContext);
  if (!graph) throw new Error('Mastery components need a <MasteryProvider>');
  return graph;
}

type Chip = { label: string; className: string; title: string };

function chipFor(m: ConceptMastery | undefined, ready: boolean): Chip | null {
  switch (m?.status) {
    case 'mastered':
      return { label: 'Mastered', className: 'bg-good-soft text-good-ink', title: 'Right answers from different questions, including one on a later day.' };
    case 'practised':
      return { label: 'Practised', className: 'bg-accent-soft text-accent-ink', title: 'Likely known. Answer it again on another day to master it.' };
    case 'learning':
      return { label: 'Learning', className: 'bg-warn-soft text-warn-ink', title: 'Started, not yet solid.' };
    case 'placed':
      return { label: 'Placed out', className: 'bg-sunken text-ink-soft', title: 'You showed this in the placement check.' };
    case 'assumed':
      return { label: 'Assumed known', className: 'bg-sunken text-ink-soft', title: 'You know something built on it, so it is taken as known.' };
    default:
      return ready ? { label: 'Ready to start', className: 'border border-accent-line text-accent-ink', title: 'Everything it builds on is known.' } : null;
  }
}

/** A concept's mastery status, for its card on the concept map. */
export function ConceptStatus({ id }: { id: string }) {
  const graph = useGraph();
  const { ready } = useProgressSnapshot();
  const m = useMastery(graph);
  if (!ready) return null;
  const chip = chipFor(m.get(id), isReady(id, m, graph));
  if (!chip) return null;
  return (
    <span title={chip.title} data-status={m.get(id)?.status} className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>
      {chip.label}
    </span>
  );
}

/** Where a concept is learned: its lesson, else its first visualiser, else its card. */
export function conceptHref(c: MasteryConcept): string {
  return c.lesson ? `/learn/${c.lesson}` : c.visualisers[0] ? `/visualisers/${c.visualisers[0]}` : `/learn#${c.id}`;
}

/** The top of the concept map: what to learn next, or an invitation to the placement check. */
export function NextSteps() {
  const graph = useGraph();
  const { ready, events } = useProgressSnapshot();
  const m = useMastery(graph);
  if (!ready) return null;
  const placedBefore = events.some((e) => e.kind === 'placement.answered');
  const counts = { mastered: 0, practised: 0, learning: 0, known: 0 };
  for (const x of m.values()) {
    if (x.status === 'mastered') counts.mastered++;
    else if (x.status === 'practised') counts.practised++;
    else if (x.status === 'learning') counts.learning++;
    else if (x.status === 'placed' || x.status === 'assumed') counts.known++;
  }
  const fresh = counts.mastered + counts.practised + counts.learning + counts.known === 0 && !placedBefore;
  const steps = nextSteps(m, graph, { limit: 3 });

  return (
    <section aria-labelledby="next-steps" className="mb-10 rounded-2xl border border-line-soft bg-surface p-5 shadow-xs">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="next-steps" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <FiCompass aria-hidden className="text-accent-ink" /> {fresh ? 'Where to start' : 'Your next steps'}
        </h2>
        {!fresh && (
          <p className="text-sm text-ink-muted">
            <FiAward aria-hidden className="mr-1 inline" />
            {counts.mastered} mastered · {counts.practised} practised · {counts.learning} in progress
            {counts.known > 0 && ` · ${counts.known} placed out`}
          </p>
        )}
      </div>
      {fresh && (
        <p className="mb-4 max-w-2xl text-sm text-ink-soft">
          New here? A short placement check asks a few questions and skips what you already know, so you start at the edge of what you know. Or
          begin with one of these.
        </p>
      )}
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map(({ concept, reason }) => (
          <li key={concept.id}>
            <Link
              href={conceptHref(concept)}
              className="group flex h-full flex-col rounded-xl border border-line p-3 hover:border-accent-line hover:bg-accent-soft"
            >
              <span className="text-xs text-ink-muted">{reason === 'continue' ? 'Pick up where you left off' : 'Ready: you know what it builds on'}</span>
              <span className="mt-0.5 font-medium text-ink">{concept.title}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-accent-ink">
                {concept.lesson ? 'Open the lesson' : concept.visualisers.length ? 'Open the visualiser' : 'See it on the map'} <FiArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/learn/placement"
          className={
            fresh
              ? 'inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong'
              : 'inline-flex items-center gap-1.5 text-accent-ink underline-offset-2 hover:underline'
          }
        >
          <FiTrendingUp aria-hidden /> {fresh ? 'Take the placement check' : 'Retake the placement check'}
        </Link>
        {!fresh && <span className="text-ink-muted">Mastery needs right answers from different questions, again on a later day.</span>}
      </div>
    </section>
  );
}

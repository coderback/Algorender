'use client';

import { displayStatus, StatusChip } from '@/components/ui/Chip';
import { useMastery, useProgressSnapshot } from '@/progress/hooks';
import { isReady, type MasteryGraph } from '@/progress/mastery';

/** The learner's status on a concept, once their progress has loaded; nothing while it is "not yet". */
export function ConceptStatus({ graph, concept }: { graph: MasteryGraph; concept: string }) {
  const { ready } = useProgressSnapshot();
  const m = useMastery(graph);
  if (!ready) return null;
  const status = displayStatus(m.get(concept)?.status ?? 'new', isReady(concept, m, graph));
  return status === 'locked' ? null : <StatusChip status={status} className="px-3 py-[5px] text-[13px]" />;
}

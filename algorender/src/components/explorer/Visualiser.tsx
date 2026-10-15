'use client';

import { useRef, useSyncExternalStore } from 'react';
import { getModule } from '@/registry';
import { AlgorithmExplorer } from './AlgorithmExplorer';
import { StructureExplorer } from './StructureExplorer';

const noopSubscribe = () => () => {};

/** False during server render and hydration, true once event handlers are live. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Interactive part of a visualiser page: picks the explorer for the module's kind. */
export function Visualiser({ slug }: { slug: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const visualiser = getModule(slug);
  if (!visualiser) throw new Error(`No trace-engine visualiser for "${slug}"`);

  return (
    <div ref={rootRef} data-hydrated={hydrated} className="scroll-mt-24">
      {visualiser.kind === 'algorithm' ? (
        <AlgorithmExplorer
          module={visualiser}
          onScrollTop={() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      ) : (
        <StructureExplorer module={visualiser} />
      )}
    </div>
  );
}

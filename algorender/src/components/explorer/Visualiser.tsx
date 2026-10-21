'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { TrackColour } from '@/data/tracks';
import { getModule } from '@/registry';
import { AlgorithmExplorer } from './AlgorithmExplorer';
import type { ExplorerOptions } from './options';
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

export type VisualiserProps = {
  slug: string;
  /**
   * page: the full visualiser page (state lives in the URL).
   * embed: an iframe embed (state in the iframe's URL, no "Try this").
   * lesson: one of several on a lesson page: starts from `settings`, never
   * touches the URL, and keeps its keyboard shortcuts to itself.
   */
  variant?: 'page' | 'embed' | 'lesson';
  /** Lesson only: URL-style settings, e.g. { preset: 'sorted', n: '8', mode: 'predict' }. */
  settings?: Record<string, string>;
  /** Lesson only: show the input panel so the learner can change the input. */
  showInput?: boolean;
  onPrediction?: (correct: boolean) => void;
  /** Page only: the track colour, the race link and the explainer cards (see ExplorerOptions). */
  colour?: TrackColour;
  next?: { href: string; label: string };
  details?: ReactNode;
};

/** Interactive part of a visualiser: picks the explorer for the module's kind. */
export function Visualiser({ slug, variant = 'page', settings, showInput = false, onPrediction, colour, next, details }: VisualiserProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const pageParams = useSearchParams();
  const visualiser = getModule(slug);
  if (!visualiser) throw new Error(`No trace-engine visualiser for "${slug}"`);

  const lesson = variant === 'lesson';
  const settingsKey = JSON.stringify(settings ?? {});
  const options: ExplorerOptions = useMemo(
    () => ({
      params: lesson ? new URLSearchParams(JSON.parse(settingsKey)) : new URLSearchParams(pageParams.toString()),
      syncUrl: !lesson,
      keyboard: lesson ? 'local' : 'page',
      layout: lesson ? 'stacked' : 'wide',
      showInput: lesson ? showInput : variant === 'page',
      showExperiments: variant === 'page',
      panels: variant !== 'embed',
      sheet: variant === 'page',
      colour,
      next,
      details,
      // Lessons ask at every decision: the prediction is the exercise.
      density: lesson ? 'all' : 'some',
      devicePrefs: variant === 'page',
      onPrediction,
    }),
    // The starting state is read once; later URL changes are the explorer's own writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson, settingsKey, showInput, variant, onPrediction, colour, next, details],
  );

  return (
    <div ref={rootRef} data-hydrated={hydrated}>
      {visualiser.kind === 'algorithm' ? (
        <AlgorithmExplorer
          module={visualiser}
          options={options}
          onScrollTop={() =>
            rootRef.current?.scrollIntoView({
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
              block: 'start',
            })
          }
        />
      ) : (
        <StructureExplorer module={visualiser} options={options} />
      )}
    </div>
  );
}

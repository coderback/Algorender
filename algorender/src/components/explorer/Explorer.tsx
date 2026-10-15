'use client';

import { MotionConfig } from 'motion/react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { FiZap } from 'react-icons/fi';
import { getAlgorithm } from '@/algorithms';
import type { ArrayAlgorithm } from '@/algorithms/types';
import { PRESET_LABELS, randomSeed, type ArrayPreset } from '@/engine/random';
import { recordTrace } from '@/engine/trace';
import type { Trace } from '@/engine/types';
import { usePlayerKeyboard, useTracePlayer } from '@/engine/useTracePlayer';
import { ArrayView } from '@/viz/array/ArrayView';
import type { ArrayState } from '@/viz/array/types';
import { InputPanel } from './InputPanel';
import { CodePanel, Legend, Narration, StatsPanel, VarsPanel } from './panels';
import { PlayerControls } from './PlayerControls';
import { inputFor, sourceFromParams, sourceToParams, type InputSource } from './source';

/** Interactive explorer for an algorithm ported to the trace engine. */
export function Explorer({ slug }: { slug: string }) {
  const algo = getAlgorithm(slug);
  if (!algo) throw new Error(`No trace-engine algorithm for "${slug}"`);

  const params = useSearchParams();
  const [initial] = useState(() => ({
    source: sourceFromParams(new URLSearchParams(params.toString()), algo.input),
    step: Math.max(0, Number(params.get('step')) || 0),
  }));
  const [source, setSource] = useState<InputSource>(initial.source);

  const trace = useMemo(() => recordTrace(algo.run(inputFor(source, algo.input))), [algo, source]);

  const rootRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();

  const changeSource = (next: InputSource) => {
    setSource(next);
    window.history.replaceState(null, '', `?${sourceToParams(next)}`);
  };

  const tryPreset = (preset: ArrayPreset) => {
    changeSource({ kind: 'preset', preset, size: algo.input.defaultSize, seed: randomSeed() });
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} data-hydrated={hydrated} className="scroll-mt-24 space-y-4">
      {/* Remount the stage for each new input so playback restarts cleanly. */}
      <Stage
        key={JSON.stringify(source)}
        algo={algo}
        trace={trace}
        initialIndex={source === initial.source ? initial.step : 0}
      />
      <InputPanel spec={algo.input} source={source} onChange={changeSource} />
      <Experiments algo={algo} onTry={tryPreset} />
    </div>
  );
}

const noopSubscribe = () => () => {};

/** False during server render and hydration, true once event handlers are live. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function Stage({ algo, trace, initialIndex }: { algo: ArrayAlgorithm; trace: Trace<ArrayState>; initialIndex: number }) {
  const player = useTracePlayer(trace.frames.length, initialIndex);
  usePlayerKeyboard(player);
  const frame = trace.frames[player.index];

  return (
    <MotionConfig transition={{ duration: player.tweenMs / 1000, ease: [0.4, 0, 0.2, 1] }} reducedMotion="user">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="min-w-0 space-y-3">
          <div
            className="rounded-xl border border-gray-100 bg-white px-3 pt-4 pb-3 shadow-xs sm:px-6"
            style={{ '--tween': `${player.tweenMs}ms` } as CSSProperties}
          >
            <ArrayView state={frame.state} />
          </div>
          <Narration note={frame.note} live={!player.playing} />
          <PlayerControls player={player} />
          {trace.truncated && (
            <p className="text-sm text-amber-700">This run was cut short because it produced too many steps. Try a smaller input.</p>
          )}
        </div>
        <aside className="min-w-0 space-y-3">
          <CodePanel lines={algo.pseudocode} current={frame.line} />
          <StatsPanel stats={algo.stats} values={frame.stats} />
          <VarsPanel vars={frame.vars} />
          <Legend marks={algo.legend} />
        </aside>
      </div>
    </MotionConfig>
  );
}

function Experiments({ algo, onTry }: { algo: ArrayAlgorithm; onTry: (preset: ArrayPreset) => void }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <FiZap aria-hidden className="text-amber-500" /> Try this
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {algo.content.experiments.map((x) => (
          <li key={x.preset}>
            <button
              type="button"
              onClick={() => onTry(x.preset)}
              className="h-full w-full rounded-lg border border-gray-200 p-3 text-left text-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="mb-1 block font-medium text-blue-700">{PRESET_LABELS[x.preset]} input →</span>
              <span className="text-gray-600">{x.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

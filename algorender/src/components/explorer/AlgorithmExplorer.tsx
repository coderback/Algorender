'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FiZap } from 'react-icons/fi';
import type { AnyAlgorithm } from '@/engine/module';
import { randomSeed } from '@/engine/random';
import { recordTrace } from '@/engine/trace';
import { InputPanel } from './InputPanel';
import { inputFor, sourceFromParams, sourceToParams, type InputSource } from './source';
import { TraceStage, type Density, type Mode } from './TraceStage';
import { modeFromParams, stepFromParams, writeUrl } from './url';

/** Runs an algorithm on a chosen input and replays its trace. */
export function AlgorithmExplorer({ module: algo, onScrollTop }: { module: AnyAlgorithm; onScrollTop: () => void }) {
  const params = useSearchParams();
  const [initial] = useState(() => {
    const p = new URLSearchParams(params.toString());
    return { source: sourceFromParams(p, algo.input), step: stepFromParams(p), mode: modeFromParams(p) };
  });
  const [source, setSource] = useState<InputSource>(initial.source);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [density, setDensity] = useState<Density>('some');

  const trace = useMemo(() => recordTrace(algo.run(inputFor(source, algo.input))), [algo, source]);

  const changeSource = (next: InputSource) => {
    setSource(next);
    writeUrl(sourceToParams(next), mode);
  };
  const changeMode = (next: Mode) => {
    setMode(next);
    writeUrl(sourceToParams(source), next);
  };
  const tryExample = (example: string) => {
    changeSource({ kind: 'example', example, size: algo.input.size?.default ?? 0, seed: randomSeed() });
    onScrollTop();
  };

  return (
    <div className="space-y-4">
      {/* Remount the stage for each new input so playback restarts cleanly. Mode
          changes don't remount: the predict gate reacts to them in place. */}
      <TraceStage
        key={JSON.stringify(source)}
        trace={trace}
        view={algo.view}
        pseudocode={algo.pseudocode}
        stats={algo.stats}
        legend={algo.legend}
        initialIndex={source === initial.source ? initial.step : 0}
        predict={{ mode, density, setMode: changeMode, setDensity }}
      />
      <InputPanel spec={algo.input} source={source} onChange={changeSource} />
      <Experiments algo={algo} onTry={tryExample} />
    </div>
  );
}

function Experiments({ algo, onTry }: { algo: AnyAlgorithm; onTry: (example: string) => void }) {
  if (algo.content.experiments.length === 0) return null;
  const labels = new Map(algo.input.examples.map((e) => [e.id, e.label]));
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <FiZap aria-hidden className="text-amber-500" /> Try this
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {algo.content.experiments.map((x) => (
          <li key={x.example}>
            <button
              type="button"
              onClick={() => onTry(x.example)}
              className="h-full w-full rounded-lg border border-gray-200 p-3 text-left text-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="mb-1 block font-medium text-blue-700">{labels.get(x.example) ?? x.example} input →</span>
              <span className="text-gray-600">{x.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

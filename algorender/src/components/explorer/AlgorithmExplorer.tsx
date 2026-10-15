'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { AnyAlgorithm } from '@/engine/module';
import { randomSeed } from '@/engine/random';
import { recordTrace } from '@/engine/trace';
import { Experiments } from './Experiments';
import { InputPanel } from './InputPanel';
import { inputFor, sourceFromParams, sourceToParams, type InputSource } from './source';
import { TraceStage, type Density, type Mode } from './TraceStage';
import { modeFromParams, stepFromParams, writeUrl } from './url';

/** Runs an algorithm on a chosen input and replays its trace. */
export function AlgorithmExplorer({
  module: algo,
  variant = 'page',
  onScrollTop,
}: {
  module: AnyAlgorithm;
  variant?: 'page' | 'embed';
  onScrollTop: () => void;
}) {
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
      {variant === 'page' && (
        <Experiments
          suffix="input"
          items={algo.content.experiments.map((x) => ({
            key: x.example,
            label: algo.input.examples.find((e) => e.id === x.example)?.label ?? x.example,
            prompt: x.prompt,
            onTry: () => tryExample(x.example),
          }))}
        />
      )}
    </div>
  );
}

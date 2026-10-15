'use client';

import { MotionConfig } from 'motion/react';
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { LegendEntry, StatSpec, ViewKind } from '@/engine/module';
import type { Trace } from '@/engine/types';
import { usePlayerKeyboard, useTracePlayer } from '@/engine/useTracePlayer';
import { VIEWS } from '@/viz/views';
import { CodePanel, Legend, Narration, StatsPanel, VarsPanel } from './panels';
import { PlayerControls } from './PlayerControls';
import { PredictCard } from './PredictCard';

export type Mode = 'watch' | 'predict';
export type Density = 'all' | 'some';

/** Predict mode asks at every 3rd decision on "some", unless there are only a few. */
const SOME_EVERY = 3;
const FEW = 8;

export type PredictSettings = {
  mode: Mode;
  density: Density;
  setMode: (mode: Mode) => void;
  setDensity: (density: Density) => void;
};

/**
 * Plays one recorded trace: the view, narration or prediction prompt, player
 * controls, and the synced pseudo-code, stats, variables and legend. Remount it
 * (via `key`) for each new trace.
 */
export function TraceStage<S>({
  trace,
  view,
  pseudocode,
  stats,
  legend,
  initialIndex = 0,
  predict,
  autoPlay = false,
}: {
  trace: Trace<S>;
  view: ViewKind;
  pseudocode: readonly string[];
  stats: readonly StatSpec[];
  legend: readonly LegendEntry[];
  initialIndex?: number;
  predict: PredictSettings;
  autoPlay?: boolean;
}) {
  const View = VIEWS[view];
  const [answers, setAnswers] = useState<ReadonlyMap<number, number>>(new Map());

  // Frames whose checkpoint is asked in Predict mode.
  const asked = useMemo(() => {
    const withCheckpoint = trace.frames.flatMap((f, i) => (f.checkpoint ? [i] : []));
    const thin = predict.density === 'some' && withCheckpoint.length > FEW;
    return new Set(thin ? withCheckpoint.filter((_, k) => k % SOME_EVERY === 0) : withCheckpoint);
  }, [trace, predict.density]);

  const predicting = predict.mode === 'predict';
  const gate = useCallback((i: number) => predicting && asked.has(i) && !answers.has(i), [predicting, asked, answers]);
  const player = useTracePlayer(trace.frames.length, { initialIndex, gate, autoPlay });
  usePlayerKeyboard(player);
  const frame = trace.frames[player.index];
  const question = predicting && asked.has(player.index) ? frame.checkpoint : undefined;

  const answer = useCallback(
    (choice: number) => setAnswers((prev) => new Map(prev).set(player.index, choice)),
    [player.index],
  );
  const answered = [...answers].filter(([i]) => trace.frames[i].checkpoint);
  const correct = answered.filter(([i, c]) => trace.frames[i].checkpoint!.answer === c).length;

  return (
    <MotionConfig transition={{ duration: player.tweenMs / 1000, ease: [0.4, 0, 0.2, 1] }} reducedMotion="user">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="min-w-0 space-y-3">
          <div
            className="rounded-xl border border-gray-100 bg-white px-3 pt-4 pb-3 shadow-xs sm:px-6"
            style={{ '--tween': `${player.tweenMs}ms` } as CSSProperties}
          >
            <View state={frame.state} />
          </div>
          <Narration note={frame.note} live={!player.playing} />
          {question && <PredictCard key={player.index} checkpoint={question} chosen={answers.get(player.index)} onAnswer={answer} />}
          <PlayerControls player={player}>
            <ModeSwitch predict={predict} hasQuestions={asked.size > 0} score={{ correct, total: answered.length }} />
          </PlayerControls>
          {trace.truncated && (
            <p className="text-sm text-amber-700">This run was cut short because it produced too many steps. Try a smaller input.</p>
          )}
        </div>
        <aside className="min-w-0 space-y-3">
          <CodePanel lines={pseudocode} current={frame.line} />
          {stats.length > 0 && <StatsPanel stats={stats} values={frame.stats} />}
          <VarsPanel vars={frame.vars} />
          <Legend entries={legend} />
        </aside>
      </div>
    </MotionConfig>
  );
}

function ModeSwitch({
  predict,
  hasQuestions,
  score,
}: {
  predict: PredictSettings;
  hasQuestions: boolean;
  score: { correct: number; total: number };
}) {
  if (!hasQuestions) return null;
  const option = (mode: Mode, label: ReactNode) => (
    <button
      type="button"
      aria-pressed={predict.mode === mode}
      onClick={() => predict.setMode(mode)}
      className={`px-2.5 py-1 text-xs transition-colors ${
        predict.mode === mode ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-gray-200" role="group" aria-label="Mode">
        {option('watch', 'Watch')}
        {option('predict', 'Predict')}
      </div>
      {predict.mode === 'predict' && (
        <>
          <select
            value={predict.density}
            onChange={(e) => predict.setDensity(e.target.value as Density)}
            aria-label="How often to ask"
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700"
          >
            <option value="some">Ask sometimes</option>
            <option value="all">Ask at every decision</option>
          </select>
          <span className="font-mono text-xs text-gray-600" aria-label="Predictions correct">
            {score.correct}/{score.total} right
          </span>
        </>
      )}
    </div>
  );
}

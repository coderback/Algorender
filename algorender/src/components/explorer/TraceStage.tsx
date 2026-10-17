'use client';

import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LegendEntry, StatSpec, ViewKind } from '@/engine/module';
import type { Trace } from '@/engine/types';
import { usePlayerKeyboard, useTracePlayer } from '@/engine/useTracePlayer';
import { ViewEditContext, type ViewEdit } from '@/viz/edit';
import { VIEWS } from '@/viz/views';
import { CodePanel, Legend, Narration, StatsPanel, VarsPanel } from './panels';
import { PlayerControls } from './PlayerControls';
import { PredictCard } from './PredictCard';

export type Mode = 'watch' | 'predict';

const NO_ANSWERS: ReadonlyMap<number, number> = new Map();
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
  keyboard = 'page',
  layout = 'wide',
  onPrediction,
  code,
  share = true,
  onFrame,
  edit,
  live = false,
}: {
  trace: Trace<S>;
  view: ViewKind;
  pseudocode: readonly string[];
  stats: readonly StatSpec[];
  legend: readonly LegendEntry[];
  initialIndex?: number;
  predict: PredictSettings;
  autoPlay?: boolean;
  /** 'local': shortcuts only act while focus is inside this stage (several stages on one page). */
  keyboard?: 'page' | 'local';
  /** 'stacked' keeps one column at every width, for narrow containers such as lessons. */
  layout?: 'wide' | 'stacked';
  /** Called once per answered prediction. */
  onPrediction?: (correct: boolean) => void;
  /** How to title and number the code panel; defaults suit pseudo-code. */
  code?: { title: string; numberAll?: boolean };
  /** Show the copy-link and embed buttons (off for a learner's own run). */
  share?: boolean;
  /** Called with the frame index whenever it changes, e.g. to keep an editor's line highlight in step. */
  onFrame?: (index: number) => void;
  /** Lets the view's handles change the input (see InputSpec.drag). */
  edit?: ViewEdit;
  /** True while a handle is being dragged: the view follows the pointer with no tween. */
  live?: boolean;
}) {
  const View = VIEWS[view];
  // Answers belong to the trace they were given on: a drag records a new trace in place, and its questions start fresh.
  const [given, setGiven] = useState<{ trace: Trace<S>; answers: ReadonlyMap<number, number> }>(() => ({ trace, answers: NO_ANSWERS }));
  const answers = given.trace === trace ? given.answers : NO_ANSWERS;

  // Frames whose checkpoint is asked in Predict mode.
  const asked = useMemo(() => {
    const withCheckpoint = trace.frames.flatMap((f, i) => (f.checkpoint ? [i] : []));
    const thin = predict.density === 'some' && withCheckpoint.length > FEW;
    return new Set(thin ? withCheckpoint.filter((_, k) => k % SOME_EVERY === 0) : withCheckpoint);
  }, [trace, predict.density]);

  const predicting = predict.mode === 'predict';
  const gate = useCallback((i: number) => predicting && asked.has(i) && !answers.has(i), [predicting, asked, answers]);
  const player = useTracePlayer(trace.frames.length, { initialIndex, gate, autoPlay });
  const rootRef = useRef<HTMLDivElement>(null);
  usePlayerKeyboard(player, keyboard === 'local' ? rootRef : undefined);
  const frame = trace.frames[player.index];
  const tweenMs = live ? 0 : player.tweenMs;
  useEffect(() => {
    onFrame?.(player.index);
  }, [onFrame, player.index]);
  const question = predicting && asked.has(player.index) ? frame.checkpoint : undefined;

  const answer = useCallback(
    (choice: number) => {
      if (answers.has(player.index)) return;
      setGiven({ trace, answers: new Map(answers).set(player.index, choice) });
      onPrediction?.(choice === trace.frames[player.index].checkpoint?.answer);
    },
    [answers, player.index, onPrediction, trace],
  );
  const answered = [...answers].filter(([i]) => trace.frames[i].checkpoint);
  const correct = answered.filter(([i, c]) => trace.frames[i].checkpoint!.answer === c).length;

  return (
    <MotionConfig transition={{ duration: tweenMs / 1000, ease: [0.4, 0, 0.2, 1] }} reducedMotion="user">
      <div
        ref={rootRef}
        // Focusable so that clicking anywhere in a local-keyboard stage makes its shortcuts active.
        tabIndex={keyboard === 'local' ? -1 : undefined}
        className={`grid gap-4 outline-none ${layout === 'wide' ? 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]' : ''}`}
      >
        <div className="min-w-0 space-y-3">
          <div
            className="rounded-xl border border-line-soft bg-surface px-3 pt-4 pb-3 shadow-xs sm:px-6"
            style={{ '--tween': `${tweenMs}ms` } as CSSProperties}
          >
            <ViewEditContext value={edit ?? null}>
              <View state={frame.state} />
            </ViewEditContext>
          </div>
          <Narration note={frame.note} live={!player.playing} />
          {question && (
            <PredictCard
              key={player.index}
              checkpoint={question}
              chosen={answers.get(player.index)}
              onAnswer={answer}
              scope={keyboard === 'local' ? rootRef : undefined}
            />
          )}
          <PlayerControls player={player} share={share}>
            <ModeSwitch predict={predict} hasQuestions={asked.size > 0} score={{ correct, total: answered.length }} />
          </PlayerControls>
          {trace.truncated && (
            <p className="text-sm text-warn-ink">This run was cut short because it produced too many steps. Try a smaller input.</p>
          )}
        </div>
        <aside className={layout === 'wide' ? 'min-w-0 space-y-3' : 'grid min-w-0 gap-3 md:grid-cols-2 md:items-start'}>
          <CodePanel lines={pseudocode} current={frame.line} title={code?.title} numberAll={code?.numberAll} />
          {stats.length > 0 && <StatsPanel stats={stats} values={frame.stats} />}
          {/* The memory view draws every name itself. */}
          {view !== 'memory' && <VarsPanel vars={frame.vars} />}
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
        predict.mode === mode ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label="Mode">
        {option('watch', 'Watch')}
        {option('predict', 'Predict')}
      </div>
      {predict.mode === 'predict' && (
        <>
          <select
            value={predict.density}
            onChange={(e) => predict.setDensity(e.target.value as Density)}
            aria-label="How often to ask"
            className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink-soft"
          >
            <option value="some">Ask sometimes</option>
            <option value="all">Ask at every decision</option>
          </select>
          <span className="font-mono text-xs text-ink-soft" aria-label="Predictions correct">
            {score.correct}/{score.total} right
          </span>
        </>
      )}
    </div>
  );
}

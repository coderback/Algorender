'use client';

import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FiChevronUp, FiEye, FiHelpCircle } from 'react-icons/fi';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cx } from '@/components/ui/cx';
import { Segmented } from '@/components/ui/Segmented';
import type { LegendEntry, StatSpec, ViewKind } from '@/engine/module';
import type { Trace } from '@/engine/types';
import { usePlayerKeyboard, useTracePlayer } from '@/engine/useTracePlayer';
import { useStartSpeed } from '@/lib/preferences';
import { stageCaption } from '@/viz/captions';
import { ViewEditContext, type ViewEdit } from '@/viz/edit';
import { VIEWS } from '@/viz/views';
import { CodePanel, CountsPanel, Legend, Narration } from './panels';
import { PlayerControls } from './PlayerControls';
import { PredictCard } from './PredictCard';
import { StageWell } from './StageWell';

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
  toolbar,
  panels = true,
  sheet = false,
  hint,
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
  /** Controls at the right of the stage's toolbar (the input and its Edit and Reset). */
  toolbar?: ReactNode;
  /** The code, counts and legend beside the stage; an embed shows the stage alone. */
  panels?: boolean;
  /** Phones: tuck the panels into a bottom sheet behind a code peek (the visualiser page). */
  sheet?: boolean;
  /** The keyboard hint under the player. */
  hint?: string;
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
  const startSpeed = useStartSpeed();
  const player = useTracePlayer(trace.frames.length, { initialIndex, gate, autoPlay, startSpeed });
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const wide = layout === 'wide';
  const side = (
    <>
      <CodePanel lines={pseudocode} current={frame.line} title={code?.title} numberAll={code?.numberAll} />
      {/* The memory view draws every name itself. */}
      <CountsPanel stats={stats} values={frame.stats} vars={view !== 'memory' ? frame.vars : undefined} />
      <Legend entries={legend} />
    </>
  );
  const modeSwitch = <ModeSwitch predict={predict} hasQuestions={asked.size > 0} score={{ correct, total: answered.length }} />;

  return (
    <MotionConfig transition={{ duration: tweenMs / 1000, ease: [0.4, 0, 0.2, 1] }} reducedMotion="user">
      <div
        ref={rootRef}
        // Focusable so that clicking anywhere in a local-keyboard stage makes its shortcuts active.
        tabIndex={keyboard === 'local' ? -1 : undefined}
        className={cx('grid items-start gap-4 outline-none', wide && panels && 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]')}
      >
        <div
          ref={cardRef}
          // In full screen the card fills the screen and scrolls; the narration and player come with it.
          className="flex min-w-0 flex-col gap-3.5 rounded-card bg-surface p-3 sm:p-[18px] [&:fullscreen]:overflow-y-auto [&:fullscreen]:rounded-none [&:fullscreen]:p-6"
        >
          {(asked.size > 0 || toolbar) && (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {modeSwitch}
              {toolbar && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
            </div>
          )}
          {/* The stage well (V0), with its caption and view tools. */}
          <StageWell caption={stageCaption(view, frame.state)} card={cardRef} style={{ '--tween': `${tweenMs}ms` } as CSSProperties}>
            <ViewEditContext value={edit ?? null}>
              <View state={frame.state} />
            </ViewEditContext>
          </StageWell>
          {/* Banners sit under the stage, in feedback colours, with the reason. */}
          {trace.truncated && (
            <p className="rounded-well bg-warn-soft px-4 py-2.5 text-[13px] font-semibold text-warn-title">
              Stopped at {trace.frames.length.toLocaleString()} steps. Try a smaller input to see it all.
            </p>
          )}
          <Narration note={frame.note} live={!player.playing} step={player.index + 1} />
          {question && (
            <PredictCard
              key={player.index}
              checkpoint={question}
              chosen={answers.get(player.index)}
              onAnswer={answer}
              scope={keyboard === 'local' ? rootRef : undefined}
              step={player.index + 1}
            />
          )}
          <PlayerControls player={player} share={share} hint={hint ?? (predicting ? '← → step · Space play · Home / End jump · number keys answer' : undefined)} />
          {panels && sheet && wide && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              data-sticks="bottom"
              className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 rounded-t-[28px] bg-code px-5 pt-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))] text-left text-code-ink lg:hidden"
            >
              <span aria-hidden className="mx-auto h-1 w-9 rounded-full bg-code-muted/60" />
              <span className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[13px] font-semibold tracking-[0.06em] text-code-muted uppercase">{code?.title ?? 'Pseudo-code'}</span>
                <span className="inline-flex items-center gap-1 text-code-muted">
                  {stats.map((st) => `${frame.stats[st.key] ?? 0} ${st.label.toLowerCase()}`).join(' · ') || 'Code, counts and legend'}
                  <FiChevronUp aria-hidden />
                </span>
              </span>
              {frame.line != null && pseudocode[frame.line] != null && (
                <span className="truncate rounded-[10px] bg-code-highlight px-2.5 py-1.5 font-mono text-[13px]">{pseudocode[frame.line].trim()}</span>
              )}
            </button>
          )}
        </div>
        {panels && (
          <aside className={cx('min-w-0 gap-3', wide ? cx('flex-col', sheet ? 'hidden lg:flex' : 'flex') : 'grid md:grid-cols-2 md:items-start')}>{side}</aside>
        )}
        {panels && sheet && wide && (
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Code and state" className="lg:hidden">
            {sheetOpen && <div className="flex flex-col gap-3">{side}</div>}
          </BottomSheet>
        )}
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Mode"
        size="m"
        value={predict.mode}
        onChange={predict.setMode}
        options={[
          { value: 'watch', label: 'Watch', icon: <FiEye aria-hidden /> },
          { value: 'predict', label: 'Predict', icon: <FiHelpCircle aria-hidden /> },
        ]}
      />
      {predict.mode === 'predict' && (
        <>
          <select
            value={predict.density}
            onChange={(e) => predict.setDensity(e.target.value as Density)}
            aria-label="How often to ask"
            className="h-10 rounded-full bg-sunken px-3 text-[13px] font-semibold text-ink"
          >
            <option value="some">Ask sometimes</option>
            <option value="all">Ask at every decision</option>
          </select>
          <span className="rounded-full bg-accent-soft px-3.5 py-2 text-[13px] font-semibold text-accent-ink tabular-nums" aria-label="Predictions correct">
            {score.correct}/{score.total} right
          </span>
        </>
      )}
    </div>
  );
}

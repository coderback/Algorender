'use client';

import { MotionConfig } from 'motion/react';
import Link from 'next/link';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FiCheckCircle, FiRefreshCw, FiXCircle } from 'react-icons/fi';
import { randomSeed } from '@/engine/random';
import { recordGame } from '@/play/record';
import { ArrayView } from '@/viz/array/ArrayView';
import { ArraySelectContext } from '@/viz/array/select';
import type { ItemId } from '@/viz/array/types';
import { ALGORITHMS } from './algorithms';
import { frameBefore, makeRound, sameSwap, type Round, type SupportedSlug } from './moves';

const SIZES = [5, 6, 7, 8, 9, 10];
const DEFAULT_SIZE = 7;
const noSubscribe = () => () => {};

type Setup = { seed: number; size: number };

/** The round from the URL (?seed=&size=), so a round can be shared and replayed; otherwise a fresh one. */
function initialSetup(): Setup {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed'));
  const size = Number(params.get('size'));
  return {
    seed: params.has('seed') && Number.isInteger(seed) && seed >= 0 ? seed : randomSeed(),
    size: SIZES.includes(size) ? size : DEFAULT_SIZE,
  };
}

function writeSetup({ seed, size }: Setup) {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('size', String(size));
  window.history.replaceState(null, '', url);
}

/**
 * Be the algorithm: the learner makes each swap the algorithm makes next, on
 * a random input, or says there are no more. A wrong move shows the
 * algorithm's own, then the round carries on from there. Each round is one
 * `game.played` event when it ends.
 */
export function BeTheAlgorithm({ slug }: { slug: SupportedSlug }) {
  // The round comes from the URL or a random seed, so it waits for the browser.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated ? (
    <Game slug={slug} />
  ) : (
    <div className="rounded-xl border border-line bg-surface p-5 text-ink-soft" data-game="loading">
      Setting up a round…
    </div>
  );
}

function Game({ slug }: { slug: SupportedSlug }) {
  const { module } = ALGORITHMS[slug];
  const [setup, setSetup] = useState(initialSetup);
  const round = useMemo(() => makeRound(module, setup.seed, setup.size), [module, setup]);
  const change = (next: Setup) => {
    writeSetup(next);
    setSetup(next);
  };
  return (
    <RoundView
      key={`${setup.seed}-${setup.size}`}
      slug={slug}
      round={round}
      size={setup.size}
      onNewRound={() => change({ seed: randomSeed(), size: setup.size })}
      onSize={(size) => change({ seed: setup.seed, size })}
    />
  );
}

type Feedback = { right: boolean; text: string };

function RoundView({ slug, round, size, onNewRound, onSize }: { slug: SupportedSlug; round: Round; size: number; onNewRound: () => void; onSize: (size: number) => void }) {
  const { module, rule } = ALGORITHMS[slug];
  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<'play' | 'reveal' | 'done'>('play');
  const [selected, setSelected] = useState<ItemId[]>([]);
  const [right, setRight] = useState(0);
  const [misses, setMisses] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const recorded = useRef(false);

  const { frames, moves } = round;
  const max = moves.length + 1;
  const shown = phase === 'done' ? frames.length - 1 : frameBefore(round, turn);
  const frame = frames[shown];
  const state = frame.state;
  const truth = turn < moves.length ? moves[turn] : null;
  const value = (id: ItemId) => state.values[id];

  const hint = useMemo(() => new Set<ItemId>(phase === 'reveal' && truth ? [truth.a, truth.b] : []), [phase, truth]);
  const select = useMemo(
    () => ({
      selected: new Set(selected),
      hint,
      disabled: phase !== 'play',
      toggle: (id: ItemId) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2))),
    }),
    [selected, hint, phase],
  );

  /** Moves on to the next turn, or ends the round after the last one. */
  const advance = (score: number) => {
    setSelected([]);
    if (truth) {
      setTurn((t) => t + 1);
      setPhase('play');
      return;
    }
    setPhase('done');
    if (!recorded.current) {
      recorded.current = true;
      recordGame('be-the-algorithm', slug, { score, max, won: score === max });
    }
  };

  const answer = (mine: readonly [ItemId, ItemId] | null) => {
    const ok = truth === null ? mine === null : mine !== null && sameSwap(state, mine, truth);
    if (ok) {
      const score = right + 1;
      setRight(score);
      setFeedback({ right: true, text: truth ? frames[truth.after].note : 'Right: everything is in order, so there are no more swaps.' });
      advance(score);
      return;
    }
    setMisses((m) => m + 1);
    setFeedback({
      right: false,
      text: truth
        ? `It swaps ${value(truth.a)} and ${value(truth.b)} next (outlined with dashes). ${frames[truth.after].note}`
        : 'It makes no more swaps: the array is already sorted.',
    });
    setPhase('reveal');
  };

  const pair = selected.length === 2 ? ([selected[0], selected[1]] as const) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p className="font-medium text-ink">{phase === 'done' ? 'Round over' : `Move ${turn + 1}`}</p>
          <p className="text-ink-soft" aria-live="polite">
            Right first time: {right} · Misses: {misses}
          </p>
        </div>

        <MotionConfig transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }} reducedMotion="user">
          <ArraySelectContext value={select}>
            <ArrayView state={state} />
          </ArraySelectContext>
        </MotionConfig>

        {phase === 'play' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              {pair ? `Selected: ${value(pair[0])} and ${value(pair[1])}.` : selected.length === 1 ? `Selected: ${value(selected[0])}. Pick one more.` : 'Pick the two bars it swaps next.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!pair}
                onClick={() => pair && answer(pair)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                Swap these two
              </button>
              <button type="button" onClick={() => answer(null)} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-sunken">
                No more swaps
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <p className="flex gap-2 text-sm" role="status">
            {feedback.right ? <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-good-ink" /> : <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />}
            <span>
              <span className={`font-semibold ${feedback.right ? 'text-good-ink' : 'text-bad-ink'}`}>{feedback.right ? 'Right. ' : 'Not that one. '}</span>
              <span className="text-ink-soft">{feedback.text}</span>
            </span>
          </p>
        )}

        {phase === 'reveal' && (
          <button
            type="button"
            onClick={() => {
              // The verdict was about the last move; the next one starts clean.
              setFeedback(null);
              advance(right);
            }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong" autoFocus>
            Continue
          </button>
        )}

        {phase === 'done' && (
          <div className={`space-y-3 rounded-lg border px-4 py-3 ${right === max ? 'border-good-line bg-good-soft' : 'border-line bg-subtle'}`}>
            <p className="font-semibold text-ink">
              {right} of {max} moves right first time.
            </p>
            <p className="text-sm text-ink-soft">
              {right === max
                ? 'A perfect round: you were the algorithm. Try more values, or another algorithm.'
                : 'Every round has new values. Play again to make every move right first time.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={onNewRound} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong">
                <FiRefreshCw aria-hidden /> New round
              </button>
              <Link href={`/visualisers/${slug}`} className="text-sm text-accent-ink underline-offset-2 hover:underline">
                Watch it in the visualiser
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-1 font-semibold text-ink">The rule</h2>
          <p className="text-ink-soft">{rule}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Pseudo-code</h2>
          <ol className="space-y-0.5 font-mono text-[13px] leading-5">
            {module.pseudocode.map((line, i) => (
              <li
                key={i}
                aria-current={frame.line === i ? 'step' : undefined}
                className={`rounded px-1.5 whitespace-pre ${frame.line === i ? 'bg-accent-soft text-ink' : 'text-ink-soft'}`}
              >
                {line || ' '}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <label className="flex items-center gap-2 text-ink">
            Values
            <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="rounded-md border border-line-strong bg-surface px-2 py-1 text-ink">
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {phase !== 'done' && (
            <button type="button" onClick={onNewRound} className="inline-flex items-center gap-1.5 text-accent-ink underline-offset-2 hover:underline">
              <FiRefreshCw aria-hidden /> New round
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

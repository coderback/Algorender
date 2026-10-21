'use client';

import { MotionConfig } from 'motion/react';
import Link from 'next/link';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FiArrowRight, FiCheck, FiShuffle, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { Card, TrackCard } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { randomSeed } from '@/engine/random';
import { recordGame } from '@/play/record';
import { ArrayView } from '@/viz/array/ArrayView';
import { ArraySelectContext } from '@/viz/array/select';
import type { ItemId } from '@/viz/array/types';
import { ALGORITHMS } from './algorithms';
import { frameBefore, makeRound, sameSwap, SUPPORTED, type Round, type SupportedSlug } from './moves';

const SIZES = [5, 6, 7, 8, 9, 10];
const DEFAULT_SIZE = 7;
const noSubscribe = () => () => {};

/** The algorithm switch's labels. */
const SHORT: Record<SupportedSlug, string> = { 'bubble-sort': 'Bubble', 'selection-sort': 'Selection', 'quick-sort': 'Quick', 'heap-sort': 'Heap' };

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
    <div className="rounded-card bg-surface p-6 text-ink-soft" data-game="loading">
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
      setFeedback({ right: true, text: truth ? frames[truth.after].note : 'Everything is in order, so there are no more swaps.' });
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
  const prompt =
    phase === 'done'
      ? 'The array is sorted.'
      : pair
        ? `Selected ${value(pair[0])} and ${value(pair[1])}. Is that the pair it swaps next?`
        : selected.length === 1
          ? `Selected ${value(selected[0])}. Pick one more.`
          : 'Pick the two bars it swaps next, or say there are no more swaps.';

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,412px)]">
      <section aria-label="The round" className="flex min-w-0 flex-col gap-3.5 rounded-card bg-surface p-4 sm:p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <nav aria-label="Algorithm" className="max-w-full overflow-x-auto rounded-full bg-sunken p-[3px]">
            <ul className="flex w-max gap-0.5">
              {SUPPORTED.map((s) => (
                <li key={s}>
                  <Link
                    href={`/play/be-the-algorithm/${s}`}
                    aria-current={s === slug ? 'page' : undefined}
                    className={cx(
                      'inline-flex h-10 items-center rounded-full px-[18px] text-sm whitespace-nowrap transition-colors duration-150 ease-standard',
                      s === slug ? 'bg-segment font-semibold text-ink shadow-segment' : 'font-medium text-ink-soft hover:text-ink',
                    )}
                  >
                    {SHORT[s]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              Values
              <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-10 rounded-full bg-sunken px-3 text-sm font-semibold text-ink">
                {SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {phase !== 'done' && (
              <Button kind="secondary" size="s" icon={<FiShuffle aria-hidden />} onClick={onNewRound}>
                New round
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-tile bg-subtle px-3 pt-4 pb-3 sm:px-6">
          <MotionConfig transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }} reducedMotion="user">
            <ArraySelectContext value={select}>
              <ArrayView state={state} />
            </ArraySelectContext>
          </MotionConfig>
        </div>

        <div className="flex items-start gap-3 rounded-[20px] bg-sunken px-4 py-3.5">
          <span className="mt-0.5 shrink-0 rounded-lg bg-surface px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap text-ink">
            {phase === 'done' ? 'Done' : `Move ${turn + 1}`}
          </span>
          <p className="text-base text-ink">{prompt}</p>
        </div>

        {phase === 'play' && (
          <div className="flex flex-wrap gap-3">
            <Button size="l" icon={<FiShuffle aria-hidden />} disabled={!pair} onClick={() => pair && answer(pair)}>
              Swap these two
            </Button>
            <Button size="l" kind="secondary" onClick={() => answer(null)}>
              No more swaps
            </Button>
          </div>
        )}

        {feedback && (
          <div role="status" className={cx('flex gap-2.5 rounded-well px-4 py-3.5 text-sm', feedback.right ? 'bg-good-soft text-good-ink' : 'bg-bad-soft text-bad-ink')}>
            {feedback.right ? <FiCheck aria-hidden className="mt-0.5 shrink-0" /> : <FiX aria-hidden className="mt-0.5 shrink-0" />}
            <p className="flex flex-col gap-0.5">
              <span className={cx('font-semibold', feedback.right ? 'text-good-title' : 'text-bad-title')}>{feedback.right ? 'Right.' : 'Not that one.'}</span>
              <span>{feedback.text}</span>
            </p>
          </div>
        )}

        {phase === 'reveal' && (
          <Button
            kind="secondary"
            className="w-fit"
            onClick={() => {
              // The verdict was about the last move; the next one starts clean.
              setFeedback(null);
              advance(right);
            }}
            autoFocus
          >
            Continue
          </Button>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <Card aria-labelledby="this-round" dense className="gap-3.5">
          <h2 id="this-round" className="text-[13px] font-semibold tracking-[0.06em] text-ink-muted uppercase">
            This round
          </h2>
          <dl className="grid grid-cols-3 gap-2" aria-live="polite">
            <Tile label="Right first time" value={right} tone="bg-track-sky text-track-sky-ink" title="text-track-sky-title" />
            <Tile label="Misses" value={misses} tone="bg-track-peach text-track-peach-ink" title="text-track-peach-title" />
            <Tile label="Move" value={phase === 'done' ? max : turn + 1} tone="bg-sunken text-ink-muted" title="text-ink" />
          </dl>
        </Card>

        <section aria-labelledby="rule" className="flex flex-col gap-3 rounded-card bg-code p-5 text-code-ink">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="rule" className="text-[13px] font-semibold tracking-[0.06em] text-code-muted uppercase">
              The rule
            </h2>
            <span className="text-xs text-code-muted">{SHORT[slug]} sort</span>
          </div>
          <p className="text-sm text-code-ink/90">{rule}</p>
          <ol className="flex flex-col gap-0.5 font-mono text-[13px] leading-normal">
            {module.pseudocode.map((line, i) => (
              <li
                key={i}
                aria-current={frame.line === i ? 'step' : undefined}
                className={cx('flex gap-3 rounded-[10px] px-2.5 py-1', frame.line === i ? 'bg-code-highlight font-semibold' : 'text-code-ink/80')}
              >
                <span className={cx('w-4 shrink-0 text-right select-none', frame.line === i ? 'text-feature-accent' : 'text-code-muted')}>{i + 1}</span>
                <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{line || ' '}</span>
              </li>
            ))}
          </ol>
        </section>

        {phase === 'done' && (
          <TrackCard track={right === max ? 'mint' : 'butter'} className="gap-3">
            <span className="w-fit rounded-full bg-surface/70 px-3 py-1 text-xs font-semibold">Round over</span>
            <p className={cx('font-display text-title-card', right === max ? 'text-track-mint-title' : 'text-track-butter-title')}>
              {right} of {max} moves right first time.
            </p>
            <p className="text-sm">
              {right === max
                ? 'A perfect round: you were the algorithm. Try more values, or another algorithm.'
                : 'Every round has new values. Play again to make every move right first time.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="s" icon={<FiShuffle aria-hidden />} onClick={onNewRound}>
                New round
              </Button>
              <Link href={`/visualisers/${slug}`} className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2 hover:no-underline">
                Watch it in the visualiser <FiArrowRight aria-hidden />
              </Link>
            </div>
          </TrackCard>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone, title }: { label: string; value: number; tone: string; title: string }) {
  return (
    <div className={cx('flex flex-col-reverse gap-0.5 rounded-well p-3', tone)}>
      <dt className="text-xs font-medium">{label}</dt>
      <dd className={cx('font-display text-number-tile tabular-nums', title)}>{value}</dd>
    </div>
  );
}

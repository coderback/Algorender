'use client';

import { Fragment, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FiCheck, FiChevronDown, FiShuffle } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Segmented } from '@/components/ui/Segmented';
import type { TrackColour } from '@/data/tracks';
import { randomSeed } from '@/engine/random';
import { recordGame } from '@/play/record';
import {
  allPairs,
  binaryInsertionWorst,
  compare,
  comparedBefore,
  deal,
  DEFAULT_CARDS,
  factorial,
  LABELS,
  lowerBound,
  MAX_CARDS,
  mergeSortWorst,
  MIN_CARDS,
  place,
  remainingOrders,
  verdict,
  type Comparison,
  type Verdict,
} from './budget';

const noSubscribe = () => () => {};

/** The deal named in the URL (`?n=6&seed=123`), else a fresh one. */
function initialDeal(): { n: number; seed: number } {
  const params = new URLSearchParams(window.location.search);
  const n = Number(params.get('n'));
  const seed = Number(params.get('seed'));
  return {
    n: Number.isInteger(n) && n >= MIN_CARDS && n <= MAX_CARDS ? n : DEFAULT_CARDS,
    seed: params.has('seed') && Number.isInteger(seed) && seed >= 0 ? seed : randomSeed(),
  };
}

/**
 * Comparison budget: sort hidden cards by comparing two at a time, then put
 * them in order. The order only counts if the comparisons prove it, and the
 * round is won within merge sort's worst case. The deal lives in the URL, so
 * a round can be shared or replayed.
 */
export function ComparisonBudget() {
  // The deal comes from the URL or a random seed, so it waits for the browser.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated ? <Round /> : <p className="rounded-card bg-surface p-6 text-ink-soft">Shuffling the cards…</p>;
}

function Round() {
  const [{ n, seed }, setDeal] = useState(initialDeal);
  const values = useMemo(() => deal(n, seed), [n, seed]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [row, setRow] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Verdict | null>(null);
  const recorded = useRef(false);

  const label = (card: number) => LABELS[card];
  const remaining = remainingOrders(n, comparisons);
  const total = factorial(n);
  const done = result !== null;

  const restart = (next: { n: number; seed: number }) => {
    setDeal(next);
    setComparisons([]);
    setSelected([]);
    setRow([]);
    setResult(null);
    setMessage('');
    recorded.current = false;
    const url = new URL(window.location.href);
    url.searchParams.set('n', String(next.n));
    url.searchParams.set('seed', String(next.seed));
    window.history.replaceState(null, '', url);
  };

  const toggle = (card: number) => {
    if (done) return;
    setSelected((s) => (s.includes(card) ? s.filter((c) => c !== card) : [...s, card].slice(-2)));
  };

  const compareSelected = () => {
    const [a, b] = selected;
    if (comparedBefore(comparisons, a, b)) {
      const c = compare(values, a, b);
      setMessage(`You compared these already: ${label(c.lo)} < ${label(c.hi)}. That one is free.`);
    } else {
      const c = compare(values, a, b);
      const next = [...comparisons, c];
      setComparisons(next);
      const left = remainingOrders(n, next);
      setMessage(`${label(c.lo)} < ${label(c.hi)}. ${left === 1 ? 'Only one order is left.' : `${left.toLocaleString()} orders are still possible.`}`);
    }
    setSelected([]);
  };

  const putAt = (gap: number) => {
    const [card] = selected;
    setRow((r) => place(r, card, gap));
    setSelected([]);
    setMessage(`${label(card)} placed.`);
  };

  const check = () => {
    const v = verdict(row, values, comparisons);
    setResult(v);
    setSelected([]);
    setMessage(SUMMARY[v].title);
    if (!recorded.current) {
      recorded.current = true;
      recordGame('comparison-budget', `n${n}`, { score: comparisons.length, max: lowerBound(n), won: v === 'won' });
    }
  };

  const one = selected.length === 1 ? selected[0] : null;
  const unplaced = Array.from({ length: n }, (_, k) => k).filter((k) => !row.includes(k));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,455px)]">
      <section aria-label="The round" className="flex min-w-0 flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-muted">Cards</span>
            <Segmented
              label="Number of cards"
              value={String(n)}
              onChange={(v) => restart({ n: Number(v), seed: randomSeed() })}
              options={Array.from({ length: MAX_CARDS - MIN_CARDS + 1 }, (_, k) => ({ value: String(MIN_CARDS + k), label: String(MIN_CARDS + k) }))}
            />
          </div>
          <Button kind="secondary" size="s" icon={<FiShuffle aria-hidden />} onClick={() => restart({ n, seed: randomSeed() })}>
            New deal
          </Button>
        </div>

        <div role="group" aria-label="Cards" className="flex flex-col gap-3">
          <h2 className="font-semibold">{done ? 'The cards, revealed' : 'Cards still to place'}</h2>
          <p className="text-sm text-ink-soft">
            {done
              ? 'Every value, face up.'
              : 'Select two cards to compare them. Select one card, then a gap in your order below, to place it (or move it).'}
          </p>
          <ul className="flex min-h-[88px] flex-wrap gap-2.5">
            {(done ? Array.from({ length: n }, (_, k) => k) : unplaced).map((card) => (
              <li key={card}>
                <CardButton card={card} value={done ? values[card] : null} selected={selected.includes(card)} onClick={() => toggle(card)} disabled={done} faceDown />
              </li>
            ))}
            {!done && unplaced.length === 0 && <li className="self-center text-sm text-ink-muted">All placed. Check your order, or keep comparing.</li>}
          </ul>
          {!done && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="l" onClick={compareSelected} disabled={selected.length !== 2}>
                {selected.length === 2 ? `Compare ${label(selected[0])} and ${label(selected[1])}` : 'Compare two cards'}
              </Button>
              {selected.length > 0 && (
                <button type="button" onClick={() => setSelected([])} className="text-sm font-semibold text-accent-ink hover:underline">
                  Clear selection
                </button>
              )}
            </div>
          )}
        </div>

        <div role="group" aria-label="Your order" className="flex flex-col gap-3">
          <h2 className="font-semibold">Your order, smallest first</h2>
          <ol className="flex min-h-[104px] flex-wrap items-center gap-2 rounded-tile bg-subtle p-4">
            {!done && <Gap card={one} gap={0} label={label} onPut={putAt} />}
            {row.map((card, k) => (
              <Fragment key={card}>
                <li>
                  <CardButton card={card} value={done ? values[card] : null} selected={selected.includes(card)} onClick={() => toggle(card)} disabled={done} />
                </li>
                {!done && <Gap card={one} gap={k + 1} label={label} onPut={putAt} />}
              </Fragment>
            ))}
            {row.length === 0 && one === null && <li className="text-sm text-ink-muted">Nothing placed yet.</li>}
          </ol>
          {!done && (
            <div className="flex flex-wrap items-center gap-3">
              <Button kind="secondary" icon={<FiCheck aria-hidden />} onClick={check} disabled={row.length !== n}>
                Check my order
              </Button>
              {row.length !== n && <span className="text-[13px] text-ink-muted">Place every card first</span>}
            </div>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {message}
        </p>

        <div role="group" aria-label="Comparisons made" className="flex flex-col gap-2.5">
          <h2 className="font-semibold">Comparisons made</h2>
          {comparisons.length === 0 ? (
            <p className="text-sm text-ink-muted">None yet.</p>
          ) : (
            <ol className="flex flex-wrap gap-2 font-mono text-sm" data-testid="comparison-log">
              {comparisons.map((c, k) => (
                <li key={k} className="rounded-[10px] bg-sunken px-3 py-1.5 text-ink">
                  {label(c.lo)} &lt; {label(c.hi)}
                </li>
              ))}
            </ol>
          )}
          {message && !done && <p className="text-[13px] text-ink-muted">{message}</p>}
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <Budgets n={n} used={comparisons.length} remaining={remaining} total={total} />
        {done && result && <Summary result={result} n={n} used={comparisons.length} remaining={remaining} onAgain={() => restart({ n, seed: randomSeed() })} />}
      </div>
    </div>
  );
}

function CardButton({ card, value, selected, onClick, disabled, faceDown = false }: { card: number; value: number | null; selected: boolean; onClick: () => void; disabled: boolean; faceDown?: boolean }) {
  // Cards still to place lie face down (dark); placed ones are face up on the lane, still hiding their value.
  const dark = faceDown && value === null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={disabled ? undefined : selected}
      aria-label={value === null ? `Card ${LABELS[card]}` : `Card ${LABELS[card]}: ${value}`}
      className={cx(
        'flex h-[88px] w-16 flex-col items-center justify-center gap-1 rounded-[16px] font-display transition-[box-shadow,background-color] duration-150 ease-standard',
        dark ? 'bg-feature text-on-feature' : 'bg-surface text-ink',
        selected ? 'ring-[3px] ring-accent ring-offset-2 ring-offset-surface' : dark ? 'hover:ring-2 hover:ring-accent-line' : 'ring-[1.5px] ring-line ring-inset hover:ring-line-strong',
      )}
    >
      <span className="text-2xl font-bold">{LABELS[card]}</span>
      <span className={cx('font-mono text-xs', dark ? 'text-feature-muted' : 'text-ink-muted')}>{value ?? (selected ? '✓' : '?')}</span>
    </button>
  );
}

function Gap({ card, gap, label, onPut }: { card: number | null; gap: number; label: (c: number) => string; onPut: (gap: number) => void }) {
  if (card === null) return null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPut(gap)}
        aria-label={`Put ${label(card)} at position ${gap + 1}`}
        className="flex h-[88px] w-8 items-center justify-center rounded-[12px] border-2 border-dashed border-accent text-accent-ink transition-colors duration-150 ease-standard hover:bg-accent-soft"
      >
        <FiChevronDown aria-hidden />
      </button>
    </li>
  );
}

function Budgets({ n, used, remaining, total }: { n: number; used: number; remaining: number; total: number }) {
  const rows = [
    { label: 'Nobody can do better', value: lowerBound(n), note: `⌈log₂ ${n}!⌉` },
    { label: 'Merge sort, worst case (to win)', value: mergeSortWorst(n), note: '' },
    { label: 'Binary insertion, worst case', value: binaryInsertionWorst(n), note: '' },
    { label: 'Comparing every pair', value: allPairs(n), note: '' },
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col-reverse gap-0.5 rounded-tile bg-track-sky p-4 text-track-sky-ink">
          <dt className="text-[13px]">Comparisons</dt>
          <dd className="font-display text-number-tile text-track-sky-title tabular-nums" data-testid="comparisons-used">
            {used}
          </dd>
        </div>
        <div className="flex flex-col-reverse gap-0.5 rounded-tile bg-track-peach p-4 text-track-peach-ink">
          <dt className="text-[13px]">Orders left of {total.toLocaleString()}</dt>
          <dd className="font-display text-number-tile text-track-peach-title tabular-nums" data-testid="orders-left">
            {remaining.toLocaleString()}
          </dd>
        </div>
      </dl>
      <div role="group" aria-label="Budgets" className="flex flex-col gap-2 rounded-card bg-track-butter p-5 text-track-butter-ink sm:p-6">
        <h2 className="mb-1 font-semibold text-track-butter-title">Budgets</h2>
        <dl className="flex flex-col divide-y divide-surface/70 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt>
                {r.label}
                {r.note && <span className="font-mono">: {r.note}</span>}
              </dt>
              <dd className="font-display text-[22px] font-bold text-track-butter-title tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

const SUMMARY: Record<Verdict, { title: string; tone: TrackColour | 'warn' | 'bad'; chip: string }> = {
  won: { title: 'Sorted, and proved, within the budget.', tone: 'mint', chip: 'Won' },
  'over-budget': { title: 'Sorted and proved, but with more comparisons than merge sort needs.', tone: 'warn', chip: 'Over budget' },
  lucky: { title: 'The right order, but a lucky guess: your comparisons didn’t prove it.', tone: 'warn', chip: 'A lucky guess' },
  wrong: { title: 'Not quite: some cards are out of order.', tone: 'bad', chip: 'Not sorted' },
};

function Summary({ result, n, used, remaining, onAgain }: { result: Verdict; n: number; used: number; remaining: number; onAgain: () => void }) {
  const bound = lowerBound(n);
  const s = SUMMARY[result];
  const box = s.tone === 'warn' ? 'bg-warn-soft text-warn-ink' : s.tone === 'bad' ? 'bg-bad-soft text-bad-ink' : 'bg-track-mint text-track-mint-ink';
  const title = s.tone === 'warn' ? 'text-warn-title' : s.tone === 'bad' ? 'text-bad-title' : 'text-track-mint-title';
  return (
    <section aria-labelledby="round-result" className={cx('flex flex-col gap-3 rounded-card p-5 sm:p-6', box)}>
      <span className="w-fit rounded-full bg-surface/70 px-3 py-1 text-xs font-semibold">{s.chip}</span>
      <h2 id="round-result" className={cx('font-display text-title-card', title)}>
        {s.title}
      </h2>
      <p className="text-sm">
        You used {used} {used === 1 ? 'comparison' : 'comparisons'}. Merge sort needs at most {mergeSortWorst(n)} for {n} cards, and no method can promise
        fewer than {bound}.{' '}
        {result !== 'won' && remaining > 1 && `When you checked, ${remaining.toLocaleString()} orders still fitted what you knew.`}
      </p>
      <p className="text-sm">
        Why {bound}? There are {n}! = {factorial(n).toLocaleString()} ways the cards could be ordered, and each comparison has two answers, so at
        best it rules out half of the orders still possible. Halving {factorial(n).toLocaleString()} down to one takes at least ⌈log₂ {n}!⌉ = {bound} steps
        in the worst case: that is why no comparison sort can beat about n log₂ n.
      </p>
      <Button block icon={<FiShuffle aria-hidden />} onClick={onAgain}>
        Play again
      </Button>
    </section>
  );
}

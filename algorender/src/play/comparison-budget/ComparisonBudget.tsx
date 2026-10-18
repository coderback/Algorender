'use client';

import { Fragment, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FiCheck, FiChevronDown, FiRefreshCw } from 'react-icons/fi';
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
  return hydrated ? <Round /> : <p className="text-ink-soft">Shuffling the cards…</p>;
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink">
          Cards
          <select
            value={n}
            onChange={(e) => restart({ n: Number(e.target.value), seed: randomSeed() })}
            className="ml-2 rounded-md border border-line-strong bg-surface px-2 py-1 text-ink"
          >
            {Array.from({ length: MAX_CARDS - MIN_CARDS + 1 }, (_, k) => MIN_CARDS + k).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => restart({ n, seed: randomSeed() })}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-sunken"
        >
          <FiRefreshCw aria-hidden /> New deal
        </button>
      </div>

      <Budgets n={n} used={comparisons.length} remaining={remaining} total={total} />

      <div role="group" aria-label="Cards" className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
        <h2 className="mb-1 text-sm font-semibold text-ink">{done ? 'The cards, revealed' : 'Cards still to place'}</h2>
        <p className="mb-3 text-sm text-ink-soft">
          {done
            ? 'Every value, face up.'
            : 'Select two cards to compare them. Select one card, then a gap in your order below, to place it (or move it).'}
        </p>
        <ul className="flex min-h-14 flex-wrap gap-2">
          {(done ? Array.from({ length: n }, (_, k) => k) : unplaced).map((card) => (
            <li key={card}>
              <CardButton card={card} value={done ? values[card] : null} selected={selected.includes(card)} onClick={() => toggle(card)} disabled={done} />
            </li>
          ))}
          {!done && unplaced.length === 0 && <li className="text-sm text-ink-muted">All placed. Check your order, or keep comparing.</li>}
        </ul>
        {!done && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={compareSelected}
              disabled={selected.length !== 2}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selected.length === 2 ? `Compare ${label(selected[0])} and ${label(selected[1])}` : 'Compare two cards'}
            </button>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])} className="text-sm text-accent-ink underline-offset-2 hover:underline">
                Clear selection
              </button>
            )}
          </div>
        )}
      </div>

      <div role="group" aria-label="Your order" className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
        <h2 className="mb-1 text-sm font-semibold text-ink">Your order, smallest first</h2>
        <ol className="flex flex-wrap items-center gap-1.5">
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
          <button
            type="button"
            onClick={check}
            disabled={row.length !== n}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiCheck aria-hidden /> Check my order
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {message}
      </p>

      <div role="group" aria-label="Comparisons made" className="rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
        <h2 className="mb-2 text-sm font-semibold text-ink">Comparisons made</h2>
        {comparisons.length === 0 ? (
          <p className="text-sm text-ink-muted">None yet.</p>
        ) : (
          <ol className="flex flex-wrap gap-2 font-mono text-sm" data-testid="comparison-log">
            {comparisons.map((c, k) => (
              <li key={k} className="rounded-md bg-subtle px-2 py-0.5 text-ink">
                {label(c.lo)} &lt; {label(c.hi)}
              </li>
            ))}
          </ol>
        )}
        {message && !done && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
      </div>

      {done && result && <Summary result={result} n={n} used={comparisons.length} remaining={remaining} onAgain={() => restart({ n, seed: randomSeed() })} />}
    </div>
  );
}

function CardButton({ card, value, selected, onClick, disabled }: { card: number; value: number | null; selected: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={disabled ? undefined : selected}
      aria-label={value === null ? `Card ${LABELS[card]}` : `Card ${LABELS[card]}: ${value}`}
      className={`flex h-16 w-12 flex-col items-center justify-center rounded-lg border-2 font-mono transition-colors ${
        selected ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-page text-ink hover:border-accent-line'
      }`}
    >
      <span className="text-lg font-bold">{LABELS[card]}</span>
      <span className="text-xs text-ink-soft">{value ?? (selected ? '✓' : '?')}</span>
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
        className="flex h-16 w-7 items-center justify-center rounded-md border-2 border-dashed border-accent-line text-accent-ink hover:bg-accent-soft"
      >
        <FiChevronDown aria-hidden />
      </button>
    </li>
  );
}

function Budgets({ n, used, remaining, total }: { n: number; used: number; remaining: number; total: number }) {
  const rows = [
    { label: 'Nobody can do better than', value: lowerBound(n), note: `⌈log₂ ${n}!⌉` },
    { label: 'Merge sort, worst case (to win)', value: mergeSortWorst(n), note: '' },
    { label: 'Binary insertion, worst case', value: binaryInsertionWorst(n), note: '' },
    { label: 'Comparing every pair', value: allPairs(n), note: '' },
  ];
  return (
    <div role="group" aria-label="Budgets" className="grid gap-4 rounded-xl border border-line-soft bg-surface p-4 shadow-xs sm:grid-cols-[1fr_auto]">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-ink-soft">
              {r.label} {r.note && <span className="font-mono text-ink-muted">({r.note})</span>}
            </dt>
            <dd className="text-right font-mono tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-6 sm:flex-col sm:gap-2 sm:border-l sm:border-line-soft sm:pl-4">
        <p className="text-sm text-ink-soft">
          Comparisons <span className="block font-mono text-2xl font-semibold text-ink" data-testid="comparisons-used">{used}</span>
        </p>
        <p className="text-sm text-ink-soft">
          Orders still possible
          <span className="block font-mono text-2xl font-semibold text-ink" data-testid="orders-left">
            {remaining.toLocaleString()}
          </span>
          <span className="text-xs text-ink-muted">of {total.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
}

const SUMMARY: Record<Verdict, { title: string; tone: string }> = {
  won: { title: 'Sorted, and proved, within the budget.', tone: 'border-good-line bg-good-soft' },
  'over-budget': { title: 'Sorted and proved, but with more comparisons than merge sort needs.', tone: 'border-warn-line bg-warn-soft' },
  lucky: { title: 'The right order, but a lucky guess: your comparisons didn’t prove it.', tone: 'border-warn-line bg-warn-soft' },
  wrong: { title: 'Not quite: some cards are out of order.', tone: 'border-bad-line bg-bad-soft' },
};

function Summary({ result, n, used, remaining, onAgain }: { result: Verdict; n: number; used: number; remaining: number; onAgain: () => void }) {
  const bound = lowerBound(n);
  return (
    <section aria-labelledby="round-result" className={`space-y-3 rounded-xl border p-5 ${SUMMARY[result].tone}`}>
      <h2 id="round-result" className="text-lg font-semibold text-ink">
        {SUMMARY[result].title}
      </h2>
      <p className="text-sm text-ink">
        You used {used} {used === 1 ? 'comparison' : 'comparisons'}. Merge sort needs at most {mergeSortWorst(n)} for {n} cards, and no method can promise
        fewer than {bound}.{' '}
        {result !== 'won' && remaining > 1 && `When you checked, ${remaining.toLocaleString()} orders still fitted what you knew.`}
      </p>
      <p className="text-sm text-ink-soft">
        Why {bound}? There are {n}! = {factorial(n).toLocaleString()} ways the cards could be ordered, and each comparison has two answers, so at
        best it rules out half of the orders still possible. Halving {factorial(n).toLocaleString()} down to one takes at least ⌈log₂ {n}!⌉ = {bound} steps
        in the worst case: that is why no comparison sort can beat about n log₂ n.
      </p>
      <button
        type="button"
        onClick={onAgain}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
      >
        <FiRefreshCw aria-hidden /> Play again
      </button>
    </section>
  );
}

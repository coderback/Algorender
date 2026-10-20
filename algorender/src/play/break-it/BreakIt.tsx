'use client';

import Link from 'next/link';
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { FiAlertTriangle, FiArrowRight, FiCheck, FiCheckCircle } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import { useProgressSnapshot } from '@/progress/hooks';
import { recordGame } from '@/play/record';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  BUCKETS,
  COIN_SETS,
  coinsAttempt,
  floodAttempt,
  KEY_COUNT,
  KEY_MAX,
  KEY_MIN,
  parseAmount,
  parseKeys,
  parseQuick,
  QUICK_MAX,
  QUICK_MIN,
  QUICK_N,
  quickAverage,
  quickHref,
  quicksortAttempt,
  quickWorst,
  type ChallengeId,
  type Parsed,
} from './challenges';

/**
 * Break it: three challenges where the learner crafts the input that hurts.
 * Every submitted attempt is a round of the game (`game.played`).
 */
export function BreakIt() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <QuicksortChallenge />
      <CoinsChallenge />
      <FloodChallenge />
    </div>
  );
}

/** Each challenge's place, colour and short name. */
const CARD: Record<ChallengeId, { n: string; colour: TrackColour; topic: string }> = {
  'quicksort-worst': { n: '01', colour: 'peach', topic: 'Quicksort' },
  'greedy-coins': { n: '02', colour: 'butter', topic: 'Greedy' },
  'hash-flood': { n: '03', colour: 'sky', topic: 'Hashing' },
};

/** Whether the learner has ever broken a challenge (a won `game.played` round of it). */
function useBroken(id: ChallengeId): boolean | null {
  const { ready, events } = useProgressSnapshot();
  return useMemo(
    () => (ready ? events.some((e) => e.kind === 'game.played' && e.data.game === 'break-it' && e.data.item === id && e.data.won) : null),
    [ready, events, id],
  );
}

const submit = (id: ChallengeId, attempt: { score: number; max: number; won: boolean }) =>
  recordGame('break-it', id, { score: attempt.score, max: attempt.max, won: attempt.won });

function Challenge({ id, title, children }: { id: ChallengeId; title: string; children: ReactNode }) {
  const card = CARD[id];
  const c = TRACK_CLASSES[card.colour];
  const broken = useBroken(id);
  return (
    <section aria-labelledby={`challenge-${id}`} className={cx('flex min-w-0 flex-col gap-4 rounded-card p-5 sm:p-6', c.bg, c.ink)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px]">
          {card.n} · {card.topic}
        </span>
        {broken != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface/70 px-2.5 py-1 text-xs font-semibold">
            {broken ? (
              <>
                Broken <FiCheck aria-hidden strokeWidth={3} />
              </>
            ) : (
              'Not broken yet'
            )}
          </span>
        )}
      </div>
      <h2 id={`challenge-${id}`} className={cx('font-display text-[26px] leading-tight font-bold tracking-[-0.02em]', c.title)}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A labelled text input with its own error message, and the button that tries it. */
function AttemptForm({
  label,
  hint,
  placeholder,
  value,
  onChange,
  error,
  onSubmit,
  children,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error: string;
  onSubmit: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  const go = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={go} className="flex flex-col gap-3" noValidate>
      {children}
      <div>
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs">
          {hint}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
            className="h-12 min-w-0 flex-1 rounded-[16px] bg-surface px-4 font-mono text-[15px] text-ink placeholder:text-ink-muted aria-invalid:ring-[1.5px] aria-invalid:ring-bad-ink aria-invalid:ring-inset"
          />
          <button type="submit" className="h-12 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary transition-colors duration-150 ease-standard hover:bg-primary-hover">
            Try it
          </button>
        </div>
        {error && (
          <p id={`${id}-error`} className="mt-2 rounded-[14px] bg-bad-soft px-3.5 py-2.5 text-sm font-semibold text-bad-ink">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

/** The outcome of an attempt: broken (with a tick) or not yet (with a warning sign), never colour alone. */
function Verdict({ won, children }: { won: boolean; children: ReactNode }) {
  return (
    <p className="flex gap-2 text-sm leading-relaxed">
      {won ? <FiCheckCircle aria-hidden className="mt-1 shrink-0" /> : <FiAlertTriangle aria-hidden className="mt-1 shrink-0" />}
      <span>
        <span className="font-bold">{won ? 'Broken! ' : 'Not broken yet. '}</span>
        {children}
      </span>
    </p>
  );
}

/** Parses on submit: an error, or the value. */
function useAttempt<T>(parse: (text: string) => Parsed<T>) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const tryIt = (run: (value: T) => void) => {
    const parsed = parse(text);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError('');
    run(parsed.value);
  };
  return { text, setText, error, tryIt };
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-well bg-surface px-4 py-3 text-sm text-ink-soft">
      <summary className="cursor-pointer font-semibold text-ink">Need a hint?</summary>
      <p className="mt-1.5">{children}</p>
    </details>
  );
}

// ---------------------------------------------------------------------------

function QuicksortChallenge() {
  const { text, setText, error, tryIt } = useAttempt(parseQuick);
  const [result, setResult] = useState<{ values: number[]; comparisons: number; won: boolean } | null>(null);
  const worst = quickWorst(QUICK_N);
  const average = Math.round(quickAverage(QUICK_N));

  const go = () =>
    tryIt((values) => {
      const attempt = quicksortAttempt(values);
      submit('quicksort-worst', attempt);
      setResult({ values, comparisons: attempt.comparisons, won: attempt.won });
    });

  return (
    <Challenge id="quicksort-worst" title="Make quicksort slow">
      <p className="text-[15px] leading-relaxed">
        This quicksort always takes the <strong>last</strong> value as its pivot. On a random order of {QUICK_N} values it makes about{' '}
        {average} comparisons. Give it {QUICK_N} values that make it do the most work it ever can: {worst} comparisons.
      </p>
      <AttemptForm
        label={`${QUICK_N} values for quicksort`}
        hint={`Whole numbers from ${QUICK_MIN} to ${QUICK_MAX}, separated by commas or spaces.`}
        placeholder="e.g. 42, 17, 88, …"
        value={text}
        onChange={setText}
        error={error}
        onSubmit={go}
      />
      <Hint>A partition is cheap to recurse on when the pivot splits the values evenly. What order makes the last value the worst possible pivot, every time?</Hint>
      {result && <Meter value={result.comparisons} max={worst} average={average} />}
      <div role="status" aria-live="polite">
        {result && (
          <Verdict won={result.won}>
            {result.won
              ? `${result.comparisons} comparisons, the most quicksort can make on ${QUICK_N} values: every pivot was the smallest or largest value left, so each partition peeled off just one. That is the O(n²) worst case, and why real quicksorts pick their pivot at random.`
              : `${result.comparisons} comparisons, against ${worst} at worst and about ${average} for a random order. Some pivots still split the values into two real parts.`}
          </Verdict>
        )}
      </div>
      {result && (
        <Link href={quickHref(result.values)} className="inline-flex items-center gap-1 text-sm text-accent-ink hover:underline">
          Watch quicksort on your input <FiArrowRight aria-hidden />
        </Link>
      )}
    </Challenge>
  );
}

/** Comparisons as a bar, with the random-order average and the worst case marked in words as well as on the bar. */
function Meter({ value, max, average }: { value: number; max: number; average: number }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="rounded-well bg-surface px-4 py-3.5">
      <p className="mb-2 flex justify-between text-sm font-semibold text-ink">
        <span>Comparisons</span>
        <span className="font-mono tabular-nums">
          {value} of {max}
        </span>
      </p>
      <div className="relative h-3 rounded-full bg-sunken" aria-hidden>
        <div className="h-3 rounded-full bg-accent" style={{ width: pct(value) }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-ink-muted" style={{ left: pct(average) }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-ink-muted" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: pct(average) }}>
          random ≈ {average}
        </span>
        <span className="absolute right-0">worst {max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CoinsChallenge() {
  const { text, setText, error, tryIt } = useAttempt(parseAmount);
  const [set, setSet] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof coinsAttempt> | null>(null);
  const coins = COIN_SETS[set];

  const go = () =>
    tryIt((amount) => {
      const attempt = coinsAttempt(coins, amount);
      submit('greedy-coins', attempt);
      setResult(attempt);
    });

  const sum = (cs: readonly number[]) => (cs.length ? cs.join(' + ') : 'nothing');

  return (
    <Challenge id="greedy-coins" title="Fool the greedy cashier">
      <p className="text-[15px] leading-relaxed">
        A greedy cashier makes change by always taking the largest coin that still fits. With real coins that gives the fewest coins. Find an
        amount where it doesn’t.
      </p>
      <AttemptForm
        label="Amount"
        hint={`A whole number from ${AMOUNT_MIN} to ${AMOUNT_MAX}.`}
        placeholder="e.g. 7"
        value={text}
        onChange={setText}
        error={error}
        onSubmit={go}
      >
        <fieldset>
          <legend className="text-sm font-semibold">Coins</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {COIN_SETS.map((cs, i) => (
              <label key={i} className="inline-flex h-11 items-center gap-2 rounded-full bg-surface/70 px-4 font-mono text-sm font-semibold text-ink has-[:checked]:bg-surface">
                <input
                  type="radio"
                  name="coin-set"
                  checked={set === i}
                  onChange={() => {
                    setSet(i);
                    setResult(null);
                  }}
                  className="accent-[var(--color-accent)]"
                />
                {cs.join(', ')}
              </label>
            ))}
          </div>
        </fieldset>
      </AttemptForm>
      <Hint>Try amounts just above a big coin. Taking it might leave a remainder that only small coins can make, when two middle-sized coins would have done.</Hint>
      {result && (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-well bg-surface px-3.5 py-2.5">
            <dt className="text-xs text-ink-muted">Greedy</dt>
            <dd className="font-mono font-semibold text-ink">
              {sum(result.greedy.coins)} → {result.greedy.count} {result.greedy.count === 1 ? 'coin' : 'coins'}
            </dd>
            </div>
            <div className="rounded-well bg-surface px-3.5 py-2.5">
            <dt className="text-xs text-ink-muted">Fewest</dt>
            <dd className="font-mono font-semibold text-ink">
              {sum(result.optimal.coins)} → {result.optimal.count} {result.optimal.count === 1 ? 'coin' : 'coins'}
            </dd>
            </div>
          </dl>
      )}
      <div role="status" aria-live="polite">
        {result && (
          <Verdict won={result.won}>
            {result.won
              ? `Greedy needed ${result.greedy.count} coins where ${result.optimal.count} will do: taking the largest coin first left a remainder that costs more. That is why coin change needs dynamic programming.`
              : `Greedy found the fewest coins here. Look for an amount where the largest coin leaves an awkward remainder.`}
          </Verdict>
        )}
      </div>
    </Challenge>
  );
}

// ---------------------------------------------------------------------------

function FloodChallenge() {
  const { text, setText, error, tryIt } = useAttempt(parseKeys);
  const [result, setResult] = useState<ReturnType<typeof floodAttempt> | null>(null);

  const go = () =>
    tryIt((keys) => {
      const attempt = floodAttempt(keys);
      submit('hash-flood', attempt);
      setResult(attempt);
    });

  return (
    <Challenge id="hash-flood" title="Flood the hash table">
      <p className="text-[15px] leading-relaxed">
        This hash table has {BUCKETS} buckets and puts key k in bucket <code className="rounded-md bg-surface/70 px-1.5 py-0.5 font-mono text-[0.9em] text-ink">k mod {BUCKETS}</code>.
        Keys that land in the same bucket form a chain, and a lookup walks the chain. Choose {KEY_COUNT} keys that make one chain as long as it can be.
      </p>
      <AttemptForm
        label={`${KEY_COUNT} different keys`}
        hint={`Whole numbers from ${KEY_MIN} to ${KEY_MAX}, separated by commas or spaces.`}
        placeholder="e.g. 3, 14, 15, …"
        value={text}
        onChange={setText}
        error={error}
        onSubmit={go}
      />
      <Hint>Two keys share a bucket when they leave the same remainder after dividing by {BUCKETS}.</Hint>
      {result && (
          <ol className="flex flex-col gap-1 rounded-well bg-surface p-2.5" aria-label="Buckets">
            {result.chains.map((chain, b) => {
              const longest = chain.length === result.score && chain.length > 1;
              return (
                <li key={b} className={`flex items-center gap-2 rounded-[12px] px-2 py-1 text-sm ${longest ? 'bg-warn-soft' : ''}`}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-xs font-semibold text-on-primary" aria-label={`bucket ${b}`}>
                    {b}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 font-mono text-ink">
                    {chain.length === 0 ? (
                      <span className="text-ink-muted">empty</span>
                    ) : (
                      chain.map((k, i) => (
                        <span key={k} className="inline-flex items-center gap-1">
                          {i > 0 && <span aria-hidden className="text-ink-muted">→</span>}
                          <span className="rounded-md bg-sunken px-1.5">{k}</span>
                        </span>
                      ))
                    )}
                  </span>
                  {longest && <span className="ml-auto text-xs font-semibold text-warn-ink">longest: {chain.length}</span>}
                </li>
              );
            })}
          </ol>
      )}
      <div role="status" aria-live="polite">
        {result && (
          <Verdict won={result.won}>
            {result.won
              ? `All ${result.score} keys share one bucket, so finding the last one checks every key: the table has become a list.`
              : `The longest chain holds ${result.score} of ${result.max} keys.`}
          </Verdict>
        )}
      </div>
      <p className="text-sm">
        Attackers do this to real servers: send keys that all collide and every lookup slows to a scan. That is why real hash tables pick a random,
        secret (salted) hash function when they start, so nobody can predict which keys collide.
      </p>
    </Challenge>
  );
}

'use client';

import { useId, useState, type FormEvent } from 'react';
import { FiCheckCircle, FiRefreshCw, FiTarget, FiXCircle } from 'react-icons/fi';
import { randomSeed } from '@/engine/random';
import { drillRound, formatQuantity, judge, makeDrill, parseEstimate, type Drill, type DrillKind, type Verdict } from '@/systems/design/estimation';

const VERDICT: Record<Verdict, { title: string; box: string; ink: string }> = {
  'spot-on': { title: 'Spot on', box: 'border-good-line bg-good-soft', ink: 'text-good-ink' },
  close: { title: 'Right order of magnitude', box: 'border-warn-line bg-warn-soft', ink: 'text-warn-ink' },
  off: { title: 'Off by more than 10×', box: 'border-bad-line bg-bad-soft', ink: 'text-bad-ink' },
};

const PLACEHOLDER: Record<Drill['unit'], string> = { count: 'e.g. 3000, 3k or 3e3', bytes: 'e.g. 40 GB or 4e10', 'bytes/s': 'e.g. 100 MB/s' };

const times = (factor: number) => (factor < 10 ? factor.toFixed(1).replace(/\.0$/, '') : String(Math.round(factor)));

/** The verdict in words: how far off, and which way. */
function verdictText(drill: Drill, guess: number): { verdict: Verdict; text: string } {
  const { verdict, factor, direction } = judge(guess, drill.answer);
  const truth = `${formatQuantity(drill.answer, drill.unit)} ${drill.unitLabel}`.trim();
  if (direction === 'exact' || factor < 1.05) return { verdict, text: `About ${truth}: exactly right.` };
  const how = `You are ${times(factor)}× too ${direction}; it is about ${truth}.`;
  if (verdict === 'spot-on') return { verdict, text: `Within 2×, which is all an estimate needs. ${how}` };
  if (verdict === 'close') return { verdict, text: `Within 10×, the same power of ten. ${how}` };
  return { verdict, text: `${how} Check the working for the step that went astray.` };
}

/**
 * One back-of-the-envelope question: type an estimate (300k, 3e5, 40 GB…),
 * get a verdict on a log scale, then see the worked steps. Practice only:
 * nothing is recorded.
 */
export function EstimationDrill({ kind = 'qps', seed = 1, drill: given, headingLevel = 3 }: { kind?: DrillKind; seed?: number; drill?: Drill; headingLevel?: 2 | 3 }) {
  const drill = given ?? makeDrill(kind, seed);
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const result = guess !== null ? verdictText(drill, guess) : null;
  const style = result ? VERDICT[result.verdict] : null;

  const check = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseEstimate(text, drill.unit);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setGuess(parsed.value);
    setShown(true);
  };

  const reset = () => {
    setText('');
    setGuess(null);
    setError(null);
    setShown(false);
  };

  return (
    <div className="not-prose my-6 rounded-xl border border-line bg-surface p-4 sm:p-5" role="group" aria-labelledby={`${id}-title`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <Heading id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold text-ink">
          <FiTarget aria-hidden className="text-accent-ink" />
          Estimate: {drill.title}
        </Heading>
        <span className="text-xs text-ink-muted">Practice, not recorded</span>
      </div>
      <p className="leading-relaxed text-ink-soft">{drill.question}</p>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {drill.facts.map((f) => (
          <div key={f.id} className="flex justify-between gap-3 border-b border-line-soft py-1">
            <dt className="text-ink-muted">{f.label}</dt>
            <dd className="font-mono text-ink">{f.text}</dd>
          </div>
        ))}
      </dl>

      <form onSubmit={check} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm" htmlFor={`${id}-input`}>
          <span className="font-medium text-ink">
            Your estimate{drill.unitLabel ? ` (${drill.unit === 'count' ? drill.unitLabel : drill.unit === 'bytes' ? 'bytes' : 'bytes a second'})` : ''}
          </span>
          <input
            id={`${id}-input`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER[drill.unit]}
            autoComplete="off"
            inputMode="text"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="w-full min-w-40 rounded-lg border border-line-strong bg-page px-3 py-2 font-mono text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong">
          Check
        </button>
        {!shown && (
          <button type="button" onClick={() => setShown(true)} className="rounded-lg px-3 py-2 text-sm text-accent-ink hover:bg-accent-soft">
            Show the working
          </button>
        )}
      </form>

      <div aria-live="polite">
        {error && (
          <p id={`${id}-error`} className="mt-2 text-sm text-bad-ink">
            {error}
          </p>
        )}
        {result && style && (
          <p className={`mt-3 flex gap-2 rounded-lg border px-3 py-2 text-sm text-ink ${style.box}`}>
            {result.verdict === 'off' ? <FiXCircle aria-hidden className={`mt-0.5 shrink-0 ${style.ink}`} /> : <FiCheckCircle aria-hidden className={`mt-0.5 shrink-0 ${style.ink}`} />}
            <span>
              <span className={`font-semibold ${style.ink}`}>{style.title}. </span>
              {result.text}
            </span>
          </p>
        )}
      </div>

      {shown && (
        <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-sm">
          <p className="mb-1 font-medium text-ink">The working</p>
          <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
            {drill.steps.map((s) => (
              <li key={s.label}>
                <span className="font-medium text-ink">{s.label}:</span> {s.working}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-ink-soft">
            <span className="font-medium text-ink">Rule of thumb: </span>
            {drill.tip}
          </p>
          <button type="button" onClick={reset} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-accent-ink hover:bg-accent-soft">
            <FiRefreshCw aria-hidden /> Clear and try again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A round of drills of every kind. "New drills" draws a fresh round; the first
 * round is fixed so the page renders the same on the server and the client.
 */
export function EstimationRound({ initialSeed = 1 }: { initialSeed?: number }) {
  const [seed, setSeed] = useState(initialSeed);
  const round = drillRound(seed);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {round.length} questions, one of each kind. Within 2× counts as spot on; within 10× is the right order of magnitude.
        </p>
        <button
          type="button"
          onClick={() => setSeed(randomSeed())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-accent-line hover:bg-accent-soft"
        >
          <FiRefreshCw aria-hidden /> New drills
        </button>
      </div>
      {round.map((d) => (
        // Keyed by drill id, so a new round starts every drill empty.
        <EstimationDrill key={`${seed}-${d.id}`} drill={d} headingLevel={2} />
      ))}
    </div>
  );
}

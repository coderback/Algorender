'use client';

import { MarkSkin } from '@/viz/linear/ValueBox';
import { useWidth } from '@/viz/linear/useWidth';
import { MARKS } from '@/viz/marks';
import { Calc } from './Calc';
import type { BloomState } from './types';

/** Narrowest bit cell before the row wraps onto two lines. */
const MIN_BIT_PX = 32;

/**
 * A Bloom filter: the bit array, the k positions for the item in hand, the
 * verdict, and (for the demo only) the items really added, so a false
 * positive can be called what it is.
 */
export function BloomView({ state }: { state: BloomState }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const m = state.bits.length;
  const cols = width < m * (MIN_BIT_PX + 4) && m % 2 === 0 ? m / 2 : m;
  const n = state.added.length;
  const expected = (1 - Math.exp((-state.k * n) / m)) ** state.k;

  return (
    <div ref={ref} className="w-full">
      <p className="sr-only">{describe(state)}</p>
      {width > 0 && (
        <div aria-hidden className="flex flex-col gap-3">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-sm text-ink-soft">
              {state.item ? (
                <>
                  item <span className="rounded-md bg-sunken px-1.5 py-0.5 font-semibold text-ink">&quot;{state.item}&quot;</span>
                </>
              ) : (
                <span className="text-ink-muted">no item in hand</span>
              )}
            </span>
            {state.verdict && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border border-current px-3 py-1 text-sm font-semibold ${MARKS[state.verdict.mark].text}`}>
                <span aria-hidden>{MARKS[state.verdict.mark].glyph}</span>
                {state.verdict.text}
              </span>
            )}
          </div>
          <Calc lines={state.calc} rule={`each of the k = ${state.k} hash functions picks one bit: hᵢ(x) mod ${m}`} />
          <div role="group" aria-label="Bits">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Bits · m = {m}</div>
            <div className="mx-auto grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols * 52 }}>
              {state.bits.map((bit, i) => {
                const mark = state.bitMarks[i];
                return (
                  <div key={i} className="flex min-w-0 flex-col items-center gap-0.5">
                    <span className="font-mono text-[10px] leading-3 text-ink-muted">{i}</span>
                    <div
                      className={`relative grid h-10 w-full place-items-center rounded-md font-mono text-sm ring-1 ring-inset transition-colors ${
                        bit ? 'bg-sunken font-bold text-ink ring-ink-faint' : 'bg-surface text-ink-muted ring-line'
                      }`}
                      style={{ transitionDuration: 'var(--tween, 300ms)' }}
                    >
                      {mark || bit ? (
                        <MarkSkin mark={mark}>
                          <span className="relative">{bit}</span>
                        </MarkSkin>
                      ) : (
                        <span>{bit}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-xs text-ink-soft sm:grid-cols-2">
            <div>
              <dt className="inline text-ink-muted">Really added </dt>
              <dd className="inline font-mono text-ink">{n ? state.added.map((a) => `"${a}"`).join(', ') : 'nothing yet'}</dd>
              <div className="text-[11px] text-ink-muted">A real filter doesn&apos;t keep this list; the demo does, to check its answers.</div>
            </div>
            <div>
              <div>
                Expected false-positive rate with n = {n}: <span className="font-mono text-ink">{(expected * 100).toFixed(1)}%</span>
              </div>
              <div>
                Never-added items tested: <span className="font-mono text-ink">{state.negatives}</span>, false positives:{' '}
                <span className="font-mono text-ink">{state.falsePositives}</span>
              </div>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function describe(state: BloomState): string {
  const set = state.bits.flatMap((b, i) => (b ? [i] : []));
  const parts = [`Bloom filter with ${state.bits.length} bits and ${state.k} hash functions. Bits set to 1: ${set.length ? set.join(', ') : 'none'}.`];
  if (state.item) parts.push(`Item: "${state.item}".`);
  if (state.calc.length) parts.push(`${state.calc.join('; ')}.`);
  if (state.verdict) parts.push(`Answer: ${state.verdict.text}.`);
  parts.push(`Items really added: ${state.added.join(', ') || 'none'}. False positives so far: ${state.falsePositives} of ${state.negatives} tests of never-added items.`);
  return parts.join(' ');
}

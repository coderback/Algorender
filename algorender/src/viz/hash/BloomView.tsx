'use client';

import { cx } from '@/components/ui/cx';
import { useWidth } from '@/viz/linear/useWidth';
import { MARKS } from '@/viz/marks';
import { CAPTION, fillFor, MarkBadge, RULED_OUT } from '@/viz/parts';
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
                  item <span className="rounded-[10px] bg-mark-focus px-2 py-1 font-semibold text-on-mark">&quot;{state.item}&quot;</span>
                </>
              ) : (
                <span className="text-ink-muted">no item in hand</span>
              )}
            </span>
            {state.verdict && (
              <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold ring-2 ring-current ring-inset ${MARKS[state.verdict.mark].text}`}>
                <span aria-hidden>{MARKS[state.verdict.mark].glyph}</span>
                {state.verdict.text}
              </span>
            )}
          </div>
          <Calc lines={state.calc} rule={`each of the k = ${state.k} hash functions picks one bit: hᵢ(x) mod ${m}`} />
          <div role="group" aria-label="Bits">
            <div className={cx('mb-1.5', CAPTION)}>Bits · m = {m}</div>
            <div className="mx-auto grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols * 52 }}>
              {state.bits.map((bit, i) => {
                const mark = state.bitMarks[i];
                return (
                  <div key={i} className="flex min-w-0 flex-col items-center gap-0.5">
                    {/* A set bit is filled, a clear one paper grey; the bits in play take their mark. */}
                    <div
                      className={cx(
                        'relative grid h-10 w-full place-items-center rounded-[10px] font-mono text-sm transition-colors',
                        mark ? `${fillFor(mark)} font-bold` : bit ? `${fillFor(null)} font-bold` : RULED_OUT,
                      )}
                      style={{ transitionDuration: 'var(--tween, 300ms)' }}
                    >
                      {bit}
                      <MarkBadge mark={mark} />
                    </div>
                    <span className="font-mono text-[11px] leading-3 text-ink-muted">{i}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <dl className="grid gap-2.5 text-xs text-ink-soft sm:grid-cols-2">
            <div className="rounded-[18px] bg-sunken p-3">
              <dt className="inline text-ink-muted">Really added </dt>
              <dd className="inline font-mono text-ink">{n ? state.added.map((a) => `"${a}"`).join(', ') : 'nothing yet'}</dd>
              <div className="text-[11px] text-ink-muted">A real filter doesn&apos;t keep this list; the demo does, to check its answers.</div>
            </div>
            <div className="rounded-[18px] bg-sunken p-3">
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

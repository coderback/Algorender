import type { ReactNode } from 'react';
import { CountTile } from '@/components/ui/Numbers';
import { cx } from '@/components/ui/cx';
import type { TrackColour } from '@/data/tracks';
import type { VarValue } from '@/engine/types';
import type { LegendEntry, StatSpec } from '@/engine/module';
import { MARKS, NEUTRAL, TONES, type MarkKey } from '@/viz/marks';

/** A side card: an uppercase title over its content. */
export function Panel({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex min-w-0 flex-col gap-3.5 rounded-card bg-surface p-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.06em] text-ink-muted uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** What is happening and why. Announced to screen readers when the learner steps (not during playback). */
export function Narration({ note, live, step }: { note: string; live: boolean; step?: number }) {
  return (
    <div className="flex min-h-14 items-start gap-3 rounded-[20px] bg-sunken px-4 py-3.5">
      {step != null && (
        <span className="mt-0.5 shrink-0 rounded-lg bg-surface px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap text-ink">Step {step}</span>
      )}
      <p data-testid="narration" aria-live={live ? 'polite' : 'off'} className="min-w-0 text-base leading-normal text-ink">
        {note}
      </p>
    </div>
  );
}

/** Line numbers for code: every line (the learner's code) or only the non-blank ones (pseudo-code). */
function lineNumbers(lines: readonly string[], numberAll: boolean) {
  const numbers: (number | null)[] = [];
  let n = 0;
  for (const line of lines) numbers.push(!numberAll && line.trim() === '' ? null : ++n);
  return numbers;
}

/** The dark code card, with the current line lit. */
export function CodePanel({
  lines,
  current,
  title = 'Pseudo-code',
  numberAll = false,
  className,
}: {
  lines: readonly string[];
  current: number | null;
  title?: string;
  /** Number every line like an editor (the learner's code), not just the non-blank ones (pseudo-code). */
  numberAll?: boolean;
  className?: string;
}) {
  const numbers = lineNumbers(lines, numberAll);
  return (
    <section className={cx('flex min-w-0 flex-col gap-3 rounded-card bg-code p-5 text-code-ink', className)}>
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-code-muted uppercase">{title}</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-code-muted">Run an operation to see its steps here.</p>
      ) : (
        <ol className="flex flex-col gap-0.5 font-mono text-[13px] leading-normal">
          {lines.map((line, i) => {
            const blank = numbers[i] == null;
            const active = i === current;
            return (
              <li
                key={i}
                aria-current={active ? 'step' : undefined}
                className={cx(
                  'flex gap-3 rounded-[10px] px-2.5 py-1 transition-colors duration-150 ease-standard',
                  active ? 'bg-code-highlight font-semibold text-code-ink' : 'text-code-ink/80',
                )}
              >
                <span className={cx('w-4 shrink-0 text-right select-none', active ? 'text-feature-accent' : 'text-code-muted')}>{numbers[i] ?? ''}</span>
                <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">{blank ? ' ' : line}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Count tiles cycle through a few pastels, so neighbouring counts read apart. */
const TILE_COLOURS: (TrackColour | undefined)[] = ['sky', 'peach', undefined, 'mint'];

/** The running counts as tiles, with the step's variables as chips under them. */
export function CountsPanel({ stats, values, vars }: { stats: readonly StatSpec[]; values: Record<string, number>; vars?: Record<string, VarValue> }) {
  const entries = vars ? Object.entries(vars) : null;
  if (stats.length === 0 && !entries) return null;
  return (
    <Panel title={stats.length > 0 ? 'Counts' : 'Variables'}>
      {stats.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2">
          {stats.map((s, i) => (
            <CountTile key={s.key} track={TILE_COLOURS[i % TILE_COLOURS.length]} value={values[s.key] ?? 0} label={s.label} />
          ))}
        </div>
      )}
      {entries && (
        <div role="group" aria-label="Variables">
          {entries.length === 0 ? (
            <p className="text-sm text-ink-muted">No variables in this step.</p>
          ) : (
            <dl className="flex flex-wrap gap-2 font-mono text-[13px]">
              {entries.map(([name, value]) => (
                <div key={name} className="flex gap-1.5 rounded-[10px] bg-sunken px-2.5 py-1.5">
                  <dt className="text-ink-muted">{name} =</dt>
                  <dd className="text-ink">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Text on a mark's fill: white on compare's blue, dark on every other mark (see globals.css). */
const onFill = (mark: MarkKey) => (mark === 'compare' ? 'text-white' : 'text-on-mark');

export function Legend({ entries }: { entries: readonly LegendEntry[] }) {
  const swatch = 'flex size-[26px] shrink-0 items-center justify-center rounded-lg text-xs font-bold';
  return (
    <Panel title="Legend">
      <ul className="grid grid-cols-2 gap-2.5 text-sm text-ink">
        {entries.map((entry) => {
          if (typeof entry === 'object' && 'neutral' in entry) {
            return (
              <li key="neutral" className="flex items-center gap-2.5">
                <span className={cx(swatch, NEUTRAL.bg)} aria-hidden />
                {entry.neutral}
              </li>
            );
          }
          if (typeof entry === 'object' && 'tone' in entry) {
            return (
              <li key={`tone-${entry.tone}`} className="flex items-center gap-2.5">
                <span className={cx(swatch, 'bg-sunken')} aria-hidden>
                  <span className="h-1 w-3.5 rounded-full" style={{ background: TONES[entry.tone] }} />
                </span>
                {entry.label}
              </li>
            );
          }
          const mark = typeof entry === 'string' ? entry : entry.mark;
          const style = MARKS[mark];
          return (
            <li key={mark} className="flex items-center gap-2.5">
              <span className={cx(swatch, style.bg, onFill(mark), style.glyph.length > 1 && 'text-[9px]')} aria-hidden>
                {style.glyph}
              </span>
              {typeof entry === 'string' ? style.label : entry.label}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

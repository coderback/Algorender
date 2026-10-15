import type { ReactNode } from 'react';
import type { VarValue } from '@/engine/types';
import type { LegendEntry } from '@/engine/module';
import { MARKS, NEUTRAL } from '@/viz/marks';

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xs ${className}`}>
      <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

/** What is happening and why. Announced to screen readers when the learner steps (not during playback). */
export function Narration({ note, live }: { note: string; live: boolean }) {
  return (
    <div
      data-testid="narration"
      aria-live={live ? 'polite' : 'off'}
      className="min-h-14 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-[15px] leading-relaxed text-gray-800"
    >
      {note}
    </div>
  );
}

export function CodePanel({ lines, current }: { lines: readonly string[]; current: number | null }) {
  // Number only non-blank lines, like an editor gutter would for this pseudo-code.
  const numbers: (number | null)[] = [];
  let n = 0;
  for (const line of lines) numbers.push(line.trim() === '' ? null : ++n);

  return (
    <Panel title="Pseudo-code">
      <ol className="py-2 font-mono text-[12.5px] leading-6">
        {lines.map((line, i) => {
          const blank = numbers[i] == null;
          const active = i === current;
          return (
            <li
              key={i}
              aria-current={active ? 'step' : undefined}
              className={`flex gap-3 border-l-4 pr-3 pl-3 transition-colors ${
                active ? 'border-blue-600 bg-blue-50 font-semibold text-gray-900' : 'border-transparent text-gray-600'
              }`}
            >
              <span className="w-4 shrink-0 text-right text-gray-400 select-none">{numbers[i] ?? ''}</span>
              <span className="whitespace-pre-wrap">{blank ? ' ' : line}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function StatsPanel({ stats, values }: { stats: readonly { key: string; label: string }[]; values: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((s) => (
        <div key={s.key} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-xs">
          <div className="text-xs text-gray-500">{s.label}</div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{values[s.key] ?? 0}</div>
        </div>
      ))}
    </div>
  );
}

export function VarsPanel({ vars }: { vars: Record<string, VarValue> }) {
  const entries = Object.entries(vars);
  return (
    <Panel title="Variables">
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-400">None in this step.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-3 font-mono text-sm">
          {entries.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-gray-500">{name}</dt>
              <dd className="text-gray-900">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

export function Legend({ entries }: { entries: readonly LegendEntry[] }) {
  return (
    <Panel title="Legend">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-sm text-gray-700">
        {entries.map((entry) => {
          if (typeof entry === 'object' && 'neutral' in entry) {
            return (
              <li key="neutral" className="flex items-center gap-2">
                <span className={`h-4 w-3 rounded-sm ring-1 ring-black/10 ring-inset ${NEUTRAL.bg}`} aria-hidden />
                <span className="w-6" aria-hidden />
                {entry.neutral}
              </li>
            );
          }
          const mark = typeof entry === 'string' ? entry : entry.mark;
          const style = MARKS[mark];
          return (
            <li key={mark} className="flex items-center gap-2">
              <span className={`h-4 w-3 shrink-0 rounded-sm ring-1 ring-black/10 ring-inset ${style.bg}`} aria-hidden />
              <span className={`w-6 shrink-0 text-center text-xs font-bold ${style.text}`} aria-hidden>
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

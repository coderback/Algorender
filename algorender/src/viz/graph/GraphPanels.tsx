'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { MARKS } from '@/viz/marks';
import type { AdjacencyPanel, Chip, ChipsPanel, FactsPanel, GroupsPanel, Mark, MatrixPanel, Panel, TablePanel } from './types';

/** Marks dark enough to need white text: white clears 4.5:1 only on the deep blue of compare. */
const DARK_MARKS: ReadonlySet<Mark> = new Set<Mark>(['compare']);
export const onMark = (mark: Mark) => (DARK_MARKS.has(mark) ? 'text-white' : 'text-on-mark');
export const svgOnMark = (mark: Mark) => (DARK_MARKS.has(mark) ? 'fill-white' : 'fill-on-mark');

const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/** Panels whose content is wide enough to deserve the full row. */
function isWide(panel: Panel): boolean {
  if (panel.kind === 'matrix') return panel.labels.length > 5;
  if (panel.kind === 'chips') return panel.chips.length > 8;
  return false;
}

export function GraphPanels({ panels }: { panels: readonly Panel[] }) {
  const id = useId();
  if (panels.length === 0) return null;
  // Panels are labelled groups, not landmarks or headings: a page can show
  // several visualisers, and their panel titles don't belong in its outline.
  return (
    <div className="@container min-w-0">
      <div className="grid gap-2.5 @lg:grid-cols-2">
      {panels.map((panel) => (
        <div key={panel.id} role="group" aria-labelledby={`${id}-${panel.id}`} className={`min-w-0 rounded-[18px] bg-sunken p-3 ${isWide(panel) ? '@lg:col-span-2' : ''}`}>
          <div id={`${id}-${panel.id}`} className="mb-2 text-xs font-semibold text-ink-soft">
            {panel.title}
          </div>
          <PanelBody panel={panel} />
        </div>
      ))}
      </div>
    </div>
  );
}

function PanelBody({ panel }: { panel: Panel }) {
  switch (panel.kind) {
    case 'chips':
      return <ChipsBody panel={panel} />;
    case 'table':
      return <TableBody panel={panel} />;
    case 'matrix':
      return <MatrixBody panel={panel} />;
    case 'adjacency':
      return <AdjacencyBody panel={panel} />;
    case 'groups':
      return <GroupsBody panel={panel} />;
    case 'facts':
      return <FactsBody panel={panel} />;
  }
}

export function ChipView({ chip, layout = true }: { chip: Chip; layout?: boolean }) {
  const meta = chip.mark ? MARKS[chip.mark] : null;
  const tone = chip.mark
    ? `${meta!.bg} ${onMark(chip.mark)} border-transparent`
    : 'border-transparent bg-surface text-ink';
  return (
    <motion.li
      layout={layout ? 'position' : false}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className={`inline-flex items-baseline gap-1 rounded-[10px] border px-2 py-0.5 font-mono text-sm transition-colors ${tone}`}
      style={TWEEN}
    >
      {meta && (
        <span aria-hidden className="text-[10px] font-bold">
          {meta.glyph}
        </span>
      )}
      <span className="font-semibold">{chip.label}</span>
      {chip.sub != null && <span className="text-xs">{chip.sub}</span>}
    </motion.li>
  );
}

function ChipsBody({ panel }: { panel: ChipsPanel }) {
  return (
    <div>
      {panel.ends && panel.chips.length > 0 && (
        <div className="mb-1 flex justify-between text-[11px] text-ink-muted" aria-hidden>
          <span>← {panel.ends[0]}</span>
          <span>{panel.ends[1]} →</span>
        </div>
      )}
      <ol className="flex min-h-7 flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {panel.chips.map((chip) => (
            <ChipView key={chip.id} chip={chip} />
          ))}
        </AnimatePresence>
        {panel.chips.length === 0 && <li className="text-sm text-ink-muted">{panel.empty}</li>}
      </ol>
    </div>
  );
}

function MarkedCell({ mark, children, className = '' }: { mark?: Mark; children: ReactNode; className?: string }) {
  const meta = mark ? MARKS[mark] : null;
  return (
    <td
      className={`relative px-1.5 py-0.5 transition-colors ${mark ? `${meta!.bg} ${onMark(mark)} font-semibold` : ''} ${className}`}
      style={TWEEN}
    >
      {meta && (
        <span aria-hidden className="absolute top-0 right-0.5 text-[8px] leading-none">
          {meta.glyph}
        </span>
      )}
      {children}
    </td>
  );
}

function TableBody({ panel }: { panel: TablePanel }) {
  return (
    <table className="w-full border-collapse font-mono text-xs tabular-nums">
      <thead>
        <tr className="border-b border-line text-left text-ink-muted">
          {panel.columns.map((c) => (
            <th key={c} scope="col" className="px-1.5 py-0.5 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {panel.rows.map((row) => (
          <tr key={row.id} className="border-b border-line-soft last:border-0">
            {row.cells.map((cell, i) =>
              i === 0 ? (
                <MarkedCell key={i} mark={row.mark} className="w-10 rounded-sm">
                  {cell}
                </MarkedCell>
              ) : (
                <MarkedCell key={i} mark={row.cellMarks?.[i]} className={row.cellMarks?.[i] ? '' : 'text-ink'}>
                  {cell}
                </MarkedCell>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatrixBody({ panel }: { panel: MatrixPanel }) {
  const marks = new Map(panel.marks.map((m) => [`${m.row},${m.col}`, m.mark]));
  const axis = panel.axis?.index ?? -1;
  const n = panel.labels.length;
  if (n === 0) return <p className="text-sm text-ink-muted">No vertices.</p>;
  return (
    <div>
      <table className="mx-auto border-collapse text-center font-mono text-xs tabular-nums sm:mx-0">
        <thead>
          <tr>
            <th className="w-6" aria-hidden />
            {panel.labels.map((l, c) => (
              <th key={l} scope="col" className={`h-6 w-7 font-semibold ${c === axis ? 'bg-warn-soft text-warn-ink' : 'text-ink-muted'}`}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {panel.cells.map((row, r) => (
            <tr key={panel.labels[r]}>
              <th scope="row" className={`h-6 w-6 font-semibold ${r === axis ? 'bg-warn-soft text-warn-ink' : 'text-ink-muted'}`}>
                {panel.labels[r]}
              </th>
              {row.map((cell, c) => {
                const mark = marks.get(`${r},${c}`);
                return (
                  <MarkedCell
                    key={panel.labels[c]}
                    mark={mark}
                    className={`h-6 min-w-7 border border-line-soft ${!mark && (r === axis || c === axis) ? 'bg-warn-soft' : ''} ${
                      !mark && panel.dimZeros && cell === '0' ? 'text-ink-muted' : !mark ? 'text-ink' : ''
                    }`}
                  >
                    {cell}
                  </MarkedCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {panel.caption && <p className="mt-1.5 text-xs text-ink-muted">{panel.caption}</p>}
    </div>
  );
}

function AdjacencyBody({ panel }: { panel: AdjacencyPanel }) {
  if (panel.rows.length === 0) return <p className="text-sm text-ink-muted">No vertices.</p>;
  return (
    <ul className="space-y-1">
      {panel.rows.map((row) => {
        const meta = row.mark ? MARKS[row.mark] : null;
        return (
          <li key={row.id} className="flex items-center gap-1.5">
            <span
              className={`inline-flex h-6 w-10 shrink-0 items-center justify-center gap-0.5 rounded-md font-mono text-sm font-semibold transition-colors ${
                row.mark ? `${meta!.bg} ${onMark(row.mark)}` : 'bg-sunken text-ink'
              }`}
              style={TWEEN}
            >
              {meta && (
                <span aria-hidden className="text-[9px]">
                  {meta.glyph}
                </span>
              )}
              {row.id}
            </span>
            <span aria-hidden className="text-ink-muted">
              →
            </span>
            <ol className="flex min-w-0 flex-wrap items-center gap-1">
              <AnimatePresence initial={false} mode="popLayout">
                {row.entries.map((chip) => (
                  <ChipView key={chip.id} chip={chip} />
                ))}
              </AnimatePresence>
              {row.entries.length === 0 && <li className="font-mono text-xs text-ink-muted">∅</li>}
            </ol>
          </li>
        );
      })}
    </ul>
  );
}

function GroupsBody({ panel }: { panel: GroupsPanel }) {
  if (panel.groups.length === 0) return <p className="text-sm text-ink-muted">{panel.empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      <AnimatePresence initial={false} mode="popLayout">
        {panel.groups.map((g) => {
          const meta = g.mark ? MARKS[g.mark] : null;
          return (
            <motion.li
              key={g.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1 pr-2 pl-1"
            >
              <span
                className={`inline-flex h-5 min-w-7 items-center justify-center gap-0.5 rounded px-1 text-[11px] font-semibold transition-colors ${
                  g.mark ? `${meta!.bg} ${onMark(g.mark)}` : 'bg-sunken text-ink-soft'
                }`}
                style={TWEEN}
              >
                {meta && <span aria-hidden>{meta.glyph}</span>}
                {g.label}
              </span>
              <span className="font-mono text-sm text-ink">{`{${g.members.join(', ')}}`}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function FactsBody({ panel }: { panel: FactsPanel }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {panel.facts.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-ink-muted">{f.label}</dt>
          <dd className={`font-mono font-semibold ${f.mark ? MARKS[f.mark].text : 'text-ink'}`}>
            {f.mark && <span aria-hidden>{MARKS[f.mark].glyph} </span>}
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

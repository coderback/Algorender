'use client';

import { Reorder, useDragControls } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { FiArrowDown, FiArrowUp, FiChevronLeft, FiChevronRight, FiMenu, FiPlus, FiX } from 'react-icons/fi';
import type { Language } from '../protocol';
import { braceIndented, type ParsonsLine, type Placed } from '../formats/parsons';

export type Arrangement = { pool: string[]; program: Placed[] };

const MAX_INDENT = 4;

/**
 * Put the given lines in order. Every action is a button (keyboard and screen
 * readers), and lines in the program can also be dragged by their handle.
 * Python asks for indentation too; JavaScript's follows the braces.
 */
export function ParsonsStage({
  lines,
  arrangement,
  onChange,
  language,
  flagged,
}: {
  lines: readonly ParsonsLine[];
  arrangement: Arrangement;
  onChange: (next: Arrangement) => void;
  language: Language;
  /** Index in the program of a line the learner asked to have pointed out. */
  flagged: number | null;
}) {
  const [said, setSaid] = useState('');
  const uid = useId();
  const byId = new Map(lines.map((l) => [l.id, l]));
  const python = language === 'python';
  const { pool, program } = arrangement;
  const shownIndent = python ? program.map((p) => p.indent) : braceIndented(program.map((p) => byId.get(p.id)!.text)).map((l) => (l.length - l.trimStart().length) / 2);

  const text = (id: string) => byId.get(id)!.text;
  const update = (next: Arrangement, announcement: string) => {
    onChange(next);
    setSaid(announcement);
  };

  const add = (id: string) =>
    update({ pool: pool.filter((p) => p !== id), program: [...program, { id, indent: 0 }] }, `Added “${text(id)}” as line ${program.length + 1}.`);
  const remove = (i: number) =>
    update({ pool: [...pool, program[i].id], program: program.filter((_, k) => k !== i) }, `Removed “${text(program[i].id)}”.`);
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= program.length) return;
    const next = [...program];
    [next[i], next[j]] = [next[j], next[i]];
    update({ pool, program: next }, `Moved “${text(program[i].id)}” to line ${j + 1} of ${program.length}.`);
  };
  const indent = (i: number, by: number) => {
    const level = Math.min(MAX_INDENT, Math.max(0, program[i].indent + by));
    if (level === program[i].indent) return;
    update({ pool, program: program.map((p, k) => (k === i ? { ...p, indent: level } : p)) }, `“${text(program[i].id)}” is now indented ${level} ${level === 1 ? 'level' : 'levels'}.`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div role="group" aria-labelledby={`${uid}-pool`} className="rounded-xl border border-line-soft bg-surface p-3 shadow-xs">
        <div id={`${uid}-pool`} className="mb-2 text-sm font-semibold text-ink">
          Lines to use <span className="font-normal text-ink-muted">· some aren’t needed</span>
        </div>
        {pool.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-muted">All lines are in your program.</p>
        ) : (
          <ul className="space-y-1.5">
            {pool.map((id) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-2 py-1.5">
                <code className="min-w-0 flex-1 font-mono text-[13px] break-words whitespace-pre-wrap text-ink">{text(id)}</code>
                <IconButton label={`Add “${text(id)}” to your program`} onClick={() => add(id)}>
                  <FiPlus />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div role="group" aria-labelledby={`${uid}-program`} className="rounded-xl border border-line-soft bg-surface p-3 shadow-xs">
        <div id={`${uid}-program`} className="mb-2 text-sm font-semibold text-ink">
          Your program{' '}
          <span className="font-normal text-ink-muted">· {python ? 'order and indent the lines' : 'put the lines in order'}</span>
        </div>
        {program.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-muted">Add lines from the left, in the order they should run.</p>
        ) : (
          <Reorder.Group
            axis="y"
            values={program.map((p) => p.id)}
            onReorder={(ids: string[]) => onChange({ pool, program: ids.map((id) => program.find((p) => p.id === id)!) })}
            className="space-y-1.5"
          >
            {program.map((p, i) => (
              <ProgramLine
                key={p.id}
                id={p.id}
                text={text(p.id)}
                position={i}
                count={program.length}
                indent={shownIndent[i]}
                python={python}
                flagged={flagged === i}
                onMove={(by) => move(i, by)}
                onIndent={(by) => indent(i, by)}
                onRemove={() => remove(i)}
              />
            ))}
          </Reorder.Group>
        )}
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}

function ProgramLine({
  id,
  text,
  position,
  count,
  indent,
  python,
  flagged,
  onMove,
  onIndent,
  onRemove,
}: {
  id: string;
  text: string;
  position: number;
  count: number;
  indent: number;
  python: boolean;
  flagged: boolean;
  onMove: (by: number) => void;
  onIndent: (by: number) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className={`flex items-center gap-1.5 rounded-lg border bg-surface px-1.5 py-1 ${
        flagged ? 'border-warn-line ring-2 ring-warn-line' : 'border-line'
      }`}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none rounded p-1 text-ink-muted hover:bg-sunken active:cursor-grabbing"
        title="Drag to reorder"
      >
        <FiMenu />
      </button>
      <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-muted" aria-hidden>
        {position + 1}
      </span>
      <code className="min-w-0 flex-1 font-mono text-[13px] break-words whitespace-pre-wrap text-ink" style={{ paddingLeft: `${indent * 2}ch` }}>
        {text}
      </code>
      {python && (
        <>
          <IconButton label={`Outdent “${text}”`} onClick={() => onIndent(-1)} disabled={indent === 0}>
            <FiChevronLeft />
          </IconButton>
          <IconButton label={`Indent “${text}”`} onClick={() => onIndent(1)} disabled={indent >= MAX_INDENT}>
            <FiChevronRight />
          </IconButton>
        </>
      )}
      <IconButton label={`Move “${text}” up`} onClick={() => onMove(-1)} disabled={position === 0}>
        <FiArrowUp />
      </IconButton>
      <IconButton label={`Move “${text}” down`} onClick={() => onMove(1)} disabled={position === count - 1}>
        <FiArrowDown />
      </IconButton>
      <IconButton label={`Remove “${text}”`} onClick={onRemove}>
        <FiX />
      </IconButton>
    </Reorder.Item>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

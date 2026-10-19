'use client';

import { useState } from 'react';
import { FiTrash2 } from 'react-icons/fi';
import { KIND_INFO, LIMITS } from '@/systems/design';
import type { CaseStudy, Component, Design, Workload } from '@/systems/design/types';
import { KIND_ICON } from './Diagram';
import { PORTS, refOf, targetsFor } from './wiring';

type Limit = { min: number; max: number; step?: number; unit?: string };

/** Bounds from the engine: `${kind}.${field}`, or `workload.${field}` for the clients' traffic. */
const limitOf = (kind: string, field: string): Limit => LIMITS[`${kind}.${field}`] ?? { min: 0, max: 1_000_000 };

type NumberSpec = { field: string; label: string; help?: string };

/** The number settings of each kind, in the order the inspector shows them. */
const NUMBERS: Partial<Record<Component['kind'], readonly NumberSpec[]>> = {
  'rate-limiter': [
    { field: 'perSecond', label: 'Requests a second', help: 'The long-run rate let through.' },
    { field: 'burst', label: 'Burst', help: 'How many can arrive at once on top of that.' },
  ],
  app: [
    { field: 'instances', label: 'Instances' },
    { field: 'workers', label: 'Workers per instance', help: 'Requests one instance handles at a time.' },
    { field: 'serviceMs', label: 'Work per request (ms)' },
    { field: 'fanout', label: 'Writes per write', help: 'More than 1 copies each write, like a post into every follower’s feed.' },
  ],
  cache: [
    { field: 'nodes', label: 'Nodes' },
    { field: 'capacity', label: 'Keys per node' },
    { field: 'serviceMs', label: 'Time per lookup (ms)' },
  ],
  database: [
    { field: 'shards', label: 'Shards', help: 'Partitions by key, each with its own primary.' },
    { field: 'replicas', label: 'Read replicas per shard' },
    { field: 'workers', label: 'Connections per node' },
    { field: 'readMs', label: 'Time per read (ms)' },
    { field: 'writeMs', label: 'Time per write (ms)' },
    { field: 'replicaLagMs', label: 'Replica lag (ms)', help: 'How far behind the primary a replica runs.' },
  ],
  queue: [{ field: 'consumers', label: 'Consumers', help: 'Workers taking writes off the queue.' }],
};

const WORKLOAD: readonly NumberSpec[] = [
  { field: 'rps', label: 'Requests a second' },
  { field: 'readShare', label: 'Share of reads (0–1)' },
  { field: 'keys', label: 'Distinct keys' },
  { field: 'skew', label: 'Skew', help: '0 spreads requests evenly over keys; about 1 makes a few keys hot.' },
];

const SPIKE: readonly NumberSpec[] = [
  { field: 'at', label: 'Spike starts at' },
  { field: 'seconds', label: 'Spike lasts' },
  { field: 'factor', label: 'Traffic multiplied by' },
];

/** Settings for the selected component: its name, numbers, choices and wiring. */
export function Inspector({
  design,
  component: c,
  onChange,
  onRemove,
  workloadLocked,
  fixed,
  idPrefix = 'inspect',
}: {
  design: Design;
  component: Component;
  onChange: (next: Component) => void;
  onRemove: () => void;
  workloadLocked: boolean;
  /** Settings a case study fixes (src/systems/design/types.ts). */
  fixed?: CaseStudy['fixed'];
  /** Starts every element id, so several canvases can share a page (a lesson). */
  idPrefix?: string;
}) {
  const Icon = KIND_ICON[c.kind];
  const set = (field: string, value: unknown) => onChange({ ...c, [field]: value } as Component);
  const id = `${idPrefix}-${c.id}`;

  return (
    <div role="group" aria-labelledby={`${id}-title`} className="space-y-4 rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
      <div className="flex items-start gap-2">
        <Icon aria-hidden className="mt-1 h-5 w-5 shrink-0 text-accent-ink" />
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-title`} className="font-semibold text-ink">
            {KIND_INFO[c.kind].name}
          </h3>
          <p className="text-sm text-ink-soft">{KIND_INFO[c.kind].blurb}</p>
        </div>
        {c.kind !== 'clients' && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-sm text-ink-soft hover:border-bad-line hover:text-bad-ink"
          >
            <FiTrash2 aria-hidden /> Remove
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField key={`${c.id}-label`} id={`${id}-label`} label="Name" value={c.label} onCommit={(v) => set('label', v)} />

        {c.kind === 'clients' &&
          (workloadLocked ? (
            <p className="text-sm text-ink-soft sm:col-span-2">The traffic is set by the case study.</p>
          ) : (
            <>
              {WORKLOAD.map((s) => (
                <NumberField
                  key={`${c.id}-${s.field}`}
                  id={`${id}-${s.field}`}
                  spec={s}
                  limit={limitOf('workload', s.field)}
                  value={c.workload[s.field as keyof Workload] as number}
                  onCommit={(v) => onChange({ ...c, workload: { ...c.workload, [s.field]: v } })}
                />
              ))}
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                <input
                  type="checkbox"
                  checked={c.workload.spike != null}
                  onChange={(e) => {
                    const workload: Workload = { ...c.workload };
                    if (e.target.checked) workload.spike = { at: 3, seconds: 2, factor: 3 };
                    else delete workload.spike;
                    onChange({ ...c, workload });
                  }}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                Add a traffic spike
              </label>
              {c.workload.spike &&
                SPIKE.map((s) => (
                  <NumberField
                    key={`${c.id}-spike-${s.field}`}
                    id={`${id}-spike-${s.field}`}
                    spec={s}
                    limit={limitOf('workload.spike', s.field)}
                    value={c.workload.spike![s.field as 'at' | 'seconds' | 'factor']}
                    onCommit={(v) => onChange({ ...c, workload: { ...c.workload, spike: { ...c.workload.spike!, [s.field]: v } } })}
                  />
                ))}
            </>
          ))}

        {(NUMBERS[c.kind] ?? []).map((s) => {
          const value = (c as unknown as Record<string, number>)[s.field];
          if (c.kind === 'app' && s.field === 'fanout' && fixed?.fanout != null) {
            return (
              <p key={`${c.id}-${s.field}`} className="text-sm text-ink-soft">
                {s.label}: <span className="font-medium text-ink">{value}</span>, set by the case study.
              </p>
            );
          }
          const limit = limitOf(c.kind, s.field);
          const floor = c.kind === 'database' && s.field === 'replicaLagMs' ? fixed?.minReplicaLagMs : undefined;
          return (
            <NumberField
              key={`${c.id}-${s.field}`}
              id={`${id}-${s.field}`}
              spec={floor != null ? { ...s, help: `${s.help ?? ''} The case needs at least ${floor} ms.`.trim() } : s}
              limit={floor != null ? { ...limit, min: Math.max(limit.min, floor) } : limit}
              value={value}
              onCommit={(v) => set(s.field, v)}
            />
          );
        })}

        {c.kind === 'load-balancer' && (
          <SelectField
            id={`${id}-policy`}
            label="Policy"
            value={c.policy}
            options={[
              ['round-robin', 'Round robin'],
              ['least-connections', 'Least connections'],
              ['random', 'Random'],
            ]}
            onChange={(v) => set('policy', v)}
          />
        )}
        {c.kind === 'cache' && (
          <>
            <SelectField
              id={`${id}-policy`}
              label="Eviction"
              value={c.policy}
              options={[
                ['lru', 'LRU: least recently used'],
                ['lfu', 'LFU: least frequently used'],
              ]}
              onChange={(v) => set('policy', v)}
            />
            <SelectField
              id={`${id}-writes`}
              label="On a write"
              value={c.writes}
              options={[
                ['invalidate', 'Invalidate the cached copy'],
                ['write-through', 'Write through (update it)'],
              ]}
              onChange={(v) => set('writes', v)}
            />
          </>
        )}
        {c.kind === 'database' && (
          <>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" checked={c.failover} onChange={(e) => set('failover', e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
              Fail over to a replica when a primary crashes
            </label>
            {c.failover && (
              <NumberField
                key={`${c.id}-failoverMs`}
                id={`${id}-failoverMs`}
                spec={{ field: 'failoverMs', label: 'Failover takes (ms)' }}
                limit={limitOf('database', 'failoverMs')}
                value={c.failoverMs}
                onCommit={(v) => set('failoverMs', v)}
              />
            )}
          </>
        )}
      </div>

      {PORTS[c.kind].length > 0 && (
        <fieldset className="grid gap-3 border-t border-line-soft pt-3 sm:grid-cols-2">
          <legend className="sr-only">Connections</legend>
          {PORTS[c.kind].map((port) => {
            const targets = targetsFor(design, c, port);
            const value = refOf(c, port.field);
            return (
              <SelectField
                key={port.field}
                id={`${id}-${port.field}`}
                label={port.label}
                value={targets.some((t) => t.id === value) ? value : ''}
                options={[['', port.optional ? '— nothing: the app answers itself —' : '— not connected —'], ...targets.map((t) => [t.id, t.label] as [string, string])]}
                onChange={(v) => set(port.field, v)}
                invalid={value === '' ? !port.optional : !targets.some((t) => t.id === value)}
              />
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line aria-invalid:border-bad-line';

/** A number input that keeps what the learner types until it is a valid value, then commits it. */
function NumberField({ id, spec, limit, value, onCommit }: { id: string; spec: NumberSpec; limit: Limit; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const n = Number(text);
  const error =
    draft == null
      ? null
      : text.trim() === '' || !Number.isFinite(n)
        ? 'Enter a number'
        : n < limit.min || n > limit.max
          ? `Between ${limit.min} and ${limit.max}`
          : null;
  const describedBy = [spec.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {spec.label}
        {limit.unit ? ` (${limit.unit})` : ''}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={limit.min}
        max={limit.max}
        step={limit.step ?? 1}
        value={text}
        aria-invalid={error != null}
        aria-describedby={describedBy}
        onChange={(e) => {
          const t = e.target.value;
          const v = Number(t);
          if (t.trim() !== '' && Number.isFinite(v) && v >= limit.min && v <= limit.max) {
            setDraft(null);
            onCommit(v);
          } else setDraft(t);
        }}
        onBlur={() => setDraft(null)}
        className={inputClass}
      />
      {spec.help && (
        <p id={`${id}-help`} className="mt-0.5 text-xs text-ink-muted">
          {spec.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-0.5 text-xs text-bad-ink">
          {error}
        </p>
      )}
    </div>
  );
}

function TextField({ id, label, value, onCommit }: { id: string; label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={draft ?? value}
        maxLength={30}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          if (t.trim()) onCommit(t.trim());
        }}
        onBlur={() => setDraft(null)}
        className={inputClass}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={inputClass}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

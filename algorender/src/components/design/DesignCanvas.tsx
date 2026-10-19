'use client';

import { MotionConfig } from 'motion/react';
import { useId, useState, useSyncExternalStore } from 'react';
import { FiAlertTriangle, FiCheck, FiLink, FiPlay, FiPlus, FiRotateCcw, FiTrash2 } from 'react-icons/fi';
import { evaluate, KIND_INFO, LIMITS, newComponent, simulate, validateDesign, withWorkload } from '@/systems/design';
import type { CaseStudy, Check, Component, Design, Fault, Ref, SimResult } from '@/systems/design/types';
import { Hints } from '@/workspace/Hints';
import { Diagram, KIND_ICON } from './Diagram';
import { configSummary, pct } from './format';
import { Inspector } from './Inspector';
import { recordDesign } from './progress';
import { Results } from './Results';
import { decodeDesign, encodeDesign, loadSaved, save } from './url';
import { addComponent, edgesOf, freshId, PALETTE, problemIds, removeComponent, replaceComponent } from './wiring';

type Variant = 'page' | 'lesson';
type Persist = 'url' | 'storage' | 'none';

type Run = {
  result: SimResult;
  faultResult: SimResult | null;
  checks: readonly Check[] | null;
  passed: boolean | null;
  /** The design and faults the run used, to say when the design has changed since. */
  key: string;
  faults: readonly Fault[];
};

const noSubscribe = () => () => {};
const SECONDS = [5, 10, 20] as const;
const startSeconds = (s: number | undefined) => (s != null && (SECONDS as readonly number[]).includes(s) ? s : 10);

/** The case's traffic replaces the clients' own, so the canvas shows what will be run. */
const withStudy = (design: Design, study: CaseStudy | undefined): Design => (study ? withWorkload(design, study) : design);

/**
 * The system-design canvas: a diagram of the design, an inspector for the
 * selected component, a palette, run controls and the results. On the
 * sandbox the design lives in the URL (`?d=`); on a case page it is saved per
 * case in localStorage; in a lesson it isn't kept.
 *
 * The server renders the initial design; once hydrated, the canvas remounts
 * from the URL or storage, so a saved design never causes a hydration mismatch.
 * `seconds` sets how long a sandbox or lesson run starts out (5, 10 or 20).
 */
export function DesignCanvas({ initial, study, variant = 'page', seconds }: { initial: Design; study?: CaseStudy; variant?: Variant; seconds?: number }) {
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const persist: Persist = variant === 'lesson' ? 'none' : study ? 'storage' : 'url';
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.3 }}>
      <Canvas key={hydrated ? 'client' : 'server'} initial={withStudy(initial, study)} study={study} variant={variant} persist={persist} restore={hydrated} initialSeconds={seconds} />
    </MotionConfig>
  );
}

function restored(initial: Design, study: CaseStudy | undefined, persist: Persist, restore: boolean): Design {
  if (!restore) return initial;
  if (persist === 'url') return decodeDesign(new URLSearchParams(window.location.search).get('d')) ?? initial;
  if (persist === 'storage' && study) return withStudy(loadSaved(study.slug) ?? initial, study);
  return initial;
}

function Canvas({
  initial,
  study,
  variant,
  persist,
  restore,
  initialSeconds,
}: {
  initial: Design;
  study?: CaseStudy;
  variant: Variant;
  persist: Persist;
  restore: boolean;
  initialSeconds?: number;
}) {
  const [design, setDesign] = useState<Design>(() => restored(initial, study, persist, restore));
  const [selected, setSelected] = useState<Ref | null>(null);
  const [seconds, setSeconds] = useState<number>(study?.seconds ?? startSeconds(initialSeconds));
  const [seed, setSeed] = useState(1);
  const [faults, setFaults] = useState<readonly Fault[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Design | null>(null); // the learner's design while a solution is shown
  const [copied, setCopied] = useState(false);

  const problems = validateDesign(design);
  const badIds = problemIds(design);
  const runKey = JSON.stringify([design.components, faults, seconds, seed]);
  const current = design.components.find((c) => c.id === selected) ?? null;
  // A lesson can hold several canvases, so its element ids must be unique on the page.
  const uid = useId().replace(/:/g, '');
  const prefix = variant === 'lesson' ? `design-${uid}` : 'design';

  const update = (next: Design) => {
    setDesign(next);
    setCopied(false);
    if (persist === 'url') {
      const url = new URL(window.location.href);
      url.searchParams.set('d', encodeDesign(next));
      window.history.replaceState(window.history.state, '', url);
    } else if (persist === 'storage' && study && !mine) save(study.slug, next);
  };

  const add = (kind: Component['kind']) => {
    const id = freshId(design, kind);
    update(addComponent(design, newComponent(kind, id)));
    setSelected(id);
  };

  const remove = (id: Ref) => {
    update(removeComponent(design, id));
    setFaults(faults.filter((f) => f.component !== id));
    setSelected(null);
  };

  const go = () => {
    if (problems.length > 0 || running) return;
    setRunning(true);
    setError(null);
    const key = runKey;
    const used = study ? [] : faults;
    // Let the button repaint as "Running…" before the simulation takes the thread.
    window.setTimeout(() => {
      try {
        if (study) {
          const out = evaluate(design, study);
          setRun({ result: out.result, faultResult: out.faultResult, checks: out.checks, passed: out.passed, key, faults: used });
          if (variant === 'page') recordDesign(study.slug, out.passed, out.result);
        } else {
          const result = simulate(design, { seconds, seed, faults: used });
          setRun({ result, faultResult: null, checks: null, passed: null, key, faults: used });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const reset = () => {
    setMine(null);
    update(study ? withStudy(study.start, study) : initial);
    setRun(null);
    setFaults([]);
    setSelected(null);
  };

  const toggleSolution = () => {
    if (!study) return;
    if (mine) {
      setDesign(mine);
      setMine(null);
    } else {
      setMine(design);
      setDesign(withStudy(study.reference, study));
    }
    setSelected(null);
    setRun(null);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const crashed: Record<Ref, number[]> = {};
  for (const f of run?.faults ?? []) (crashed[f.component] ??= []).push(f.instance);

  return (
    <div className="space-y-4">
      <div role="toolbar" aria-label="Add a component" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-muted">Add:</span>
        {PALETTE.map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => add(kind)}
              disabled={design.components.length >= 24}
              title={KIND_INFO[kind].blurb}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-soft hover:border-accent-line hover:bg-accent-soft disabled:opacity-50"
            >
              <FiPlus aria-hidden className="h-3.5 w-3.5" />
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {KIND_INFO[kind].name}
            </button>
          );
        })}
      </div>

      <Diagram design={design} selected={selected} onSelect={(id) => setSelected(id === selected ? null : id)} stats={run?.result.components ?? null} crashed={crashed} problems={badIds} />

      <NodeList design={design} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {current ? (
            <Inspector
              key={current.id}
              design={design}
              component={current}
              onChange={(next) => update(replaceComponent(design, current.id, next))}
              onRemove={() => remove(current.id)}
              workloadLocked={study != null}
              fixed={study?.fixed}
              idPrefix={variant === 'lesson' ? `${prefix}-inspect` : undefined}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
              Select a component in the diagram to change its settings and connections, or add one above.
            </p>
          )}
        </div>

        <div role="group" aria-labelledby={`${prefix}-run`} className="space-y-3 rounded-xl border border-line-soft bg-surface p-4 shadow-xs">
          <h3 id={`${prefix}-run`} className="font-semibold text-ink">
            {study ? 'Check the design' : 'Run traffic'}
          </h3>
          {study ? (
            <p className="text-sm text-ink-soft">
              Runs {study.seconds} simulated seconds of the case’s traffic{study.targets.survive ? `, then again with ${study.targets.survive.label.toLowerCase()}` : ''}, and checks every target.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${prefix}-seconds`} className="mb-1 block text-xs font-medium text-ink-muted">
                  Simulated seconds
                </label>
                <select id={`${prefix}-seconds`} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className={field}>
                  {SECONDS.map((s) => (
                    <option key={s} value={s}>
                      {s} s
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${prefix}-seed`} className="mb-1 block text-xs font-medium text-ink-muted">
                  Random seed
                </label>
                <input
                  id={`${prefix}-seed`}
                  type="number"
                  min={1}
                  max={9999}
                  value={seed}
                  onChange={(e) => setSeed(Math.max(1, Math.min(9999, Math.round(Number(e.target.value) || 1))))}
                  className={field}
                />
              </div>
            </div>
          )}

          {!study && <Faults design={design} faults={faults} seconds={seconds} onChange={setFaults} prefix={prefix} />}

          {problems.length > 0 && (
            <div id={`${prefix}-problems`} role="alert" className="rounded-lg border border-bad-line bg-bad-soft p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-bad-ink">
                <FiAlertTriangle aria-hidden /> Fix {problems.length === 1 ? 'this' : 'these'} to run:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={go}
            disabled={problems.length > 0 || running}
            aria-describedby={problems.length > 0 ? `${prefix}-problems` : undefined}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            <FiPlay aria-hidden /> {running ? 'Running…' : study ? 'Run the checks' : 'Run'}
          </button>
          {error && (
            <p role="alert" className="text-sm text-bad-ink">
              The simulation stopped: {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} className={small}>
              <FiRotateCcw aria-hidden /> Reset
            </button>
            {persist === 'url' && (
              <button type="button" onClick={share} className={small}>
                {copied ? <FiCheck aria-hidden /> : <FiLink aria-hidden />} {copied ? 'Link copied' : 'Copy link'}
              </button>
            )}
            {study && (
              <button type="button" onClick={toggleSolution} aria-pressed={mine != null} className={small}>
                {mine ? 'Back to my design' : 'Show a solution'}
              </button>
            )}
          </div>
          {study && (
            <p className="text-xs text-ink-muted">
              {mine ? 'Showing one design that meets every target. Your own design comes back when you switch back.' : 'Showing a solution replaces your design on screen until you switch back.'}
            </p>
          )}
          {study && study.hints.length > 0 && <Hints hints={study.hints} />}
        </div>
      </div>

      <p role="status" className="sr-only">
        {running ? 'Running the simulation…' : run ? (run.passed == null ? 'Run finished.' : run.passed ? 'Every target is met.' : 'Some targets are missed.') : ''}
      </p>

      {run && (
        <Results
          design={design}
          result={run.result}
          faultResult={run.faultResult}
          faultLabel={study?.targets.survive?.label ?? null}
          checks={run.checks}
          passed={run.passed}
          stale={run.key !== runKey}
          idPrefix={variant === 'lesson' ? `${prefix}-` : undefined}
        />
      )}
      {run?.passed && study && (
        <div className="rounded-xl border border-good-line bg-good-soft p-4">
          <h3 className="font-semibold text-ink">The trade-off</h3>
          <p className="mt-1 text-sm text-ink-soft">{study.lesson}</p>
        </div>
      )}
    </div>
  );
}

const field =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line';
const small = 'inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm text-ink-soft hover:border-accent-line hover:bg-accent-soft';

/**
 * The components and connections as text, for screen readers: the diagram's
 * nodes are buttons, but its arrows are drawn, not read.
 */
function NodeList({ design }: { design: Design }) {
  const labels = new Map(design.components.map((c) => [c.id, c.label]));
  return (
    <div className="sr-only">
      <h3>Components</h3>
      <ul>
        {design.components.map((c) => (
          <li key={c.id}>
            {c.label}, {KIND_INFO[c.kind].name}: {configSummary(c)}
          </li>
        ))}
      </ul>
      <h3>Connections</h3>
      <ul>
        {edgesOf(design).map((e) => (
          <li key={e.id}>
            {labels.get(e.from)} to {labels.get(e.to)}: {e.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Instances of a component that can crash, with names: "App servers #2", "Database shard 1 primary". */
function instances(c: Component): { index: number; name: string }[] {
  if (c.kind === 'app') return Array.from({ length: c.instances }, (_, i) => ({ index: i, name: `${c.label} #${i + 1}` }));
  if (c.kind === 'cache') return Array.from({ length: c.nodes }, (_, i) => ({ index: i, name: `${c.label} node ${i + 1}` }));
  if (c.kind === 'database') {
    const out: { index: number; name: string }[] = [];
    for (let s = 0; s < c.shards; s++) {
      const shard = c.shards > 1 ? ` shard ${s + 1}` : '';
      out.push({ index: s * (c.replicas + 1), name: `${c.label}${shard} primary` });
      for (let r = 1; r <= c.replicas; r++) out.push({ index: s * (c.replicas + 1) + r, name: `${c.label}${shard} replica ${r}` });
    }
    return out;
  }
  return [];
}

/** Crashes to inject into a sandbox run: a machine and a time. */
function Faults({ design, faults, seconds, onChange, prefix }: { design: Design; faults: readonly Fault[]; seconds: number; onChange: (f: Fault[]) => void; prefix: string }) {
  const machines = design.components.flatMap((c) => instances(c).map((m) => ({ ...m, component: c.id })));
  const nameOf = (f: Fault) => machines.find((m) => m.component === f.component && m.index === f.instance)?.name ?? `${f.component} #${f.instance + 1}`;
  const [pick, setPick] = useState(0);
  const [at, setAt] = useState(Math.min(4, seconds - 1));
  const chosen = machines[Math.min(pick, machines.length - 1)];
  if (machines.length === 0) return null;
  const limit = LIMITS['run.seconds'];
  return (
    <fieldset className="space-y-2 border-t border-line-soft pt-3">
      <legend className="text-sm font-medium text-ink">Crash a machine (optional)</legend>
      {faults.length > 0 && (
        <ul className="space-y-1 text-sm text-ink-soft">
          {faults.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span>
                Crash {nameOf(f)} at {f.at} s
              </span>
              <button type="button" onClick={() => onChange(faults.filter((_, j) => j !== i))} className="text-ink-muted hover:text-bad-ink" aria-label={`Remove: crash ${nameOf(f)} at ${f.at} s`}>
                <FiTrash2 aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        <div>
          <label htmlFor={`${prefix}-fault-machine`} className="mb-1 block text-xs font-medium text-ink-muted">
            Machine
          </label>
          <select id={`${prefix}-fault-machine`} value={Math.min(pick, machines.length - 1)} onChange={(e) => setPick(Number(e.target.value))} className={field}>
            {machines.map((m, i) => (
              <option key={`${m.component}-${m.index}`} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${prefix}-fault-at`} className="mb-1 block text-xs font-medium text-ink-muted">
            At (s)
          </label>
          <input
            id={`${prefix}-fault-at`}
            type="number"
            min={0}
            max={Math.min(limit?.max ?? 60, seconds)}
            step={0.5}
            value={at}
            onChange={(e) => setAt(Math.max(0, Math.min(seconds, Number(e.target.value) || 0)))}
            className={field}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => chosen && !faults.some((f) => f.component === chosen.component && f.instance === chosen.index) && onChange([...faults, { component: chosen.component, instance: chosen.index, at }])}
        className={small}
      >
        <FiPlus aria-hidden /> Add crash
      </button>
      {faults.length > 0 && <p className="text-xs text-ink-muted">A crashed machine stays down; {pct(faults.length / Math.max(1, machines.length))} of machines will crash.</p>}
    </fieldset>
  );
}

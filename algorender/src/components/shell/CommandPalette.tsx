'use client';

import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { FiBookOpen, FiCode, FiCornerDownLeft, FiGitBranch, FiMap, FiMonitor, FiMoon, FiPlay, FiRefreshCw, FiSearch, FiSun } from 'react-icons/fi';
import { applyTheme, THEME_LABEL, useTheme } from '@/components/ThemeToggle';
import { ButtonLink } from '@/components/ui/Button';
import { trackSurface, trackTitle } from '@/components/ui/Card';
import { displayStatus, StatusChip } from '@/components/ui/Chip';
import { Kbd } from '@/components/ui/CodeBlock';
import type { PaletteEntry, PaletteKind } from '@/content/palette';
import { useMastery } from '@/progress/hooks';
import { KNOWN, type MasteryGraph } from '@/progress/mastery';
import { useDueCount } from './hooks';
import { search } from './search';

// ⌘K (Ctrl K elsewhere) from anywhere in the app: jump to a visualiser,
// lesson, problem or concept, or run an action. "G then R" starts the review.

type Filter = 'all' | 'visualiser' | 'lesson' | 'problem' | 'action';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'visualiser', label: 'Visualisers' },
  { id: 'lesson', label: 'Lessons' },
  { id: 'problem', label: 'Problems' },
  { id: 'action', label: 'Actions' },
];

const GROUP_LABEL: Record<PaletteKind | 'action', string> = {
  concept: 'Concepts',
  visualiser: 'Visualisers',
  lesson: 'Lessons',
  problem: 'Problems',
  action: 'Actions',
};

const KIND_ICON: Record<PaletteKind, IconType> = { concept: FiGitBranch, visualiser: FiPlay, lesson: FiBookOpen, problem: FiCode };
const OPEN_LABEL: Record<PaletteKind, string> = { concept: 'Start here', visualiser: 'Open the visualiser', lesson: 'Open the lesson', problem: 'Solve it' };

interface Item {
  id: string;
  kind: PaletteKind | 'action';
  title: string;
  subtitle: string;
  icon: IconType;
  /** Track colour for the tile; actions use a neutral tile. */
  track?: string;
  href?: string;
  run?: () => void;
  kbd?: string;
  entry?: PaletteEntry;
}

interface Index {
  entries: PaletteEntry[];
  graph: MasteryGraph;
}

const EMPTY_GRAPH: MasteryGraph = { concepts: [], lessons: {}, exercises: {}, problems: {} };
let indexPromise: Promise<Index> | null = null;
const loadIndex = () => {
  indexPromise ??= fetch('/search-index.json')
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : Promise.reject(new Error(String(r.status)))))
    .catch((e) => {
      indexPromise = null; // try again next time
      throw e;
    });
  return indexPromise;
};

// The shortcut reads ⌘K on Apple devices and Ctrl K elsewhere.
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const noop = () => () => {};
export function useShortcutLabel(): string {
  return useSyncExternalStore(noop, () => (isApple() ? '⌘K' : 'Ctrl K'), () => 'Ctrl K');
}

const Ctx = createContext<{ open: () => void } | null>(null);

export function usePalette() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePalette needs a PaletteProvider');
  return c;
}

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('.cm-editor'));
}

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const opener = useRef<Element | null>(null);

  const show = useCallback(() => {
    opener.current = document.activeElement;
    void loadIndex().catch(() => {});
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Focus goes back to whatever opened the palette.
    const el = opener.current as HTMLElement | null;
    requestAnimationFrame(() => el?.focus?.());
  }, []);

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = isApple() ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else show();
        return;
      }
      if (open || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === 'g') gAt = Date.now();
      else if (e.key === 'r' && Date.now() - gAt < 1200) {
        gAt = 0;
        router.push('/review');
      } else gAt = 0;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, show, close, router]);

  const value = useMemo(() => ({ open: show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <CommandPalette onClose={close} />}
    </Ctx.Provider>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const base = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<Index | null>(null);
  const [failed, setFailed] = useState(false);
  const { theme, next } = useTheme();
  const due = useDueCount();
  const masteries = useMastery(index?.graph ?? EMPTY_GRAPH);

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    loadIndex().then(
      (i) => live && setIndex(i),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const actions: Item[] = useMemo(
    () => [
      {
        id: 'action:review',
        kind: 'action',
        title: 'Start daily review',
        subtitle: due > 0 ? `${due} card${due === 1 ? '' : 's'} due` : 'Nothing due right now',
        icon: FiRefreshCw,
        href: '/review',
        kbd: 'G R',
      },
      {
        id: 'action:theme',
        kind: 'action',
        title: next === 'system' ? 'Follow the system theme' : `Switch to ${THEME_LABEL[next].toLowerCase()} theme`,
        subtitle: theme === 'system' ? 'Follows your system until you choose' : `${THEME_LABEL[theme]} now`,
        icon: next === 'dark' ? FiMoon : next === 'light' ? FiSun : FiMonitor,
        run: () => applyTheme(next),
      },
      {
        // TODO(redesign): resume the lesson in progress once lesson steps are recorded; until then, the concept map.
        id: 'action:continue',
        kind: 'action',
        title: 'Continue learning',
        subtitle: 'Your next steps on the concept map',
        icon: FiMap,
        href: '/learn',
      },
    ],
    [due, theme, next],
  );

  const groups = useMemo(() => {
    const entries = index?.entries ?? [];
    const asItem = (e: PaletteEntry): Item => ({ id: e.id, kind: e.kind, title: e.title, subtitle: e.subtitle, icon: KIND_ICON[e.kind], track: e.track, href: e.href, entry: e });
    const q = query.trim();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const matchActions = actions.filter((a) => words.every((w) => `${a.title} ${a.subtitle}`.toLowerCase().includes(w)));
    const of = (kind: PaletteKind, limit: number) => (q ? search(entries, kind, q, limit) : entries.filter((e) => e.kind === kind).slice(0, limit)).map(asItem);
    const out: { kind: PaletteKind | 'action'; items: Item[] }[] = [];
    if (filter === 'all') {
      if (q) {
        out.push({ kind: 'concept', items: of('concept', 3) }, { kind: 'visualiser', items: of('visualiser', 4) }, { kind: 'lesson', items: of('lesson', 3) }, { kind: 'problem', items: of('problem', 4) });
        out.push({ kind: 'action', items: matchActions });
      } else {
        out.push({ kind: 'action', items: actions }, { kind: 'concept', items: of('concept', 5) });
      }
    } else if (filter === 'action') out.push({ kind: 'action', items: matchActions });
    else out.push({ kind: filter, items: of(filter, 40) });
    return out.filter((g) => g.items.length > 0);
  }, [index, query, filter, actions]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = flat[Math.min(active, flat.length - 1)];
  const optionId = (i: number) => `${base}-option-${i}`;

  useEffect(() => {
    list.current?.querySelector(`[data-index="${Math.min(active, flat.length - 1)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, flat.length]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    if (item.run) item.run();
    if (item.href) router.push(item.href);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (Math.min(a, flat.length - 1) + step + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(current);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const i = FILTERS.findIndex((f) => f.id === filter);
      setFilter(FILTERS[(i + (e.shiftKey ? -1 : 1) + FILTERS.length) % FILTERS.length].id);
      setActive(0);
    }
  };

  const status = (entry?: PaletteEntry) => {
    if (!entry?.concept || !index) return null;
    const m = masteries.get(entry.concept);
    const c = index.graph.concepts.find((x) => x.id === entry.concept);
    if (!m || !c) return null;
    const ready = c.prereqs.every((p) => KNOWN.has(masteries.get(p)?.status ?? 'new'));
    return displayStatus(m.status, ready);
  };

  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0));
  return (
    <dialog
      ref={dialog}
      aria-label="Search and actions"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mt-[6vh] mb-auto max-h-[min(760px,calc(100dvh-3rem))] w-[min(980px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-[28px] open:flex bg-surface p-0 text-ink transition-[opacity,scale] duration-150 ease-standard backdrop:bg-feature/45 backdrop:backdrop-blur-[3px] starting:scale-[0.98] starting:opacity-0"
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
        <FiSearch aria-hidden className="size-5 shrink-0 text-accent-ink" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={`${base}-list`}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(Math.min(active, flat.length - 1)) : undefined}
          aria-label="Search visualisers, lessons, problems and actions"
          aria-describedby={`${base}-keys`}
          placeholder="Search visualisers, lessons, problems"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-ink-muted sm:text-xl"
        />
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg">
          <Kbd>esc</Kbd>
        </button>
        <p id={`${base}-keys`} className="sr-only">
          Up and down arrows move through the results, Enter opens one, Tab changes what to show, Escape closes.
        </p>
      </div>
      {/* Says what the list holds as the query or the filter changes, since focus stays in the input. */}
      <p role="status" className="sr-only">
        {index && `${flat.length} ${flat.length === 1 ? 'result' : 'results'}${filter === 'all' ? '' : ` in ${FILTERS.find((f) => f.id === filter)!.label}`}`}
      </p>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            tabIndex={-1}
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setActive(0);
            }}
            className={clsx(
              'h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-standard',
              filter === f.id ? 'bg-primary text-on-primary' : 'bg-sunken text-ink-soft hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={list} id={`${base}-list`} role="listbox" aria-label="Results" className="min-h-0 overflow-y-auto pr-1">
          {!index && !failed && <p className="px-3 py-6 text-sm text-ink-muted">Loading…</p>}
          {failed && <p className="px-3 py-6 text-sm text-ink-muted">The search index didn&apos;t load. Check your connection and open search again.</p>}
          {index && flat.length === 0 && <p className="px-3 py-6 text-sm text-ink-muted">Nothing matches &ldquo;{query}&rdquo;.</p>}
          {groups.map((g, gi) => (
            <div key={g.kind} role="group" aria-labelledby={`${base}-${g.kind}`} className="mb-2">
              <div id={`${base}-${g.kind}`} role="presentation" className="px-3 pt-3 pb-2 text-eyebrow text-ink-muted uppercase">
                {GROUP_LABEL[g.kind]}
              </div>
              {g.items.map((item, k) => {
                const i = starts[gi] + k;
                const on = current?.id === item.id;
                const s = status(item.entry);
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={() => choose(item)}
                    className={clsx('flex cursor-pointer items-center gap-3.5 rounded-[18px] px-3 py-2.5', on && 'bg-sunken')}
                  >
                    <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-[12px]', item.track ? trackSurface(item.track) : 'bg-sunken text-ink-soft', on && !item.track && 'bg-surface')}>
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{item.title}</span>
                      <span className="block truncate text-[13px] text-ink-muted">{item.subtitle}</span>
                    </span>
                    {s && (
                      <span className="hidden sm:block">
                        <StatusChip status={s} />
                      </span>
                    )}
                    {item.kbd && (
                      <span className="hidden sm:block">
                        <Kbd tone={on ? 'surface' : 'well'}>{item.kbd}</Kbd>
                      </span>
                    )}
                    {on && <FiCornerDownLeft aria-hidden className="hidden size-4 shrink-0 text-ink-muted sm:block" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {current && <Preview item={current} status={status(current.entry)} onPick={onClose} />}
      </div>

      <div className="hidden items-center justify-between gap-4 border-t border-line-soft px-6 py-3.5 text-[13px] text-ink-muted sm:flex">
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd> move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>tab</Kbd> filter
          </span>
        </span>
        <span>Searches names, descriptions, patterns and complexities</span>
      </div>
    </dialog>
  );
}

function Preview({ item, status, onPick }: { item: Item; status: ReturnType<typeof displayStatus> | null; onPick: () => void }) {
  const e = item.entry;
  if (!e) {
    return (
      <aside aria-label="Preview" className="hidden flex-col gap-3 rounded-tile bg-sunken p-6 lg:flex">
        <span className="text-eyebrow text-ink-muted uppercase">Action</span>
        <h2 className="font-display text-[28px] leading-tight font-bold tracking-tight">{item.title}</h2>
        <p className="text-[15px] text-ink-soft">{item.subtitle}</p>
        <p className="mt-auto text-[13px] text-ink-muted">Press Enter to run it.</p>
      </aside>
    );
  }
  return (
    <aside aria-label="Preview" className={clsx('hidden flex-col gap-3 rounded-tile p-6 lg:flex', trackSurface(e.track))}>
      <span className="text-eyebrow uppercase">
        {[e.trackTitle, GROUP_LABEL[e.kind].replace(/s$/, '')].filter(Boolean).join(' · ')}
      </span>
      <h2 className={clsx('font-display text-[28px] leading-tight font-bold tracking-tight', trackTitle(e.track))}>{e.title}</h2>
      {status && <StatusChip status={status} className="self-start" />}
      <p className="line-clamp-6 text-[15px] leading-relaxed">{e.description}</p>
      <div className="mt-auto flex flex-col gap-2 pt-3">
        <ButtonLink href={e.href} kind="primary" block onClick={onPick}>
          {OPEN_LABEL[e.kind]}
        </ButtonLink>
        {e.secondary && (
          <ButtonLink href={e.secondary.href} kind="onTrack" block onClick={onPick}>
            {e.secondary.label}
          </ButtonLink>
        )}
      </div>
    </aside>
  );
}

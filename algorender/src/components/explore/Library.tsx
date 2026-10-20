'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FiArrowUpRight, FiSearch } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { TrackCardLink, trackTitle } from '@/components/ui/Card';
import { Chip, displayStatus, StatusChip, type Status } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import { COLOUR_LABEL, COLOUR_SHORT, COLOURS, TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import { useMastery, useProgressSnapshot } from '@/progress/hooks';
import { isReady, type MasteryGraph } from '@/progress/mastery';
import { TileGlyph } from './Glyph';
import { kindCounts, KINDS, matches, sortTiles, SORTS, type KindFilter, type Sort, type Tile } from './tiles';

/** Keeps the kind and track in the address, so a filtered library can be shared. */
function writeFilters(kind: KindFilter, colour: TrackColour | 'all') {
  const url = new URL(window.location.href);
  if (kind === 'all') url.searchParams.delete('kind');
  else url.searchParams.set('kind', kind);
  if (colour === 'all') url.searchParams.delete('track');
  else url.searchParams.set('track', colour);
  window.history.replaceState(window.history.state, '', url);
}

/** Explore: every visualiser as a track-coloured tile, with filters and the learner's status on each. */
export function Library({ tiles, graph, initial }: { tiles: readonly Tile[]; graph: MasteryGraph; initial: { kind: KindFilter; colour: TrackColour | 'all' } }) {
  const [kind, setKind] = useState<KindFilter>(initial.kind);
  const [colour, setColour] = useState<TrackColour | 'all'>(initial.colour);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('ready');
  const { ready } = useProgressSnapshot();
  const m = useMastery(graph);

  // Each concept's status, once the learner's progress has loaded.
  const statuses = useMemo(() => {
    const out = new Map<string, Status>();
    if (!ready) return out;
    for (const t of tiles) if (t.concept && !out.has(t.concept)) out.set(t.concept, displayStatus(m.get(t.concept)?.status ?? 'new', isReady(t.concept, m, graph)));
    return out;
  }, [ready, tiles, m, graph]);
  const status = useMemo(() => (tile: Tile): Status | null => (tile.concept && statuses.get(tile.concept)) || null, [statuses]);

  const counts = useMemo(() => kindCounts(tiles), [tiles]);
  const shown = useMemo(() => sortTiles(tiles.filter((t) => matches(t, { kind, colour, query })), sort, status), [tiles, kind, colour, query, sort, status]);

  const pickKind = (next: KindFilter) => {
    setKind(next);
    writeFilters(next, colour);
  };
  const pickColour = (next: TrackColour | 'all') => {
    const value = next === colour && next !== 'all' ? 'all' : next;
    setColour(value);
    writeFilters(kind, value);
  };
  const clear = () => {
    setKind('all');
    setColour('all');
    setQuery('');
    writeFilters('all', 'all');
  };

  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-[640px] flex-col gap-2">
          <h1 className="font-display text-title-page">Explore</h1>
          <p className="hidden text-base text-ink-soft sm:block">
            {tiles.length} visualisers you can step through forwards and backwards, with synced code and a reason for every move.
          </p>
        </div>
        <Link href="/compare" className="flex items-center gap-3.5 rounded-tile bg-feature py-3 pr-[18px] pl-3 text-on-feature transition-transform duration-150 ease-standard hover:-translate-y-0.5">
          <span aria-hidden className="flex size-12 flex-col justify-center gap-1 rounded-[14px] bg-on-feature/10 px-2">
            <span className="h-[5px] w-[90%] rounded-full bg-track-peach-bar" />
            <span className="h-[5px] w-[60%] rounded-full bg-feature-accent" />
            <span className="h-[5px] w-[35%] rounded-full bg-track-mint-bar" />
          </span>
          <span className="flex flex-col">
            <strong className="text-[15px]">Lab: race the sorts</strong>
            <span className="text-[13px] text-feature-muted">Same input, side by side</span>
          </span>
          <FiArrowUpRight aria-hidden className="size-[18px]" />
        </Link>
      </header>

      <section aria-label="Filters" className="flex flex-col gap-3 sm:rounded-[28px] sm:bg-surface sm:p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
          <div role="group" aria-label="Kind" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:w-fit sm:max-w-full sm:rounded-full sm:bg-sunken sm:p-1">
            {KINDS.map((k) => {
              const on = kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickKind(k.id)}
                  className={cx(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ease-standard',
                    on ? 'bg-primary text-on-primary sm:bg-segment sm:text-ink sm:shadow-segment' : 'bg-surface text-ink-soft hover:text-ink sm:bg-transparent',
                  )}
                >
                  {k.label}
                  <span className={cx('text-xs font-medium', on ? 'text-on-primary sm:text-ink-soft' : 'text-ink-muted')}>{counts[k.id]}</span>
                </button>
              );
            })}
          </div>
          <label className="order-first flex h-12 min-w-0 items-center sm:flex-1 sm:basis-60 gap-2.5 rounded-full bg-surface px-4 text-ink-muted sm:order-none sm:bg-sunken">
            <FiSearch aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">Filter visualisers</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${tiles.length} visualisers by name`}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          </label>
          <label className="hidden items-center gap-2 text-sm text-ink-soft sm:flex">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-11 rounded-full bg-sunken px-3.5 text-sm font-semibold text-ink"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div role="group" aria-label="Track" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <TrackChip on={colour === 'all'} onClick={() => pickColour('all')} label="Every track" short="All tracks" />
          {COLOURS.map((c) => (
            <TrackChip key={c} colour={c} on={colour === c} onClick={() => pickColour(c)} label={COLOUR_LABEL[c]} short={COLOUR_SHORT[c]} />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
        <p aria-live="polite">
          Showing <strong className="text-ink">{shown.length}</strong> of {tiles.length}
        </p>
        <p className="hidden sm:block">Pastel = track · chip = your mastery</p>
      </div>

      {shown.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-4">
          {shown.map((t) => (
            <li key={t.slug} className="min-w-0">
              <TileLink tile={t} status={status(t)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface p-10 text-center">
          <strong className="font-display text-title-section">Nothing matches that yet</strong>
          <span className="text-ink-muted">Try another word, or clear the filters.</span>
          <Button onClick={clear}>Clear filters</Button>
        </div>
      )}
    </main>
  );
}

function TrackChip({ colour, on, onClick, label, short }: { colour?: TrackColour; on: boolean; onClick: () => void; label: string; short: string }) {
  const c = colour && TRACK_CLASSES[colour];
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border-2 pr-3.5 pl-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 ease-standard',
        c ? cx(c.bg, c.ink) : 'bg-sunken text-ink',
        on ? 'border-ink' : 'border-transparent hover:border-line-strong',
      )}
    >
      <span aria-hidden className={cx('size-5 rounded-full', c ? c.fill : 'bg-[conic-gradient(var(--color-track-lilac-bar)_0_60deg,var(--color-track-peach-bar)_0_120deg,var(--color-track-mint-bar)_0_180deg,var(--color-track-sky-bar)_0_240deg,var(--color-track-butter-bar)_0_300deg,var(--color-track-rose-bar)_0_330deg,var(--color-track-teal-bar)_0)]')} />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TileLink({ tile, status }: { tile: Tile; status: Status | null }) {
  return (
    <TrackCardLink track={tile.colour} href={`/visualisers/${tile.slug}`} dense className="h-full min-h-[216px] gap-4 p-4 sm:p-5">
      <span className="flex flex-wrap items-start justify-between gap-2">
        <Chip tone="onTrack" className="whitespace-normal">
          {tile.category}
        </Chip>
        {status && status !== 'locked' && <StatusChip status={status} className={status === 'practised' || status === 'ready' ? 'bg-surface' : undefined} />}
      </span>
      <TileGlyph glyph={tile.glyph} colour={tile.colour} className="mt-auto" />
      <span className="flex flex-col gap-1">
        <strong className={cx('font-display text-[19px] leading-[1.1] font-bold tracking-[-0.01em] sm:text-[22px]', trackTitle(tile.colour))}>{tile.name}</strong>
        <span className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
          <span className="hidden text-[13px] sm:line-clamp-2">{tile.blurb}</span>
          {tile.cost && <span className="shrink-0 font-mono text-xs whitespace-nowrap">{tile.cost}</span>}
        </span>
      </span>
    </TrackCardLink>
  );
}

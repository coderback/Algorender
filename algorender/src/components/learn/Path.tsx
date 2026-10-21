'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { FiAward, FiCalendar, FiCheck, FiChevronDown, FiLock, FiPlay, FiTrendingUp } from 'react-icons/fi';
import { ButtonLink } from '@/components/ui/Button';
import { Card, TrackCard, trackTitle } from '@/components/ui/Card';
import { displayStatus, StatusChip, type Status } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import type { Goal } from '@/content/goals';
import { TRACK_CLASSES, trackColour, type TrackClasses } from '@/data/tracks';
import { useLessonProgress, useMastery, useProgressSnapshot } from '@/progress/hooks';
import { isReady, KNOWN, nextSteps, type ConceptMastery, type MasteryGraph } from '@/progress/mastery';
import { currentPlan, goalConcepts } from '@/progress/plan';
import { lessonInProgress } from '../today/select';
import { MistakesToClear } from './Mastery';

// Learn › Path: the concept map as one row per track, each concept a node
// with its status, joined by solid connectors where what it builds on is
// known. Selecting a node fills the panel on the right.

export type PathConcept = {
  id: string;
  title: string;
  summary: string;
  track: string;
  planned: boolean;
  prereqs: string[];
  unlocks: string[];
  lesson?: { slug: string; title: string; minutes: number };
  visualisers: { slug: string; name: string }[];
  /** Other pages that teach it. */
  links: { href: string; label: string }[];
  problems: number;
  /** The practice list's anchor for its pattern, when it has problems. */
  pattern?: string;
};

export type PathTrack = { id: string; title: string; planned: boolean; concepts: string[] };

export type PathData = {
  graph: MasteryGraph;
  goals: readonly Goal[];
  tracks: PathTrack[];
  concepts: Record<string, PathConcept>;
  mistakes: Record<string, { title: string; lessonTitle: string }>;
};

const STATUS_TEXT: Record<Status, string> = {
  mastered: 'Mastered',
  practised: 'Practised',
  learning: 'Learning',
  ready: 'Ready',
  placed: 'Placed out',
  locked: '',
};

const LEGEND: Status[] = ['mastered', 'practised', 'learning', 'ready', 'placed', 'locked'];
const LEGEND_LABEL: Record<Status, string> = { ...STATUS_TEXT, locked: 'Not yet' };

/** The node circle's look for each status, in a track's colours. */
function nodeLook(status: Status | null, c: TrackClasses): { circle: string; icon: ReactNode } {
  switch (status) {
    case 'mastered':
      return { circle: cx(c.solid, c.onSolid), icon: <FiAward aria-hidden /> };
    case 'practised':
      return { circle: cx('border-[3px]', c.edge, c.bg, c.ink), icon: <FiCheck aria-hidden strokeWidth={2.5} /> };
    case 'learning':
      return { circle: cx('border-[3px] border-mark-focus text-mark-focus-ink', c.bg), icon: <FiTrendingUp aria-hidden strokeWidth={2.5} /> };
    case 'ready':
      return { circle: 'border-2 border-dashed border-accent bg-surface text-accent-ink', icon: <FiPlay aria-hidden className="translate-x-px fill-current" /> };
    case 'placed':
      return { circle: 'border-2 border-line-strong bg-sunken text-ink-muted', icon: <FiCheck aria-hidden /> };
    case 'locked':
      return { circle: 'bg-sunken text-ink-faint', icon: <FiLock aria-hidden /> };
    default:
      return { circle: 'bg-sunken', icon: null };
  }
}

function statusTextClass(status: Status | null, c: TrackClasses) {
  return status === 'ready' ? 'text-accent-ink' : status === 'learning' ? 'text-mark-focus-ink' : status === 'placed' ? 'text-ink-muted' : c.ink;
}

export function PathLegend() {
  return (
    <ul aria-label="What the node styles mean" className="hidden flex-wrap md:flex items-center gap-x-4 gap-y-2 rounded-full bg-surface px-4 py-2.5 text-[13px] text-ink-soft">
      {LEGEND.map((s) => {
        const look = nodeLook(s, TRACK_CLASSES.lilac);
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cx('size-3.5 rounded-full', look.circle, s === 'practised' || s === 'learning' ? 'border-2' : '', s === 'mastered' && 'bg-accent')} />
            {LEGEND_LABEL[s]}
          </li>
        );
      })}
    </ul>
  );
}

/** `linked`: the concept named in the link (`/learn?concept=<id>`), selected until the learner picks another. */
export function LearnPath({ data, linked }: { data: PathData; linked?: string }) {
  const { graph, goals, tracks, concepts } = data;
  const { ready, events } = useProgressSnapshot();
  const m = useMastery(graph);
  const lessons = useLessonProgress();
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const status = (id: string): Status | null => {
    const c = concepts[id];
    if (!ready || !c) return null;
    if (c.planned) return 'locked';
    return displayStatus(m.get(id)?.status ?? 'new', isReady(id, m, graph));
  };

  // The default selection: the concept linked to, else the lesson in progress, else the first next step.
  const completed = useMemo(() => new Set(lessons.completed), [lessons.completed]);
  const resumeLesson = ready ? lessonInProgress(events, completed) : null;
  const resumeConcept = resumeLesson ? graph.lessons[resumeLesson] : undefined;
  const fallback = ready ? nextSteps(m, graph, { limit: 1 })[0]?.concept.id : undefined;
  const selectedId = picked ?? (linked && concepts[linked] ? linked : undefined) ?? resumeConcept ?? fallback ?? tracks[0]?.concepts[0];
  const selected = selectedId ? concepts[selectedId] : undefined;

  // Tracks outside the current goal fold into one bar.
  const plan = ready ? currentPlan(events) : null;
  const goal = plan ? goals.find((g) => g.id === plan.goal) : undefined;
  const inGoal = useMemo(() => (goal ? goalConcepts(goal, graph) : null), [goal, graph]);
  const shown = (t: PathTrack) => showAll || t.id === selected?.track || (inGoal ? t.concepts.some((id) => inGoal.has(id)) : !t.planned);
  const visible = tracks.filter(shown);
  const folded = tracks.filter((t) => !shown(t));

  const select = (id: string) => {
    setPicked(id);
    const track = concepts[id]?.track;
    if (track) setOpen((o) => ({ ...o, [track]: true }));
  };
  const isOpen = (t: PathTrack) => open[t.id] ?? t.id === selected?.track;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_auto_auto_auto_1fr]">
      {selected && <Selected concept={selected} status={status(selected.id)} mastery={m.get(selected.id)} resuming={resumeConcept === selected.id} done={!!selected.lesson && completed.has(selected.lesson.slug)} />}

      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-span-5 lg:row-start-1">
        {visible.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            concepts={concepts}
            status={status}
            known={(id) => ready && KNOWN.has(m.get(id)?.status ?? 'new')}
            selectedId={selectedId}
            onSelect={select}
            open={isOpen(t)}
            onToggle={() => setOpen((o) => ({ ...o, [t.id]: !isOpen(t) }))}
          />
        ))}
        {folded.length > 0 && (
          <TrackCard track="rose" as="div" className="flex-row flex-wrap items-center justify-between gap-4 p-5 sm:px-6">
            <div className="min-w-0">
              <p className={cx('font-display text-lg leading-snug font-bold', trackTitle('rose'))}>{folded.map((t) => t.title).join(' · ')}</p>
              <p className="text-[13px]">
                {folded.length} more {folded.length === 1 ? 'track' : 'tracks'}, {folded.reduce((n, t) => n + t.concepts.length, 0)} concepts · {inGoal ? 'outside your current goal' : 'coming next'}
              </p>
            </div>
            <button type="button" onClick={() => setShowAll(true)} className="h-11 shrink-0 rounded-full bg-surface px-5 text-sm font-semibold text-ink hover:bg-subtle">
              Show all tracks
            </button>
          </TrackCard>
        )}
        {showAll && (inGoal || tracks.some((t) => t.planned)) && (
          <button type="button" onClick={() => setShowAll(false)} className="self-start rounded-full px-2 py-1 text-sm font-semibold text-accent-ink hover:underline">
            {inGoal ? 'Show only my goal’s tracks' : 'Hide the tracks coming next'}
          </button>
        )}
      </div>

      {selected && <Relations concept={selected} concepts={concepts} known={(id) => ready && KNOWN.has(m.get(id)?.status ?? 'new')} onSelect={select} />}
      <MistakesToClear titles={data.mistakes} />
      <WhereToStart />
    </div>
  );
}

function TrackRow({
  track,
  concepts,
  status,
  known,
  selectedId,
  onSelect,
  open,
  onToggle,
}: {
  track: PathTrack;
  concepts: Record<string, PathConcept>;
  status: (id: string) => Status | null;
  known: (id: string) => boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const c = TRACK_CLASSES[trackColour(track.id)];
  const items = track.concepts.map((id) => concepts[id]).filter(Boolean);
  const live = items.filter((x) => !x.planned);
  const count = live.filter((x) => known(x.id)).length;
  const share = live.length ? count / live.length : 0;
  const panel = `track-${track.id}-concepts`;

  return (
    <section
      aria-labelledby={`track-${track.id}`}
      className={cx('rounded-card md:grid md:grid-cols-[196px_minmax(0,1fr)] md:gap-6 md:bg-surface md:p-[18px]', open ? 'bg-surface p-3' : 'bg-transparent p-0')}
    >
      {/* Phones: the track is a row that opens to its concepts. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panel}
        className={cx('flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left md:hidden', c.bg, c.ink)}
      >
        <span className={cx('flex-1 font-display text-[17px] font-bold', c.title)}>{track.title}</span>
        <span className="text-[13px] font-semibold tabular-nums">
          {count} of {live.length}
        </span>
        <FiChevronDown aria-hidden className={cx('size-5 transition-transform duration-150 ease-standard', open && 'rotate-180')} />
      </button>

      <div className={cx('hidden min-h-[130px] flex-col justify-between gap-4 rounded-[20px] p-4 md:flex', c.bg, c.ink)}>
        <h2 id={`track-${track.id}`} className={cx('font-display text-lg leading-tight font-bold', c.title)}>
          {track.title}
        </h2>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold">
            {count} of {live.length} known
          </span>
          <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-chip-on-track">
            <span className={cx('block h-full rounded-full', c.solid)} style={{ width: `${share * 100}%` }} />
          </span>
        </div>
      </div>

      <ol id={panel} className={cx('flex-col px-2 pt-3 pb-1 md:flex md:flex-row md:flex-wrap md:items-start md:gap-y-4 md:p-0 md:pt-1', open ? 'flex' : 'hidden')}>
        {items.map((x, i) => {
          const s = status(x.id);
          const look = nodeLook(s, c);
          const on = x.id === selectedId;
          const met = i > 0 && known(items[i - 1].id);
          const text = x.planned ? 'Coming soon' : s ? STATUS_TEXT[s] : '';
          return (
            <li key={x.id} id={x.id} className="flex flex-col md:flex-row md:items-start">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cx(
                    'ml-[21px] h-4 w-0 border-l-2 md:mt-[29px] md:ml-0 md:h-0 md:w-8 md:border-t-2 md:border-l-0',
                    met ? c.edge : 'border-dashed border-line-strong',
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(x.id)}
                aria-pressed={on}
                className="group flex items-center gap-3 rounded-[18px] py-1 text-left md:w-[124px] md:flex-col md:gap-0 md:text-center"
              >
                <span
                  className={cx(
                    'flex size-11 shrink-0 items-center justify-center rounded-full transition-transform duration-150 ease-standard group-hover:scale-105 md:size-15 [&_svg]:size-[18px] md:[&_svg]:size-5',
                    look.circle,
                    on && 'ring-[3px] ring-primary ring-offset-[3px] ring-offset-surface',
                  )}
                >
                  {look.icon}
                </span>
                <span className="flex min-w-0 flex-col md:mt-2.5">
                  <span className={cx('text-[13px] leading-tight', s === 'locked' || x.planned ? 'text-ink-muted' : 'font-semibold text-ink')}>{x.title}</span>
                  {text && (
                    <span data-status={x.planned ? 'planned' : (s ?? undefined)} className={cx('mt-1 text-[11px] font-semibold', statusTextClass(s, c))}>
                      {text}
                      {on && <span className="font-normal"> · selected</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Selected({ concept, status, mastery, resuming, done }: { concept: PathConcept; status: Status | null; mastery: ConceptMastery | undefined; resuming: boolean; done: boolean }) {
  const lesson = concept.lesson;
  const link = concept.links[0];
  const href = lesson ? `/learn/${lesson.slug}` : concept.visualisers[0] ? `/visualisers/${concept.visualisers[0].slug}` : (link?.href ?? '#');
  const action = lesson ? (resuming ? 'Resume lesson' : done ? 'Open the lesson again' : `Start lesson · ${lesson.minutes} min`) : concept.visualisers.length ? 'Open the visualiser' : (link?.label ?? null);
  const tally = mastery && mastery.observations > 0 ? ` · ${mastery.correct} of ${mastery.observations} right` : '';
  return (
    <TrackCard track={concept.track} as="section" aria-labelledby="selected-title" className="gap-4 rounded-[28px] lg:col-start-2 lg:row-start-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-eyebrow uppercase">Selected</span>
        {status && status !== 'locked' && <StatusChip status={status} label={`${STATUS_TEXT[status] || 'Ready'}${tally}`} className="bg-chip-on-track" />}
        {status === 'locked' && <StatusChip status="locked" label={concept.planned ? 'Coming soon' : 'Not yet'} />}
      </div>
      <h2 id="selected-title" className={cx('font-display text-[30px] leading-[1.05] font-bold tracking-[-0.02em]', trackTitle(concept.track))}>
        {concept.title}
      </h2>
      <p className="text-[15px] leading-relaxed">{concept.summary}</p>
      {action && (
        <ButtonLink href={href} size="l" block>
          {action}
        </ButtonLink>
      )}
      {(lesson && concept.visualisers.length > 0) || concept.problems > 0 ? (
        <div className="flex flex-wrap gap-2">
          {lesson && concept.visualisers[0] && (
            <ButtonLink href={`/visualisers/${concept.visualisers[0].slug}`} kind="onTrack" className="flex-1" icon={<FiPlay aria-hidden className="fill-current" />}>
              Visualiser
            </ButtonLink>
          )}
          {concept.problems > 0 && (
            <ButtonLink href={concept.pattern ? `/practice#${concept.pattern}` : '/practice'} kind="onTrack" className="flex-1">
              {concept.problems} {concept.problems === 1 ? 'problem' : 'problems'}
            </ButtonLink>
          )}
        </div>
      ) : null}
    </TrackCard>
  );
}

function Relations({ concept, concepts, known, onSelect }: { concept: PathConcept; concepts: Record<string, PathConcept>; known: (id: string) => boolean; onSelect: (id: string) => void }) {
  const group = (title: string, ids: string[]) =>
    ids.length > 0 && (
      <div className="flex flex-col gap-2">
        <h3 className="text-eyebrow text-ink-muted uppercase">{title}</h3>
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => {
            const c = concepts[id];
            if (!c) return null;
            const t = TRACK_CLASSES[trackColour(c.track)];
            return (
              <li key={id}>
                <button type="button" onClick={() => onSelect(id)} className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold', t.bg, t.ink)}>
                  {c.title}
                  {known(id) && <FiCheck aria-label="known" className="size-3.5" strokeWidth={2.5} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  return (
    <Card aria-label={`What ${concept.title} builds on and unlocks`} className="gap-4 rounded-[28px] lg:col-start-2">
      {group('Builds on', concept.prereqs)}
      {group('Unlocks', concept.unlocks)}
      {concept.visualisers.length + concept.links.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-eyebrow text-ink-muted uppercase">See it</h3>
          <ul className="flex flex-wrap gap-2">
            {concept.visualisers.map((v) => (
              <li key={v.slug}>
                <Link href={`/visualisers/${v.slug}`} className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink">
                  <FiPlay aria-hidden className="size-3 fill-current" /> {v.name}
                </Link>
              </li>
            ))}
            {concept.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex rounded-full bg-sunken px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {concept.prereqs.length === 0 && concept.unlocks.length === 0 && <p className="text-sm text-ink-muted">Nothing on the map builds on this yet.</p>}
      <p className="text-[13px] text-ink-muted">Mastered means right answers to different questions, including one on a later day.</p>
    </Card>
  );
}

/** A way in for someone new, or back to the placement check and the plan. */
function WhereToStart() {
  const { ready, events } = useProgressSnapshot();
  if (!ready) return null;
  const placed = events.some((e) => e.kind === 'placement.answered');
  const fresh = !placed && !events.some((e) => e.kind !== 'plan.set');
  const plan = currentPlan(events);
  return (
    <Card aria-labelledby="start-title" className="gap-3 rounded-[28px] lg:col-start-2">
      <h2 id="start-title" className="text-base font-semibold">
        {fresh ? 'Where to start' : 'Placement and plan'}
      </h2>
      {fresh && <p className="text-sm text-ink-soft">New here? A short placement check skips what you already know, so you start at the edge of it.</p>}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/learn/placement" kind={fresh ? 'primary' : 'soft'} size="s" icon={<FiTrendingUp aria-hidden />}>
          {fresh ? 'Take the placement check' : 'Retake the placement check'}
        </ButtonLink>
        <ButtonLink href="/plan" kind="soft" size="s" icon={<FiCalendar aria-hidden />}>
          {plan ? 'Open your study plan' : 'Make a study plan'}
        </ButtonLink>
      </div>
      {!fresh && (
        <Link href="/learn?tab=lessons" className="text-sm font-semibold text-accent-ink hover:underline">
          Every lesson in one list
        </Link>
      )}
    </Card>
  );
}

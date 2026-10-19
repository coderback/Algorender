import { clsx } from 'clsx';
import type { ComponentProps, ReactNode } from 'react';
import { FiAward, FiCheck, FiLock, FiTrendingUp } from 'react-icons/fi';
import type { MasteryStatus } from '@/progress/mastery';

export type ChipTone = 'neutral' | 'onTrack' | 'accent' | 'good' | 'warn' | 'bad' | 'onFeature';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-sunken text-ink-soft',
  onTrack: 'bg-chip-on-track',
  accent: 'bg-accent-soft text-accent-ink',
  good: 'bg-good-soft text-good-ink',
  warn: 'bg-warn-soft text-warn-ink',
  bad: 'bg-bad-soft text-bad-ink',
  onFeature: 'bg-on-feature/12 text-on-feature',
};

/** A round pill label (category, count, tag). onTrack inherits the card's ink. */
export function Chip({ tone = 'neutral', icon, className, children, ...rest }: { tone?: ChipTone; icon?: ReactNode } & ComponentProps<'span'>) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap [&_svg]:size-3', TONE[tone], className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}

/** A square tag: difficulty and complexity are tags, statuses are round pills. */
function Tag({ className, children, ...rest }: ComponentProps<'span'>) {
  return (
    <span className={clsx('inline-flex items-center rounded-lg px-2.5 py-[3px] text-xs whitespace-nowrap', className)} {...rest}>
      {children}
    </span>
  );
}

export type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTY: Record<Difficulty, { label: string; className: string }> = {
  easy: { label: 'Easy', className: 'bg-good-soft text-good-ink' },
  medium: { label: 'Medium', className: 'bg-warn-soft text-warn-ink' },
  hard: { label: 'Hard', className: 'bg-bad-soft text-bad-ink' },
};

export function DifficultyChip({ level, className }: { level: Difficulty; className?: string }) {
  const d = DIFFICULTY[level];
  return <Tag className={clsx('font-semibold', d.className, className)}>{d.label}</Tag>;
}

/** A complexity or other mono value: O(n log n). */
export function MonoTag({ className, children }: { className?: string; children: ReactNode }) {
  return <Tag className={clsx('bg-sunken font-mono text-ink', className)}>{children}</Tag>;
}

/** The six progress statuses as the learner sees them. */
export type Status = 'mastered' | 'practised' | 'learning' | 'ready' | 'placed' | 'locked';

export const STATUS_LABEL: Record<Status, string> = {
  mastered: 'Mastered',
  practised: 'Practised',
  learning: 'Learning',
  ready: 'Ready to start',
  placed: 'Placed out',
  locked: 'Not yet',
};

const STATUS_STYLE: Record<Status, string> = {
  mastered: 'bg-good-soft text-good-ink',
  practised: 'bg-accent-soft text-accent-ink',
  learning: 'bg-warn-soft text-warn-ink',
  ready: 'border-[1.5px] border-dashed border-accent text-accent-ink py-[2.5px]',
  placed: 'bg-sunken text-ink-soft',
  locked: 'bg-sunken text-ink-soft',
};

const STATUS_ICON: Partial<Record<Status, ReactNode>> = {
  mastered: <FiAward aria-hidden strokeWidth={2.5} />,
  practised: <FiCheck aria-hidden strokeWidth={2.5} />,
  learning: <FiTrendingUp aria-hidden strokeWidth={2.5} />,
  locked: <FiLock aria-hidden strokeWidth={2.5} />,
};

/**
 * A concept's status for display. A concept with nothing recorded is ready if
 * everything it builds on is known, otherwise not yet; placed and assumed
 * both read as placed out.
 */
export function displayStatus(status: MasteryStatus, ready: boolean): Status {
  if (status === 'new') return ready ? 'ready' : 'locked';
  if (status === 'assumed') return 'placed';
  return status;
}

/** A status pill: always a word, and a glyph where the board draws one. */
export function StatusChip({ status, label, className }: { status: Status; label?: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap [&_svg]:size-3', STATUS_STYLE[status], className)}>
      {STATUS_ICON[status]}
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

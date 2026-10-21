import { cx } from '@/components/ui/cx';

/** Concepts floating on a lilac panel: a picture of ideas building on each other (placement, onboarding, sign-in). */
const BUBBLES = [
  { label: 'Big-O', className: 'left-[2%] top-[6%] size-24 bg-surface text-ink' },
  { label: 'Hash tables', className: 'right-[12%] top-0 size-20 bg-track-mint text-track-mint-title' },
  { label: 'Binary search', className: 'left-[36%] top-[30%] size-21 bg-track-peach text-track-peach-title' },
  { label: 'Two pointers', className: 'left-[14%] top-[58%] size-22 bg-track-butter text-track-butter-title' },
  { label: 'Your goal', className: 'left-[52%] top-[60%] size-26 bg-primary text-on-primary' },
];

export function ConceptBubbles({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx('relative h-64', className)}>
      {BUBBLES.map((b) => (
        <span key={b.label} className={cx('absolute flex items-center justify-center rounded-full p-2 text-center text-sm leading-tight font-semibold', b.className)}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

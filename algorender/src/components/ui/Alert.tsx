import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiXCircle } from 'react-icons/fi';

export type AlertTone = 'good' | 'warn' | 'bad';

const STYLE: Record<AlertTone, { box: string; title: string; icon: string; Icon: typeof FiCheckCircle }> = {
  good: { box: 'bg-good-soft', title: 'text-good-title', icon: 'text-good-ink', Icon: FiCheckCircle },
  warn: { box: 'bg-warn-soft', title: 'text-warn-title', icon: 'text-warn-ink', Icon: FiAlertTriangle },
  bad: { box: 'bg-bad-soft', title: 'text-bad-title', icon: 'text-bad-ink', Icon: FiXCircle },
};

/**
 * Feedback: a soft fill, a dark title and a coloured icon. It's a polite
 * status region by default; pass role={null} for static callouts.
 */
export function Alert({ tone, title, children, icon, role = 'status', className }: { tone: AlertTone; title: ReactNode; children?: ReactNode; icon?: ReactNode; role?: 'status' | 'alert' | null; className?: string }) {
  const s = STYLE[tone];
  return (
    <div role={role ?? undefined} className={clsx('flex items-start gap-2.5 rounded-well px-3.5 py-3', s.box, className)}>
      <span className={clsx('mt-px shrink-0 [&_svg]:size-[18px]', s.icon)}>{icon ?? <s.Icon aria-hidden />}</span>
      <div className="min-w-0">
        <p className={clsx('text-sm font-semibold', s.title)}>{title}</p>
        {children && <div className={clsx('mt-0.5 text-[13px] leading-snug', s.title)}>{children}</div>}
      </div>
    </div>
  );
}

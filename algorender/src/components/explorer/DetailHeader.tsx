import Link from 'next/link';
import type { ReactNode } from 'react';
import { BackButton } from '@/components/shell/PhoneHeader';
import { cx } from '@/components/ui/cx';

/**
 * The header of a page below a hub (a visualiser, the race, an exercise): a breadcrumb,
 * the title with its chips, a line of description and actions on the right.
 * Phones get a back button beside the title instead of the breadcrumb.
 */
export function DetailHeader({
  crumb,
  back,
  title,
  eyebrowClass = 'text-ink-muted',
  chips,
  description,
  actions,
  root = { href: '/explore', label: 'Explore' },
}: {
  /** The last breadcrumb, after the root; also the phone eyebrow. */
  crumb: string;
  /** Where the phone back button goes; none where the shell already draws one. */
  back?: string;
  /** The first breadcrumb. */
  root?: { href: string; label: string };
  title: string;
  eyebrowClass?: string;
  chips?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-4">
      <div className="flex min-w-0 flex-col gap-2.5">
        <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm md:flex">
          <Link href={root.href} className="font-semibold text-accent-ink hover:underline">
            {root.label}
          </Link>
          <span aria-hidden className="text-ink-faint">
            /
          </span>
          <span className="text-ink-muted">{crumb}</span>
        </nav>
        <div className="flex min-w-0 items-center gap-3">
          {back && (
            <span className="md:hidden">
              <BackButton href={back} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={cx('text-[13px] font-semibold md:hidden', eyebrowClass)}>{crumb}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2">
              <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.03em] md:text-[clamp(34px,3.6vw,48px)] md:tracking-[-0.035em]">{title}</h1>
              {chips && <span className="hidden flex-wrap items-center gap-2 md:flex">{chips}</span>}
            </div>
          </div>
        </div>
        {description && <p className="hidden max-w-[640px] text-base leading-normal text-ink-soft md:block">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

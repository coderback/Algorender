import Link from 'next/link';
import { clsx } from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

/**
 * primary: the one main action on a screen (Resume, Start review, Submit).
 * accent: learning actions (Run, Play, Check). secondary: a second action.
 * soft: tertiary inside cards. ghost: a quiet link-like action. danger:
 * destructive. onTrack: a button sitting on a pastel track card.
 */
export type ButtonKind = 'primary' | 'accent' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'onTrack';
export type ButtonSize = 's' | 'm' | 'l';

const KIND: Record<ButtonKind, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  accent: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'bg-surface text-ink ring-[1.5px] ring-line ring-inset hover:ring-line-strong',
  soft: 'bg-sunken text-ink hover:bg-line-soft',
  ghost: 'bg-transparent text-accent-ink hover:bg-accent-soft',
  danger: 'bg-bad-soft text-bad-ink hover:ring-[1.5px] hover:ring-bad-line hover:ring-inset',
  onTrack: 'bg-surface text-ink hover:bg-subtle',
};

const SIZE: Record<ButtonSize, string> = {
  s: 'h-9 px-3.5 text-[13px]',
  m: 'h-11 px-[18px] text-sm',
  l: 'h-13 px-[22px] text-[15px]',
};

const ICON_SIZE: Record<ButtonSize, string> = { s: 'size-9', m: 'size-11', l: 'size-13' };

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-150 ease-standard disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0';

/** The classes for a button-shaped element, for the rare case that isn't a Button or ButtonLink. */
export function buttonClass({ kind = 'primary', size = 'm', block = false }: { kind?: ButtonKind; size?: ButtonSize; block?: boolean } = {}) {
  return clsx(BASE, KIND[kind], SIZE[size], block && 'w-full');
}

interface Look {
  kind?: ButtonKind;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** A 16px icon before the label. */
  icon?: ReactNode;
  /** A 16px icon after the label (e.g. an arrow). */
  trailing?: ReactNode;
}

export function Button({ kind, size, block, icon, trailing, className, children, type = 'button', ...rest }: Look & ComponentProps<'button'>) {
  return (
    <button type={type} className={clsx(buttonClass({ kind, size, block }), className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </button>
  );
}

export function ButtonLink({ kind, size, block, icon, trailing, className, children, ...rest }: Look & ComponentProps<typeof Link>) {
  return (
    <Link className={clsx(buttonClass({ kind, size, block }), className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </Link>
  );
}

/** A round icon-only button. The label is required: it is the accessible name. */
export function IconButton({
  label,
  kind = 'onTrack',
  size = 'm',
  className,
  children,
  type = 'button',
  ...rest
}: { label: string; kind?: ButtonKind; size?: ButtonSize } & Omit<ComponentProps<'button'>, 'aria-label'>) {
  return (
    <button type={type} aria-label={label} title={label} className={clsx(BASE, KIND[kind], ICON_SIZE[size], 'px-0', className)} {...rest}>
      {children}
    </button>
  );
}

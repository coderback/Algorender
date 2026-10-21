'use client';

import { cx } from './cx';
import { useId, type ComponentProps, type ReactNode } from 'react';

const CONTROL =
  'h-12 w-full min-w-0 rounded-[16px] bg-sunken px-4 text-[15px] text-ink placeholder:text-ink-muted transition-shadow duration-150 ease-standard hover:ring-1 hover:ring-line-strong hover:ring-inset aria-invalid:ring-[1.5px] aria-invalid:ring-bad-ink aria-invalid:ring-inset disabled:opacity-45';

interface FieldProps {
  label: ReactNode;
  /** Help under the control. */
  hint?: ReactNode;
  /** An error replaces the hint, in the wrong ink, and marks the control invalid. */
  error?: ReactNode;
  /** Geist Mono 600, for numbers and code-like values. */
  mono?: boolean;
  className?: string;
}

function Frame({ id, label, hint, error, className, children }: Omit<FieldProps, 'mono'> & { id: string; children: ReactNode }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {(error || hint) && (
        <p id={`${id}-hint`} className={cx('text-xs', error ? 'text-bad-ink' : 'text-ink-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** A labelled text input. */
export function Field({ label, hint, error, mono, className, id, ...input }: FieldProps & ComponentProps<'input'>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Frame id={fid} label={label} hint={hint} error={error} className={className}>
      <input
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-hint` : undefined}
        className={cx(CONTROL, mono && 'font-mono font-semibold')}
        {...input}
      />
    </Frame>
  );
}

/** A labelled native select. It follows the theme's color-scheme. */
export function SelectField({ label, hint, error, mono, className, id, children, ...select }: FieldProps & ComponentProps<'select'>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Frame id={fid} label={label} hint={hint} error={error} className={className}>
      <select
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-hint` : undefined}
        className={cx(CONTROL, 'cursor-pointer pr-10', mono && 'font-mono font-semibold')}
        {...select}
      >
        {children}
      </select>
    </Frame>
  );
}


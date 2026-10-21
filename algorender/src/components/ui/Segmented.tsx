import { cx } from './cx';
import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * An in-page mode switch (Watch / Predict, input shape, theme). Each option is
 * a toggle button with aria-pressed; the group is labelled.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 's',
  className,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** s: 13px options (dense controls); m: 40px options (the board's Watch / Predict). */
  size?: 's' | 'm';
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-sunken p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex shrink-0 items-center gap-2 rounded-full whitespace-nowrap transition-colors duration-150 ease-standard disabled:opacity-45 [&_svg]:size-4',
              size === 's' ? 'px-3 py-1.5 text-[13px]' : 'h-10 px-[18px] text-sm',
              on ? 'bg-segment font-semibold text-ink shadow-segment' : 'font-medium text-ink-soft hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

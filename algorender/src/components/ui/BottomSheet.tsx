'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';

/**
 * A phone bottom sheet (filters, the tutor, the hint ladder). It is a modal
 * <dialog>, so focus stays inside, Esc closes it and focus returns to the
 * opener. Tapping the backdrop closes it too.
 */
export function BottomSheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={clsx(
        'm-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] bg-surface p-0 text-ink backdrop:bg-feature/40 backdrop:backdrop-blur-[2px]',
        className,
      )}
    >
      <div className="flex flex-col gap-4 px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto h-1 w-9 rounded-full bg-line-strong" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-title-card">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-full bg-sunken text-ink-soft hover:text-ink"
          >
            <FiX aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

'use client';

import { useId, useState, type ReactNode } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';

/**
 * The teaching panels beside a visualiser ("What stays true", "When to use
 * it", "Properties", "Try it out next") are written from the module's
 * `content`, which can state what a Predict question asks. In Predict mode
 * they fold behind a disclosure until the learner opens it; in Watch mode they
 * show as before. Mount it with a `key` on the mode so it folds again each
 * time Predict starts.
 */
export function PredictFold({ predicting, children }: { predicting: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!predicting) return children;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-surface px-6 py-5" data-testid="predict-fold">
        <p className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <span className="font-display text-title-card">Notes are folded while you predict</span>
          <span className="text-sm text-ink-muted">What stays true, when to use it, its properties and the experiments can give answers away.</span>
        </p>
        <Button kind="secondary" aria-expanded={open} aria-controls={id} icon={open ? <FiEyeOff aria-hidden /> : <FiEye aria-hidden />} onClick={() => setOpen(!open)}>
          {open ? 'Hide the notes' : 'Show them anyway'}
        </Button>
      </div>
      <div id={id} hidden={!open} className="flex flex-col gap-4">
        {open && children}
      </div>
    </>
  );
}

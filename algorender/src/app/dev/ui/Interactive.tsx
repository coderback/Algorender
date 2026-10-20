'use client';

import { useState } from 'react';
import { FiEye, FiHelpCircle, FiSearch, FiSliders } from 'react-icons/fi';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Kbd } from '@/components/ui/CodeBlock';
import { Field, SelectField } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/Numbers';
import { Segmented } from '@/components/ui/Segmented';

/** The interactive half of the sheet: switches, fields and the bottom sheet. */
export function InputsDemo() {
  const [mode, setMode] = useState<'watch' | 'predict'>('watch');
  const [shape, setShape] = useState<'random' | 'sorted' | 'reversed' | 'few'>('random');
  return (
    <div className="flex flex-col gap-4">
      <label className="flex h-12 items-center gap-2.5 rounded-full border border-field-line bg-sunken pr-2 pl-4 text-sm text-ink-muted">
        <FiSearch aria-hidden className="size-[18px] shrink-0" />
        <span className="sr-only">Search</span>
        <input data-bare type="search" placeholder="Search visualisers, lessons, problems" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted" />
        <Kbd tone="surface">Ctrl K</Kbd>
      </label>
      <Segmented
        label="Mode"
        size="m"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'watch', label: 'Watch', icon: <FiEye aria-hidden /> },
          { value: 'predict', label: 'Predict', icon: <FiHelpCircle aria-hidden /> },
        ]}
      />
      <Segmented
        label="Input shape"
        value={shape}
        onChange={setShape}
        options={[
          { value: 'random', label: 'Random' },
          { value: 'sorted', label: 'Sorted' },
          { value: 'reversed', label: 'Reversed' },
          { value: 'few', label: 'Few unique' },
        ]}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Progress bar</span>
        <ProgressBar value={64} max={100} label="Progress" />
      </div>
    </div>
  );
}

export function FieldsDemo() {
  const [estimate, setEstimate] = useState('300k');
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Email" type="email" placeholder="you@example.com" hint="We never share it." />
      <Field label="Your estimate" mono value={estimate} onChange={(e) => setEstimate(e.target.value)} hint="Use k, M, GB…" />
      <SelectField label="Code language" defaultValue="python">
        <option value="python">Python</option>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
      </SelectField>
      <Field label="Hash table size" mono defaultValue="0" error="Pick a size from 1 to 64." />
    </div>
  );
}

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button kind="secondary" icon={<FiSliders aria-hidden />} onClick={() => setOpen(true)}>
        Open filters sheet
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Filters">
        <div className="flex flex-wrap gap-2">
          <Chip tone="accent">Every track</Chip>
          <Chip>Sorting</Chip>
          <Chip>Graphs</Chip>
        </div>
        <Button kind="primary" block onClick={() => setOpen(false)}>
          Show 28 visualisers
        </Button>
      </BottomSheet>
    </>
  );
}

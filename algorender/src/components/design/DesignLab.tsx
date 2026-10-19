import { FiZap } from 'react-icons/fi';
import { designPresets } from '@/content/designs/presets';
import { DesignCanvas } from './DesignCanvas';

/**
 * A design canvas inside a lesson: it starts from a named preset
 * (src/content/designs/presets.ts), and the caption, shown first, says what to
 * change and what to watch. Lesson canvases keep nothing: no URL, no saved
 * copy, no progress events.
 */
export function DesignLab({ preset, caption }: { preset: string; caption: string }) {
  const p = designPresets[preset];
  if (!p) throw new Error(`Unknown design preset "${preset}"`);
  return (
    <figure className="not-prose -mx-1 space-y-3 rounded-2xl border border-line-soft bg-subtle p-3 sm:mx-0 sm:p-4">
      <figcaption className="flex gap-2 text-sm text-ink-soft">
        <FiZap aria-hidden className="mt-0.5 shrink-0 text-accent-ink" />
        <span>
          <span className="font-semibold text-ink">Try this: </span>
          {caption}
        </span>
      </figcaption>
      <DesignCanvas initial={p.design} variant="lesson" seconds={p.seconds} />
    </figure>
  );
}

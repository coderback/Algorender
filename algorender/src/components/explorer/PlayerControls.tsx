'use client';

import { useState, type ReactNode } from 'react';
import { FiChevronLeft, FiChevronRight, FiCode, FiLink, FiPause, FiPlay, FiRotateCcw, FiSkipBack, FiSkipForward } from 'react-icons/fi';
import { cx } from '@/components/ui/cx';
import { DEFAULT_SPEED, SPEEDS, type TracePlayer } from '@/engine/useTracePlayer';

/**
 * Transport controls: |◀ ◀ ▶ ▶ ▶|, the scrubber, the step counter and speed,
 * with the keyboard hint below. `children` adds extra controls to that last
 * row. `share` shows the step-link and embed buttons; a learner's own run has
 * no URL to share.
 */
export function PlayerControls({ player, children, share = true, hint }: { player: TracePlayer; children?: ReactNode; share?: boolean; hint?: string }) {
  const { index, last, playing, speed, blocked } = player;
  const waiting = blocked ? 'Answer the question first' : null;
  const atStart = index === 0;
  const atEnd = index === last;
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);

  const copy = async (kind: 'link' | 'embed') => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(index));
    url.pathname = url.pathname.replace(/^\/(visualisers|embed)\//, kind === 'embed' ? '/embed/' : '/visualisers/');
    const text =
      kind === 'link'
        ? url.toString()
        : `<iframe src="${url}" title="Algorender visualisation" width="100%" height="760" style="border:0" loading="lazy"></iframe>`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      if (kind === 'link') window.history.replaceState(null, '', url);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-3 sm:justify-start">
        <div className="flex items-center gap-1.5">
          <RoundButton label="Go to start (Home)" onClick={() => player.seek(0)} disabled={atStart} className="hidden sm:inline-flex">
            <FiSkipBack />
          </RoundButton>
          <RoundButton label="Step back (←)" onClick={player.stepBack} disabled={atStart}>
            <FiChevronLeft />
          </RoundButton>
          <button
            type="button"
            onClick={player.toggle}
            disabled={last === 0 || blocked}
            aria-label={playing ? 'Pause (Space)' : atEnd ? 'Replay (Space)' : 'Play (Space)'}
            title={waiting ?? (playing ? 'Pause (Space)' : atEnd ? 'Replay (Space)' : 'Play (Space)')}
            className="inline-flex size-[60px] items-center justify-center rounded-full bg-accent text-xl text-on-accent shadow-[0_10px_24px_-10px_var(--color-accent)] transition-colors duration-150 ease-standard hover:bg-accent-strong disabled:opacity-40 disabled:shadow-none"
          >
            {playing ? <FiPause /> : atEnd ? <FiRotateCcw /> : <FiPlay className="translate-x-px" />}
          </button>
          <RoundButton label={waiting ?? 'Step forward (→)'} onClick={player.stepForward} disabled={atEnd || blocked}>
            <FiChevronRight />
          </RoundButton>
          <RoundButton label="Go to end (End)" onClick={() => player.seek(last)} disabled={atEnd} className="hidden sm:inline-flex">
            <FiSkipForward />
          </RoundButton>
        </div>

        <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3">
          <input
            type="range"
            min={0}
            max={last}
            value={index}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Step"
            aria-valuetext={`Step ${index + 1} of ${last + 1}`}
            className="h-7 w-full min-w-0 accent-accent"
          />
          <span className="shrink-0 font-mono text-sm whitespace-nowrap text-ink-soft tabular-nums">
            {index + 1} / {last + 1}
          </span>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          Speed
          <select
            value={speed}
            onChange={(e) => player.setSpeed(Number(e.target.value))}
            className="h-10 rounded-full bg-sunken px-3 text-[13px] font-semibold text-ink"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s / DEFAULT_SPEED}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-muted">
        <span className="hidden sm:inline">{hint ?? '← → step · Space play · Home / End jump'}</span>
        {children}
        {share && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => copy('link')}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 font-semibold text-accent-ink transition-colors duration-150 ease-standard hover:bg-accent-soft"
            >
              <FiLink aria-hidden /> {copied === 'link' ? 'Link copied' : 'Copy link to this step'}
            </button>
            <button
              type="button"
              onClick={() => copy('embed')}
              title="Copy an <iframe> snippet that embeds this visualiser at this step"
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 font-semibold text-accent-ink transition-colors duration-150 ease-standard hover:bg-accent-soft"
            >
              <FiCode aria-hidden /> {copied === 'embed' ? 'Embed copied' : 'Embed'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 items-center justify-center rounded-full bg-sunken text-lg text-ink transition-colors duration-150 ease-standard hover:bg-line-soft disabled:opacity-35 disabled:hover:bg-sunken',
        className,
      )}
    >
      {children}
    </button>
  );
}

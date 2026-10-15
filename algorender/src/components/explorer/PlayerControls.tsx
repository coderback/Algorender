'use client';

import { useState, type ReactNode } from 'react';
import { FiChevronLeft, FiChevronRight, FiCode, FiLink, FiPause, FiPlay, FiRotateCcw, FiSkipBack, FiSkipForward } from 'react-icons/fi';
import { DEFAULT_SPEED, SPEEDS, type TracePlayer } from '@/engine/useTracePlayer';

/**
 * Transport controls. `children` adds extra controls (e.g. the Watch/Predict switch) to the second row.
 * `share` shows the step-link and embed buttons; a learner's own run has no URL to share.
 */
export function PlayerControls({ player, children, share = true }: { player: TracePlayer; children?: ReactNode; share?: boolean }) {
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
    <div className="rounded-xl border border-line-soft bg-surface p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton label="Go to start (Home)" onClick={() => player.seek(0)} disabled={atStart}>
            <FiSkipBack />
          </IconButton>
          <IconButton label="Step back (←)" onClick={player.stepBack} disabled={atStart}>
            <FiChevronLeft />
          </IconButton>
          <button
            type="button"
            onClick={player.toggle}
            disabled={last === 0 || blocked}
            aria-label={playing ? 'Pause (Space)' : atEnd ? 'Replay (Space)' : 'Play (Space)'}
            title={waiting ?? (playing ? 'Pause (Space)' : atEnd ? 'Replay (Space)' : 'Play (Space)')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-lg text-white shadow-sm transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
          >
            {playing ? <FiPause /> : atEnd ? <FiRotateCcw /> : <FiPlay className="translate-x-px" />}
          </button>
          <IconButton label={waiting ?? 'Step forward (→)'} onClick={player.stepForward} disabled={atEnd || blocked}>
            <FiChevronRight />
          </IconButton>
          <IconButton label="Go to end (End)" onClick={() => player.seek(last)} disabled={atEnd}>
            <FiSkipForward />
          </IconButton>
        </div>

        <div className="flex min-w-48 flex-1 items-center gap-3">
          <input
            type="range"
            min={0}
            max={last}
            value={index}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Step"
            aria-valuetext={`Step ${index + 1} of ${last + 1}`}
            className="w-full accent-accent"
          />
          <span className="shrink-0 font-mono text-sm tabular-nums text-ink-soft">
            {index + 1}/{last + 1}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <label className="flex items-center gap-2">
          Speed
          <select
            value={speed}
            onChange={(e) => player.setSpeed(Number(e.target.value))}
            className="rounded-md border border-line bg-surface px-2 py-1 text-ink-soft"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s / DEFAULT_SPEED}×
              </option>
            ))}
          </select>
        </label>
        {children}
        <span className="hidden xl:inline">← → step · Space play · Home/End jump</span>
        {share && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => copy('link')}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-accent-ink hover:bg-accent-soft"
            >
              <FiLink aria-hidden /> {copied === 'link' ? 'Link copied' : 'Copy link to this step'}
            </button>
            <button
              type="button"
              onClick={() => copy('embed')}
              title="Copy an <iframe> snippet that embeds this visualiser at this step"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-accent-ink hover:bg-accent-soft"
            >
              <FiCode aria-hidden /> {copied === 'embed' ? 'Embed copied' : 'Embed'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink-soft transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

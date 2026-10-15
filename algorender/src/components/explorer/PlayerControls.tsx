'use client';

import { useState, type ReactNode } from 'react';
import { FiChevronLeft, FiChevronRight, FiLink, FiPause, FiPlay, FiRotateCcw, FiSkipBack, FiSkipForward } from 'react-icons/fi';
import { DEFAULT_SPEED, SPEEDS, type TracePlayer } from '@/engine/useTracePlayer';

export function PlayerControls({ player }: { player: TracePlayer }) {
  const { index, last, playing, speed } = player;
  const atStart = index === 0;
  const atEnd = index === last;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(index));
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.history.replaceState(null, '', url);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xs">
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
            disabled={last === 0}
            aria-label={playing ? 'Pause (Space)' : atEnd ? 'Replay (Space)' : 'Play (Space)'}
            title={playing ? 'Pause (Space)' : atEnd ? 'Replay (Space)' : 'Play (Space)'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-lg text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40"
          >
            {playing ? <FiPause /> : atEnd ? <FiRotateCcw /> : <FiPlay className="translate-x-px" />}
          </button>
          <IconButton label="Step forward (→)" onClick={player.stepForward} disabled={atEnd}>
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
            className="w-full accent-blue-600"
          />
          <span className="shrink-0 font-mono text-sm tabular-nums text-gray-600">
            {index + 1}/{last + 1}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <label className="flex items-center gap-2">
          Speed
          <select
            value={speed}
            onChange={(e) => player.setSpeed(Number(e.target.value))}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s / DEFAULT_SPEED}×
              </option>
            ))}
          </select>
        </label>
        <span className="hidden md:inline">← → step · Space play/pause · Home/End jump</span>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-blue-700 hover:bg-blue-50"
        >
          <FiLink aria-hidden /> {copied ? 'Link copied' : 'Copy link to this step'}
        </button>
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
      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

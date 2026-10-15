'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Playback speeds in steps per second. */
export const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32] as const;
export const DEFAULT_SPEED = 2;

/** Tween used when the learner steps by hand. */
const MANUAL_TWEEN_MS = 320;
/** Longest tween during playback; slower speeds hold the end state instead of crawling. */
const MAX_PLAY_TWEEN_MS = 420;

/**
 * Tween length for a given playback speed. Motion fills most of the step
 * interval, so movement is continuous rather than stop-motion, and it never
 * outlasts the step (which would truncate it at high speeds).
 */
export function playTweenMs(stepsPerSecond: number): number {
  return Math.min(MAX_PLAY_TWEEN_MS, Math.round((1000 / stepsPerSecond) * 0.85));
}

export type TracePlayer = {
  index: number;
  last: number;
  playing: boolean;
  speed: number;
  /** How long the view should take to animate into the current frame. 0 = jump. */
  tweenMs: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepForward: () => void;
  stepBack: () => void;
  seek: (index: number) => void;
  setSpeed: (speed: number) => void;
};

/**
 * Plays a recorded trace on a requestAnimationFrame clock. Holds only an index:
 * the frames themselves are immutable, so stepping back is as cheap as forward.
 */
export function useTracePlayer(frameCount: number, initialIndex = 0): TracePlayer {
  const last = Math.max(0, frameCount - 1);
  const [index, setIndex] = useState(() => clamp(initialIndex, 0, last));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [instant, setInstant] = useState(false);

  // Mirror of `index` for the playback loop, which must not restart every step.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    const interval = 1000 / speed;
    let pos = indexRef.current;
    let prev: number | null = null;
    let elapsed = 0;
    let raf = 0;

    const tick = (now: number) => {
      if (prev !== null) elapsed += now - prev;
      prev = now;
      if (elapsed >= interval) {
        const steps = Math.floor(elapsed / interval);
        elapsed -= steps * interval;
        pos = Math.min(last, pos + steps);
        setIndex(pos);
        if (pos >= last) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, last]);

  const play = useCallback(() => {
    setInstant(false);
    if (indexRef.current >= last) {
      // Replaying from the end: jump back to the start first.
      indexRef.current = 0;
      setIndex(0);
    }
    if (last > 0) setPlaying(true);
  }, [last]);

  const pause = useCallback(() => setPlaying(false), []);

  const stepTo = useCallback(
    (next: number, jump: boolean) => {
      setPlaying(false);
      setInstant(jump);
      setIndex(clamp(next, 0, last));
    },
    [last],
  );

  const stepForward = useCallback(() => stepTo(indexRef.current + 1, false), [stepTo]);
  const stepBack = useCallback(() => stepTo(indexRef.current - 1, false), [stepTo]);
  const seek = useCallback((next: number) => stepTo(next, true), [stepTo]);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  const tweenMs = instant ? 0 : playing ? playTweenMs(speed) : MANUAL_TWEEN_MS;

  return { index, last, playing, speed, tweenMs, play, pause, toggle, stepForward, stepBack, seek, setSpeed };
}

/** Keyboard shortcuts: ←/→ step, Space play/pause, Home/End jump. */
export function usePlayerKeyboard(player: TracePlayer) {
  const { stepForward, stepBack, toggle, seek, last } = player;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Leave typing, sliders and native button activation alone.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (e.key === ' ' && (tag === 'BUTTON' || tag === 'A')) return;

      switch (e.key) {
        case 'ArrowRight':
          stepForward();
          break;
        case 'ArrowLeft':
          stepBack();
          break;
        case ' ':
          toggle();
          break;
        case 'Home':
          seek(0);
          break;
        case 'End':
          seek(last);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepForward, stepBack, toggle, seek, last]);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

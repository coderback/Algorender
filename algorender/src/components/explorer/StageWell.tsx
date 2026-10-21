'use client';

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { FiMaximize2, FiMinimize2, FiMinus, FiPlus } from 'react-icons/fi';
import { Button, IconButton } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { STAGE_CAPTION } from '@/viz/parts';

/** Zoom levels the − and + buttons step through; 1 is Fit. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
const FIT = ZOOMS.indexOf(1);

/** Elements a drag should reach instead of panning the stage. */
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [role="slider"], [tabindex]:not([tabindex="-1"])';

const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};

/**
 * The stage well (V0) with its caption and view tools above it: zoom out, Fit,
 * zoom in, full screen. The caption says what the view holds and names the
 * well for screen readers.
 *
 * Zoom scales the drawing without changing its layout: the view is laid out at
 * the well's width as usual, then scaled inside a scroll box, so scrolling,
 * touch and (with a mouse) dragging the background pan it. Full screen shows
 * the whole stage card (`card`), narration and player included.
 */
export function StageWell({ caption, card, style, children }: { caption: string; card: RefObject<HTMLElement | null>; style?: CSSProperties; children: ReactNode }) {
  const captionId = useId();
  const [step, setStep] = useState(FIT);
  const zoom = ZOOMS[step];
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The box's own width (scrollbars inside it don't change it) and the drawing's unscaled height.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      setSize({ width: box.current?.getBoundingClientRect().width ?? 0, height: content.current?.offsetHeight ?? 0 });
    });
    if (box.current) observer.observe(box.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);

  const fullscreenEnabled = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenEnabled,
    () => false,
  );
  const full = useSyncExternalStore(
    subscribeFullscreen,
    () => !!card.current && document.fullscreenElement === card.current,
    () => false,
  );
  const toggleFull = () => {
    if (full) void document.exitFullscreen();
    else void card.current?.requestFullscreen();
  };

  // Zooming in keeps the middle of what was in view in the middle.
  const zoomTo = (next: number) => {
    const el = box.current;
    const to = ZOOMS[next];
    if (el && to > 1) {
      const cx = (el.scrollLeft + el.clientWidth / 2) / zoom;
      const cy = (el.scrollTop + el.clientHeight / 2) / zoom;
      requestAnimationFrame(() => {
        el.scrollLeft = cx * to - el.clientWidth / 2;
        el.scrollTop = cy * to - el.clientHeight / 2;
      });
    }
    setStep(next);
  };

  // Drag the background to pan (a mouse; touch scrolls natively).
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || e.pointerType !== 'mouse' || e.button !== 0 || (e.target as Element).closest(INTERACTIVE)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pan.current) return;
    e.currentTarget.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    e.currentTarget.scrollTop = pan.current.top - (e.clientY - pan.current.y);
  };
  const endPan = () => {
    pan.current = null;
  };

  const zoomed = zoom !== 1 && size.width > 0;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span id={captionId} className={cx('min-w-0', STAGE_CAPTION)}>
          {caption}
        </span>
        <div role="group" aria-label="View" className="flex shrink-0 items-center gap-1.5">
          <IconButton label="Zoom out" kind="soft" size="s" disabled={step === 0} onClick={() => zoomTo(step - 1)}>
            <FiMinus />
          </IconButton>
          <Button kind="soft" size="s" aria-label="Fit to stage" onClick={() => zoomTo(FIT)}>
            Fit
          </Button>
          <IconButton label="Zoom in" kind="soft" size="s" disabled={step === ZOOMS.length - 1} onClick={() => zoomTo(step + 1)}>
            <FiPlus />
          </IconButton>
          {fullscreenEnabled && (
            <IconButton label={full ? 'Exit full screen' : 'Full screen'} kind="soft" size="s" onClick={toggleFull}>
              {full ? <FiMinimize2 /> : <FiMaximize2 />}
            </IconButton>
          )}
        </div>
      </div>
      <div role="group" aria-labelledby={captionId} className="rounded-tile bg-subtle px-3 pt-4 pb-3 sm:px-6" style={style}>
        <div
          ref={box}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          className={cx('relative', zoomed && 'overflow-auto overscroll-contain', zoom > 1 && 'cursor-grab active:cursor-grabbing')}
          // Zoomed in, the box keeps the height the drawing has at Fit and scrolls; zoomed out, it shrinks with it.
          style={zoomed ? { height: zoom > 1 ? size.height : size.height * zoom } : undefined}
        >
          <div className={cx('relative', zoom < 1 && 'mx-auto')} style={zoomed ? { width: size.width * zoom, height: size.height * zoom } : undefined}>
            <div
              ref={content}
              style={zoomed ? { position: 'absolute', top: 0, left: 0, width: size.width, transform: `scale(${zoom})`, transformOrigin: '0 0' } : undefined}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

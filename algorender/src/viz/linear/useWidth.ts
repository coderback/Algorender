'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tracks an element's width so a view can wrap or space itself for phones.
 * Measured before the first paint (so a phone never sees a desktop layout
 * flash) and again whenever the element resizes. 0 only during server render.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

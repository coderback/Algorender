import { useCallback, useEffect, useRef } from 'react';

// Returns wait(ms), a drop-in for `new Promise(r => setTimeout(r, ms))` that
// never resolves once the component has unmounted. An async animation loop
// awaiting it simply stops when the user navigates away, instead of running to
// completion (or polling a pause flag forever) in the background.
export function useCancellableWait() {
  const timersRef = useRef(new Set());
  const unmountedRef = useRef(false);

  useEffect(() => {
    const timers = timersRef.current;
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return useCallback((ms) => new Promise(resolve => {
    if (unmountedRef.current) return;
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      resolve();
    }, ms);
    timersRef.current.add(id);
  }), []);
}

import { useEffect, useState } from 'react';
import { useStore } from '../store/store';

/**
 * Re-renders the caller when the document changes, but at most every `ms` milliseconds (and
 * once more at the end). For panels that don't need to follow a drag frame by frame, such as
 * the layers list, which is expensive to re-render on large files.
 */
export function useThrottledVersion(ms = 120): number {
  const [version, setVersion] = useState(() => useStore.getState().version);
  useEffect(() => {
    let timer: number | undefined;
    let last = 0;
    const flush = () => {
      timer = undefined;
      last = performance.now();
      setVersion(useStore.getState().version);
    };
    const unsub = useStore.subscribe((s, prev) => {
      if (s.version === prev.version || timer !== undefined) return;
      timer = window.setTimeout(flush, Math.max(0, ms - (performance.now() - last)));
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [ms]);
  return version;
}

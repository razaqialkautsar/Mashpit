"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTERVAL_MS = 3000; // FE-NFR-3: data at most 5 s old

export type Poll<T> = {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refresh: () => void;
};

/**
 * Runs `fetcher` now and every 3 s while the tab is visible. A failed poll keeps
 * the last good data and shows the error; the next tick retries by itself.
 */
export function usePoll<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Poll<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  // Latest fetcher, without restarting the poll loop. Runs before the effect below.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const tick = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (document.hidden) return schedule();
      try {
        const next = await fetcherRef.current();
        if (!alive) return;
        setData(next);
        setError(undefined);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
      if (alive) setLoading(false);
      schedule();
    };
    const schedule = () => {
      if (alive) timer = setTimeout(run, INTERVAL_MS);
    };
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        run();
      }
    };

    tick.current = () => {
      clearTimeout(timer);
      run();
    };
    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => tick.current(), []);
  return { data, error, loading, refresh };
}

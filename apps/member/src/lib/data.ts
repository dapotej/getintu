// Loads API data for a screen, showing what was cached first so screens work with no signal.
// Tabs stay loaded, so each screen fetches again whenever it comes back into view.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { api, errorText, NoSignal } from "./api";
import { cache } from "./storage";

export function useCached<T>(key: string, path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const fresh = await api<T>(path);
      setData(fresh);
      setOffline(false);
      setError(null);
      await cache.set(`intu.${key}`, fresh);
    } catch (err) {
      if (err instanceof NoSignal) setOffline(true);
      else setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [key, path]);

  useEffect(() => {
    let live = true;
    cache.get<T>(`intu.${key}`).then((cached) => live && cached && setData((d) => d ?? cached));
    return () => {
      live = false;
    };
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, error, offline, loading, reload: load };
}

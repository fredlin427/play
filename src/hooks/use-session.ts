"use client";

import { useState, useEffect, useCallback } from "react";

const QA_STORAGE_KEY = "qa_session_v1";

/**
 * Persist Q&A session state to localStorage so the user can recover
 * their progress after a page refresh or accidental navigation.
 *
 * Returns [hydrated, sessionData, saveSession].
 * - `hydrated` is false until the initial localStorage read completes
 *   (prevents SSR hydration mismatch flash).
 * - `sessionData` is the parsed session object (or null).
 * - `saveSession` persists the given data to localStorage.
 */
export function useSession(): [
  boolean,
  Record<string, unknown> | null,
  (data: Record<string, unknown>) => void,
] {
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QA_STORAGE_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch { /* corrupted data — start fresh */ }
    setHydrated(true);
  }, []);

  const save = useCallback((newData: Record<string, unknown>) => {
    setData(newData);
    try {
      localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.warn("[Session] Save failed:", String(e).slice(0, 80));
    }
  }, []);

  return [hydrated, data, save];
}

/** Clear the persisted session (e.g. on reset). */
export function clearSession(): void {
  try {
    localStorage.removeItem(QA_STORAGE_KEY);
  } catch { /* noop */ }
}

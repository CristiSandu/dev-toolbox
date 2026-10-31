import { useCallback, useState, type SetStateAction } from "react";

// Keep work across route changes in memory; source text never goes into browser storage.
const drafts = new Map<string, unknown>();

export function useDraftState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => drafts.has(key) ? drafts.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  const update = useCallback((next: SetStateAction<T>) => {
    setValue(current => {
      const result = typeof next === "function" ? (next as (value: T) => T)(current) : next;
      drafts.set(key, result);
      return result;
    });
  }, [key]);
  return [value, update] as const;
}

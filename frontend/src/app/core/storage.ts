/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin at `/<mockup_id>/` and Web Storage is
 * origin-scoped (not path-scoped), so bare keys collide across mockups. Every
 * read/write goes through here and is prefixed with the first path segment.
 * The colon separator is load-bearing — the screenshot harness seeds both the
 * bare and the `<segment>:`-prefixed form of each key.
 */
const NS = (typeof location !== 'undefined' && location.pathname.split('/')[1]) || 'app';

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* storage disabled / quota exceeded — the preview stays usable without it */
  }
}

export function removeKeys(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(nsKey(key));
  } catch {
    /* ignore */
  }
}

/** Reads JSON and validates it. Any unrecognised value clears the key and returns null. */
export function readJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) return parsed;
  } catch {
    /* fall through to clear */
  }
  removeKeys(key);
  return null;
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

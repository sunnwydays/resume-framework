// Runs `action` for a key unless a run for that key is still pending, so a
// double click can't fire it twice. Returns undefined when it was skipped. The
// key is released when the run settles, including when it throws.
export function createOncePerKey() {
  const pending = new Set<string>();
  return async function once<T>(key: string, action: () => Promise<T>): Promise<T | undefined> {
    if (pending.has(key)) return undefined;
    pending.add(key);
    try {
      return await action();
    } finally {
      pending.delete(key);
    }
  };
}

// Whether live parsing should be offered: a key is set and Affinda still
// accepts it. Only an explicit 401/403 counts as dead; a network error or
// 5xx says nothing about the key, so it stays "on" (today's behavior).
const CHECK_URL = "https://api.affinda.com/v3/organizations";
const TTL_MS = 5 * 60 * 1000;

let cached: { at: number; key: string; ok: boolean } | null = null;

export async function isAffindaKeyWorking(
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!apiKey) return false;
  if (cached && cached.key === apiKey && Date.now() - cached.at < TTL_MS) {
    return cached.ok;
  }
  let ok = true;
  try {
    const res = await fetchImpl(CHECK_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    ok = res.status !== 401 && res.status !== 403;
  } catch {
    ok = true;
  }
  cached = { at: Date.now(), key: apiKey, ok };
  return ok;
}

export function resetAffindaKeyCache() {
  cached = null;
}

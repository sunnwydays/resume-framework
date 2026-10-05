// Reads Gmail from the browser. Google Identity Services hands the page a
// short-lived, read-only access token after a consent popup; it lives in
// memory only (nothing stored, nothing server-side), and a reload asks again.
// Everything else (parsing, rules) is pure and lives next to this file.

import { RULES } from "@/lib/tracker/email/classify";
import { expandDigest, parseGmailMessage, type EmailFacts, type GmailMessage } from "@/lib/tracker/email/parse";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const READ_CONCURRENCY = 8;

export type GmailErrorCode = "config" | "denied" | "expired" | "quota" | "api" | "network";

export class GmailError extends Error {
  constructor(
    readonly code: GmailErrorCode,
    message: string
  ) {
    super(message);
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let token: { value: string; expiresAt: number } | null = null;
let script: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return (script ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://accounts.google.com/gsi/client";
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => {
      script = null;
      reject(new GmailError("network", "Couldn't load Google's sign-in script. Check your connection or ad blocker."));
    };
    document.head.appendChild(tag);
  }));
}

export async function getToken(): Promise<string> {
  if (token && token.expiresAt - Date.now() > 60_000) return token.value;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new GmailError("config", "NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set (it is inlined at build time).");
  await loadGoogleScript();
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new GmailError("denied", response.error_description ?? `Google said: ${response.error ?? "no token"}.`));
          return;
        }
        token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
        resolve(response.access_token);
      },
      error_callback: (error) =>
        reject(
          new GmailError(
            "denied",
            error.type === "popup_closed" ? "The Google sign-in window was closed." : (error.message ?? "Google sign-in failed.")
          )
        ),
    });
    client.requestAccessToken();
  });
}

// Drop the token and tell Google to revoke it.
export function forgetToken(): void {
  if (token) window.google?.accounts.oauth2.revoke(token.value);
  token = null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api<T>(path: string, signal?: AbortSignal, attempt = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await getToken()}` }, signal });
  } catch (error) {
    if (error instanceof GmailError || (error as Error).name === "AbortError") throw error;
    throw new GmailError("network", "Couldn't reach Gmail.");
  }
  if (res.status === 401) {
    token = null;
    if (attempt < 1) return api(path, signal, attempt + 1);
    throw new GmailError("expired", "Google sign-in expired. Scan again to sign in.");
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 4) {
      await sleep(500 * 2 ** attempt);
      return api(path, signal, attempt + 1);
    }
    throw new GmailError("quota", "Gmail is rate-limiting requests. Wait a minute and scan again.");
  }
  if (!res.ok) {
    const detail = await res.json().then((j: { error?: { message?: string } }) => j.error?.message).catch(() => undefined);
    throw new GmailError(
      "api",
      res.status === 403
        ? `Gmail refused (${detail ?? "403"}). Is the Gmail API enabled for the Google Cloud project, and is this account a test user?`
        : `Gmail returned ${res.status}${detail ? `: ${detail}` : ""}.`
    );
  }
  return res.json() as Promise<T>;
}

export type ScanMode = "rules" | "broad";

// "rules" asks only for likely job mail (what the real scan uses); "broad"
// asks for everything since the date, to show what the rules never fetched.
export function gmailQuery(since: Date, mode: ScanMode): string {
  const base = `after:${Math.floor(since.getTime() / 1000)} -in:sent -in:chats -in:drafts`;
  if (mode === "broad") return base;
  // LinkedIn also sends job alerts; only its application mails are asked for (searchTerms).
  const senders = [...RULES.atsDomains, ...RULES.assessmentDomains].filter((d) => d !== "linkedin.com").map((d) => `from:${d}`);
  return `${base} {${[...RULES.searchTerms, ...senders].join(" ")}}`;
}

export interface ScanProgress {
  phase: "listing" | "reading";
  done: number;
  total: number;
}

export interface FetchOptions {
  cap?: number;
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
}

export interface FetchResult {
  messages: GmailMessage[];
  listed: number;
  failed: number;
  capped: boolean;
}

// Lists the messages matching a Gmail search and reads each one in full.
export async function fetchMessages(query: string, { cap = 1500, onProgress, signal }: FetchOptions = {}): Promise<FetchResult> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let capped = false;
  do {
    const page = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `/messages?q=${encodeURIComponent(query)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`,
      signal
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
    onProgress?.({ phase: "listing", done: ids.length, total: ids.length });
    if (ids.length >= cap) {
      capped = ids.length > cap || Boolean(pageToken);
      ids.length = cap;
      break;
    }
  } while (pageToken);

  const messages: GmailMessage[] = [];
  let next = 0;
  let done = 0;
  let failed = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        messages.push(await api<GmailMessage>(`/messages/${id}?format=full`, signal));
      } catch (error) {
        // One deleted or odd message shouldn't sink the scan; sign-in problems should.
        if (error instanceof GmailError && error.code !== "api") throw error;
        if ((error as Error).name === "AbortError") throw error;
        failed++;
      }
      onProgress?.({ phase: "reading", done: ++done, total: ids.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, ids.length) }, worker));
  return { messages, listed: ids.length, failed, capped };
}

// Jobright's instant alerts since a date (the Postings page reads these).
export function alertQuery(since: Date): string {
  return `after:${Math.floor(since.getTime() / 1000)} from:noreply@jobright.ai subject:"just posted" -in:sent`;
}

export interface ScanOptions extends FetchOptions {
  since: Date;
  mode: ScanMode;
}

export interface ScanResult {
  facts: EmailFacts[];
  listed: number;
  failed: number;
  capped: boolean;
  query: string;
}

export async function scanGmail({ since, mode, ...options }: ScanOptions): Promise<ScanResult> {
  const query = gmailQuery(since, mode);
  const fetched = await fetchMessages(query, options);
  const facts: EmailFacts[] = [];
  let failed = fetched.failed;
  for (const message of fetched.messages) {
    try {
      facts.push(...expandDigest(parseGmailMessage(message)));
    } catch {
      failed++; // an undecodable message, same as one that couldn't be read
    }
  }
  facts.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { facts, listed: fetched.listed, failed, capped: fetched.capped, query };
}

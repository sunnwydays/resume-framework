import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// Database tests run against the real Supabase project, but every test is
// one transaction that is always rolled back, with its own throwaway users.
// Nothing is ever committed (see `guard`), and no query here touches rows
// that don't belong to those users.
//
// They need SUPABASE_DB_URL (Dashboard > Connect > Session pooler) in
// .env.local or the environment. Without it, or if it can't connect, the
// db tests are skipped with a warning rather than failing.

function readDbUrl(): string | undefined {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  try {
    const text = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    return /^SUPABASE_DB_URL=(.*)$/m.exec(text)?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const url = readDbUrl();
const pool = url
  ? new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 })
  : null;

async function probe(): Promise<string | null> {
  if (!pool) return "SUPABASE_DB_URL is not set (add it to .env.local)";
  try {
    await pool.query("select 1");
    return null;
  } catch (e) {
    return `could not connect with SUPABASE_DB_URL: ${(e as Error).message}`;
  }
}

const problem = await probe();
if (problem) console.warn(`\n[db tests] SKIPPED: ${problem}\n`);

// Use as `describe.skipIf(!dbReady)(...)`.
export const dbReady = problem === null;

export async function closePool() {
  await pool?.end();
}

// ------------------------------------------------------------ transactions

// Nothing may end the transaction except the harness's own rollback.
const FORBIDDEN = /^\s*(commit|end|abort|begin|start\s+transaction)\b|\bcommit\b/i;

export interface Tx {
  query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  rows<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>;
  scalar<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

function wrap(client: PoolClient): Tx {
  const query: Tx["query"] = (sql, params) => {
    if (FORBIDDEN.test(sql)) throw new Error(`db test tried to end the transaction: ${sql.slice(0, 60)}`);
    return client.query(sql, params as unknown[]);
  };
  return {
    query,
    rows: async (sql, params) => (await query(sql, params)).rows as never,
    one: async (sql, params) => {
      const { rows } = await query(sql, params);
      if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}: ${sql.slice(0, 80)}`);
      return rows[0] as never;
    },
    scalar: async (sql, params) => {
      const { rows } = await query(sql, params);
      return Object.values(rows[0] ?? {})[0] as never;
    },
  };
}

// Runs `fn` inside a transaction that is rolled back no matter what.
export async function inTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  if (!pool) throw new Error("no database connection");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(wrap(client));
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

// ----------------------------------------------------------------- helpers

let userCount = 0;

// A throwaway auth user, visible only inside this transaction.
export async function createUser(tx: Tx, label = "user"): Promise<string> {
  return tx.scalar<string>(
    `insert into auth.users (id, aud, role, email)
     values (gen_random_uuid(), 'authenticated', 'authenticated', $1)
     returning id`,
    [`${label}-${++userCount}-${Date.now()}@test.invalid`]
  );
}

// Runs `fn` as a signed-in user: the `authenticated` role, with that user's
// id in the JWT claims, so row-level security applies exactly as in the app.
export async function asUser<T>(tx: Tx, userId: string, fn: () => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, userId]);
  await tx.query("set local role authenticated");
  try {
    return await fn();
  } finally {
    await tx.query("reset role");
  }
}

// Runs `fn` as the signed-out `anon` role.
export async function asAnon<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await tx.query("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
  await tx.query("set local role anon");
  try {
    return await fn();
  } finally {
    await tx.query("reset role");
  }
}

// Runs a statement that should fail and returns the error, leaving the
// transaction usable (a failed statement would otherwise abort it).
export async function failure(tx: Tx, sql: string, params?: unknown[]): Promise<Error & { code?: string; constraint?: string }> {
  await tx.query("savepoint expect_error");
  try {
    await tx.query(sql, params);
  } catch (e) {
    await tx.query("rollback to savepoint expect_error");
    return e as never;
  }
  await tx.query("release savepoint expect_error");
  throw new Error(`expected this to fail, but it succeeded: ${sql.slice(0, 100)}`);
}

// Sets the status-origin setting for this transaction (what import_rows and
// a future Gmail integration do). '' means the default, 'manual'.
export async function setOrigin(tx: Tx, origin: string) {
  await tx.query("select set_config('app.status_origin', $1, true)", [origin]);
}

// Shorthand for the rows most tests need.
export async function addApplication(tx: Tx, fields: Record<string, unknown> = {}): Promise<string> {
  const row = { company: "Acme", role: "SWE Intern", ...fields };
  const keys = Object.keys(row);
  return tx.scalar<string>(
    `insert into public.applications (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row)
  );
}

export async function addAssessment(tx: Tx, applicationId: string, fields: Record<string, unknown> = {}): Promise<string> {
  const row = { application_id: applicationId, title: "Coding round", ...fields };
  const keys = Object.keys(row);
  return tx.scalar<string>(
    `insert into public.assessments (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row)
  );
}

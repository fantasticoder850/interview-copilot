import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, "../../../migrations/001_init.sql");

// Tables holding test data, truncated between tests (schema_migrations is left).
const DATA_TABLES = [
  "interview_messages",
  "interview_images",
  "interview_candidates",
  "interviews",
  "resume_qa",
  "resumes",
  "manager_candidates",
  "users",
];

let prepared: Promise<boolean> | null = null;

// Is the base Postgres reachable? If not, integration tests skip themselves.
export async function dbReachable(): Promise<boolean> {
  return prepareTestDatabase();
}

// Create the `<db>_test` database (if absent) and apply the schema once.
// Returns false if the database server cannot be reached at all.
export function prepareTestDatabase(): Promise<boolean> {
  if (!prepared) prepared = doPrepare();
  return prepared;
}

async function doPrepare(): Promise<boolean> {
  const baseUrl = process.env.BASE_DATABASE_URL;
  const testUrl = process.env.DATABASE_URL;
  if (!baseUrl || !testUrl) return false;

  const testName = new URL(testUrl).pathname.replace(/^\//, "");

  // 1. Ensure the test database exists (connect to the base database to CREATE).
  const admin = new pg.Client({ connectionString: baseUrl });
  try {
    await admin.connect();
  } catch {
    return false; // server unreachable → caller skips integration tests
  }
  let freshlyCreated = false;
  try {
    await admin.query(`CREATE DATABASE ${quoteIdent(testName)}`);
    freshlyCreated = true;
  } catch (err) {
    if ((err as { code?: string }).code !== "42P04") throw err; // 42P04 = duplicate_database
  } finally {
    await admin.end();
  }

  // 2. Apply the schema. On a freshly created DB always run it; otherwise run it
  // only if the schema is missing (so repeated test runs don't re-create tables).
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    const needsSchema = freshlyCreated || !(await hasUsersTable(client));
    if (needsSchema) await client.query(readFileSync(MIGRATION, "utf8"));
  } finally {
    await client.end();
  }
  return true;
}

async function hasUsersTable(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query(`SELECT to_regclass('public.users') AS reg`);
  return rows[0]?.reg != null;
}

// Remove all test data, leaving the seeded admin out (tests create their own).
export async function resetDb(): Promise<void> {
  const { pool } = await import("../../../infrastructure/db.js");
  await pool.query(`TRUNCATE ${DATA_TABLES.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE`);
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

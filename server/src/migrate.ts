import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./infrastructure/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM schema_migrations`,
  );
  const applied = new Set(rows.map((r) => r.name));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      console.log(`✓ applied ${file}`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✗ failed ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(ran === 0 ? "Schema already up to date" : `Applied ${ran} migration(s)`);
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

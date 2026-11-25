// Runs (via vitest setupFiles) before any test module imports the db pool, so
// every test points at a dedicated `<db>_test` database and never the real one.
import "dotenv/config";

const base = process.env.DATABASE_URL;
if (base) {
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "") || "interview_assistant";
  if (!name.endsWith("_test")) {
    // Keep the original around so the harness can CREATE the test database.
    process.env.BASE_DATABASE_URL = base;
    url.pathname = `/${name}_test`;
    process.env.DATABASE_URL = url.toString();
  }
}
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

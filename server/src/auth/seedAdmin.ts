import { query } from "../db.js";
import { env } from "../env.js";
import { hashPassword } from "./password.js";

// On boot, ensure the seed admin exists and is an approved admin. Updates the
// password to match the env each boot so a lost admin password can be reset by
// editing server/.env and restarting.
export async function seedAdmin() {
  if (!env.adminEmail || !env.adminPassword) {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set — no seed admin created");
    return;
  }
  const email = env.adminEmail.toLowerCase();
  const hash = await hashPassword(env.adminPassword);

  const { rowCount } = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (rowCount! > 0) {
    await query(
      `UPDATE users
          SET password_hash = $2, role = 'admin', status = 'approved', name = $3
        WHERE email = $1`,
      [email, hash, env.adminName],
    );
    console.log(`Seed admin ensured: ${email}`);
  } else {
    await query(
      `INSERT INTO users (email, password_hash, name, role, status, approved_at)
       VALUES ($1, $2, $3, 'admin', 'approved', now())`,
      [email, hash, env.adminName],
    );
    console.log(`Seed admin created: ${email}`);
  }
}

import type { Role, UserStatus } from "../../../common/types.js";
import { query } from "../../../infrastructure/db.js";
import { hashPassword } from "../../../modules/auth/password.js";
import { AUTH_COOKIE, signToken } from "../../../modules/auth/tokens.js";

let seq = 0;

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
}

export async function createUser(opts: {
  role: Role;
  status?: UserStatus;
  email?: string;
  name?: string;
  password?: string;
}): Promise<TestUser> {
  const email = (opts.email ?? `user${++seq}-${Date.now()}@example.com`).toLowerCase();
  const name = opts.name ?? `User ${seq}`;
  const status = opts.status ?? "approved";
  const requestedRole = opts.role === "admin" ? null : opts.role;
  const hash = await hashPassword(opts.password ?? "password123");
  const { rows } = await query<TestUser>(
    `INSERT INTO users (email, password_hash, name, role, requested_role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, name, role, status`,
    [email, hash, name, opts.role, requestedRole, status],
  );
  return rows[0];
}

export async function assignManagerToCandidate(managerId: string, candidateId: string): Promise<void> {
  await query(
    `INSERT INTO manager_candidates (manager_id, candidate_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [managerId, candidateId],
  );
}

export async function createResume(ownerId: string, name = "Test Resume"): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO resumes (owner_id, name, role, content) VALUES ($1, $2, '', 'CONTENT') RETURNING id`,
    [ownerId, name],
  );
  return rows[0];
}

// Session cookie header for a user id (bypasses the login route / rate limit).
export function cookieFor(userId: string): string {
  return `${AUTH_COOKIE}=${signToken(userId)}`;
}

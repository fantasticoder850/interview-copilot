import Anthropic from "@anthropic-ai/sdk";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors.js";
import { buildUpdate } from "../../common/sql.js";
import type { User } from "../../common/types.js";
import { anthropicWithKey, getUserApiKey } from "../../infrastructure/anthropic/client.js";
import { encryptSecret } from "../../infrastructure/crypto.js";
import { query } from "../../infrastructure/db.js";
import { hashPassword, verifyPassword } from "./password.js";

type UserWithHash = User & { password_hash: string };

const USER_COLUMNS =
  "id, email, name, role, requested_role, status, approved_by, approved_at, created_at";

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  requestedRole: "manager" | "candidate";
}): Promise<void> {
  const email = input.email.toLowerCase();
  const existing = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (existing.rowCount! > 0) {
    throw new ConflictError("An account with that email already exists");
  }
  const hash = await hashPassword(input.password);
  await query(
    `INSERT INTO users (email, password_hash, name, role, requested_role, status)
     VALUES ($1, $2, $3, $4, $4, 'pending')`,
    [email, hash, input.name, input.requestedRole],
  );
}

// Verify credentials and account status. Returns the full user row so the
// caller can sign a session cookie; throws on any failure.
export async function login(input: { email: string; password: string }): Promise<User> {
  const email = input.email.toLowerCase();
  const { rows } = await query<UserWithHash>(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = rows[0];
  const ok = user && (await verifyPassword(input.password, user.password_hash));
  if (!user || !ok) throw new UnauthorizedError("Incorrect email or password");

  if (user.status === "pending") {
    throw new ForbiddenError("Your account is awaiting admin approval");
  }
  if (user.status === "rejected") {
    throw new ForbiddenError("Your registration was not approved");
  }
  if (user.status === "disabled") {
    throw new ForbiddenError("Your account has been disabled");
  }
  return user;
}

export async function updateAccount(
  me: User,
  input: { name?: string; email?: string; password?: string; currentPassword?: string },
): Promise<User> {
  const sensitive = input.email !== undefined || input.password !== undefined;
  if (sensitive) {
    const { rows } = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [me.id],
    );
    const ok =
      input.currentPassword && (await verifyPassword(input.currentPassword, rows[0].password_hash));
    if (!ok) throw new ForbiddenError("Current password is incorrect");
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) {
    const email = input.email.toLowerCase();
    const clash = await query(`SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [email, me.id]);
    if (clash.rowCount! > 0) throw new ConflictError("That email is already in use");
    data.email = email;
  }
  if (input.password !== undefined) data.password_hash = await hashPassword(input.password);

  const { assignments, values } = buildUpdate(
    { name: "name", email: "email", password_hash: "password_hash" },
    data,
  );
  values.push(me.id);
  const { rows } = await query<User>(
    `UPDATE users SET ${assignments.join(", ")} WHERE id = $${values.length}
     RETURNING ${USER_COLUMNS}`,
    values,
  );
  return rows[0];
}

export async function getApiKeyStatus(userId: string): Promise<{ hasKey: boolean; last4: string | null }> {
  const key = await getUserApiKey(userId);
  return { hasKey: !!key, last4: key ? key.slice(-4) : null };
}

// Validate the key against Anthropic (auth errors reject it; transient errors
// are tolerated) and store it encrypted. Returns the new status.
export async function setApiKey(
  userId: string,
  apiKey: string,
): Promise<{ hasKey: boolean; last4: string }> {
  const key = apiKey.trim();
  if (!key.startsWith("sk-ant-")) {
    throw new BadRequestError("That doesn't look like an Anthropic API key (expected sk-ant-…)");
  }
  try {
    await anthropicWithKey(key).models.list();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new BadRequestError("Anthropic rejected this API key");
    }
    // transient/non-auth errors: store anyway rather than block the user
  }
  await query(`UPDATE users SET anthropic_api_key_enc = $2 WHERE id = $1`, [userId, encryptSecret(key)]);
  return { hasKey: true, last4: key.slice(-4) };
}

export async function clearApiKey(userId: string): Promise<void> {
  await query(`UPDATE users SET anthropic_api_key_enc = NULL WHERE id = $1`, [userId]);
}

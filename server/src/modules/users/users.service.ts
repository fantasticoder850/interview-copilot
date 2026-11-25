import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { publicUser, type User } from "../../common/types.js";
import { hashPassword } from "../auth/password.js";
import { query, withTransaction } from "../../infrastructure/db.js";
import type { z } from "zod";
import type { userPatchSchema } from "./users.schema.js";

const USER_COLUMNS =
  "id, email, name, role, requested_role, status, approved_by, approved_at, created_at";

// All users, each candidate annotated with the manager ids assigned to them.
export async function listUsersWithManagers() {
  const { rows } = await query<User>(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC`,
  );
  const { rows: links } = await query<{ manager_id: string; candidate_id: string }>(
    `SELECT manager_id, candidate_id FROM manager_candidates`,
  );
  const managersByCandidate = new Map<string, string[]>();
  for (const l of links) {
    const arr = managersByCandidate.get(l.candidate_id) ?? [];
    arr.push(l.manager_id);
    managersByCandidate.set(l.candidate_id, arr);
  }
  return rows.map((u) => ({
    ...publicUser(u),
    managerIds: managersByCandidate.get(u.id) ?? [],
  }));
}

// Update a user's status / role / password. `actingAdminId` records approvals
// and guards against an admin changing their own role or status.
export async function updateUser(
  actingAdminId: string,
  targetUserId: string,
  patch: z.infer<typeof userPatchSchema>,
) {
  const { status, role, password } = patch;
  if (targetUserId === actingAdminId && (status || role)) {
    throw new BadRequestError("You cannot change your own role or status");
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (status) {
    sets.push(`status = $${sets.length + 1}`);
    vals.push(status);
    if (status === "approved") {
      sets.push(`approved_by = $${sets.length + 1}`);
      vals.push(actingAdminId);
      sets.push(`approved_at = now()`);
    }
  }
  if (role) {
    sets.push(`role = $${sets.length + 1}`);
    vals.push(role);
  }
  if (password) {
    sets.push(`password_hash = $${sets.length + 1}`);
    vals.push(await hashPassword(password));
  }
  if (sets.length === 0) throw new BadRequestError("Nothing to update");

  vals.push(targetUserId);
  const { rows } = await query<User>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}
     RETURNING ${USER_COLUMNS}`,
    vals,
  );
  if (rows.length === 0) throw new NotFoundError("User not found");
  return publicUser(rows[0]);
}

// Replace the full set of managers assigned to a candidate.
export async function replaceManagers(candidateId: string, managerIds: string[]): Promise<string[]> {
  const { rows: vrows } = await query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [candidateId],
  );
  if (vrows.length === 0) throw new NotFoundError("Candidate not found");
  if (vrows[0].role !== "candidate") throw new BadRequestError("That user is not a candidate");

  const ids = [...new Set(managerIds)];
  if (ids.length > 0) {
    const { rows: mrows } = await query<{ id: string }>(
      `SELECT id FROM users WHERE id = ANY($1) AND role = 'manager'`,
      [ids],
    );
    if (mrows.length !== ids.length) {
      throw new BadRequestError("One or more manager ids are invalid");
    }
  }

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM manager_candidates WHERE candidate_id = $1`, [candidateId]);
    for (const managerId of ids) {
      await client.query(
        `INSERT INTO manager_candidates (manager_id, candidate_id) VALUES ($1, $2)`,
        [managerId, candidateId],
      );
    }
  });
  return ids;
}

// Candidates the given user may assign to interviews: admins see all approved
// candidates; a manager sees only the candidates assigned to them.
export async function listAssignableCandidates(user: User) {
  if (user.role === "admin") {
    const { rows } = await query(
      `SELECT id, name, email FROM users
        WHERE role = 'candidate' AND status = 'approved' ORDER BY name`,
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email FROM users u
       JOIN manager_candidates mv ON mv.candidate_id = u.id
      WHERE mv.manager_id = $1 AND u.status = 'approved'
      ORDER BY u.name`,
    [user.id],
  );
  return rows;
}

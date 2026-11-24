import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import { publicUser, type User } from "../domain.js";
import { hashPassword } from "../auth/password.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { zodMessage } from "../validation.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

// List all users (with each viewer's assigned manager ids).
adminRouter.get("/users", async (_req, res) => {
  const { rows } = await query<User>(
    `SELECT id, email, name, role, requested_role, status, approved_by,
            approved_at, created_at
       FROM users ORDER BY created_at DESC`,
  );
  const { rows: links } = await query<{ manager_id: string; viewer_id: string }>(
    `SELECT manager_id, viewer_id FROM manager_viewers`,
  );
  const managersByViewer = new Map<string, string[]>();
  for (const l of links) {
    const arr = managersByViewer.get(l.viewer_id) ?? [];
    arr.push(l.manager_id);
    managersByViewer.set(l.viewer_id, arr);
  }
  res.json(
    rows.map((u) => ({
      ...publicUser(u),
      managerIds: managersByViewer.get(u.id) ?? [],
    })),
  );
});

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "disabled"]).optional(),
  role: z.enum(["admin", "manager", "viewer"]).optional(),
  password: z.string().min(8).max(200).optional(),
});

// Update a user's status / role, or reset their password.
adminRouter.patch("/users/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { status, role, password } = parsed.data;

  if (req.params.id === req.user!.id && (status || role)) {
    return res.status(400).json({ error: "You cannot change your own role or status" });
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (status) {
    sets.push(`status = $${sets.length + 1}`);
    vals.push(status);
    if (status === "approved") {
      sets.push(`approved_by = $${sets.length + 1}`);
      vals.push(req.user!.id);
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
  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });

  vals.push(req.params.id);
  const { rows } = await query<User>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}
     RETURNING id, email, name, role, requested_role, status, approved_by, approved_at, created_at`,
    vals,
  );
  if (rows.length === 0) return res.status(404).json({ error: "User not found" });
  res.json(publicUser(rows[0]));
});

// Replace the set of managers a viewer is assigned to.
const managersSchema = z.object({ managerIds: z.array(z.string().uuid()) });
adminRouter.put("/viewers/:id/managers", async (req, res) => {
  const parsed = managersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });

  const { rows: vrows } = await query<User>(
    `SELECT role FROM users WHERE id = $1`,
    [req.params.id],
  );
  if (vrows.length === 0) return res.status(404).json({ error: "Viewer not found" });
  if (vrows[0].role !== "viewer") {
    return res.status(400).json({ error: "That user is not a viewer" });
  }

  // Validate all manager ids are managers.
  const ids = [...new Set(parsed.data.managerIds)];
  if (ids.length > 0) {
    const { rows: mrows } = await query<{ id: string }>(
      `SELECT id FROM users WHERE id = ANY($1) AND role = 'manager'`,
      [ids],
    );
    if (mrows.length !== ids.length) {
      return res.status(400).json({ error: "One or more manager ids are invalid" });
    }
  }

  // Replace set in a transaction.
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query(`DELETE FROM manager_viewers WHERE viewer_id = $1`, [req.params.id]);
    for (const managerId of ids) {
      await conn.query(
        `INSERT INTO manager_viewers (manager_id, viewer_id) VALUES ($1, $2)`,
        [managerId, req.params.id],
      );
    }
    await conn.query("COMMIT");
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
  res.json({ ok: true, managerIds: ids });
});

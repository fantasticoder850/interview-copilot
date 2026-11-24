import { Router } from "express";
import { query } from "../db.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export const peopleRouter = Router();

// Viewers the current user may assign to interviews.
// Admin sees all approved viewers; a manager sees only their assigned ones.
peopleRouter.get("/viewers", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const user = req.user!;
  if (user.role === "admin") {
    const { rows } = await query(
      `SELECT id, name, email FROM users
        WHERE role = 'viewer' AND status = 'approved' ORDER BY name`,
    );
    return res.json(rows);
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email FROM users u
       JOIN manager_viewers mv ON mv.viewer_id = u.id
      WHERE mv.manager_id = $1 AND u.status = 'approved'
      ORDER BY u.name`,
    [user.id],
  );
  res.json(rows);
});

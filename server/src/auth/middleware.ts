import type { NextFunction, Request, Response } from "express";
import { query } from "../db.js";
import type { Role, User } from "../domain.js";
import { AUTH_COOKIE, verifyToken } from "./tokens.js";

// Loads the user fresh from the database on every request, so a disabled or
// deleted user loses access immediately rather than when their token expires.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const userId = verifyToken(token);
  if (!userId) return res.status(401).json({ error: "Invalid session" });

  const { rows } = await query<User>(
    `SELECT id, email, name, role, requested_role, status, approved_by,
            approved_at, created_at
       FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid session" });
  if (user.status !== "approved") {
    return res.status(403).json({ error: "Account is not active", status: user.status });
  }

  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

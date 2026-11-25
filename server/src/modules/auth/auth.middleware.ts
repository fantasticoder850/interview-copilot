import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { ForbiddenError, UnauthorizedError } from "../../common/errors.js";
import type { Role, User } from "../../common/types.js";
import { query } from "../../infrastructure/db.js";
import { AUTH_COOKIE, verifyToken } from "./tokens.js";

// Loads the user fresh from the database on every request, so a disabled or
// deleted user loses access immediately rather than when their token expires.
// Wrapped with asyncHandler so a thrown error reaches the central error handler.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new UnauthorizedError("Not authenticated");

  const userId = verifyToken(token);
  if (!userId) throw new UnauthorizedError("Invalid session");

  const { rows } = await query<User>(
    `SELECT id, email, name, role, requested_role, status, approved_by,
            approved_at, created_at
       FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) throw new UnauthorizedError("Invalid session");
  if (user.status !== "approved") {
    throw new ForbiddenError("Account is not active", { status: user.status });
  }

  req.user = user;
  next();
});

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError("Not authenticated");
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}

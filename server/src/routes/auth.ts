import { Router } from "express";
import rateLimit from "express-rate-limit";
import { query } from "../db.js";
import { publicUser, type User } from "../domain.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { AUTH_COOKIE, cookieOptions, signToken } from "../auth/tokens.js";
import { requireAuth } from "../auth/middleware.js";
import { accountSchema, loginSchema, registerSchema, zodMessage } from "../validation.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later" },
});

// Register — always creates a pending, non-admin account.
authRouter.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { name, email, password, requestedRole } = parsed.data;
  const lower = email.toLowerCase();

  const existing = await query(`SELECT 1 FROM users WHERE email = $1`, [lower]);
  if (existing.rowCount! > 0) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const hash = await hashPassword(password);
  await query(
    `INSERT INTO users (email, password_hash, name, role, requested_role, status)
     VALUES ($1, $2, $3, $4, $4, 'pending')`,
    [lower, hash, name, requestedRole],
  );
  res.status(201).json({ ok: true, message: "Registration received — awaiting admin approval" });
});

// Login — only approved accounts may sign in.
authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const lower = parsed.data.email.toLowerCase();

  const { rows } = await query<User & { password_hash: string }>(
    `SELECT * FROM users WHERE email = $1`,
    [lower],
  );
  const user = rows[0];
  const ok = user && (await verifyPassword(parsed.data.password, user.password_hash));
  if (!user || !ok) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  if (user.status === "pending") {
    return res.status(403).json({ error: "Your account is awaiting admin approval" });
  }
  if (user.status === "rejected") {
    return res.status(403).json({ error: "Your registration was not approved" });
  }
  if (user.status === "disabled") {
    return res.status(403).json({ error: "Your account has been disabled" });
  }

  res.cookie(AUTH_COOKIE, signToken(user.id), cookieOptions());
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// Update own account: name, email, and/or password. Changing email or password
// requires the current password.
authRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { name, email, password, currentPassword } = parsed.data;
  const me = req.user!;

  const sensitive = email !== undefined || password !== undefined;
  if (sensitive) {
    const { rows } = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [me.id],
    );
    const ok = currentPassword && (await verifyPassword(currentPassword, rows[0].password_hash));
    if (!ok) return res.status(403).json({ error: "Current password is incorrect" });
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name !== undefined) { sets.push(`name = $${sets.length + 1}`); vals.push(name); }
  if (email !== undefined) {
    const lower = email.toLowerCase();
    const clash = await query(`SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [lower, me.id]);
    if (clash.rowCount! > 0) return res.status(409).json({ error: "That email is already in use" });
    sets.push(`email = $${sets.length + 1}`); vals.push(lower);
  }
  if (password !== undefined) { sets.push(`password_hash = $${sets.length + 1}`); vals.push(await hashPassword(password)); }

  vals.push(me.id);
  const { rows } = await query<User>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}
     RETURNING id, email, name, role, requested_role, status, approved_by, approved_at, created_at`,
    vals,
  );
  res.json({ user: publicUser(rows[0]) });
});

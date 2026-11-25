import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../common/async-handler.js";
import { parse } from "../../common/validation.js";
import { publicUser } from "../../common/types.js";
import { requireAuth } from "./auth.middleware.js";
import { accountSchema, apiKeySchema, loginSchema, registerSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";
import { AUTH_COOKIE, cookieOptions, signToken } from "./tokens.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later" },
});

// Register — always creates a pending, non-admin account.
authRouter.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(registerSchema, req.body);
    await authService.registerUser(data);
    res.status(201).json({ ok: true, message: "Registration received — awaiting admin approval" });
  }),
);

// Login — only approved accounts may sign in.
authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(loginSchema, req.body);
    const user = await authService.login(data);
    res.cookie(AUTH_COOKIE, signToken(user.id), cookieOptions());
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// Update own account: name, email, and/or password. Changing email or password
// requires the current password.
authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parse(accountSchema, req.body);
    const updated = await authService.updateAccount(req.user!, data);
    res.json({ user: publicUser(updated) });
  }),
);

// --- Per-user Anthropic API key --------------------------------------------

authRouter.get(
  "/api-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await authService.getApiKeyStatus(req.user!.id));
  }),
);

authRouter.put(
  "/api-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { apiKey } = parse(apiKeySchema, req.body);
    res.json(await authService.setApiKey(req.user!.id, apiKey));
  }),
);

authRouter.delete(
  "/api-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    await authService.clearApiKey(req.user!.id);
    res.json({ hasKey: false, last4: null });
  }),
);

import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { parse } from "../../common/validation.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { managersSchema, userPatchSchema } from "./users.schema.js";
import * as usersService from "./users.service.js";

// Admin-only user administration, mounted at /api/admin.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    res.json(await usersService.listUsersWithManagers());
  }),
);

adminRouter.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const patch = parse(userPatchSchema, req.body);
    res.json(await usersService.updateUser(req.user!.id, req.params.id, patch));
  }),
);

adminRouter.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    await usersService.deleteUser(req.user!.id, req.params.id);
    res.status(204).end();
  }),
);

adminRouter.put(
  "/candidates/:id/managers",
  asyncHandler(async (req, res) => {
    const { managerIds } = parse(managersSchema, req.body);
    const ids = await usersService.replaceManagers(req.params.id, managerIds);
    res.json({ ok: true, managerIds: ids });
  }),
);

// Candidate directory, mounted at /api.
export const peopleRouter = Router();

peopleRouter.get(
  "/candidates",
  requireAuth,
  requireRole("admin", "manager"),
  asyncHandler(async (req, res) => {
    res.json(await usersService.listAssignableCandidates(req.user!));
  }),
);

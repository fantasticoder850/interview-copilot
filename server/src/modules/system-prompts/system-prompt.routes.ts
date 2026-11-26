import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { parse } from "../../common/validation.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { systemPromptSchema } from "./system-prompt.schema.js";
import * as prompts from "./system-prompt.service.js";

// Personal library of reusable interview system prompts. Managers and admins
// only (candidates never create interviews).
export const systemPromptsRouter = Router();
systemPromptsRouter.use(requireAuth, requireRole("admin", "manager"));

systemPromptsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await prompts.listPrompts(req.user!.id));
  }),
);

systemPromptsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parse(systemPromptSchema, req.body);
    res.status(201).json(await prompts.createPrompt(req.user!.id, data));
  }),
);

systemPromptsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parse(systemPromptSchema.partial(), req.body);
    res.json(await prompts.updatePrompt(req.user!.id, req.params.id, data));
  }),
);

systemPromptsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prompts.deletePrompt(req.user!.id, req.params.id);
    res.status(204).end();
  }),
);

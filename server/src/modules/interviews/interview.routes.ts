import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { parse } from "../../common/validation.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  currentInterview,
  requireInterviewManage,
  requireInterviewRead,
} from "./interview.access.js";
import {
  interviewSchema,
  newVersionSchema,
  resumeTextSchema,
  statusSchema,
} from "./interview.schema.js";
import * as interviews from "./interview.service.js";

export const interviewsRouter = Router();
interviewsRouter.use(requireAuth);

// Manage-gated chain: load + read access, then manage rights.
const manage = [requireInterviewRead, requireInterviewManage] as const;

// --- List & create ---------------------------------------------------------

interviewsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await interviews.listInterviews(req.user!));
  }),
);

interviewsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parse(interviewSchema, req.body);
    res.status(201).json(await interviews.createInterview(req.user!, data));
  }),
);

// --- Read / update / delete ------------------------------------------------

interviewsRouter.get(
  "/:id",
  requireInterviewRead,
  asyncHandler(async (req, res) => {
    res.json(await interviews.getInterviewView(currentInterview(req), req.user!));
  }),
);

interviewsRouter.patch(
  "/:id",
  ...manage,
  asyncHandler(async (req, res) => {
    const data = parse(interviewSchema.partial(), req.body);
    res.json(await interviews.updateInterview(currentInterview(req), req.user!, data));
  }),
);

interviewsRouter.delete(
  "/:id",
  ...manage,
  asyncHandler(async (req, res) => {
    await interviews.deleteInterview(currentInterview(req).id);
    res.status(204).end();
  }),
);

// --- Lifecycle -------------------------------------------------------------

interviewsRouter.post(
  "/:id/status",
  ...manage,
  asyncHandler(async (req, res) => {
    const { status } = parse(statusSchema, req.body);
    res.json(await interviews.setStatus(currentInterview(req), status));
  }),
);

interviewsRouter.post(
  "/:id/new-version",
  ...manage,
  asyncHandler(async (req, res) => {
    const { carrySummary } = parse(newVersionSchema, req.body);
    res.status(201).json(await interviews.newVersion(currentInterview(req), carrySummary));
  }),
);

// --- Resume copy -----------------------------------------------------------

interviewsRouter.put(
  "/:id/resume",
  ...manage,
  asyncHandler(async (req, res) => {
    const { text } = parse(resumeTextSchema, req.body);
    await interviews.saveResumeText(currentInterview(req).id, text);
    res.json({ ok: true });
  }),
);

interviewsRouter.post(
  "/:id/resume/recopy",
  ...manage,
  asyncHandler(async (req, res) => {
    const content = await interviews.recopyResume(currentInterview(req));
    res.json({ ok: true, content });
  }),
);

interviewsRouter.post(
  "/:id/resume/save-back",
  ...manage,
  asyncHandler(async (req, res) => {
    await interviews.saveBackResume(currentInterview(req));
    res.json({ ok: true });
  }),
);

// --- Prep pack & summary ---------------------------------------------------

interviewsRouter.post(
  "/:id/prep-pack",
  ...manage,
  asyncHandler(async (req, res) => {
    const prep_pack = await interviews.generatePrepPack(currentInterview(req));
    res.json({ prep_pack });
  }),
);

interviewsRouter.post(
  "/:id/summary",
  ...manage,
  asyncHandler(async (req, res) => {
    const summary = await interviews.generateSummary(currentInterview(req).id);
    res.json({ summary: summary ?? "" });
  }),
);

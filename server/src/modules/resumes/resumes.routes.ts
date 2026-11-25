import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../common/async-handler.js";
import { BadRequestError } from "../../common/errors.js";
import { parse } from "../../common/validation.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireResumeAccess } from "./resumes.access.js";
import { RESUME_TEMPLATE, STARTER_QA_QUESTIONS } from "./resume-template.js";
import { draftSchema, qaSchema, resumeSchema } from "./resumes.schema.js";
import * as resumes from "./resumes.service.js";

export const resumesRouter = Router();
resumesRouter.use(requireAuth, requireRole("admin", "manager"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB, matches nginx client_max_body_size
});

// Resumes the current user may see (admins: all).
resumesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await resumes.listResumes(req.user!));
  }),
);

resumesRouter.get("/template", (_req, res) => {
  res.json({ template: RESUME_TEMPLATE, starterQuestions: STARTER_QA_QUESTIONS });
});

// Parse a PDF or pasted text into the structured template. Nothing is saved.
resumesRouter.post(
  "/parse",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    let pdfBase64: string | undefined;
    if (req.file) {
      if (req.file.mimetype !== "application/pdf") {
        throw new BadRequestError("Only PDF files are supported");
      }
      pdfBase64 = req.file.buffer.toString("base64");
    }
    const text = typeof req.body?.text === "string" ? req.body.text : undefined;
    const content = await resumes.parseResume({ userId: req.user!.id, pdfBase64, text });
    res.json({ content });
  }),
);

resumesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = parse(resumeSchema, req.body);
    res.status(201).json(await resumes.createResume(req.user!.id, data));
  }),
);

resumesRouter.get(
  "/:id",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    res.json(await resumes.getResumeWithQA(req.params.id));
  }),
);

resumesRouter.patch(
  "/:id",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    const data = parse(resumeSchema.partial(), req.body);
    res.json(await resumes.updateResume(req.params.id, data));
  }),
);

resumesRouter.delete(
  "/:id",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    await resumes.deleteResume(req.params.id);
    res.status(204).end();
  }),
);

// --- Basic Information (prepared Q&A) --------------------------------------

resumesRouter.get(
  "/:id/qa",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    res.json(await resumes.listQA(req.params.id));
  }),
);

resumesRouter.post(
  "/:id/qa",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    const data = parse(qaSchema, req.body);
    res.status(201).json(await resumes.addQA(req.params.id, data));
  }),
);

resumesRouter.patch(
  "/:id/qa/:qaId",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    const data = parse(qaSchema.partial(), req.body);
    res.json(await resumes.updateQA(req.params.id, req.params.qaId, data));
  }),
);

resumesRouter.delete(
  "/:id/qa/:qaId",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    await resumes.deleteQA(req.params.id, req.params.qaId);
    res.status(204).end();
  }),
);

// Draft an answer to a question from the resume content. Nothing is saved.
resumesRouter.post(
  "/:id/qa/draft",
  requireResumeAccess,
  asyncHandler(async (req, res) => {
    const { question } = parse(draftSchema, req.body);
    const answer = await resumes.draftAnswer({ userId: req.user!.id, resumeId: req.params.id, question });
    res.json({ answer });
  }),
);

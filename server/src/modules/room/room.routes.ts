import type Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../common/async-handler.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../common/errors.js";
import { parse } from "../../common/validation.js";
import { query } from "../../infrastructure/db.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  currentInterview,
  requireInterviewManage,
  requireInterviewRead,
} from "../interviews/interview.access.js";
import { noteSchema, saveQaSchema } from "./room.schema.js";
import {
  abortGeneration,
  beginGeneration,
  endGeneration,
  generateAnswer,
} from "./room.service.js";
import {
  addClient,
  broadcast,
  getInflight,
  presenceCount,
  removeClient,
  sendTo,
} from "./sse-hub.js";

export const roomRouter = Router();
roomRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

// --- Transcript & live events ---------------------------------------------

roomRouter.get(
  "/:id/messages",
  requireInterviewRead,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, role, kind, image_id, quick, content, qa_ref, follow_ups, author_id,
              action, model, state, created_at
         FROM interview_messages WHERE interview_id = $1 ORDER BY created_at ASC`,
      [req.params.id],
    );
    res.json(rows);
  }),
);

roomRouter.get("/:id/events", requireInterviewRead, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const interview = currentInterview(req);
  const clientId = addClient(interview.id, res);

  sendTo(res, "snapshot", {
    status: interview.status,
    presence: presenceCount(interview.id),
    inflight: getInflight(interview.id),
  });

  req.on("close", () => removeClient(interview.id, clientId));
});

// --- Manager note (no AI) --------------------------------------------------

roomRouter.post(
  "/:id/notes",
  requireInterviewRead,
  requireInterviewManage,
  asyncHandler(async (req, res) => {
    const interview = currentInterview(req);
    const { content } = parse(noteSchema, req.body);
    const { rows } = await query(
      `INSERT INTO interview_messages (interview_id, role, kind, content, author_id, state)
       VALUES ($1, 'user', 'note', $2, $3, 'complete') RETURNING id, created_at`,
      [interview.id, content, req.user!.id],
    );
    broadcast(interview.id, "note", { id: rows[0].id, content, authorId: req.user!.id, created_at: rows[0].created_at });
    res.status(201).json({ id: rows[0].id });
  }),
);

// --- Ask a question (two-stage, detached) ----------------------------------

roomRouter.post(
  "/:id/messages",
  requireInterviewRead,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const interview = currentInterview(req);
    // Any assigned candidate, manager, or admin may ask (read-only is a client toggle).
    if (interview.status !== "interviewing") {
      throw new ConflictError("The interview is not in progress");
    }
    const content = String(req.body?.content ?? "").trim();
    const action = typeof req.body?.action === "string" ? req.body.action : undefined;
    if (!content && !req.file && !action) {
      throw new BadRequestError("content is required");
    }
    if (req.file && !req.file.mimetype.startsWith("image/")) {
      throw new BadRequestError("Only image files are supported");
    }

    // Acquire the single-flight lock synchronously — before any await — so two
    // concurrent asks cannot both pass the check.
    const aborter = beginGeneration(interview.id);
    if (!aborter) throw new ConflictError("An answer is already being generated");

    try {
      // Store an optional image.
      let imageId: string | null = null;
      let imageBlock: Anthropic.ImageBlockParam | null = null;
      if (req.file) {
        const ins = await query<{ id: string }>(
          `INSERT INTO interview_images (interview_id, media_type, data) VALUES ($1,$2,$3) RETURNING id`,
          [interview.id, req.file.mimetype, req.file.buffer],
        );
        imageId = ins.rows[0].id;
        imageBlock = {
          type: "image",
          source: { type: "base64", media_type: req.file.mimetype as Anthropic.Base64ImageSource["media_type"], data: req.file.buffer.toString("base64") },
        };
      }

      // Persist the question and broadcast it.
      const q = await query<{ id: string; created_at: string }>(
        `INSERT INTO interview_messages (interview_id, role, kind, content, image_id, author_id, action, state)
         VALUES ($1,'user','question',$2,$3,$4,$5,'complete') RETURNING id, created_at`,
        [interview.id, content, imageId, req.user!.id, action ?? null],
      );
      broadcast(interview.id, "question", {
        id: q.rows[0].id, content, imageId, authorId: req.user!.id, action: action ?? null, created_at: q.rows[0].created_at,
      });

      res.status(202).json({ questionId: q.rows[0].id });

      // Run generation detached from the request. generateAnswer releases the
      // lock in its finally; the .catch here is a last-resort safety net.
      generateAnswer({ interview, question: content, action, imageBlock, aborter }).catch((err) => {
        console.error("generation failed", err);
        endGeneration(interview.id);
      });
    } catch (err) {
      // Failure before generation started: release the lock we acquired.
      endGeneration(interview.id);
      throw err;
    }
  }),
);

roomRouter.post(
  "/:id/stop",
  requireInterviewRead,
  asyncHandler(async (req, res) => {
    abortGeneration(req.params.id);
    res.json({ ok: true });
  }),
);

// --- Image bytes -----------------------------------------------------------

roomRouter.get(
  "/:id/images/:imageId",
  requireInterviewRead,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{ media_type: string; data: Buffer }>(
      `SELECT media_type, data FROM interview_images WHERE id = $1 AND interview_id = $2`,
      [req.params.imageId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).end();
    res.setHeader("Content-Type", rows[0].media_type);
    res.send(rows[0].data);
  }),
);

// --- Save a live answer into the resume's Basic Information -----------------

roomRouter.post(
  "/:id/messages/:msgId/save-qa",
  requireInterviewRead,
  requireInterviewManage,
  asyncHandler(async (req, res) => {
    const interview = currentInterview(req);
    if (!interview.resume_id) throw new BadRequestError("Interview has no linked resume");

    const { rows } = await query<{ quick: string | null; content: string }>(
      `SELECT quick, content FROM interview_messages WHERE id = $1 AND interview_id = $2 AND role = 'assistant'`,
      [req.params.msgId, interview.id],
    );
    if (rows.length === 0) throw new NotFoundError("Answer not found");
    const { question } = parse(saveQaSchema, req.body);
    const answer = [rows[0].quick, rows[0].content].filter(Boolean).join("\n").trim();

    await query(
      `INSERT INTO resume_qa (resume_id, question, answer, sort_order)
       VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM resume_qa WHERE resume_id=$1))`,
      [interview.resume_id, question, answer],
    );
    res.status(201).json({ ok: true });
  }),
);

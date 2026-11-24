import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { pool, query } from "../db.js";
import type { InterviewRow } from "../domain.js";
import { requireAuth } from "../auth/middleware.js";
import { canAccessInterview, canManageInterview } from "../auth/permissions.js";
import {
  buildHistory,
  effectiveQA,
  effectiveResumeText,
  loadInterview,
  previousSummary,
} from "../interviewService.js";
import { HISTORY_SUMMARY_THRESHOLD, QUICK_MODEL } from "../models.js";
import {
  actionInstruction,
  detailInstruction,
  quickInstruction,
  systemBlocks,
} from "../prompt.js";
import {
  addClient,
  broadcast,
  clearInflight,
  getInflight,
  presenceCount,
  removeClient,
  sendTo,
  startInflight,
} from "../realtime/hub.js";
import {
  matchPreparedQuestion,
  predictFollowUps,
  streamStage,
} from "../realtime/generate.js";

export const roomRouter = Router();
roomRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

// Abort handles for in-flight answers, keyed by interview id.
const aborters = new Map<string, AbortController>();

async function loadForRead(req: Request, res: Response, next: NextFunction) {
  const interview = await loadInterview(req.params.id);
  if (!interview || !(await canAccessInterview(req.user!, interview))) {
    return res.status(404).json({ error: "Interview not found" });
  }
  (req as any).interview = interview;
  next();
}
const getIv = (req: Request) => (req as any).interview as InterviewRow;

// --- Transcript & live events ---------------------------------------------

roomRouter.get("/:id/messages", loadForRead, async (req, res) => {
  const { rows } = await query(
    `SELECT id, role, kind, image_id, quick, content, qa_ref, follow_ups, author_id,
            action, model, state, created_at
       FROM interview_messages WHERE interview_id = $1 ORDER BY created_at ASC`,
    [req.params.id],
  );
  res.json(rows);
});

roomRouter.get("/:id/events", loadForRead, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const interview = getIv(req);
  const clientId = addClient(interview.id, res);

  sendTo(res, "snapshot", {
    status: interview.status,
    presence: presenceCount(interview.id),
    inflight: getInflight(interview.id),
  });

  req.on("close", () => removeClient(interview.id, clientId));
});

// --- Manager note (no AI) --------------------------------------------------

roomRouter.post("/:id/notes", loadForRead, async (req, res) => {
  const interview = getIv(req);
  if (!canManageInterview(req.user!, interview)) return res.status(403).json({ error: "Forbidden" });
  const text = String(req.body?.content ?? "").trim();
  if (!text) return res.status(400).json({ error: "content is required" });
  const { rows } = await query(
    `INSERT INTO interview_messages (interview_id, role, kind, content, author_id, state)
     VALUES ($1, 'user', 'note', $2, $3, 'complete') RETURNING id, created_at`,
    [interview.id, text, req.user!.id],
  );
  broadcast(interview.id, "note", { id: rows[0].id, content: text, authorId: req.user!.id, created_at: rows[0].created_at });
  res.status(201).json({ id: rows[0].id });
});

// --- Ask a question (two-stage, detached) ----------------------------------

roomRouter.post("/:id/messages", loadForRead, upload.single("image"), async (req, res) => {
  const interview = getIv(req);
  // Any assigned viewer, manager, or admin may ask (read-only is a client toggle).
  if (interview.status !== "interviewing") {
    return res.status(409).json({ error: "The interview is not in progress" });
  }
  if (aborters.has(interview.id)) {
    return res.status(409).json({ error: "An answer is already being generated" });
  }
  const content = String(req.body?.content ?? "").trim();
  const action = req.body?.action as string | undefined;
  if (!content && !req.file && !action) {
    return res.status(400).json({ error: "content is required" });
  }

  // Store an optional image.
  let imageId: string | null = null;
  let imageBlock: any = null;
  if (req.file) {
    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are supported" });
    }
    const ins = await query<{ id: string }>(
      `INSERT INTO interview_images (interview_id, media_type, data) VALUES ($1,$2,$3) RETURNING id`,
      [interview.id, req.file.mimetype, req.file.buffer],
    );
    imageId = ins.rows[0].id;
    imageBlock = { type: "image", source: { type: "base64", media_type: req.file.mimetype, data: req.file.buffer.toString("base64") } };
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

  // Run generation detached from the request.
  runAnswer({ interview, question: content, action, imageBlock }).catch((err) => {
    console.error("generation failed", err);
    broadcast(interview.id, "answer_error", { message: "Generation failed" });
    aborters.delete(interview.id);
    clearInflight(interview.id);
  });
});

roomRouter.post("/:id/stop", loadForRead, async (req, res) => {
  const ac = aborters.get(req.params.id);
  if (ac) ac.abort();
  res.json({ ok: true });
});

// --- Image bytes -----------------------------------------------------------

roomRouter.get("/:id/images/:imageId", loadForRead, async (req, res) => {
  const { rows } = await query<{ media_type: string; data: Buffer }>(
    `SELECT media_type, data FROM interview_images WHERE id = $1 AND interview_id = $2`,
    [req.params.imageId, req.params.id],
  );
  if (rows.length === 0) return res.status(404).end();
  res.setHeader("Content-Type", rows[0].media_type);
  res.send(rows[0].data);
});

// --- Save a live answer into the resume's Basic Information -----------------

roomRouter.post("/:id/messages/:msgId/save-qa", loadForRead, async (req, res) => {
  const interview = getIv(req);
  if (!canManageInterview(req.user!, interview)) return res.status(403).json({ error: "Forbidden" });
  if (!interview.resume_id) return res.status(400).json({ error: "Interview has no linked resume" });

  // Find the answer and the question before it.
  const { rows } = await query<{ quick: string | null; content: string }>(
    `SELECT quick, content FROM interview_messages WHERE id = $1 AND interview_id = $2 AND role = 'assistant'`,
    [req.params.msgId, interview.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Answer not found" });
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "question is required" });
  const answer = [rows[0].quick, rows[0].content].filter(Boolean).join("\n").trim();

  await query(
    `INSERT INTO resume_qa (resume_id, question, answer, sort_order)
     VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM resume_qa WHERE resume_id=$1))`,
    [interview.resume_id, question, answer],
  );
  res.status(201).json({ ok: true });
});

// --- Generation orchestration ----------------------------------------------

interface RunArgs {
  interview: InterviewRow;
  question: string;
  action?: string;
  imageBlock: any;
}

async function runAnswer({ interview, question, action, imageBlock }: RunArgs) {
  const ac = new AbortController();
  aborters.set(interview.id, ac);

  const resumeText = await effectiveResumeText(interview);
  const qa = await effectiveQA(interview);
  const prevSummary = await previousSummary(interview);
  const system = systemBlocks({ interview, resumeText, qa, previousSummary: prevSummary });
  const history = await buildHistory(interview);

  // Create the assistant row up front so we have an id for the stream.
  const ins = await query<{ id: string }>(
    `INSERT INTO interview_messages (interview_id, role, kind, model, state)
     VALUES ($1,'assistant','answer',$2,'streaming') RETURNING id`,
    [interview.id, interview.model],
  );
  const messageId = ins.rows[0].id;
  const inflight = startInflight(interview.id, messageId);
  broadcast(interview.id, "answer_start", { messageId });

  // Non-blocking prepared-answer match for the label.
  let qaRef: string | null = null;
  const qaMatchPromise = matchPreparedQuestion(question, qa.map((q) => q.question)).then((idx) => {
    if (idx != null) {
      qaRef = `${idx}`;
      inflight.qaRef = qaRef;
      broadcast(interview.id, "qa_match", { messageId, index: idx });
    }
  });

  // The user turn: image (if any) + question text.
  const questionBlocks: any[] = [];
  if (imageBlock) questionBlocks.push(imageBlock);
  questionBlocks.push({ type: "text", text: question || "(see image)" });

  const extra = action ? `\n\n${actionInstruction(action)}` : "";

  try {
    // Stage 1: quick line (always fast model, thinking off).
    const quickMessages = [
      ...history,
      { role: "user" as const, content: [...questionBlocks, { type: "text", text: quickInstruction(interview.interview_type) + extra }] },
    ];
    const quick = await streamStage({
      model: QUICK_MODEL, system, messages: quickMessages, maxTokens: 200, thinkingOff: true,
      signal: ac.signal,
      onDelta: (t) => { inflight.quick += t; broadcast(interview.id, "quick_delta", { messageId, text: t }); },
    });
    broadcast(interview.id, "quick_done", { messageId, qaRef });

    // Stage 2: detail (interview's model, low effort), continues the quick line.
    const detailMessages = [
      ...history,
      { role: "user" as const, content: [...questionBlocks, { type: "text", text: detailInstruction(interview.interview_type, quick.text) + extra }] },
    ];
    const detail = await streamStage({
      model: interview.model, system, messages: detailMessages, maxTokens: 2048,
      effort: "low", cacheHistory: true, signal: ac.signal,
      onDelta: (t) => { inflight.content += t; broadcast(interview.id, "delta", { messageId, text: t }); },
    });

    await qaMatchPromise.catch(() => {});
    await query(
      `UPDATE interview_messages
          SET quick=$2, content=$3, qa_ref=$4, state='complete', quick_ms=$5, detail_ms=$6,
              input_tokens=$7, output_tokens=$8
        WHERE id=$1`,
      [messageId, quick.text, detail.text, qaRef, quick.ms, detail.ms, detail.inputTokens, detail.outputTokens],
    );
    broadcast(interview.id, "answer_done", { messageId, qaRef, quickMs: quick.ms, detailMs: detail.ms });

    // Likely follow-ups (after the answer; never delays it).
    predictFollowUps(question, detail.text).then(async (fu) => {
      if (fu.length === 0) return;
      await query(`UPDATE interview_messages SET follow_ups=$2 WHERE id=$1`, [messageId, JSON.stringify(fu)]);
      broadcast(interview.id, "follow_ups", { messageId, followUps: fu });
    }).catch(() => {});

    // History safety net.
    if (detail.inputTokens > HISTORY_SUMMARY_THRESHOLD) {
      rollUpHistory(interview.id).catch((e) => console.error("rollup failed", e));
    }
  } catch (err: any) {
    const aborted = ac.signal.aborted || err?.name === "AbortError";
    await query(
      `UPDATE interview_messages SET quick=$2, content=$3, state=$4 WHERE id=$1`,
      [messageId, inflight.quick, inflight.content, aborted ? "stopped" : "error"],
    );
    broadcast(interview.id, aborted ? "answer_done" : "answer_error", {
      messageId, stopped: aborted, message: aborted ? undefined : (err?.message ?? "Generation error"),
    });
  } finally {
    aborters.delete(interview.id);
    clearInflight(interview.id);
  }
}

// Fold the earliest turns into interviews.history_summary when the context
// sent grows past the threshold. Keeps the full transcript in the database.
async function rollUpHistory(interviewId: string) {
  const interview = await loadInterview(interviewId);
  if (!interview) return;
  const { rows } = await query<{ id: string; role: string; quick: string | null; content: string }>(
    `SELECT id, role, quick, content FROM interview_messages
      WHERE interview_id=$1 AND kind IN ('question','answer')
        ${interview.history_summary_upto ? "AND created_at > (SELECT created_at FROM interview_messages WHERE id=$2)" : ""}
      ORDER BY created_at ASC`,
    interview.history_summary_upto ? [interviewId, interview.history_summary_upto] : [interviewId],
  );
  // Summarise all but the last 6 turns.
  const keep = 6;
  if (rows.length <= keep) return;
  const toFold = rows.slice(0, rows.length - keep);
  const upto = toFold[toFold.length - 1].id;
  const transcript = toFold
    .map((r) => (r.role === "user" ? `Q: ${r.content}` : `A: ${[r.quick, r.content].filter(Boolean).join(" ")}`))
    .join("\n");
  const { anthropic } = await import("../anthropic.js");
  const msg = await anthropic.messages.create({
    model: QUICK_MODEL, max_tokens: 1500,
    system: "Summarise this interview transcript so far into compact notes that preserve what was asked and answered.",
    messages: [
      ...(interview.history_summary ? [{ role: "user" as const, content: `Existing summary:\n${interview.history_summary}` }] : []),
      { role: "user", content: transcript },
    ],
  });
  const text = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  await query(`UPDATE interviews SET history_summary=$2, history_summary_upto=$3 WHERE id=$1`, [interviewId, text, upto]);
}

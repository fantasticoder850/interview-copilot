import { Router, type NextFunction, type Request, type Response } from "express";
import { clientForUser } from "../anthropic.js";
import { pool, query } from "../db.js";
import type { InterviewRow } from "../domain.js";
import { requireAuth } from "../auth/middleware.js";
import {
  allowedViewerIds,
  canAccessInterview,
  canManageInterview,
} from "../auth/permissions.js";
import {
  buildHistory,
  effectiveQA,
  effectiveResumeText,
  loadInterview,
  previousSummary,
} from "../interviewService.js";
import { isValidModel } from "../models.js";
import { systemBlocks } from "../prompt.js";
import { broadcast } from "../realtime/hub.js";
import { interviewSchema, zodMessage } from "../validation.js";

export const interviewsRouter = Router();
interviewsRouter.use(requireAuth);

// Load + attach the interview, enforcing read access.
async function loadForRead(req: Request, res: Response, next: NextFunction) {
  const interview = await loadInterview(req.params.id);
  if (!interview || !(await canAccessInterview(req.user!, interview))) {
    return res.status(404).json({ error: "Interview not found" });
  }
  (req as any).interview = interview;
  next();
}
function requireManage(req: Request, res: Response, next: NextFunction) {
  const interview = (req as any).interview as InterviewRow;
  if (!canManageInterview(req.user!, interview)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
const getIv = (req: Request) => (req as any).interview as InterviewRow;

async function assignedViewers(interviewId: string) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email FROM users u
       JOIN interview_viewers iv ON iv.viewer_id = u.id
      WHERE iv.interview_id = $1 ORDER BY u.name`,
    [interviewId],
  );
  return rows;
}

// --- List & create ---------------------------------------------------------

interviewsRouter.get("/", async (req, res) => {
  const user = req.user!;
  let rows;
  if (user.role === "admin") {
    rows = (await query<InterviewRow>(`SELECT * FROM interviews ORDER BY updated_at DESC`)).rows;
  } else if (user.role === "manager") {
    rows = (await query<InterviewRow>(`SELECT * FROM interviews WHERE owner_id = $1 ORDER BY updated_at DESC`, [user.id])).rows;
  } else {
    rows = (await query<InterviewRow>(
      `SELECT i.* FROM interviews i JOIN interview_viewers iv ON iv.interview_id = i.id
        WHERE iv.viewer_id = $1 ORDER BY i.updated_at DESC`,
      [user.id],
    )).rows;
  }
  res.json(rows.map(summaryRow));
});

function summaryRow(i: InterviewRow) {
  return {
    id: i.id, job_title: i.job_title, company: i.company, status: i.status,
    interview_type: i.interview_type, model: i.model, version: i.version,
    parent_id: i.parent_id, updated_at: i.updated_at, created_at: i.created_at,
  };
}

interviewsRouter.post("/", async (req, res) => {
  const user = req.user!;
  if (user.role === "viewer") return res.status(403).json({ error: "Forbidden" });
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const d = parsed.data;
  if (!isValidModel(d.model)) return res.status(400).json({ error: "Invalid model" });

  const allowed = await allowedViewerIds(user);
  const viewerIds = [...new Set(d.viewerIds)];
  if (viewerIds.some((v) => !allowed.has(v))) {
    return res.status(403).json({ error: "You can only assign your own viewers" });
  }
  if (d.resumeId) {
    const r = await query(`SELECT 1 FROM resumes WHERE id = $1 AND ($2 = 'admin' OR owner_id = $3)`, [d.resumeId, user.role, user.id]);
    if (r.rowCount === 0) return res.status(400).json({ error: "Invalid resume" });
  }

  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const { rows } = await conn.query<InterviewRow>(
      `INSERT INTO interviews
        (owner_id, job_title, job_description, system_prompt, resume_id, interview_type,
         interviewers, company, company_notes, answer_language, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [user.id, d.jobTitle, d.jobDescription ?? null, d.systemPrompt, d.resumeId ?? null,
       d.interviewType, d.interviewers, d.company, d.companyNotes ?? null, d.answerLanguage, d.model],
    );
    const interview = rows[0];
    for (const v of viewerIds) {
      await conn.query(`INSERT INTO interview_viewers (interview_id, viewer_id) VALUES ($1,$2)`, [interview.id, v]);
    }
    await conn.query("COMMIT");
    res.status(201).json(interview);
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
});

// --- Read / update / delete ------------------------------------------------

interviewsRouter.get("/:id", loadForRead, async (req, res) => {
  const i = getIv(req);
  res.json({
    ...i,
    viewers: await assignedViewers(i.id),
    canManage: canManageInterview(req.user!, i),
  });
});

interviewsRouter.patch("/:id", loadForRead, requireManage, async (req, res) => {
  const i = getIv(req);
  const parsed = interviewSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const d = parsed.data;

  const map: Record<string, string> = {
    jobTitle: "job_title", jobDescription: "job_description", systemPrompt: "system_prompt",
    resumeId: "resume_id", interviewType: "interview_type", interviewers: "interviewers",
    company: "company", companyNotes: "company_notes", answerLanguage: "answer_language", model: "model",
  };
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    if ((d as any)[key] !== undefined) {
      if (key === "model" && !isValidModel((d as any)[key])) return res.status(400).json({ error: "Invalid model" });
      fields.push(`${col} = $${fields.length + 1}`);
      vals.push((d as any)[key]);
    }
  }
  if (d.viewerIds !== undefined) {
    const allowed = await allowedViewerIds(req.user!);
    if (d.viewerIds.some((v) => !allowed.has(v))) return res.status(403).json({ error: "You can only assign your own viewers" });
  }

  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    if (fields.length > 0) {
      fields.push(`updated_at = now()`);
      vals.push(i.id);
      await conn.query(`UPDATE interviews SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    }
    if (d.viewerIds !== undefined) {
      await conn.query(`DELETE FROM interview_viewers WHERE interview_id = $1`, [i.id]);
      for (const v of [...new Set(d.viewerIds)]) {
        await conn.query(`INSERT INTO interview_viewers (interview_id, viewer_id) VALUES ($1,$2)`, [i.id, v]);
      }
    }
    await conn.query("COMMIT");
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
  const updated = await loadInterview(i.id);
  res.json({ ...updated, viewers: await assignedViewers(i.id) });
});

interviewsRouter.delete("/:id", loadForRead, requireManage, async (req, res) => {
  await query(`DELETE FROM interviews WHERE id = $1`, [getIv(req).id]);
  res.status(204).end();
});

// --- Lifecycle -------------------------------------------------------------

interviewsRouter.post("/:id/status", loadForRead, requireManage, async (req, res) => {
  const i = getIv(req);
  const next = String(req.body?.status ?? "");
  const valid = ["scheduled", "interviewing", "ended"];
  if (!valid.includes(next)) return res.status(400).json({ error: "Invalid status" });

  // Starting (scheduled/ended -> interviewing): copy the resume on first start.
  if (next === "interviewing") {
    if (i.resume_copied_at == null) {
      const text = await effectiveResumeText(i);
      const qa = await effectiveQA(i);
      await query(
        `UPDATE interviews SET status='interviewing', started_at=COALESCE(started_at, now()),
            resume_text=$2, qa_snapshot=$3, resume_copied_at=now(), updated_at=now() WHERE id=$1`,
        [i.id, text, JSON.stringify(qa)],
      );
    } else {
      await query(`UPDATE interviews SET status='interviewing', updated_at=now() WHERE id=$1`, [i.id]);
    }
    const started = await loadInterview(i.id);
    warmCaches(started!).catch(() => {});
    broadcast(i.id, "status", { status: "interviewing" });
    return res.json(started);
  }

  if (next === "ended") {
    await query(`UPDATE interviews SET status='ended', ended_at=now(), updated_at=now() WHERE id=$1`, [i.id]);
    broadcast(i.id, "status", { status: "ended" });
    generateSummary(i.id).catch((e) => console.error("summary failed", e));
    return res.json(await loadInterview(i.id));
  }

  await query(`UPDATE interviews SET status='scheduled', updated_at=now() WHERE id=$1`, [i.id]);
  broadcast(i.id, "status", { status: "scheduled" });
  res.json(await loadInterview(i.id));
});

interviewsRouter.post("/:id/new-version", loadForRead, requireManage, async (req, res) => {
  const i = getIv(req);
  const carry = Boolean(req.body?.carrySummary);
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const { rows } = await conn.query<InterviewRow>(
      `INSERT INTO interviews
        (owner_id, parent_id, version, job_title, job_description, system_prompt, resume_id,
         interview_type, interviewers, company, company_notes, answer_language, model, carry_summary)
       SELECT owner_id, $1, version + 1, job_title, job_description, system_prompt, resume_id,
         interview_type, interviewers, company, company_notes, answer_language, model, $2
       FROM interviews WHERE id = $1 RETURNING *`,
      [i.id, carry],
    );
    const v2 = rows[0];
    await conn.query(
      `INSERT INTO interview_viewers (interview_id, viewer_id)
       SELECT $1, viewer_id FROM interview_viewers WHERE interview_id = $2`,
      [v2.id, i.id],
    );
    await conn.query("COMMIT");
    res.status(201).json(v2);
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
});

// --- Resume copy -----------------------------------------------------------

interviewsRouter.put("/:id/resume", loadForRead, requireManage, async (req, res) => {
  const text = String(req.body?.text ?? "");
  await query(`UPDATE interviews SET resume_text=$2, updated_at=now() WHERE id=$1`, [getIv(req).id, text]);
  res.json({ ok: true });
});

interviewsRouter.post("/:id/resume/recopy", loadForRead, requireManage, async (req, res) => {
  const i = getIv(req);
  if (!i.resume_id) return res.status(400).json({ error: "No linked resume" });
  const { rows } = await query<{ content: string }>(`SELECT content FROM resumes WHERE id=$1`, [i.resume_id]);
  const qa = await query(`SELECT question, answer FROM resume_qa WHERE resume_id=$1 ORDER BY sort_order, created_at`, [i.resume_id]);
  await query(`UPDATE interviews SET resume_text=$2, qa_snapshot=$3, resume_copied_at=now(), updated_at=now() WHERE id=$1`,
    [i.id, rows[0]?.content ?? "", JSON.stringify(qa.rows)]);
  res.json({ ok: true, content: rows[0]?.content ?? "" });
});

interviewsRouter.post("/:id/resume/save-back", loadForRead, requireManage, async (req, res) => {
  const i = getIv(req);
  if (!i.resume_id) return res.status(400).json({ error: "No linked resume" });
  if (i.resume_text == null) return res.status(400).json({ error: "No copy to save back" });
  await query(`UPDATE resumes SET content=$2, updated_at=now() WHERE id=$1`, [i.resume_id, i.resume_text]);
  res.json({ ok: true });
});

// --- Prep pack & summary ---------------------------------------------------

interviewsRouter.post("/:id/prep-pack", loadForRead, requireManage, async (req, res) => {
  const i = getIv(req);
  try {
    const system = systemBlocks({
      interview: i, resumeText: await effectiveResumeText(i),
      qa: await effectiveQA(i), previousSummary: await previousSummary(i),
    });
    const client = await clientForUser(i.owner_id);
    const msg = await client.messages.create({
      model: i.model, max_tokens: 4000, system,
      messages: [{ role: "user", content:
        "Produce a preparation pack for this interview: list the 8-12 most likely questions, " +
        "each with a concise draft answer grounded in the resume. Group by theme. Markdown." }],
    });
    const text = textOf(msg);
    await query(`UPDATE interviews SET prep_pack=$2, updated_at=now() WHERE id=$1`, [i.id, text]);
    res.json({ prep_pack: text });
  } catch (err) {
    console.error("prep pack failed", err);
    res.status(502).json({ error: "Could not generate the prep pack" });
  }
});

interviewsRouter.post("/:id/summary", loadForRead, requireManage, async (req, res) => {
  try {
    await generateSummary(getIv(req).id);
    const updated = await loadInterview(getIv(req).id);
    res.json({ summary: updated?.summary ?? "" });
  } catch (err) {
    console.error("summary failed", err);
    res.status(502).json({ error: "Could not generate the summary" });
  }
});

// --- helpers ---------------------------------------------------------------

function textOf(msg: any): string {
  return (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

async function warmCaches(interview: InterviewRow) {
  const system = systemBlocks({
    interview, resumeText: await effectiveResumeText(interview),
    qa: await effectiveQA(interview), previousSummary: await previousSummary(interview),
  });
  const client = await clientForUser(interview.owner_id);
  const warm = (model: string) =>
    client.messages.create({ model, max_tokens: 1, system, messages: [{ role: "user", content: "ready?" }] });
  await Promise.allSettled([warm(interview.model), warm("claude-haiku-5-5")]);
}

async function generateSummary(interviewId: string) {
  const interview = await loadInterview(interviewId);
  if (!interview) return;
  const history = await buildHistory(interview);
  if (history.length === 0) return;
  const system = systemBlocks({
    interview, resumeText: await effectiveResumeText(interview),
    qa: await effectiveQA(interview), previousSummary: await previousSummary(interview),
  });
  const client = await clientForUser(interview.owner_id);
  const msg = await client.messages.create({
    model: interview.model, max_tokens: 2000, system,
    messages: [...history, { role: "user", content:
      "The interview is over. Summarise it: questions asked, how they were answered, weak spots, " +
      "and likely follow-ups for next time. Markdown." }],
  });
  const text = textOf(msg);
  await query(`UPDATE interviews SET summary=$2, updated_at=now() WHERE id=$1`, [interviewId, text]);
  broadcast(interviewId, "summary", { summary: text });
}

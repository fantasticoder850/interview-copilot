import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import { clientForUser } from "../anthropic.js";
import { pool, query } from "../db.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { canAccessResume } from "../auth/permissions.js";
import { RESUME_TEMPLATE, STARTER_QA_QUESTIONS } from "../resumeTemplate.js";
import { qaSchema, resumeSchema, zodMessage } from "../validation.js";

export const resumesRouter = Router();
resumesRouter.use(requireAuth, requireRole("admin", "manager"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB, matches nginx client_max_body_size
});

// Resumes the current user may see (admins: all).
resumesRouter.get("/", async (req, res) => {
  const user = req.user!;
  const rows =
    user.role === "admin"
      ? (await query(`SELECT id, owner_id, name, role, created_at, updated_at FROM resumes ORDER BY updated_at DESC`)).rows
      : (await query(`SELECT id, owner_id, name, role, created_at, updated_at FROM resumes WHERE owner_id = $1 ORDER BY updated_at DESC`, [user.id])).rows;
  res.json(rows);
});

resumesRouter.get("/template", (_req, res) => {
  res.json({ template: RESUME_TEMPLATE, starterQuestions: STARTER_QA_QUESTIONS });
});

// Parse a PDF or pasted text into the structured template. Nothing is saved.
resumesRouter.post("/parse", upload.single("file"), async (req, res) => {
  const instruction =
    `Rewrite the following resume into EXACTLY this plain-text structure. ` +
    `Use only facts present in the source — never invent experience, dates, or metrics. ` +
    `Omit any section that has no data. Return ONLY the structured plain text, no commentary, no markdown fences.\n\n` +
    `TEMPLATE:\n${RESUME_TEMPLATE}`;

  try {
    const content: any[] = [];
    if (req.file) {
      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are supported" });
      }
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: req.file.buffer.toString("base64"),
        },
      });
      content.push({ type: "text", text: instruction });
    } else if (typeof req.body?.text === "string" && req.body.text.trim()) {
      content.push({ type: "text", text: `${instruction}\n\nSOURCE RESUME:\n${req.body.text}` });
    } else {
      return res.status(400).json({ error: "Provide a PDF file or text" });
    }

    const client = await clientForUser(req.user!.id);
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      messages: [{ role: "user", content }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    res.json({ content: text });
  } catch (err: any) {
    console.error("Resume parse failed:", err);
    res.status(502).json({ error: "Could not parse the resume. Try pasting the text instead." });
  }
});

resumesRouter.post("/", async (req, res) => {
  const parsed = resumeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { name, role, content } = parsed.data;
  const { rows } = await query(
    `INSERT INTO resumes (owner_id, name, role, content) VALUES ($1, $2, $3, $4)
     RETURNING id, owner_id, name, role, content, created_at, updated_at`,
    [req.user!.id, name, role, content],
  );
  res.status(201).json(rows[0]);
});

resumesRouter.get("/:id", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const { rows } = await query(
    `SELECT id, owner_id, name, role, content, created_at, updated_at FROM resumes WHERE id = $1`,
    [req.params.id],
  );
  const { rows: qa } = await query(
    `SELECT id, question, answer, sort_order FROM resume_qa WHERE resume_id = $1 ORDER BY sort_order, created_at`,
    [req.params.id],
  );
  res.json({ ...rows[0], qa });
});

resumesRouter.patch("/:id", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const parsed = resumeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const key of ["name", "role", "content"] as const) {
    if (parsed.data[key] !== undefined) {
      fields.push(`${key} = $${fields.length + 1}`);
      vals.push(parsed.data[key]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });
  fields.push(`updated_at = now()`);
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE resumes SET ${fields.join(", ")} WHERE id = $${vals.length}
     RETURNING id, owner_id, name, role, content, created_at, updated_at`,
    vals,
  );
  res.json(rows[0]);
});

resumesRouter.delete("/:id", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const used = await query(`SELECT 1 FROM interviews WHERE resume_id = $1 LIMIT 1`, [req.params.id]);
  if (used.rowCount! > 0) {
    return res.status(409).json({ error: "This resume is used by an interview and cannot be deleted" });
  }
  await query(`DELETE FROM resumes WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

// --- Basic Information (prepared Q&A) --------------------------------------

resumesRouter.get("/:id/qa", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const { rows } = await query(
    `SELECT id, question, answer, sort_order FROM resume_qa WHERE resume_id = $1 ORDER BY sort_order, created_at`,
    [req.params.id],
  );
  res.json(rows);
});

resumesRouter.post("/:id/qa", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const parsed = qaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const { rows } = await query(
    `INSERT INTO resume_qa (resume_id, question, answer, sort_order)
     VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM resume_qa WHERE resume_id = $1)))
     RETURNING id, question, answer, sort_order`,
    [req.params.id, parsed.data.question, parsed.data.answer, parsed.data.sortOrder ?? null],
  );
  res.status(201).json(rows[0]);
});

resumesRouter.patch("/:id/qa/:qaId", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const parsed = qaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (parsed.data.question !== undefined) { fields.push(`question = $${fields.length + 1}`); vals.push(parsed.data.question); }
  if (parsed.data.answer !== undefined) { fields.push(`answer = $${fields.length + 1}`); vals.push(parsed.data.answer); }
  if (parsed.data.sortOrder !== undefined) { fields.push(`sort_order = $${fields.length + 1}`); vals.push(parsed.data.sortOrder); }
  if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });
  fields.push(`updated_at = now()`);
  vals.push(req.params.qaId, req.params.id);
  const { rows } = await query(
    `UPDATE resume_qa SET ${fields.join(", ")}
      WHERE id = $${vals.length - 1} AND resume_id = $${vals.length}
      RETURNING id, question, answer, sort_order`,
    vals,
  );
  if (rows.length === 0) return res.status(404).json({ error: "Q&A not found" });
  res.json(rows[0]);
});

resumesRouter.delete("/:id/qa/:qaId", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  await query(`DELETE FROM resume_qa WHERE id = $1 AND resume_id = $2`, [req.params.qaId, req.params.id]);
  res.status(204).end();
});

// Draft an answer to a question from the resume content. Nothing is saved.
resumesRouter.post("/:id/qa/draft", async (req, res) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    return res.status(404).json({ error: "Resume not found" });
  }
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "question is required" });
  const { rows } = await query<{ content: string }>(`SELECT content FROM resumes WHERE id = $1`, [req.params.id]);
  try {
    const client = await clientForUser(req.user!.id);
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 1000,
      system:
        "You are helping a candidate prepare answers to common interview questions. " +
        "Write a concise, first-person answer grounded only in the resume below. " +
        "Do not invent facts. Return only the answer text.\n\nRESUME:\n" + (rows[0]?.content ?? ""),
      messages: [{ role: "user", content: question }],
    });
    const answer = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    res.json({ answer });
  } catch (err) {
    console.error("QA draft failed:", err);
    res.status(502).json({ error: "Could not draft an answer" });
  }
});

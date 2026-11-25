import type Anthropic from "@anthropic-ai/sdk";
import { BadRequestError, ConflictError, NotFoundError, UpstreamAIError } from "../../common/errors.js";
import { buildUpdate } from "../../common/sql.js";
import type { User } from "../../common/types.js";
import { UTILITY_MODEL } from "../../config/models.js";
import { query } from "../../infrastructure/db.js";
import { complete } from "../ai/ai.service.js";
import { RESUME_TEMPLATE } from "./resume-template.js";

const RESUME_COLUMNS = "id, owner_id, name, role, content, created_at, updated_at";

export async function listResumes(user: User) {
  const rows =
    user.role === "admin"
      ? (await query(`SELECT id, owner_id, name, role, created_at, updated_at FROM resumes ORDER BY updated_at DESC`)).rows
      : (await query(
          `SELECT id, owner_id, name, role, created_at, updated_at FROM resumes WHERE owner_id = $1 ORDER BY updated_at DESC`,
          [user.id],
        )).rows;
  return rows;
}

export async function createResume(ownerId: string, data: { name: string; role: string; content: string }) {
  const { rows } = await query(
    `INSERT INTO resumes (owner_id, name, role, content) VALUES ($1, $2, $3, $4)
     RETURNING ${RESUME_COLUMNS}`,
    [ownerId, data.name, data.role, data.content],
  );
  return rows[0];
}

export async function getResumeWithQA(id: string) {
  const { rows } = await query(`SELECT ${RESUME_COLUMNS} FROM resumes WHERE id = $1`, [id]);
  const { rows: qa } = await query(
    `SELECT id, question, answer, sort_order FROM resume_qa WHERE resume_id = $1 ORDER BY sort_order, created_at`,
    [id],
  );
  return { ...rows[0], qa };
}

export async function updateResume(
  id: string,
  patch: { name?: string; role?: string; content?: string },
) {
  const { assignments, values } = buildUpdate(
    { name: "name", role: "role", content: "content" },
    patch,
  );
  if (assignments.length === 0) throw new BadRequestError("Nothing to update");
  assignments.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await query(
    `UPDATE resumes SET ${assignments.join(", ")} WHERE id = $${values.length}
     RETURNING ${RESUME_COLUMNS}`,
    values,
  );
  return rows[0];
}

export async function deleteResume(id: string) {
  const used = await query(`SELECT 1 FROM interviews WHERE resume_id = $1 LIMIT 1`, [id]);
  if (used.rowCount! > 0) {
    throw new ConflictError("This resume is used by an interview and cannot be deleted");
  }
  await query(`DELETE FROM resumes WHERE id = $1`, [id]);
}

// --- Basic Information (prepared Q&A) --------------------------------------

export async function listQA(resumeId: string) {
  const { rows } = await query(
    `SELECT id, question, answer, sort_order FROM resume_qa WHERE resume_id = $1 ORDER BY sort_order, created_at`,
    [resumeId],
  );
  return rows;
}

export async function addQA(
  resumeId: string,
  data: { question: string; answer: string; sortOrder?: number },
) {
  const { rows } = await query(
    `INSERT INTO resume_qa (resume_id, question, answer, sort_order)
     VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM resume_qa WHERE resume_id = $1)))
     RETURNING id, question, answer, sort_order`,
    [resumeId, data.question, data.answer, data.sortOrder ?? null],
  );
  return rows[0];
}

export async function updateQA(
  resumeId: string,
  qaId: string,
  patch: { question?: string; answer?: string; sortOrder?: number },
) {
  const { assignments, values } = buildUpdate(
    { question: "question", answer: "answer", sortOrder: "sort_order" },
    patch,
  );
  if (assignments.length === 0) throw new BadRequestError("Nothing to update");
  assignments.push(`updated_at = now()`);
  values.push(qaId, resumeId);
  const { rows } = await query(
    `UPDATE resume_qa SET ${assignments.join(", ")}
      WHERE id = $${values.length - 1} AND resume_id = $${values.length}
      RETURNING id, question, answer, sort_order`,
    values,
  );
  if (rows.length === 0) throw new NotFoundError("Q&A not found");
  return rows[0];
}

export async function deleteQA(resumeId: string, qaId: string) {
  await query(`DELETE FROM resume_qa WHERE id = $1 AND resume_id = $2`, [qaId, resumeId]);
}

// --- AI-assisted --------------------------------------------------------

const PARSE_INSTRUCTION =
  `Rewrite the following resume into EXACTLY this plain-text structure. ` +
  `Use only facts present in the source — never invent experience, dates, or metrics. ` +
  `Omit any section that has no data. Return ONLY the structured plain text, no commentary, no markdown fences.\n\n` +
  `TEMPLATE:\n${RESUME_TEMPLATE}`;

// Parse a PDF (base64) or pasted text into the structured template. Saves nothing.
export async function parseResume(input: {
  userId: string;
  pdfBase64?: string;
  text?: string;
}): Promise<string> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
    });
    content.push({ type: "text", text: PARSE_INSTRUCTION });
  } else if (input.text && input.text.trim()) {
    content.push({ type: "text", text: `${PARSE_INSTRUCTION}\n\nSOURCE RESUME:\n${input.text}` });
  } else {
    throw new BadRequestError("Provide a PDF file or text");
  }

  try {
    return await complete({
      userId: input.userId,
      model: UTILITY_MODEL,
      maxTokens: 4000,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof UpstreamAIError) {
      throw new UpstreamAIError("Could not parse the resume. Try pasting the text instead.");
    }
    throw err;
  }
}

// Draft a first-person answer grounded only in the resume. Saves nothing.
export async function draftAnswer(input: {
  userId: string;
  resumeId: string;
  question: string;
}): Promise<string> {
  const { rows } = await query<{ content: string }>(
    `SELECT content FROM resumes WHERE id = $1`,
    [input.resumeId],
  );
  try {
    return await complete({
      userId: input.userId,
      model: UTILITY_MODEL,
      maxTokens: 1000,
      system:
        "You are helping a candidate prepare answers to common interview questions. " +
        "Write a concise, first-person answer grounded only in the resume below. " +
        "Do not invent facts. Return only the answer text.\n\nRESUME:\n" + (rows[0]?.content ?? ""),
      messages: [{ role: "user", content: input.question }],
    });
  } catch (err) {
    if (err instanceof UpstreamAIError) throw new UpstreamAIError("Could not draft an answer");
    throw err;
  }
}

import { BadRequestError, ForbiddenError, UpstreamAIError } from "../../common/errors.js";
import type { InterviewRow, User } from "../../common/types.js";
import { isValidModel } from "../../config/models.js";
import { query, withTransaction } from "../../infrastructure/db.js";
import { complete, warmModel } from "../ai/ai.service.js";
import { systemBlocks } from "../ai/prompt.js";
import {
  allowedCandidateIds,
  canAccessResume,
  canManageInterview,
} from "../auth/auth.permissions.js";
import { broadcast } from "../room/sse-hub.js";
import type { interviewSchema } from "./interview.schema.js";
import type { z } from "zod";
import {
  buildHistory,
  effectiveQA,
  effectiveResumeText,
  interviewContext,
  loadInterview,
} from "./interview.context.js";

type InterviewInput = z.infer<typeof interviewSchema>;

// Trimmed shape for list views.
export function summaryRow(i: InterviewRow) {
  return {
    id: i.id, job_title: i.job_title, company: i.company, status: i.status,
    interview_type: i.interview_type, model: i.model, version: i.version,
    parent_id: i.parent_id, updated_at: i.updated_at, created_at: i.created_at,
  };
}

export async function assignedCandidates(interviewId: string) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email FROM users u
       JOIN interview_candidates iv ON iv.candidate_id = u.id
      WHERE iv.interview_id = $1 ORDER BY u.name`,
    [interviewId],
  );
  return rows;
}

export async function listInterviews(user: User) {
  let rows: InterviewRow[];
  if (user.role === "admin") {
    rows = (await query<InterviewRow>(`SELECT * FROM interviews ORDER BY updated_at DESC`)).rows;
  } else if (user.role === "manager") {
    rows = (await query<InterviewRow>(`SELECT * FROM interviews WHERE owner_id = $1 ORDER BY updated_at DESC`, [user.id])).rows;
  } else {
    rows = (await query<InterviewRow>(
      `SELECT i.* FROM interviews i JOIN interview_candidates iv ON iv.interview_id = i.id
        WHERE iv.candidate_id = $1 ORDER BY i.updated_at DESC`,
      [user.id],
    )).rows;
  }
  return rows.map(summaryRow);
}

export async function createInterview(user: User, input: InterviewInput): Promise<InterviewRow> {
  if (user.role === "candidate") throw new ForbiddenError();
  if (!isValidModel(input.model)) throw new BadRequestError("Invalid model");

  const allowed = await allowedCandidateIds(user);
  const candidateIds = [...new Set(input.candidateIds)];
  if (candidateIds.some((v) => !allowed.has(v))) {
    throw new ForbiddenError("You can only assign your own candidates");
  }
  if (input.resumeId && !(await canAccessResume(user, input.resumeId))) {
    throw new BadRequestError("Invalid resume");
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query<InterviewRow>(
      `INSERT INTO interviews
        (owner_id, job_title, job_description, system_prompt, resume_id, interview_type,
         interviewers, company, company_notes, answer_language, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [user.id, input.jobTitle, input.jobDescription ?? null, input.systemPrompt, input.resumeId ?? null,
       input.interviewType, input.interviewers, input.company, input.companyNotes ?? null, input.answerLanguage, input.model],
    );
    const interview = rows[0];
    for (const v of candidateIds) {
      await client.query(`INSERT INTO interview_candidates (interview_id, candidate_id) VALUES ($1,$2)`, [interview.id, v]);
    }
    return interview;
  });
}

export async function getInterviewView(interview: InterviewRow, user: User) {
  return {
    ...interview,
    candidates: await assignedCandidates(interview.id),
    canManage: canManageInterview(user, interview),
  };
}

export async function updateInterview(
  interview: InterviewRow,
  user: User,
  input: Partial<InterviewInput>,
) {
  const map: Record<string, string> = {
    jobTitle: "job_title", jobDescription: "job_description", systemPrompt: "system_prompt",
    resumeId: "resume_id", interviewType: "interview_type", interviewers: "interviewers",
    company: "company", companyNotes: "company_notes", answerLanguage: "answer_language", model: "model",
  };
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (key === "model" && !isValidModel(value)) throw new BadRequestError("Invalid model");
      fields.push(`${col} = $${fields.length + 1}`);
      vals.push(value);
    }
  }
  if (input.candidateIds !== undefined) {
    const allowed = await allowedCandidateIds(user);
    if (input.candidateIds.some((v) => !allowed.has(v))) {
      throw new ForbiddenError("You can only assign your own candidates");
    }
  }

  await withTransaction(async (client) => {
    if (fields.length > 0) {
      fields.push(`updated_at = now()`);
      vals.push(interview.id);
      await client.query(`UPDATE interviews SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    }
    if (input.candidateIds !== undefined) {
      await client.query(`DELETE FROM interview_candidates WHERE interview_id = $1`, [interview.id]);
      for (const v of [...new Set(input.candidateIds)]) {
        await client.query(`INSERT INTO interview_candidates (interview_id, candidate_id) VALUES ($1,$2)`, [interview.id, v]);
      }
    }
  });

  const updated = await loadInterview(interview.id);
  return { ...updated, candidates: await assignedCandidates(interview.id) };
}

export async function deleteInterview(id: string) {
  await query(`DELETE FROM interviews WHERE id = $1`, [id]);
}

// --- Lifecycle -------------------------------------------------------------

export async function setStatus(interview: InterviewRow, next: "scheduled" | "interviewing" | "ended") {
  if (next === "interviewing") {
    if (interview.resume_copied_at == null) {
      const text = await effectiveResumeText(interview);
      const qa = await effectiveQA(interview);
      await query(
        `UPDATE interviews SET status='interviewing', started_at=COALESCE(started_at, now()),
            resume_text=$2, qa_snapshot=$3, resume_copied_at=now(), updated_at=now() WHERE id=$1`,
        [interview.id, text, JSON.stringify(qa)],
      );
    } else {
      await query(`UPDATE interviews SET status='interviewing', updated_at=now() WHERE id=$1`, [interview.id]);
    }
    const started = await loadInterview(interview.id);
    warmCaches(started!).catch(() => {});
    broadcast(interview.id, "status", { status: "interviewing" });
    return started;
  }

  if (next === "ended") {
    await query(`UPDATE interviews SET status='ended', ended_at=now(), updated_at=now() WHERE id=$1`, [interview.id]);
    broadcast(interview.id, "status", { status: "ended" });
    generateSummary(interview.id).catch((e) => console.error("summary failed", e));
    return loadInterview(interview.id);
  }

  await query(`UPDATE interviews SET status='scheduled', updated_at=now() WHERE id=$1`, [interview.id]);
  broadcast(interview.id, "status", { status: "scheduled" });
  return loadInterview(interview.id);
}

export async function newVersion(interview: InterviewRow, carry: boolean): Promise<InterviewRow> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<InterviewRow>(
      `INSERT INTO interviews
        (owner_id, parent_id, version, job_title, job_description, system_prompt, resume_id,
         interview_type, interviewers, company, company_notes, answer_language, model, carry_summary)
       SELECT owner_id, $1, version + 1, job_title, job_description, system_prompt, resume_id,
         interview_type, interviewers, company, company_notes, answer_language, model, $2
       FROM interviews WHERE id = $1 RETURNING *`,
      [interview.id, carry],
    );
    const v2 = rows[0];
    await client.query(
      `INSERT INTO interview_candidates (interview_id, candidate_id)
       SELECT $1, candidate_id FROM interview_candidates WHERE interview_id = $2`,
      [v2.id, interview.id],
    );
    return v2;
  });
}

// --- Resume copy -----------------------------------------------------------

export async function saveResumeText(id: string, text: string) {
  await query(`UPDATE interviews SET resume_text=$2, updated_at=now() WHERE id=$1`, [id, text]);
}

export async function recopyResume(interview: InterviewRow): Promise<string> {
  if (!interview.resume_id) throw new BadRequestError("No linked resume");
  const { rows } = await query<{ content: string }>(`SELECT content FROM resumes WHERE id=$1`, [interview.resume_id]);
  const qa = await query(`SELECT question, answer FROM resume_qa WHERE resume_id=$1 ORDER BY sort_order, created_at`, [interview.resume_id]);
  const content = rows[0]?.content ?? "";
  await query(`UPDATE interviews SET resume_text=$2, qa_snapshot=$3, resume_copied_at=now(), updated_at=now() WHERE id=$1`,
    [interview.id, content, JSON.stringify(qa.rows)]);
  return content;
}

export async function saveBackResume(interview: InterviewRow) {
  if (!interview.resume_id) throw new BadRequestError("No linked resume");
  if (interview.resume_text == null) throw new BadRequestError("No copy to save back");
  await query(`UPDATE resumes SET content=$2, updated_at=now() WHERE id=$1`, [interview.resume_id, interview.resume_text]);
}

// --- Prep pack & summary ---------------------------------------------------

export async function generatePrepPack(interview: InterviewRow): Promise<string> {
  const ctx = await interviewContext(interview);
  let text: string;
  try {
    text = await complete({
      userId: interview.owner_id,
      model: interview.model,
      maxTokens: 4000,
      system: systemBlocks(ctx),
      messages: [{ role: "user", content:
        "Produce a preparation pack for this interview: list the 8-12 most likely questions, " +
        "each with a concise draft answer grounded in the resume. Group by theme. Markdown." }],
    });
  } catch (err) {
    if (err instanceof UpstreamAIError) throw new UpstreamAIError("Could not generate the prep pack");
    throw err;
  }
  await query(`UPDATE interviews SET prep_pack=$2, updated_at=now() WHERE id=$1`, [interview.id, text]);
  return text;
}

export async function generateSummary(interviewId: string): Promise<string | null> {
  const interview = await loadInterview(interviewId);
  if (!interview) return null;
  const history = await buildHistory(interview);
  if (history.length === 0) return null;
  const ctx = await interviewContext(interview);
  let text: string;
  try {
    text = await complete({
      userId: interview.owner_id,
      model: interview.model,
      maxTokens: 2000,
      system: systemBlocks(ctx),
      messages: [...history, { role: "user", content:
        "The interview is over. Summarise it: questions asked, how they were answered, weak spots, " +
        "and likely follow-ups for next time. Markdown." }],
    });
  } catch (err) {
    if (err instanceof UpstreamAIError) throw new UpstreamAIError("Could not generate the summary");
    throw err;
  }
  await query(`UPDATE interviews SET summary=$2, updated_at=now() WHERE id=$1`, [interviewId, text]);
  broadcast(interviewId, "summary", { summary: text });
  return text;
}

// Prime the prompt cache for the interview's model and the fast model, so the
// first live answer is quick. Best-effort.
export async function warmCaches(interview: InterviewRow) {
  const ctx = await interviewContext(interview);
  const system = systemBlocks(ctx);
  await Promise.allSettled([
    warmModel(interview.owner_id, interview.model, system),
    warmModel(interview.owner_id, "claude-haiku-5-5", system),
  ]);
}

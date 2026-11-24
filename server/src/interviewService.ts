import type Anthropic from "@anthropic-ai/sdk";
import { query } from "./db.js";
import type { InterviewRow } from "./domain.js";
import type { QAItem } from "./prompt.js";

export async function loadInterview(id: string): Promise<InterviewRow | null> {
  const { rows } = await query<InterviewRow>(`SELECT * FROM interviews WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// The resume text the answers are based on: the interview's own copy once
// started, otherwise the linked master resume.
export async function effectiveResumeText(interview: InterviewRow): Promise<string> {
  if (interview.resume_text != null) return interview.resume_text;
  if (interview.resume_id) {
    const { rows } = await query<{ content: string }>(
      `SELECT content FROM resumes WHERE id = $1`,
      [interview.resume_id],
    );
    return rows[0]?.content ?? "";
  }
  return "";
}

// The prepared Q&A: the interview's snapshot once started, otherwise the
// linked resume's current list.
export async function effectiveQA(interview: InterviewRow): Promise<QAItem[]> {
  if (interview.qa_snapshot != null) return interview.qa_snapshot;
  if (interview.resume_id) {
    const { rows } = await query<QAItem>(
      `SELECT question, answer FROM resume_qa WHERE resume_id = $1 ORDER BY sort_order, created_at`,
      [interview.resume_id],
    );
    return rows;
  }
  return [];
}

// The previous version's summary, if this interview carries it over.
export async function previousSummary(interview: InterviewRow): Promise<string | null> {
  if (!interview.carry_summary || !interview.parent_id) return null;
  const { rows } = await query<{ summary: string | null }>(
    `SELECT summary FROM interviews WHERE id = $1`,
    [interview.parent_id],
  );
  return rows[0]?.summary ?? null;
}

// Build the message history for a request: optional rolled-up summary of early
// turns, then the recent question/answer turns verbatim. Notes are excluded —
// they are manager-to-candidate only and never sent to the model.
export async function buildHistory(interview: InterviewRow): Promise<Anthropic.MessageParam[]> {
  const messages: Anthropic.MessageParam[] = [];

  if (interview.history_summary) {
    messages.push({
      role: "user",
      content: `[Earlier in this interview, summarised]\n${interview.history_summary}`,
    });
    messages.push({ role: "assistant", content: "Understood, continuing." });
  }

  const afterClause = interview.history_summary_upto
    ? `AND created_at > (SELECT created_at FROM interview_messages WHERE id = $2)`
    : "";
  const params: unknown[] = [interview.id];
  if (interview.history_summary_upto) params.push(interview.history_summary_upto);

  const { rows } = await query<{ role: string; kind: string; quick: string | null; content: string }>(
    `SELECT role, kind, quick, content FROM interview_messages
      WHERE interview_id = $1 AND kind IN ('question', 'answer') ${afterClause}
      ORDER BY created_at ASC`,
    params,
  );

  for (const r of rows) {
    if (r.role === "user") {
      messages.push({ role: "user", content: r.content });
    } else {
      const answer = [r.quick, r.content].filter(Boolean).join("\n").trim();
      if (answer) messages.push({ role: "assistant", content: answer });
    }
  }
  return messages;
}

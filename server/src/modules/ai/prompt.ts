import type Anthropic from "@anthropic-ai/sdk";
import type { InterviewRow } from "../../common/types.js";

export interface QAItem {
  question: string;
  answer: string;
}

const BASE_BEHAVIOUR = `You are a real-time interview assistant. You answer AS THE CANDIDATE, in the first person, as if the candidate is speaking to the interviewer.

Rules:
- Ground every answer in the candidate's resume below. Never invent experience, employers, dates, or metrics that are not supported by the resume or the prepared answers.
- First check the PREPARED ANSWERS section. If the interviewer's question matches one of those questions in meaning (any wording), use that prepared answer as the basis of your response.
- For behavioural questions, structure the answer with STAR (Situation, Task, Action, Result) but keep it natural and spoken.
- Be specific and concrete. Prefer real detail from the resume over generic claims.
- Answer in the configured answer language regardless of the language the question is typed in.`;

function section(title: string, body: string | null | undefined): string {
  const text = (body ?? "").trim();
  return text ? `\n\n## ${title}\n${text}` : "";
}

function qaSection(qa: QAItem[] | null | undefined): string {
  const items = (qa ?? []).filter((q) => q.answer.trim());
  if (items.length === 0) return "";
  const body = items
    .map((q, i) => `${i + 1}. Q: ${q.question}\n   A: ${q.answer.trim()}`)
    .join("\n");
  return `\n\n## PREPARED ANSWERS (check these first)\n${body}`;
}

// The cached system block. Identical across every turn of an interview, so it
// is read from cache after the first request (1h TTL covers gaps between
// questions). Changing the resume copy or prompt rebuilds it once.
export function systemBlocks(args: {
  interview: InterviewRow;
  resumeText: string;
  qa: QAItem[];
  previousSummary?: string | null;
}): Anthropic.MessageCreateParams["system"] {
  const { interview, resumeText, qa, previousSummary } = args;

  const meta = [
    `Job title: ${interview.job_title}`,
    interview.company ? `Company: ${interview.company}` : "",
    `Interview type: ${interview.interview_type}`,
    interview.interviewers ? `Interviewers: ${interview.interviewers}` : "",
    `Answer language: ${interview.answer_language}`,
  ]
    .filter(Boolean)
    .join("\n");

  const text =
    BASE_BEHAVIOUR +
    section("INTERVIEW INSTRUCTIONS", interview.system_prompt) +
    section("ROLE DETAILS", meta) +
    section("JOB DESCRIPTION", interview.job_description) +
    section("COMPANY NOTES", interview.company_notes) +
    section("CANDIDATE RESUME", resumeText) +
    qaSection(qa) +
    section("PREVIOUS INTERVIEW SUMMARY", previousSummary);

  return [{ type: "text", text, cache_control: { type: "ephemeral", ttl: "1h" } }];
}

// The single instruction for the candidate's answer. Appended to the question
// turn; the "answer as the candidate" behaviour and grounding rules come from
// the cached system block.
export function answerInstruction(interviewType: string): string {
  const base =
    `Answer AS THE CANDIDATE, in the first person, ready to say out loud. ` +
    `Lead with the direct answer, grounded in the resume and prepared answers — never invent facts. `;
  if (interviewType === "technical") {
    return (
      base +
      `For a coding or system-design question: one-line approach, then the solution (code in a fenced block if needed), then time/space complexity, then edge cases.`
    );
  }
  return (
    base +
    `Keep it concise and natural — a few spoken sentences (STAR for behavioural questions), with a concrete example from the resume where it fits.`
  );
}

const ACTION_INSTRUCTIONS: Record<string, string> = {
  shorter: "Give a shorter version of the previous answer — the essentials only, spoken in under 20 seconds.",
  detail: "Expand the previous answer with more depth and a concrete example from the resume.",
  example: "Give a specific concrete example from the resume that supports the previous answer, in STAR form.",
  star: "Re-cast the previous answer in explicit STAR form: Situation, Task, Action, Result.",
};

export function actionInstruction(action: string): string {
  return ACTION_INSTRUCTIONS[action] ?? "";
}

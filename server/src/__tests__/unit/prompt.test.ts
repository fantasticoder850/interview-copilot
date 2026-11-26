import { describe, expect, it } from "vitest";
import type { InterviewRow } from "../../common/types.js";
import {
  actionInstruction,
  answerInstruction,
  systemBlocks,
} from "../../modules/ai/prompt.js";

function fixture(over: Partial<InterviewRow> = {}): InterviewRow {
  return {
    id: "i1", owner_id: "o1", parent_id: null, version: 1,
    job_title: "Backend Engineer", job_description: "Build APIs", system_prompt: "Be concise",
    resume_id: "r1", resume_text: null, qa_snapshot: null, resume_copied_at: null,
    interview_type: "intro", interviewers: "Alex", company: "Acme", company_notes: null,
    answer_language: "English", status: "interviewing", model: "claude-opus-5-5",
    prep_pack: null, summary: null, carry_summary: false, history_summary: null,
    history_summary_upto: null, started_at: null, ended_at: null,
    created_at: "", updated_at: "", ...over,
  };
}

function text(blocks: ReturnType<typeof systemBlocks>): string {
  return (blocks as any)[0].text as string;
}

describe("systemBlocks", () => {
  it("returns a single cache-controlled block", () => {
    const blocks = systemBlocks({ interview: fixture(), resumeText: "RESUME", qa: [] }) as any[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("includes job title, company, resume and system prompt", () => {
    const t = text(systemBlocks({ interview: fixture(), resumeText: "MY RESUME TEXT", qa: [] }));
    expect(t).toContain("Backend Engineer");
    expect(t).toContain("Acme");
    expect(t).toContain("MY RESUME TEXT");
    expect(t).toContain("Be concise");
    expect(t).toContain("Build APIs");
  });

  it("includes only prepared answers that have an answer", () => {
    const t = text(systemBlocks({
      interview: fixture(), resumeText: "x",
      qa: [{ question: "Salary?", answer: "120k" }, { question: "Notice?", answer: "" }],
    }));
    expect(t).toContain("PREPARED ANSWERS");
    expect(t).toContain("Salary?");
    expect(t).toContain("120k");
    expect(t).not.toContain("Notice?");
  });

  it("omits empty sections", () => {
    const t = text(systemBlocks({
      interview: fixture({ job_description: null, company_notes: null, system_prompt: "" }),
      resumeText: "x", qa: [],
    }));
    expect(t).not.toContain("JOB DESCRIPTION");
    expect(t).not.toContain("COMPANY NOTES");
    expect(t).not.toContain("INTERVIEW INSTRUCTIONS");
  });

  it("includes the previous summary only when provided", () => {
    const withSummary = text(systemBlocks({ interview: fixture(), resumeText: "x", qa: [], previousSummary: "DID WELL" }));
    expect(withSummary).toContain("PREVIOUS INTERVIEW SUMMARY");
    expect(withSummary).toContain("DID WELL");
    const without = text(systemBlocks({ interview: fixture(), resumeText: "x", qa: [] }));
    expect(without).not.toContain("PREVIOUS INTERVIEW SUMMARY");
  });
});

describe("instructions", () => {
  it("answer instruction is first-person and resume-grounded", () => {
    expect(answerInstruction("intro")).toMatch(/candidate/i);
    expect(answerInstruction("intro")).toMatch(/resume/i);
  });

  it("answer instruction differs by interview type", () => {
    expect(answerInstruction("technical")).toMatch(/complexity/i);
    expect(answerInstruction("intro")).toMatch(/concise|STAR/i);
  });

  it("action instruction maps known actions and ignores unknown", () => {
    expect(actionInstruction("star")).toMatch(/STAR/);
    expect(actionInstruction("shorter").length).toBeGreaterThan(0);
    expect(actionInstruction("bogus")).toBe("");
  });
});

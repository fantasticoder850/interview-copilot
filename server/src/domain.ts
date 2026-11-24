export type Role = "admin" | "manager" | "candidate";
export type UserStatus = "pending" | "approved" | "rejected" | "disabled";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  requested_role: "manager" | "candidate" | null;
  status: UserStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface InterviewRow {
  id: string;
  owner_id: string;
  parent_id: string | null;
  version: number;
  job_title: string;
  job_description: string | null;
  system_prompt: string;
  resume_id: string | null;
  resume_text: string | null;
  qa_snapshot: { question: string; answer: string }[] | null;
  resume_copied_at: string | null;
  interview_type: "intro" | "technical";
  interviewers: string;
  company: string;
  company_notes: string | null;
  answer_language: string;
  status: "scheduled" | "interviewing" | "ended";
  model: string;
  prep_pack: string | null;
  summary: string | null;
  carry_summary: boolean;
  history_summary: string | null;
  history_summary_upto: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

// Shape returned to the client for a user (never the password hash).
export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    requested_role: u.requested_role,
    status: u.status,
    created_at: u.created_at,
  };
}

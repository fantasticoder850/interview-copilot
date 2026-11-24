export type Role = "admin" | "manager" | "viewer";
export type UserStatus = "pending" | "approved" | "rejected" | "disabled";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  requested_role: "manager" | "viewer" | null;
  status: UserStatus;
  created_at: string;
}

export interface AdminUser extends CurrentUser {
  managerIds: string[];
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface Model {
  id: string;
  label: string;
  description: string;
}

export interface QA {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export interface ResumeSummary {
  id: string;
  owner_id: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Resume extends ResumeSummary {
  content: string;
  qa: QA[];
}

export type InterviewStatus = "scheduled" | "interviewing" | "ended";
export type InterviewType = "intro" | "technical";

export interface InterviewSummary {
  id: string;
  job_title: string;
  company: string;
  status: InterviewStatus;
  interview_type: InterviewType;
  model: string;
  version: number;
  parent_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface Interview extends InterviewSummary {
  owner_id: string;
  job_description: string | null;
  system_prompt: string;
  resume_id: string | null;
  resume_text: string | null;
  interviewers: string;
  company_notes: string | null;
  answer_language: string;
  prep_pack: string | null;
  summary: string | null;
  viewers: Person[];
  canManage: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  kind: "question" | "answer" | "note";
  image_id: string | null;
  quick: string | null;
  content: string;
  qa_ref: string | null;
  follow_ups: string[] | null;
  author_id: string | null;
  action: string | null;
  model: string | null;
  state: "complete" | "streaming" | "stopped" | "error";
  created_at: string;
}

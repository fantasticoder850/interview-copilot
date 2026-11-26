import type {
  AdminUser,
  CurrentUser,
  Interview,
  InterviewSummary,
  Message,
  Model,
  Person,
  Resume,
  ResumeSummary,
  SystemPrompt,
} from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  // auth
  me: () => req<{ user: CurrentUser }>("/auth/me").then((r) => r.user),
  login: (email: string, password: string) =>
    req<{ user: CurrentUser }>("/auth/login", { method: "POST", body: body({ email, password }) }).then((r) => r.user),
  register: (data: { name: string; email: string; password: string; requestedRole: string }) =>
    req<{ ok: boolean; message: string }>("/auth/register", { method: "POST", body: body(data) }),
  logout: () => req("/auth/logout", { method: "POST" }),
  updateAccount: (data: { name?: string; email?: string; password?: string; currentPassword?: string }) =>
    req<{ user: CurrentUser }>("/auth/me", { method: "PATCH", body: body(data) }).then((r) => r.user),
  getApiKey: () => req<{ hasKey: boolean; last4: string | null }>("/auth/api-key"),
  setApiKey: (apiKey: string) => req<{ hasKey: boolean; last4: string | null }>("/auth/api-key", { method: "PUT", body: body({ apiKey }) }),
  clearApiKey: () => req<{ hasKey: boolean; last4: string | null }>("/auth/api-key", { method: "DELETE" }),

  // admin
  adminUsers: () => req<AdminUser[]>("/admin/users"),
  patchUser: (id: string, patch: { status?: string; role?: string; password?: string }) =>
    req<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: body(patch) }),
  setCandidateManagers: (candidateId: string, managerIds: string[]) =>
    req(`/admin/candidates/${candidateId}/managers`, { method: "PUT", body: body({ managerIds }) }),
  deleteUser: (id: string) => req(`/admin/users/${id}`, { method: "DELETE" }),

  // people
  candidates: () => req<Person[]>("/candidates"),
  models: () => req<Model[]>("/models"),

  // system prompts (personal library)
  systemPrompts: () => req<SystemPrompt[]>("/system-prompts"),
  createSystemPrompt: (data: { name: string; content: string }) =>
    req<SystemPrompt>("/system-prompts", { method: "POST", body: body(data) }),
  updateSystemPrompt: (id: string, data: Partial<{ name: string; content: string }>) =>
    req<SystemPrompt>(`/system-prompts/${id}`, { method: "PATCH", body: body(data) }),
  deleteSystemPrompt: (id: string) => req(`/system-prompts/${id}`, { method: "DELETE" }),

  // resumes
  resumes: () => req<ResumeSummary[]>("/resumes"),
  resumeTemplate: () => req<{ template: string; starterQuestions: string[] }>("/resumes/template"),
  resume: (id: string) => req<Resume>(`/resumes/${id}`),
  createResume: (data: { name: string; role: string; content: string }) =>
    req<Resume>("/resumes", { method: "POST", body: body(data) }),
  updateResume: (id: string, data: Partial<{ name: string; role: string; content: string }>) =>
    req<Resume>(`/resumes/${id}`, { method: "PATCH", body: body(data) }),
  deleteResume: (id: string) => req(`/resumes/${id}`, { method: "DELETE" }),
  parseResume: (form: FormData) => req<{ content: string }>("/resumes/parse", { method: "POST", body: form }),

  // qa
  addQA: (resumeId: string, q: { question: string; answer: string }) =>
    req(`/resumes/${resumeId}/qa`, { method: "POST", body: body(q) }),
  updateQA: (resumeId: string, qaId: string, q: Partial<{ question: string; answer: string; sortOrder: number }>) =>
    req(`/resumes/${resumeId}/qa/${qaId}`, { method: "PATCH", body: body(q) }),
  deleteQA: (resumeId: string, qaId: string) => req(`/resumes/${resumeId}/qa/${qaId}`, { method: "DELETE" }),
  draftQA: (resumeId: string, question: string) =>
    req<{ answer: string }>(`/resumes/${resumeId}/qa/draft`, { method: "POST", body: body({ question }) }),

  // interviews
  interviews: () => req<InterviewSummary[]>("/interviews"),
  interview: (id: string) => req<Interview>(`/interviews/${id}`),
  createInterview: (data: Record<string, unknown>) => req<Interview>("/interviews", { method: "POST", body: body(data) }),
  updateInterview: (id: string, data: Record<string, unknown>) =>
    req<Interview>(`/interviews/${id}`, { method: "PATCH", body: body(data) }),
  deleteInterview: (id: string) => req(`/interviews/${id}`, { method: "DELETE" }),
  setStatus: (id: string, status: string) => req<Interview>(`/interviews/${id}/status`, { method: "POST", body: body({ status }) }),
  newVersion: (id: string, carrySummary: boolean) =>
    req<Interview>(`/interviews/${id}/new-version`, { method: "POST", body: body({ carrySummary }) }),
  editInterviewResume: (id: string, text: string) => req(`/interviews/${id}/resume`, { method: "PUT", body: body({ text }) }),
  recopyResume: (id: string) => req<{ content: string }>(`/interviews/${id}/resume/recopy`, { method: "POST" }),
  saveBackResume: (id: string) => req(`/interviews/${id}/resume/save-back`, { method: "POST" }),
  prepPack: (id: string) => req<{ prep_pack: string }>(`/interviews/${id}/prep-pack`, { method: "POST" }),
  summary: (id: string) => req<{ summary: string }>(`/interviews/${id}/summary`, { method: "POST" }),

  // room
  messages: (id: string) => req<Message[]>(`/interviews/${id}/messages`),
  ask: (id: string, form: FormData) => req<{ questionId: string }>(`/interviews/${id}/messages`, { method: "POST", body: form }),
  note: (id: string, content: string) => req(`/interviews/${id}/notes`, { method: "POST", body: body({ content }) }),
  stop: (id: string) => req(`/interviews/${id}/stop`, { method: "POST" }),
  saveAnswerToQA: (id: string, msgId: string, question: string) =>
    req(`/interviews/${id}/messages/${msgId}/save-qa`, { method: "POST", body: body({ question }) }),
};

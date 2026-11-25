import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { PageHeader } from "../components/PageHeader";
import type { Model, Person, ResumeSummary } from "../types";

const EMPTY = {
  jobTitle: "", jobDescription: "", systemPrompt: "", resumeId: "",
  interviewType: "intro", interviewers: "", company: "", companyNotes: "",
  answerLanguage: "English", model: "claude-opus-5-5", candidateIds: [] as string[],
};

export function InterviewForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const nav = useNavigate();

  const [form, setForm] = useState({ ...EMPTY });
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.candidates().then(setCandidates).catch(() => {});
    api.resumes().then(setResumes).catch(() => {});
    api.models().then(setModels).catch(() => {});
    if (!isNew) {
      api.interview(id!).then((i) => setForm({
        jobTitle: i.job_title, jobDescription: i.job_description ?? "", systemPrompt: i.system_prompt,
        resumeId: i.resume_id ?? "", interviewType: i.interview_type, interviewers: i.interviewers,
        company: i.company, companyNotes: i.company_notes ?? "", answerLanguage: i.answer_language,
        model: i.model, candidateIds: i.candidates.map((v) => v.id),
      })).catch((e) => setError(e.message));
    }
  }, [id]);

  async function save() {
    setBusy(true); setError(null);
    const payload = { ...form, resumeId: form.resumeId || null, jobDescription: form.jobDescription || null, companyNotes: form.companyNotes || null };
    try {
      const saved = isNew ? await api.createInterview(payload) : await api.updateInterview(id!, payload);
      nav(`/interviews/${saved.id}/room`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHeader
        title={isNew ? "Interview setup" : "Edit interview"}
        subtitle="Create or edit a rehearsal or authorized session."
        actions={<button className="btn-ghost" onClick={() => nav("/interviews")}>← Back</button>}
      />
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-head"><h2>Session details</h2></div>

        <div className="form-grid">
          <label>Job title *<input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></label>
          <label>Company<input value={form.company} onChange={(e) => set("company", e.target.value)} /></label>

          <label>Interviewers<input value={form.interviewers} onChange={(e) => set("interviewers", e.target.value)} placeholder="Names / roles" /></label>
          <label>Type
            <select value={form.interviewType} onChange={(e) => set("interviewType", e.target.value)}>
              <option value="intro">Intro</option>
              <option value="technical">Technical</option>
            </select>
          </label>

          <label>Resume
            <select value={form.resumeId} onChange={(e) => set("resumeId", e.target.value)}>
              <option value="">— none —</option>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.role ? ` (${r.role})` : ""}</option>)}
            </select>
          </label>
          <label>Model
            <select value={form.model} onChange={(e) => set("model", e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.description}</option>)}
            </select>
          </label>

          <label>Answer language<input value={form.answerLanguage} onChange={(e) => set("answerLanguage", e.target.value)} /></label>
          <label>Assigned candidates
            <MultiSelect
              options={candidates.map((v) => ({ id: v.id, label: v.name, sub: v.email }))}
              selected={form.candidateIds}
              onChange={(ids) => set("candidateIds", ids)}
              placeholder="Assign candidates…"
            />
          </label>

          <label>Company notes (product, values, interviewer backgrounds)<textarea rows={5} value={form.companyNotes} onChange={(e) => set("companyNotes", e.target.value)} /></label>
          <label>System prompt<textarea rows={5} value={form.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} placeholder="Extra instructions for how the assistant should answer" /></label>
        </div>

        <label style={{ marginTop: "var(--s4)" }}>Job description<textarea rows={5} value={form.jobDescription} onChange={(e) => set("jobDescription", e.target.value)} /></label>

        <p className="hint">The quick "say-now" line is equally fast on all models; the detailed answer starts soonest on Haiku, then Sonnet, then Opus. Verify latency with real measurements.</p>

        <div className="form-actions">
          <button className="primary" disabled={busy || !form.jobTitle.trim()} onClick={save}>{busy ? "Saving…" : isNew ? "Create session" : "Save setup"}</button>
          <button className="btn-ghost" onClick={() => nav("/interviews")}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { api } from "../api";
import type { QA } from "../types";

interface Props {
  resumeId: string;
  qa: QA[];
  starterQuestions: string[];
  onChange: () => void;
}

export function ResumeQA({ resumeId, qa, starterQuestions, onChange }: Props) {
  const [adding, setAdding] = useState({ question: "", answer: "" });
  const [busy, setBusy] = useState(false);
  const [draftingIds, setDraftingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const existing = new Set(qa.map((q) => q.question.toLowerCase()));
  const remainingStarters = starterQuestions.filter((q) => !existing.has(q.toLowerCase()));

  async function add(question: string, answer = "") {
    if (!question.trim()) return;
    setBusy(true); setError(null);
    try { await api.addQA(resumeId, { question, answer }); setAdding({ question: "", answer: "" }); onChange(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function update(id: string, patch: Partial<{ question: string; answer: string }>) {
    try { await api.updateQA(resumeId, id, patch); onChange(); } catch (e: any) { setError(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this prepared answer?")) return;
    try { await api.deleteQA(resumeId, id); onChange(); } catch (e: any) { setError(e.message); }
  }
  async function draft(id: string, question: string) {
    setDraftingIds((s) => new Set(s).add(id)); setError(null);
    try { const { answer } = await api.draftQA(resumeId, question); await update(id, { answer }); }
    catch (e: any) { setError(e.message); }
    finally { setDraftingIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }

  return (
    <div className="qa-tab">
      <p className="muted small" style={{ marginBottom: "var(--s3)" }}>
        During an interview, questions are checked against these prepared answers first.
      </p>
      {error && <div className="error-banner">{error}</div>}

      {remainingStarters.length > 0 && (
        <div className="starters">
          <span className="muted small">Add a common question:</span>
          {remainingStarters.map((q) => (
            <button key={q} className="chip" disabled={busy} onClick={() => add(q)}>+ {q}</button>
          ))}
        </div>
      )}

      <div className="qa-list">
        {qa.length === 0 && remainingStarters.length === 0 && <p className="muted small">No prepared answers yet.</p>}
        {qa.map((item) => (
          <div key={item.id} className="qa-item">
            <input
              className="qa-q"
              defaultValue={item.question}
              onBlur={(e) => e.target.value !== item.question && update(item.id, { question: e.target.value })}
            />
            <textarea
              key={`a:${item.id}:${item.answer}`}
              className="qa-a"
              placeholder="Answer…"
              defaultValue={item.answer}
              onBlur={(e) => e.target.value !== item.answer && update(item.id, { answer: e.target.value })}
            />
            <div className="qa-actions">
              <button className="btn-sm" disabled={draftingIds.has(item.id)} onClick={() => draft(item.id, item.question)}>
                {draftingIds.has(item.id) ? <><span className="spinner-inline" /> Drafting…</> : "Draft from resume"}
              </button>
              <button className="btn-sm btn-danger" disabled={draftingIds.has(item.id)} onClick={() => remove(item.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className="qa-add">
        <input
          placeholder="New question"
          value={adding.question}
          onChange={(e) => setAdding((a) => ({ ...a, question: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") add(adding.question, adding.answer); }}
        />
        <button className="primary" disabled={busy || !adding.question.trim()} onClick={() => add(adding.question, adding.answer)}>Add</button>
      </div>
    </div>
  );
}

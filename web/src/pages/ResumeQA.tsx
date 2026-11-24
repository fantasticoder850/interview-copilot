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
    try { await api.deleteQA(resumeId, id); onChange(); } catch (e: any) { setError(e.message); }
  }
  async function draft(id: string, question: string) {
    try { const { answer } = await api.draftQA(resumeId, question); await update(id, { answer }); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <div className="qa-tab">
      <p className="muted">
        Prepared answers for common questions. During an interview, questions are checked against these first.
      </p>
      {error && <div className="error-banner">{error}</div>}

      {remainingStarters.length > 0 && (
        <div className="starters">
          <span className="muted">Add a common question:</span>
          {remainingStarters.map((q) => (
            <button key={q} className="chip" disabled={busy} onClick={() => add(q)}>+ {q}</button>
          ))}
        </div>
      )}

      <div className="qa-list">
        {qa.map((item) => (
          <div key={item.id} className="qa-item">
            <input
              className="qa-q"
              defaultValue={item.question}
              onBlur={(e) => e.target.value !== item.question && update(item.id, { question: e.target.value })}
            />
            <textarea
              className="qa-a"
              placeholder="Answer…"
              defaultValue={item.answer}
              onBlur={(e) => e.target.value !== item.answer && update(item.id, { answer: e.target.value })}
            />
            <div className="qa-actions">
              <button onClick={() => draft(item.id, item.question)}>Draft from resume</button>
              <button onClick={() => remove(item.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className="qa-add">
        <input
          placeholder="New question"
          value={adding.question}
          onChange={(e) => setAdding((a) => ({ ...a, question: e.target.value }))}
        />
        <button disabled={busy || !adding.question.trim()} onClick={() => add(adding.question, adding.answer)}>Add</button>
      </div>
    </div>
  );
}

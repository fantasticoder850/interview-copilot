import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { ResumeQA } from "./ResumeQA";
import type { Resume } from "../types";

export function ResumeForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState("");
  const [starters, setStarters] = useState<string[]>([]);
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.resumeTemplate().then((t) => { setTemplate(t.template); setStarters(t.starterQuestions); }).catch(() => {});
    if (!isNew) {
      api.resume(id!).then((r) => { setResume(r); setName(r.name); setRole(r.role); setContent(r.content); }).catch((e) => setError(e.message));
    }
  }, [id]);

  const reloadQA = () => !isNew && api.resume(id!).then(setResume).catch(() => {});

  async function parseFile(file: File) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { content: parsed } = await api.parseResume(form);
      setContent(parsed);
      setNotice("Parsed into the standard structure. Review and save — the resume is stored as text; the PDF is not kept.");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      if (isNew) {
        const r = await api.createResume({ name, role, content });
        nav(`/resumes/${r.id}`);
      } else {
        await api.updateResume(id!, { name, role, content });
        setNotice("Saved.");
        reloadQA();
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const textPanel = (
    <section className="panel">
      <div className="panel-head">
        <h2>Resume text</h2>
        <button className="primary btn-sm" disabled={busy || !name.trim()} onClick={save}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</button>
      </div>
      <div className="row" style={{ marginBottom: "var(--s4)" }}>
        <button type="button" onClick={() => setContent(template)}>Insert template</button>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Parsing…" : "Import PDF"}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" hidden
          onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
      </div>
      <textarea
        className="resume-text"
        value={content}
        placeholder={template}
        onChange={(e) => setContent(e.target.value)}
        rows={22}
      />
      <p className="hint">Review before saving. Stored as text only.</p>
    </section>
  );

  return (
    <div className="page">
      <PageHeader
        title={isNew ? "New resume" : "Resume editor"}
        subtitle="Review imported text and prepare verified answers."
        actions={<button className="btn-ghost" onClick={() => nav("/resumes")}>← Back</button>}
      />
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="form-row two" style={{ maxWidth: 640 }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Chen" /></label>
        <label>Role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" /></label>
      </div>

      {isNew ? (
        textPanel
      ) : (
        <div className="editor-layout">
          {textPanel}
          <aside className="panel qa-aside">
            <div className="panel-head"><h2>Prepared Q&amp;A</h2></div>
            {resume
              ? <ResumeQA resumeId={resume.id} qa={resume.qa} starterQuestions={starters} onChange={reloadQA} />
              : <p className="muted">Loading…</p>}
          </aside>
        </div>
      )}
    </div>
  );
}

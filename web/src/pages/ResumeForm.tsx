import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
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
  const [tab, setTab] = useState<"text" | "qa">("text");
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

  return (
    <div className="page">
      <div className="page-head">
        <h1>{isNew ? "New resume" : name || "Resume"}</h1>
        <button onClick={() => nav("/resumes")}>Back</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="form-row two">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" /></label>
      </div>

      {!isNew && (
        <div className="tabs">
          <button className={tab === "text" ? "active" : ""} onClick={() => setTab("text")}>Resume text</button>
          <button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}>Basic Information</button>
        </div>
      )}

      {(isNew || tab === "text") && (
        <>
          <div className="form-actions">
            <button type="button" onClick={() => setContent(template)}>Insert template</button>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Parsing…" : "Import from PDF"}
            </button>
            <input ref={fileRef} type="file" accept="application/pdf" hidden
              onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
          </div>
          <textarea
            className="resume-text"
            value={content}
            placeholder={template}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
          />
        </>
      )}

      {!isNew && tab === "qa" && resume && (
        <ResumeQA resumeId={resume.id} qa={resume.qa} starterQuestions={starters} onChange={reloadQA} />
      )}

      <div className="form-actions">
        <button disabled={busy || !name.trim()} onClick={save}>{isNew ? "Create" : "Save"}</button>
      </div>
    </div>
  );
}

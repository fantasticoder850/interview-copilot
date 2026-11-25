import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { MessageBubble } from "../components/MessageBubble";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import { connectRoom, type RoomEvent } from "../realtime";
import type { Interview, Message } from "../types";

type AsideTab = "resume" | "prep" | "summary";

export function InterviewRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [presence, setPresence] = useState(0);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<AsideTab>("resume");
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [noteText, setNoteText] = useState("");
  const [readOnly, setReadOnly] = useState(() => localStorage.getItem(`ro:${id}`) !== "false");
  const [readerScale, setReaderScale] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastQuestionRef = useRef<string>("");

  const canManage = interview?.canManage ?? false;
  const isCandidate = user?.role === "candidate";

  const refetch = useCallback(async () => {
    if (!id) return;
    const [iv, msgs] = await Promise.all([api.interview(id), api.messages(id)]);
    setInterview(iv);
    setMessages(msgs);
  }, [id]);

  useEffect(() => { refetch().catch((e) => setError(e.message)); }, [refetch]);

  // SSE
  useEffect(() => {
    if (!id) return;
    const disconnect = connectRoom(id, applyEvent, () => { refetch().catch(() => {}); }, setConnected);
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function patchMsg(messageId: string, fn: (m: Message) => Message) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? fn(m) : m)));
  }

  function applyEvent(e: RoomEvent) {
    switch (e.type) {
      case "snapshot":
        setPresence(e.presence);
        setInterview((iv) => (iv ? { ...iv, status: e.status as any } : iv));
        break;
      case "presence": setPresence(e.count); break;
      case "status": setInterview((iv) => (iv ? { ...iv, status: e.status as any } : iv)); break;
      case "question":
        setMessages((prev) => prev.some((m) => m.id === e.id) ? prev : [...prev, {
          id: e.id, role: "user", kind: "question", image_id: e.imageId, quick: null,
          content: e.content, qa_ref: null, follow_ups: null, author_id: e.authorId,
          action: e.action, model: null, state: "complete", created_at: e.created_at,
        }]);
        break;
      case "note":
        setMessages((prev) => prev.some((m) => m.id === e.id) ? prev : [...prev, {
          id: e.id, role: "user", kind: "note", image_id: null, quick: null, content: e.content,
          qa_ref: null, follow_ups: null, author_id: e.authorId, action: null, model: null,
          state: "complete", created_at: e.created_at,
        }]);
        break;
      case "answer_start":
        setStreamingId(e.messageId);
        setMessages((prev) => prev.some((m) => m.id === e.messageId) ? prev : [...prev, {
          id: e.messageId, role: "assistant", kind: "answer", image_id: null, quick: "", content: "",
          qa_ref: null, follow_ups: null, author_id: null, action: null, model: null,
          state: "streaming", created_at: new Date().toISOString(),
        }]);
        break;
      case "quick_delta": patchMsg(e.messageId, (m) => ({ ...m, quick: (m.quick ?? "") + e.text })); break;
      case "quick_done": patchMsg(e.messageId, (m) => ({ ...m, qa_ref: e.qaRef })); break;
      case "qa_match": patchMsg(e.messageId, (m) => ({ ...m, qa_ref: String(e.index) })); break;
      case "delta": patchMsg(e.messageId, (m) => ({ ...m, content: m.content + e.text })); break;
      case "answer_done":
        patchMsg(e.messageId, (m) => ({ ...m, state: "complete", qa_ref: e.qaRef ?? m.qa_ref }));
        setStreamingId((cur) => (cur === e.messageId ? null : cur));
        break;
      case "answer_error":
        if (e.messageId) patchMsg(e.messageId, (m) => ({ ...m, state: "error" }));
        setStreamingId(null);
        setError(e.message ?? "Generation error");
        break;
      case "follow_ups": patchMsg(e.messageId, (m) => ({ ...m, follow_ups: e.followUps })); break;
      case "summary": setInterview((iv) => (iv ? { ...iv, summary: e.summary } : iv)); break;
    }
  }

  // Auto-scroll unless the user has scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  function followLatest() {
    const el = scrollRef.current;
    if (el) { el.scrollTop = el.scrollHeight; pinnedRef.current = true; }
  }

  async function send() {
    if (!id || (!input.trim() && !image)) return;
    const q = input.trim();
    lastQuestionRef.current = q;
    const form = new FormData();
    form.append("content", q);
    if (image) form.append("image", image);
    setInput(""); setImage(null);
    try { await api.ask(id, form); } catch (e: any) { setError(e.message); }
  }
  async function shape(action: string) {
    if (!id) return;
    const form = new FormData();
    form.append("action", action);
    form.append("content", "");
    try { await api.ask(id, form); } catch (e: any) { setError(e.message); }
  }
  async function sendCoachNote() {
    if (!id || !noteText.trim()) return;
    const note = noteText.trim(); setNoteText("");
    try { await api.note(id, note); } catch (e: any) { setError(e.message); }
  }
  async function followUp(q: string) {
    if (!id) return;
    const form = new FormData();
    form.append("content", q);
    lastQuestionRef.current = q;
    try { await api.ask(id, form); } catch (e: any) { setError(e.message); }
  }
  async function saveQA(msg: Message) {
    if (!id) return;
    const question = prompt("Save under which question?", lastQuestionRef.current || "");
    if (!question) return;
    try { await api.saveAnswerToQA(id, msg.id, question); alert("Saved to Basic Information."); }
    catch (e: any) { setError(e.message); }
  }
  async function setStatus(status: string) {
    if (!id) return;
    try { setInterview(await api.setStatus(id, status)); } catch (e: any) { setError(e.message); }
  }
  function toggleReadOnly() {
    setReadOnly((v) => { localStorage.setItem(`ro:${id}`, String(!v)); return !v; });
  }
  async function newVersion() {
    if (!id) return;
    const carry = confirm("Carry over the previous interview's summary as context?");
    try { const v2 = await api.newVersion(id, carry); nav(`/interviews/${v2.id}/edit`); }
    catch (e: any) { setError(e.message); }
  }

  if (!interview) {
    return (
      <div className="loading-page">
        {error ? <div className="error-banner">{error}</div> : <><span className="spinner" /><span>Loading room…</span></>}
      </div>
    );
  }

  const composerVisible = canManage || (isCandidate && !readOnly);
  const sessionControls = canManage && (
    <div className="room-controls">
      {interview.status !== "interviewing" && (
        <button className="primary btn-sm" onClick={() => setStatus("interviewing")}>
          {interview.status === "ended" ? "Resume" : "Start session"}
        </button>
      )}
      {interview.status === "interviewing" && <button className="btn-sm" onClick={() => setStatus("ended")}>End session</button>}
      {interview.status === "ended" && <button className="btn-sm" onClick={newVersion}>New version</button>}
    </div>
  );

  const composer = composerVisible && (
    interview.status === "interviewing" ? (
      <div className="composer">
        <textarea
          rows={1} value={input} placeholder={canManage ? "Enter the interviewer's question…" : "Enter a practice question…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <label className="icon-btn img-btn" title="Attach screenshot">
          📎<input type="file" accept="image/*" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        </label>
        {image && <span className="img-name">{image.name}</span>}
        {streamingId
          ? <button className="stop-btn" onClick={() => id && api.stop(id)}>Stop</button>
          : <button className="primary" onClick={send} disabled={!input.trim() && !image}>Send</button>}
      </div>
    ) : (
      <div className="composer-hint">{canManage ? "Start the session to ask questions." : "Waiting for the interview to start."}</div>
    )
  );

  // ---- Candidate reader view ------------------------------------------------
  if (isCandidate && !canManage) {
    return (
      <div className="room">
        <header className="room-head">
          <button className="link-btn" onClick={() => nav("/interviews")}>← Interviews</button>
          <div className="room-title">
            {interview.job_title}{interview.company && <span className="muted"> · {interview.company}</span>}
          </div>
          <span className="spacer" />
          <span className={`connection ${connected ? "online" : "offline"}`}>{connected ? "Connected" : "Reconnecting…"}</span>
        </header>
        {error && <div style={{ padding: "0 var(--s5)" }}><div className="error-banner">{error}</div></div>}

        <div className="reader-wrap" ref={scrollRef} onScroll={onScroll} style={{ ["--reader-scale" as any]: readerScale }}>
          <div className="reader">
            <div className="reader-status">
              <StatusBadge status={interview.status} />
              <label className="row small" style={{ gap: 6, color: "var(--muted)" }}>
                <input type="checkbox" checked={readOnly} onChange={toggleReadOnly} style={{ width: "auto" }} /> Read-only
              </label>
            </div>

            {messages.length === 0 ? (
              <div className="reader-empty">
                <p>{interview.status === "interviewing" ? "Waiting for the first answer…" : "The interview hasn't started yet."}</p>
              </div>
            ) : (
              messages.map((m) => <ReaderMessage key={m.id} m={m} streaming={m.id === streamingId} />)
            )}

            <div className="reader-controls">
              <button className="btn-sm" aria-label="Decrease text size" onClick={() => setReaderScale((s) => Math.max(0.85, +(s - 0.1).toFixed(2)))}>A−</button>
              <button className="btn-sm" aria-label="Increase text size" onClick={() => setReaderScale((s) => Math.min(1.5, +(s + 0.1).toFixed(2)))}>A+</button>
              <button className="btn-sm btn-ghost" onClick={followLatest}>Follow latest</button>
            </div>
          </div>
        </div>

        {composer}
      </div>
    );
  }

  // ---- Manager / admin workspace -------------------------------------------
  return (
    <div className="room">
      <header className="room-head">
        <button className="link-btn" onClick={() => nav("/interviews")}>← Interviews</button>
        <div className="room-title">
          {interview.job_title}
          {interview.company && <span className="muted"> · {interview.company}</span>}
        </div>
        <span className="spacer" />
        <span className={`connection ${connected ? "online" : "offline"}`}>{connected ? "Live" : "Reconnecting…"}</span>
      </header>
      {error && <div style={{ padding: "0 var(--s6)" }}><div className="error-banner">{error}</div></div>}

      <div className="room-body">
        <section className="room-main">
          <div className="room-main-head">
            <StatusBadge status={interview.status} />
            <span className="muted small">v{interview.version}</span>
            <span className="presence">{presence} watching</span>
            <span className="spacer" />
            {sessionControls}
          </div>

          <div className="messages" ref={scrollRef} onScroll={onScroll}>
            {messages.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">💬</span>
                <p>No messages yet. {interview.status === "interviewing" ? "Ask the first question below." : "Start the session to begin."}</p>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id} message={m} interviewId={interview.id}
                streaming={m.id === streamingId}
                canManage={canManage}
                onShape={canManage ? shape : undefined}
                onSaveQA={canManage && interview.resume_id ? saveQA : undefined}
                onFollowUp={composerVisible ? followUp : undefined}
              />
            ))}
          </div>

          {composer}
        </section>

        <aside className="room-aside">
          <div className="aside-tabs">
            {(["resume", "prep", "summary"] as AsideTab[]).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "resume" ? "Resume" : t === "prep" ? "Prep pack" : "Summary"}
              </button>
            ))}
          </div>
          <div className="aside-body">
            {tab === "resume" && <ResumeTab interview={interview} onReload={refetch} />}
            {tab === "prep" && <GenTab kind="prep" interview={interview} onReload={refetch} />}
            {tab === "summary" && <GenTab kind="summary" interview={interview} onReload={refetch} />}
          </div>
          <div className="coach-note" style={{ borderTop: "1px solid var(--border)", padding: "var(--s4) var(--s5)" }}>
            <h3>Coach note</h3>
            <textarea rows={2} value={noteText} placeholder="Write feedback to candidates…" onChange={(e) => setNoteText(e.target.value)} />
            <button className="btn-sm" onClick={sendCoachNote} disabled={!noteText.trim()}>Save note</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReaderMessage({ m, streaming }: { m: Message; streaming: boolean }) {
  if (m.kind === "note") {
    return (
      <div className="row-msg note" style={{ marginBottom: "var(--s5)" }}>
        <div className="note-bubble"><span className="note-tag">Note</span> {m.content}</div>
      </div>
    );
  }
  if (m.role === "user") {
    return <div className="q-label" style={{ margin: "var(--s5) 0 var(--s3)", fontSize: 14 }}>Interviewer asked: <strong style={{ color: "var(--text)" }}>{m.content}</strong></div>;
  }
  return (
    <article className="reader-card" style={{ marginBottom: "var(--s5)" }}>
      {m.qa_ref != null && <span className="prepared-tag">Prepared answer</span>}
      {m.quick && <div className="opener">{m.quick}</div>}
      {m.content && <div className="detail"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
      {streaming && <span className="caret" />}
      {m.state === "stopped" && <div className="meta-note">Stopped</div>}
      {m.state === "error" && <div className="meta-note err">Generation error</div>}
    </article>
  );
}

function ResumeTab({ interview, onReload }: { interview: Interview; onReload: () => void }) {
  const [text, setText] = useState(interview.resume_text ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack">
      <p className="muted small">
        This interview's own copy of the resume. Edits affect the next answer only; the master resume is unchanged until you save back.
      </p>
      {msg && <div className="notice">{msg}</div>}
      <textarea className="resume-text" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button className="btn-sm primary" onClick={async () => { await api.editInterviewResume(interview.id, text); setMsg("Saved for this interview."); }}>Save copy</button>
        <button className="btn-sm" onClick={async () => { const r = await api.recopyResume(interview.id); setText(r.content); setMsg("Re-copied from master."); onReload(); }}>Re-copy</button>
        <button className="btn-sm" onClick={async () => { await api.saveBackResume(interview.id); setMsg("Saved back to master."); }}>Save back</button>
      </div>
    </div>
  );
}

function GenTab({ kind, interview, onReload }: { kind: "prep" | "summary"; interview: Interview; onReload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = kind === "prep" ? interview.prep_pack : interview.summary;
  const label = kind === "prep" ? "prep pack" : "summary";
  async function generate() {
    setBusy(true); setError(null);
    try { if (kind === "prep") await api.prepPack(interview.id); else await api.summary(interview.id); await onReload(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button className="btn-sm primary" disabled={busy} onClick={generate}>{busy ? "Generating…" : text ? `Regenerate ${label}` : `Generate ${label}`}</button>
      </div>
      {text ? <div className="markdown"><ReactMarkdown>{text}</ReactMarkdown></div> : <p className="muted small">Not generated yet.</p>}
    </div>
  );
}

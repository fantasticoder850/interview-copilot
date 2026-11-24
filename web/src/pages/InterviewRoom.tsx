import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { MessageBubble } from "../components/MessageBubble";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import { connectRoom, type RoomEvent } from "../realtime";
import type { Interview, Message } from "../types";

type Tab = "chat" | "resume" | "prep" | "summary";

export function InterviewRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [presence, setPresence] = useState(0);
  const [tab, setTab] = useState<Tab>("chat");
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [readOnly, setReadOnly] = useState(() => localStorage.getItem(`ro:${id}`) !== "false");

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastQuestionRef = useRef<string>("");

  const canManage = interview?.canManage ?? false;
  const isViewer = user?.role === "viewer";

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
    const disconnect = connectRoom(id, applyEvent, () => { refetch().catch(() => {}); });
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
  async function sendNote() {
    if (!id || !input.trim()) return;
    const note = input.trim(); setInput("");
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

  if (!interview) return <div className="page">{error ? <div className="error-banner">{error}</div> : "Loading…"}</div>;

  const composerVisible = canManage || (isViewer && !readOnly);

  return (
    <div className="room">
      <header className="room-head">
        <button className="link-btn" onClick={() => nav("/interviews")}>← Interviews</button>
        <div className="room-title">
          <strong>{interview.job_title}</strong>
          {interview.company && <span className="muted"> · {interview.company}</span>}
          <span className="muted"> · v{interview.version}</span>
        </div>
        <StatusBadge status={interview.status} />
        <span className="presence">{presence} watching</span>
        <span className="spacer" />
        {canManage && (
          <div className="room-controls">
            {interview.status !== "interviewing" && <button onClick={() => setStatus("interviewing")}>{interview.status === "ended" ? "Resume" : "Start"}</button>}
            {interview.status === "interviewing" && <button onClick={() => setStatus("ended")}>End</button>}
            {interview.status === "ended" && <button onClick={() => newVersion()}>New version</button>}
          </div>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}

      {canManage && (
        <div className="tabs">
          {(["chat", "resume", "prep", "summary"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      )}

      {tab === "chat" && (
        <>
          <div className="messages" ref={scrollRef} onScroll={onScroll}>
            {messages.length === 0 && <p className="muted center">No messages yet.</p>}
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

          {isViewer && (
            <div className="readonly-bar">
              <label><input type="checkbox" checked={readOnly} onChange={toggleReadOnly} /> Read-only</label>
            </div>
          )}

          {composerVisible && interview.status === "interviewing" && (
            <div className="composer">
              <textarea
                rows={1} value={input} placeholder="Type the interviewer's question…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <label className="img-btn" title="Attach screenshot">
                📎<input type="file" accept="image/*" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
              </label>
              {image && <span className="img-name">{image.name}</span>}
              <button onClick={send} disabled={!!streamingId}>Ask</button>
              {canManage && <button className="note-btn" onClick={sendNote} title="Send a note to viewers (no AI)">Note</button>}
              {streamingId && <button className="stop-btn" onClick={() => id && api.stop(id)}>Stop</button>}
            </div>
          )}
          {composerVisible && interview.status !== "interviewing" && (
            <div className="composer-hint">{canManage ? "Start the interview to ask questions." : "Waiting for the interview to start."}</div>
          )}
        </>
      )}

      {tab === "resume" && canManage && <ResumeTab interview={interview} onReload={refetch} />}
      {tab === "prep" && canManage && <GenTab kind="prep" interview={interview} onReload={refetch} />}
      {tab === "summary" && canManage && <GenTab kind="summary" interview={interview} onReload={refetch} />}
    </div>
  );

  async function newVersion() {
    if (!id) return;
    const carry = confirm("Carry over the previous interview's summary as context?");
    try { const v2 = await api.newVersion(id, carry); nav(`/interviews/${v2.id}/edit`); }
    catch (e: any) { setError(e.message); }
  }
}

function ResumeTab({ interview, onReload }: { interview: Interview; onReload: () => void }) {
  const [text, setText] = useState(interview.resume_text ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="tab-body">
      <p className="muted">
        This interview's own copy of the resume. Edits affect the next answer only; the master resume is unchanged
        until you save back.
      </p>
      {msg && <div className="notice">{msg}</div>}
      <textarea className="resume-text" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="form-actions">
        <button onClick={async () => { await api.editInterviewResume(interview.id, text); setMsg("Saved for this interview."); }}>Save copy</button>
        <button onClick={async () => { const r = await api.recopyResume(interview.id); setText(r.content); setMsg("Re-copied from Resume Management."); onReload(); }}>Re-copy from master</button>
        <button onClick={async () => { await api.saveBackResume(interview.id); setMsg("Saved back to Resume Management."); }}>Save back to master</button>
      </div>
    </div>
  );
}

function GenTab({ kind, interview, onReload }: { kind: "prep" | "summary"; interview: Interview; onReload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = kind === "prep" ? interview.prep_pack : interview.summary;
  async function generate() {
    setBusy(true); setError(null);
    try { if (kind === "prep") await api.prepPack(interview.id); else await api.summary(interview.id); await onReload(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="tab-body">
      {error && <div className="error-banner">{error}</div>}
      <div className="form-actions">
        <button disabled={busy} onClick={generate}>{busy ? "Generating…" : text ? `Regenerate ${kind}` : `Generate ${kind}`}</button>
      </div>
      {text ? <div className="markdown"><ReactMarkdown>{text}</ReactMarkdown></div> : <p className="muted">Not generated yet.</p>}
    </div>
  );
}

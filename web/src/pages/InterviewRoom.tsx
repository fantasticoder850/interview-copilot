import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { MessageBubble } from "../components/MessageBubble";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import { connectRoom, type RoomEvent } from "../realtime";
import type { Interview, Message, QA } from "../types";

type AsideTab = "resume" | "prep" | "summary" | "questions";
const ASIDE_TAB_LABELS: Record<AsideTab, string> = {
  resume: "Resume", prep: "Prep pack", summary: "Summary", questions: "Questions",
};

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
  const [coachH, setCoachH] = useState(180);
  const [spacerH, setSpacerH] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const lastQuestionRef = useRef<string>("");
  const asideRef = useRef<HTMLElement>(null);
  const pendingQRef = useRef<{ tempId: string; content: string }[]>([]);
  const anchorAnswerRef = useRef<string | null>(null);

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
      case "question": {
        // If we optimistically added this question ourselves, swap the temp row
        // for the real one instead of appending a duplicate.
        if (e.authorId === user?.id) {
          const idx = pendingQRef.current.findIndex((p) => p.content === e.content);
          if (idx !== -1) {
            const { tempId } = pendingQRef.current.splice(idx, 1)[0];
            setMessages((prev) => prev.map((m) =>
              m.id === tempId ? { ...m, id: e.id, image_id: e.imageId, action: e.action, created_at: e.created_at } : m));
            break;
          }
        }
        setMessages((prev) => prev.some((m) => m.id === e.id) ? prev : [...prev, {
          id: e.id, role: "user", kind: "question", image_id: e.imageId, quick: null,
          content: e.content, qa_ref: null, follow_ups: null, author_id: e.authorId,
          action: e.action, model: null, state: "complete", created_at: e.created_at,
        }]);
        break;
      }
      case "note":
        setMessages((prev) => prev.some((m) => m.id === e.id) ? prev : [...prev, {
          id: e.id, role: "user", kind: "note", image_id: null, quick: null, content: e.content,
          qa_ref: null, follow_ups: null, author_id: e.authorId, action: null, model: null,
          state: "complete", created_at: e.created_at,
        }]);
        break;
      case "answer_start":
        setStreamingId(e.messageId);
        // If we were following the latest, anchor the new answer's top under the
        // header and stop auto-following, so it reads from the top instead of the
        // view chasing its growing bottom. A trailing spacer gives the (last)
        // answer room to actually reach the top.
        if (pinnedRef.current) {
          anchorAnswerRef.current = e.messageId;
          setSpacerH(scrollRef.current?.clientHeight ?? 0);
        } else {
          anchorAnswerRef.current = null;
        }
        pinnedRef.current = false;
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

  // Auto-scroll to newest content ONLY while pinned to the bottom. The scroll we
  // trigger ourselves is flagged so it isn't mistaken for the user scrolling; a
  // scroll/wheel upward unpins and stays unpinned even while an answer streams,
  // so the reader can hold their place.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);
  // Anchor a newly-started answer so its top sits just under the header and then
  // holds still while it streams (set up in the answer_start handler). The
  // trailing spacer added there is removed once the answer finishes.
  useEffect(() => {
    if (!streamingId) { setSpacerH(0); return; }
    const target = anchorAnswerRef.current;
    if (!target) return;
    const scrollEl = scrollRef.current;
    const el = scrollEl?.querySelector<HTMLElement>(`[data-mid="${target}"]`);
    if (!scrollEl || !el) return;
    anchorAnswerRef.current = null;
    programmaticScrollRef.current = true;
    const top = el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    scrollEl.scrollTop = Math.max(0, top - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingId]);

  const lastScrollTopRef = useRef(0);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (programmaticScrollRef.current) { programmaticScrollRef.current = false; lastScrollTopRef.current = el.scrollTop; return; }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < lastScrollTopRef.current - 2) pinnedRef.current = false; // user scrolled up
    else if (atBottom) pinnedRef.current = true;
    lastScrollTopRef.current = el.scrollTop;
  }
  function onWheel(e: React.WheelEvent) { if (e.deltaY < 0) pinnedRef.current = false; }
  function followLatest() {
    const el = scrollRef.current;
    if (el) { programmaticScrollRef.current = true; el.scrollTop = el.scrollHeight; pinnedRef.current = true; }
  }

  // Show the question in the chat immediately, before the server round-trips.
  function optimisticQuestion(content: string): string {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pendingQRef.current.push({ tempId, content });
    pinnedRef.current = true; // jump to the newly asked question
    setMessages((prev) => [...prev, {
      id: tempId, role: "user", kind: "question", image_id: null, quick: null,
      content, qa_ref: null, follow_ups: null, author_id: user?.id ?? null,
      action: null, model: null, state: "complete", created_at: new Date().toISOString(),
    }]);
    return tempId;
  }
  function rollbackOptimistic(tempId: string | null) {
    if (!tempId) return;
    pendingQRef.current = pendingQRef.current.filter((p) => p.tempId !== tempId);
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }

  async function ask(content: string, imageFile?: File | null) {
    if (!id) return;
    const q = content.trim();
    if (!q && !imageFile) return;
    if (q) lastQuestionRef.current = q;
    const form = new FormData();
    form.append("content", q);
    if (imageFile) form.append("image", imageFile);
    const tempId = q ? optimisticQuestion(q) : null;
    try { await api.ask(id, form); }
    catch (e: any) { setError(e.message); rollbackOptimistic(tempId); }
  }

  async function send() {
    if (!input.trim() && !image) return;
    const q = input, img = image;
    setInput(""); setImage(null);
    await ask(q, img);
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
    await ask(q);
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
    try {
      // The status endpoint returns the raw interview row (no canManage /
      // candidates), so merge it into the loaded view rather than replacing it —
      // otherwise canManage is dropped and the composer + controls disappear.
      const updated = await api.setStatus(id, status);
      setInterview((iv) => (iv ? { ...iv, ...updated } : updated));
    } catch (e: any) { setError(e.message); }
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
  // Drag the divider between the tab content and the Coach note to resize them.
  function startCoachResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = coachH;
    const onMove = (ev: MouseEvent) => {
      const aside = asideRef.current;
      const maxH = aside ? aside.clientHeight - 170 : 520;
      setCoachH(Math.min(Math.max(startH + (startY - ev.clientY), 90), Math.max(120, maxH)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
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
          <StatusBadge status={interview.status} />
          <span className="spacer" />
          <span className={`connection ${connected ? "online" : "offline"}`}>{connected ? "Connected" : "Reconnecting…"}</span>
        </header>
        {error && <div style={{ padding: "0 var(--s5)" }}><div className="error-banner">{error}</div></div>}

        <div className="reader-wrap" ref={scrollRef} onScroll={onScroll} onWheel={onWheel} style={{ ["--reader-scale" as any]: readerScale }}>
          <div className="reader">
            {messages.length === 0 ? (
              <div className="reader-empty">
                <p>{interview.status === "interviewing" ? "Waiting for the first answer…" : "The interview hasn't started yet."}</p>
              </div>
            ) : (
              messages.map((m) => <ReaderMessage key={m.id} m={m} streaming={m.id === streamingId} />)
            )}
            <div aria-hidden style={{ height: spacerH }} />
          </div>
        </div>

        <div className="reader-controls">
          <button className="btn-sm" aria-label="Decrease text size" onClick={() => setReaderScale((s) => Math.max(0.85, +(s - 0.1).toFixed(2)))}>A−</button>
          <button className="btn-sm" aria-label="Increase text size" onClick={() => setReaderScale((s) => Math.min(1.5, +(s + 0.1).toFixed(2)))}>A+</button>
          <span className="spacer" />
          <button className={`btn-sm toggle-btn${readOnly ? " on" : ""}`} aria-pressed={readOnly} onClick={toggleReadOnly}>Read-only</button>
          <button className="btn-sm btn-ghost" onClick={followLatest}>Follow latest</button>
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

          <div className="messages" ref={scrollRef} onScroll={onScroll} onWheel={onWheel}>
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
            <div aria-hidden style={{ height: spacerH, flexShrink: 0 }} />
          </div>

          {composer}
        </section>

        <aside className="room-aside" ref={asideRef}>
          <div className="aside-tabs">
            {(["resume", "prep", "summary", "questions"] as AsideTab[]).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {ASIDE_TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="aside-body">
            {tab === "resume" && <ResumeTab interview={interview} />}
            {tab === "prep" && <GenTab kind="prep" interview={interview} onReload={refetch} />}
            {tab === "summary" && <GenTab kind="summary" interview={interview} onReload={refetch} />}
            {tab === "questions" && (
              <QuestionsTab interview={interview} onAsk={composerVisible && interview.status === "interviewing" ? followUp : undefined} />
            )}
          </div>
          <div className="aside-resize" onMouseDown={startCoachResize} title="Drag to resize" role="separator" aria-orientation="horizontal" />
          <div className="coach-note" style={{ height: coachH }}>
            <h3>Coach note</h3>
            <textarea value={noteText} placeholder="Write feedback to candidates…" onChange={(e) => setNoteText(e.target.value)} />
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
      <div className="row-msg note" data-mid={m.id} style={{ marginBottom: "var(--s5)" }}>
        <div className="note-bubble"><span className="note-tag">Note</span> {m.content}</div>
      </div>
    );
  }
  if (m.role === "user") {
    return <div className="q-label" data-mid={m.id} style={{ margin: "var(--s5) 0 var(--s3)", fontSize: 14 }}>Interviewer asked: <strong style={{ color: "var(--text)" }}>{m.content}</strong></div>;
  }
  return (
    <article className="reader-card" data-mid={m.id} style={{ marginBottom: "var(--s5)" }}>
      {m.qa_ref != null && <span className="prepared-tag">Prepared answer</span>}
      {m.quick && <div className="opener">{m.quick}</div>}
      {m.content && <div className="detail"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
      {streaming && <span className="caret" />}
      {m.state === "stopped" && <div className="meta-note">Stopped</div>}
      {m.state === "error" && <div className="meta-note err">Generation error</div>}
    </article>
  );
}

function ResumeTab({ interview }: { interview: Interview }) {
  const text = (interview.resume_text ?? "").trim();
  return (
    <div className="stack">
      <p className="muted small">
        The resume the answers are grounded in — read-only during the session. Edit it in the resume editor before you start.
      </p>
      {text
        ? <pre className="resume-readonly">{text}</pre>
        : <p className="muted small">No resume copy for this interview yet.</p>}
    </div>
  );
}

function QuestionsTab({ interview, onAsk }: { interview: Interview; onAsk?: (q: string) => void }) {
  const [qa, setQa] = useState<QA[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!interview.resume_id) { setQa([]); return; }
    let on = true;
    api.resume(interview.resume_id)
      .then((r) => { if (on) setQa(r.qa); })
      .catch((e) => { if (on) setError(e.message); });
    return () => { on = false; };
  }, [interview.resume_id]);

  return (
    <div className="stack">
      <p className="muted small">
        {onAsk ? "Click a question to ask it in the chat." : "Prepared questions from the linked resume. Start the session to ask them."}
      </p>
      {error && <div className="error-banner">{error}</div>}
      {!interview.resume_id ? (
        <p className="muted small">No resume linked to this interview.</p>
      ) : qa === null ? (
        <p className="muted small">Loading…</p>
      ) : qa.length === 0 ? (
        <p className="muted small">No prepared questions yet.</p>
      ) : (
        <div className="qa-ask-list">
          {qa.map((q) => (
            <button key={q.id} type="button" className="qa-ask-item" disabled={!onAsk} onClick={() => onAsk?.(q.question)}>
              {q.question}
            </button>
          ))}
        </div>
      )}
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

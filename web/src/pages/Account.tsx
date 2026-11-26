import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthContext";
import type { SystemPrompt } from "../types";

export function Account() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="page">
      <PageHeader title="Account" subtitle="Manage profile, password and credentials." />
      <div className="account-grid">
        <ProfileForm />
        {user.role !== "candidate" && <ApiKeySection />}
        {user.role !== "candidate" && <SystemPromptsSection />}
      </div>
    </div>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();
  const passwordChanged = password.length > 0;
  const nameChanged = name.trim() !== user.name;
  const sensitive = emailChanged || passwordChanged;
  const nothing = !nameChanged && !emailChanged && !passwordChanged;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    try {
      const payload: Record<string, string> = {};
      if (nameChanged) payload.name = name.trim();
      if (emailChanged) payload.email = email.trim();
      if (passwordChanged) payload.password = password;
      if (sensitive) payload.currentPassword = currentPassword;
      setUser(await api.updateAccount(payload));
      setPassword(""); setCurrentPassword(""); setShowPw(false);
      setNotice("Account updated.");
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <form className="panel stack-form" onSubmit={save}>
      <div className="panel-head"><h2>Profile</h2><span className="badge badge-neutral">{user.role}</span></div>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>

      {showPw ? (
        <>
          <label>New password (leave blank to keep)
            <input type="password" value={password} placeholder="••••••••" minLength={8} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {sensitive && (
            <label>Current password (required to change email or password)
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </label>
          )}
        </>
      ) : (
        <button type="button" className="btn-block" onClick={() => setShowPw(true)}>Change password</button>
      )}
      {!showPw && sensitive && (
        <label>Current password (required to change email)
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
      )}

      <div className="form-actions">
        <button className="primary btn-block" type="submit" disabled={busy || nothing || (sensitive && !currentPassword)}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

function ApiKeySection() {
  const [hasKey, setHasKey] = useState(false);
  const [last4, setLast4] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.getApiKey().then((r) => { setHasKey(r.hasKey); setLast4(r.last4); }).catch(() => {}); }, []);

  async function save() {
    setError(null); setNotice(null); setBusy(true);
    try {
      const r = await api.setApiKey(input.trim());
      setHasKey(r.hasKey); setLast4(r.last4); setInput(""); setEditing(false);
      setNotice("API key saved.");
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm("Remove your Anthropic API key? Your interviews will stop working until you add one.")) return;
    setBusy(true); setError(null); setNotice(null);
    try { const r = await api.clearApiKey(); setHasKey(r.hasKey); setLast4(r.last4); setNotice("API key removed."); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="panel stack-form">
      <div className="panel-head"><h2>Personal API key</h2></div>
      <p className="muted small">
        Your interviews use your own Anthropic key for all Claude calls. Get one at{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        It is stored encrypted and never shown again after saving.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {hasKey && !editing && (
        <div className="keyrow">
          <span className="tag">Key set · ends in {last4}</span>
          <button onClick={() => setEditing(true)} disabled={busy}>Replace</button>
          <button className="btn-danger" onClick={remove} disabled={busy}>Remove</button>
        </div>
      )}

      {(!hasKey || editing) && (
        <div className="keyrow">
          <input type="password" placeholder="sk-ant-…" value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1 }} />
          <button className="primary" onClick={save} disabled={busy || !input.trim()}>{hasKey ? "Replace key" : "Save key"}</button>
          {editing && <button className="btn-ghost" onClick={() => { setEditing(false); setInput(""); }}>Cancel</button>}
        </div>
      )}

      <p className="hint">Credentials stay on the server. The full key is never shown in the browser.</p>
    </div>
  );
}

// Shown as the placeholder of the "new prompt" box and inserted by "Use sample".
// It adds delivery rules on top of the built-in behaviour (answer as the
// candidate, grounded in the resume and prepared answers).
const SAMPLE_PROMPT_NAME = "Live interview — clear, accurate, fast";
const SAMPLE_PROMPT = `Goal: answers I can say out loud immediately. Clear, accurate, quick to read.

Delivery
- Put the direct answer in the first sentence. No preamble, no restating the question.
- Use short spoken sentences and plain words, the way I would say it aloud.
- Keep a normal answer to 60-90 seconds spoken (about 120-180 words). Go longer only when the question asks for depth.
- Make it easy to scan: at most 3-5 short bullets or 2 short paragraphs.

Accuracy
- Use only facts from my resume and prepared answers, with the exact names, dates and numbers written there.
- If the resume does not cover something, do not guess. Say so briefly and bridge to my closest real experience.
- Take one clear position. Do not hedge or list every option.

By question type
- Behavioural: STAR. One line each for Situation and Task, most of the answer on what I did ("I", not "we"), end on a measurable Result.
- Technical: one-sentence approach first, then the key steps, then trade-offs, complexity and edge cases. Code only when asked.
- Motivation or fit: 2-3 sentences linking my real experience to this role and company.
- Unclear question: give one short clarifying question I can ask, then answer the most likely meaning.

Stop when the answer is complete. No summary, no offer to elaborate.`;

function SystemPromptsSection() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.systemPrompts().then(setPrompts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add() {
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createSystemPrompt({ name: newName.trim(), content: newContent });
      setNewName(""); setNewContent(""); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this system prompt?")) return;
    try { await api.deleteSystemPrompt(id); await load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="panel stack-form">
      <div className="panel-head"><h2>System prompts</h2></div>
      <p className="muted small">Reusable instructions you can apply — and still tweak — when creating an interview.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="qa-list">
        {prompts.length === 0 && <p className="muted small">No saved prompts yet. Add one below.</p>}
        {prompts.map((p) => (
          <PromptCard key={p.id} prompt={p} onSaved={load} onError={setError} onRemove={() => remove(p.id)} />
        ))}
      </div>

      <div className="prompt-add">
        <input placeholder="Prompt name (e.g. Behavioural — concise STAR)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <textarea rows={12} placeholder={`Sample:\n\n${SAMPLE_PROMPT}`} value={newContent} onChange={(e) => setNewContent(e.target.value)} />
        <div className="row">
          <button className="primary btn-sm" disabled={busy || !newName.trim()} onClick={add}>{busy ? "Adding…" : "Add prompt"}</button>
          <button
            type="button"
            className="btn-sm"
            disabled={busy}
            onClick={() => { setNewContent(SAMPLE_PROMPT); setNewName((n) => n.trim() || SAMPLE_PROMPT_NAME); }}
          >
            Use sample
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptCard({ prompt, onSaved, onError, onRemove }: {
  prompt: SystemPrompt;
  onSaved: () => void;
  onError: (m: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(prompt.name);
  const [content, setContent] = useState(prompt.content);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== prompt.name || content !== prompt.content;

  async function save() {
    setBusy(true);
    try { await api.updateSystemPrompt(prompt.id, { name: name.trim(), content }); onSaved(); }
    catch (e: any) { onError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="qa-item">
      <input className="qa-q" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="qa-a" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="qa-actions">
        <button className="btn-sm primary" disabled={busy || !dirty || !name.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn-sm btn-danger" disabled={busy} onClick={onRemove}>Delete</button>
      </div>
    </div>
  );
}

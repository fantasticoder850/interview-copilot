import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthContext";

export function Account() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="page">
      <PageHeader title="Account" subtitle="Manage profile, password and credentials." />
      <div className="account-grid">
        <ProfileForm />
        {user.role !== "candidate" && <ApiKeySection />}
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

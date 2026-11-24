import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

export function Account() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="page">
      <h1>Account</h1>
      <ProfileForm />
      {user.role !== "candidate" && <ApiKeySection />}
      <p className="muted">Role: {user.role}</p>
    </div>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
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
      setPassword(""); setCurrentPassword("");
      setNotice("Account updated.");
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <form className="account-form section" onSubmit={save}>
      <h2>Profile</h2>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>New password (leave blank to keep)
        <input type="password" value={password} placeholder="••••••••" minLength={8} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {sensitive && (
        <label>Current password (required to change email or password)
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy || nothing || (sensitive && !currentPassword)}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function ApiKeySection() {
  const [hasKey, setHasKey] = useState(false);
  const [last4, setLast4] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.getApiKey().then((r) => { setHasKey(r.hasKey); setLast4(r.last4); }).catch(() => {}); }, []);

  async function save() {
    setError(null); setNotice(null); setBusy(true);
    try {
      const r = await api.setApiKey(input.trim());
      setHasKey(r.hasKey); setLast4(r.last4); setInput("");
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
    <div className="section">
      <h2>Anthropic API key</h2>
      <p className="muted">
        Your interviews use your own Anthropic key for all Claude calls. Get one at{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        It is stored encrypted and never shown again after saving.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      {hasKey ? (
        <div className="keyrow">
          <span className="key-set">Key set · ends in <code>{last4}</code></span>
          <button onClick={remove} disabled={busy}>Remove</button>
        </div>
      ) : (
        <div className="muted" style={{ marginBottom: 8 }}>No key set.</div>
      )}
      <div className="keyrow">
        <input type="password" placeholder="sk-ant-…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button onClick={save} disabled={busy || !input.trim()}>{hasKey ? "Replace key" : "Save key"}</button>
      </div>
    </div>
  );
}

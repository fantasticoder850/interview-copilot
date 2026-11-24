import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

export function Account() {
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
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      if (nameChanged) payload.name = name.trim();
      if (emailChanged) payload.email = email.trim();
      if (passwordChanged) payload.password = password;
      if (sensitive) payload.currentPassword = currentPassword;
      const updated = await api.updateAccount(payload);
      setUser(updated);
      setPassword("");
      setCurrentPassword("");
      setNotice("Account updated.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Account</h1>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <form className="account-form" onSubmit={save}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>New password (leave blank to keep)
          <input type="password" value={password} placeholder="••••••••" minLength={8}
            onChange={(e) => setPassword(e.target.value)} />
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
      <p className="muted">Role: {user.role}</p>
    </div>
  );
}

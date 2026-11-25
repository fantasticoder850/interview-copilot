import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ThemeToggle } from "../components/ThemeToggle";

export function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", requestedRole: "manager" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.register(form);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-card">
        <div className="auth-brand">Interview <b>Copilot</b></div>
        <div className="panel">
          {done ? (
            <>
              <div className="empty-state" style={{ padding: "8px 0 4px" }}>
                <span className="empty-icon" aria-hidden="true">✓</span>
                <h1>Request received</h1>
                <p className="muted">Your account is awaiting admin approval. You'll be able to sign in once an admin approves it.</p>
              </div>
              <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
            </>
          ) : (
            <>
              <h1>Request access</h1>
              <p className="auth-sub">Create an account for review by an administrator.</p>
              <form onSubmit={submit}>
                {error && <div className="error-banner">{error}</div>}
                <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" required /></label>
                <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required /></label>
                <label>Password<input type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" required /></label>
                <label>Role
                  <select value={form.requestedRole} onChange={(e) => set("requestedRole", e.target.value)}>
                    <option value="manager">Manager — conducts interview sessions</option>
                    <option value="candidate">Candidate — participates in interview sessions</option>
                  </select>
                </label>
                <button className="primary" disabled={busy} type="submit">{busy ? "Submitting…" : "Request access"}</button>
              </form>
              <p className="auth-alt">Already approved? <Link to="/login">Sign in</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

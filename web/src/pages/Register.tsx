import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

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

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Request received</h1>
          <p>Your account is awaiting admin approval. You'll be able to sign in once approved.</p>
          <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Request access</h1>
        {error && <div className="error-banner">{error}</div>}
        <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required /></label>
        <label>Password<input type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} required /></label>
        <label>Role
          <select value={form.requestedRole} onChange={(e) => set("requestedRole", e.target.value)}>
            <option value="manager">Manager (runs interviews)</option>
            <option value="viewer">Viewer (takes part in interviews)</option>
          </select>
        </label>
        <button disabled={busy} type="submit">{busy ? "Submitting…" : "Request access"}</button>
        <p className="auth-alt">Already approved? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}

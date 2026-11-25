import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      nav("/interviews");
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
          <h1>Sign in</h1>
          <p className="auth-sub">Welcome back. Sign in to continue.</p>
          <form onSubmit={submit}>
            {error && <div className="error-banner">{error}</div>}
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
            <button className="primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className="auth-alt">No account? <Link to="/register">Request access</Link></p>
        </div>
      </div>
    </div>
  );
}

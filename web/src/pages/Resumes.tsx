import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ResumeSummary } from "../types";

export function Resumes() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  const load = () => api.resumes().then(setResumes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function del(id: string) {
    if (!confirm("Delete this resume?")) return;
    try { await api.deleteResume(id); load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Resumes</h1>
        <button onClick={() => nav("/resumes/new")}>+ New resume</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {resumes.length === 0 && <p className="muted">No resumes yet.</p>}
      <table className="grid">
        <thead><tr><th>Name</th><th>Role</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          {resumes.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/resumes/${r.id}`}>{r.name}</Link></td>
              <td>{r.role || <span className="muted">—</span>}</td>
              <td>{new Date(r.updated_at).toLocaleDateString()}</td>
              <td className="actions-cell"><button onClick={() => del(r.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import type { ResumeSummary } from "../types";

export function Resumes() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = () => api.resumes().then(setResumes).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function del(id: string) {
    if (!confirm("Delete this resume?")) return;
    try { await api.deleteResume(id); load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="page">
      <PageHeader
        title="Resumes"
        subtitle="Store resume text and prepare verified answers."
        actions={<button className="primary" onClick={() => nav("/resumes/new")}>+ New resume</button>}
      />
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-page"><span className="spinner" /><span>Loading resumes…</span></div>
      ) : resumes.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">📄</span>
          <h3>No resumes yet</h3>
          <p>Create a resume to import text and prepare answers for interviews.</p>
          <button className="primary" onClick={() => nav("/resumes/new")}>+ New resume</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Name</th><th>Role</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {resumes.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/resumes/${r.id}`}><strong>{r.name}</strong></Link></td>
                  <td>{r.role || <span className="muted">—</span>}</td>
                  <td className="muted small nowrap">{new Date(r.updated_at).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <Link className="btn btn-sm btn-ghost" to={`/resumes/${r.id}`}>Edit</Link>
                    <button className="btn-sm btn-danger" onClick={() => del(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

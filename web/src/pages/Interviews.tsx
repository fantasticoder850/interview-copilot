import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import type { InterviewStatus, InterviewSummary } from "../types";

export function Interviews() {
  const { user } = useAuth();
  const [items, setItems] = useState<InterviewSummary[]>([]);
  const [filter, setFilter] = useState<InterviewStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.interviews().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );
  const canCreate = user?.role === "admin" || user?.role === "manager";

  return (
    <div className="page">
      <PageHeader
        title="Interviews"
        subtitle="Rehearsal and authorized interview sessions."
        actions={canCreate && <button className="primary" onClick={() => nav("/interviews/new")}>+ New interview</button>}
      />
      {error && <div className="error-banner">{error}</div>}

      <div className="filters">
        {(["all", "scheduled", "interviewing", "ended"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading-page"><span className="spinner" /><span>Loading interviews…</span></div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">🗂</span>
          <h3>No interviews {filter !== "all" ? `that are ${filter}` : "yet"}</h3>
          <p>{canCreate ? "Create an interview to set up a rehearsal or authorized session." : "You'll see your assigned interviews here."}</p>
          {canCreate && filter === "all" && <button className="primary" onClick={() => nav("/interviews/new")}>+ New interview</button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Job title</th><th>Company</th><th>Type</th><th>Ver</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td><Link to={`/interviews/${i.id}/room`}><strong>{i.job_title}</strong></Link></td>
                  <td>{i.company || <span className="muted">—</span>}</td>
                  <td style={{ textTransform: "capitalize" }}>{i.interview_type}</td>
                  <td className="muted">v{i.version}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td className="muted small nowrap">{new Date(i.updated_at).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <Link className="btn btn-sm" to={`/interviews/${i.id}/room`}>Open</Link>
                    {canCreate && <Link className="btn btn-sm btn-ghost" to={`/interviews/${i.id}/edit`}>Edit</Link>}
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

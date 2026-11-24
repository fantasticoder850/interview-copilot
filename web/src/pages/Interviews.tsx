import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import type { InterviewStatus, InterviewSummary } from "../types";

export function Interviews() {
  const { user } = useAuth();
  const [items, setItems] = useState<InterviewSummary[]>([]);
  const [filter, setFilter] = useState<InterviewStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => { api.interviews().then(setItems).catch((e) => setError(e.message)); }, []);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );
  const canCreate = user?.role === "admin" || user?.role === "manager";

  return (
    <div className="page">
      <div className="page-head">
        <h1>Interviews</h1>
        {canCreate && <button onClick={() => nav("/interviews/new")}>+ New interview</button>}
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="filters">
        {(["all", "scheduled", "interviewing", "ended"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted">No interviews.</p>}
      <table className="grid">
        <thead><tr><th>Job title</th><th>Company</th><th>Type</th><th>Ver</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i.id}>
              <td><Link to={`/interviews/${i.id}/room`}>{i.job_title}</Link></td>
              <td>{i.company || <span className="muted">—</span>}</td>
              <td>{i.interview_type}</td>
              <td>v{i.version}</td>
              <td><StatusBadge status={i.status} /></td>
              <td className="actions-cell">
                <Link to={`/interviews/${i.id}/room`}>Open</Link>
                {canCreate && <Link to={`/interviews/${i.id}/edit`}>Edit</Link>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

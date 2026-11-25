import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { MultiSelect } from "../../components/MultiSelect";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import type { AdminUser } from "../../types";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = () => api.adminUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const managers = useMemo(
    () => users.filter((u) => u.role === "manager" && u.status === "approved").map((u) => ({ id: u.id, label: u.name, sub: u.email })),
    [users],
  );
  const managerName = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name]));
    return (ids: string[]) => ids.map((id) => m.get(id)).filter(Boolean).join(", ");
  }, [users]);
  const pendingCount = users.filter((u) => u.status === "pending").length;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  async function patch(id: string, patch: Record<string, string>) {
    try { await api.patchUser(id, patch); await load(); } catch (e: any) { setError(e.message); }
  }
  async function resetPw(id: string) {
    const pw = prompt("New password (min 8 chars):");
    if (!pw) return;
    try { await api.patchUser(id, { password: pw }); alert("Password reset."); } catch (e: any) { setError(e.message); }
  }
  async function setManagers(candidateId: string, managerIds: string[]) {
    try { await api.setCandidateManagers(candidateId, managerIds); await load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="page">
      <PageHeader title="Users" subtitle="Manage access and candidate assignments." />
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h2>Roster {pendingCount > 0 && <span className="pill-count">{pendingCount} pending</span>}</h2>
        </div>

        <div className="toolbar">
          <input className="search" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select style={{ width: "auto" }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="candidate">Candidate</option>
          </select>
          <select style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <table className="grid users-grid">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th>Assigned managers</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id}>
                    <td data-label="User">
                      <div className="user-cell">
                        <span className="avatar" style={{ background: `hsl(${hue(u.email)} 55% 42%)` }}>{initials(u.name)}</span>
                        <span className="user-meta">
                          <span className="user-name">{u.name}{isMe && <span className="you-chip">you</span>}</span>
                          <span className="user-email">{u.email}</span>
                        </span>
                      </div>
                    </td>
                    <td data-label="Role">
                      <select className="role-select" value={u.role} disabled={isMe}
                        onChange={(e) => patch(u.id, { role: e.target.value })}>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="candidate">Candidate</option>
                      </select>
                    </td>
                    <td data-label="Status"><span className={`status-text status-${u.status}`}>{u.status}</span></td>
                    <td data-label="Assigned managers" className="mgr-cell">
                      {u.role === "candidate"
                        ? <MultiSelect options={managers} selected={u.managerIds} onChange={(ids) => setManagers(u.id, ids)} placeholder="Assign managers…" />
                        : <span className="muted">{managerName(u.managerIds) || "—"}</span>}
                    </td>
                    <td data-label="Actions" className="actions-cell">
                      {isMe ? (
                        <span className="muted small">—</span>
                      ) : (
                        <>
                          {u.status !== "approved" && (
                            <button className="btn-sm primary" onClick={() => patch(u.id, { status: "approved" })}>
                              {u.status === "disabled" ? "Enable" : "Approve"}
                            </button>
                          )}
                          {u.status === "approved" && (
                            <button className="btn-sm btn-danger" onClick={() => patch(u.id, { status: "disabled" })}>Disable</button>
                          )}
                          {u.status === "pending" && (
                            <button className="btn-sm btn-danger" onClick={() => patch(u.id, { status: "rejected" })}>Reject</button>
                          )}
                          <button className="btn-sm btn-ghost" onClick={() => resetPw(u.id)}>Reset PW</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state" style={{ padding: "28px 0" }}><p>No users match these filters.</p></div></td></tr>
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}

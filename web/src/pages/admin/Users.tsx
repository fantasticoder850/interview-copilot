import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { MultiSelect } from "../../components/MultiSelect";
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

  const load = () => api.adminUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const managers = useMemo(
    () => users.filter((u) => u.role === "manager" && u.status === "approved").map((u) => ({ id: u.id, label: u.name, sub: u.email })),
    [users],
  );
  const pendingCount = users.filter((u) => u.status === "pending").length;

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
      <div className="page-head">
        <h1>Users</h1>
        {pendingCount > 0 && <span className="pill-count">{pendingCount} pending approval</span>}
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="users-table">
        <div className="ut-head">
          <span>User</span><span>Role</span><span>Status</span><span>Managers</span><span>Actions</span>
        </div>
        {users.map((u) => {
          const isMe = u.id === me?.id;
          return (
            <div key={u.id} className="ut-row">
              <div className="user-cell">
                <span className="avatar" style={{ background: `hsl(${hue(u.email)} 55% 42%)` }}>{initials(u.name)}</span>
                <span className="user-meta">
                  <span className="user-name">{u.name}{isMe && <span className="you-chip">you</span>}</span>
                  <span className="user-email">{u.email}</span>
                </span>
              </div>

              <div data-label="Role">
                <select className="role-select" value={u.role} disabled={isMe}
                  onChange={(e) => patch(u.id, { role: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="candidate">Candidate</option>
                </select>
              </div>

              <div data-label="Status"><span className={`badge badge-${u.status}`}>{u.status}</span></div>

              <div data-label="Managers" className="mgr-cell">
                {u.role === "candidate"
                  ? <MultiSelect options={managers} selected={u.managerIds} onChange={(ids) => setManagers(u.id, ids)} placeholder="Assign managers…" />
                  : <span className="muted">—</span>}
              </div>

              <div data-label="Actions" className="actions">
                {isMe ? (
                  <span className="muted small">—</span>
                ) : (
                  <>
                    {u.status !== "approved" && (
                      <button className="btn-sm btn-approve" onClick={() => patch(u.id, { status: "approved" })}>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { ActionMenu, type MenuAction } from "../../components/ActionMenu";
import { Avatar } from "../../components/Avatar";
import { AvatarSelect } from "../../components/AvatarSelect";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import type { AdminUser } from "../../types";

export function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");

  const load = () => api.adminUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const managers = useMemo(
    () => users.filter((u) => u.role === "manager" && u.status === "approved").map((u) => ({ id: u.id, label: u.name, seed: u.email })),
    [users],
  );
  const pendingCount = users.filter((u) => u.status === "pending").length;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      // Assigned-manager filter: only candidates assigned to the chosen manager.
      if (managerFilter !== "all" && (u.role !== "candidate" || !u.managerIds.includes(managerFilter))) return false;
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter, managerFilter]);

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
  async function delUser(u: AdminUser) {
    if (!confirm(`Delete ${u.name} (${u.email})? This permanently removes the account and their resumes and interviews. This cannot be undone.`)) return;
    try { await api.deleteUser(u.id); await load(); } catch (e: any) { setError(e.message); }
  }

  function actionsFor(u: AdminUser): MenuAction[] {
    const a: MenuAction[] = [];
    if (u.status === "approved") a.push({ label: "Disable", onClick: () => patch(u.id, { status: "disabled" }) });
    else if (u.status === "disabled") a.push({ label: "Enable", onClick: () => patch(u.id, { status: "approved" }) });
    else if (u.status === "pending") {
      a.push({ label: "Approve", onClick: () => patch(u.id, { status: "approved" }) });
      a.push({ label: "Reject", onClick: () => patch(u.id, { status: "rejected" }) });
    } else if (u.status === "rejected") {
      a.push({ label: "Approve", onClick: () => patch(u.id, { status: "approved" }) });
    }
    a.push({ label: "Reset password", onClick: () => resetPw(u.id) });
    a.push({ label: "Delete", danger: true, onClick: () => delUser(u) });
    return a;
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
          <select style={{ width: "auto" }} value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
            <option value="all">All managers</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <table className="grid users-grid">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th>Managers</th><th className="col-actions">Actions</th></tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td data-label="User">
                    <div className="user-cell">
                      <Avatar name={u.name} seed={u.email} />
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
                  <td data-label="Managers" className="mgr-cell">
                    {u.role === "candidate"
                      ? <AvatarSelect options={managers} selected={u.managerIds} onChange={(ids) => setManagers(u.id, ids)} placeholder="Assign managers" noun="manager" />
                      : <span className="muted">—</span>}
                  </td>
                  <td data-label="Actions" className="actions-cell col-actions">
                    {isMe ? <span className="muted small">—</span> : <ActionMenu actions={actionsFor(u)} />}
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

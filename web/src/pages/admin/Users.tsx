import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { MultiSelect } from "../../components/MultiSelect";
import type { AdminUser } from "../../types";

export function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.adminUsers().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const managers = useMemo(
    () => users.filter((u) => u.role === "manager" && u.status === "approved").map((u) => ({ id: u.id, label: u.name, sub: u.email })),
    [users],
  );

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
      <h1>Users</h1>
      {error && <div className="error-banner">{error}</div>}
      <table className="grid">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Managers (candidates only)</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="candidate">candidate</option>
                </select>
              </td>
              <td><span className={`badge badge-${u.status}`}>{u.status}</span></td>
              <td style={{ minWidth: 220 }}>
                {u.role === "candidate" ? (
                  <MultiSelect
                    options={managers}
                    selected={u.managerIds}
                    onChange={(ids) => setManagers(u.id, ids)}
                    placeholder="Assign managers…"
                  />
                ) : <span className="muted">—</span>}
              </td>
              <td className="actions-cell">
                {u.status !== "approved" && <button onClick={() => patch(u.id, { status: "approved" })}>Approve</button>}
                {u.status !== "rejected" && <button onClick={() => patch(u.id, { status: "rejected" })}>Reject</button>}
                {u.status !== "disabled" && <button onClick={() => patch(u.id, { status: "disabled" })}>Disable</button>}
                <button onClick={() => resetPw(u.id)}>Reset PW</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

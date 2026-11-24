import { query } from "../db.js";
import type { InterviewRow, User } from "../domain.js";

// Can this user open / read the interview?
export async function canAccessInterview(
  user: User,
  interview: InterviewRow,
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "manager") return interview.owner_id === user.id;
  // viewer: must be assigned to it
  const { rowCount } = await query(
    `SELECT 1 FROM interview_viewers WHERE interview_id = $1 AND viewer_id = $2`,
    [interview.id, user.id],
  );
  return rowCount! > 0;
}

// Can this user manage (edit / start / end / send questions in) the interview?
export function canManageInterview(user: User, interview: InterviewRow): boolean {
  if (user.role === "admin") return true;
  return user.role === "manager" && interview.owner_id === user.id;
}

// The set of viewer ids this user is allowed to assign to an interview.
export async function allowedViewerIds(user: User): Promise<Set<string>> {
  if (user.role === "admin") {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'viewer' AND status = 'approved'`,
    );
    return new Set(rows.map((r) => r.id));
  }
  if (user.role === "manager") {
    const { rows } = await query<{ viewer_id: string }>(
      `SELECT mv.viewer_id FROM manager_viewers mv
         JOIN users u ON u.id = mv.viewer_id
        WHERE mv.manager_id = $1 AND u.status = 'approved'`,
      [user.id],
    );
    return new Set(rows.map((r) => r.viewer_id));
  }
  return new Set();
}

// Does the user own the resume (admins own all)?
export async function canAccessResume(user: User, resumeId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role !== "manager") return false;
  const { rowCount } = await query(
    `SELECT 1 FROM resumes WHERE id = $1 AND owner_id = $2`,
    [resumeId, user.id],
  );
  return rowCount! > 0;
}

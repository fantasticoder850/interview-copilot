import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { buildUpdate } from "../../common/sql.js";
import { query } from "../../infrastructure/db.js";

const COLUMNS = "id, name, content, created_at, updated_at";

// All CRUD is scoped to the owning user; a prompt is never visible or editable
// by anyone else.

export async function listPrompts(ownerId: string) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM system_prompts WHERE owner_id = $1 ORDER BY name`,
    [ownerId],
  );
  return rows;
}

export async function createPrompt(ownerId: string, data: { name: string; content: string }) {
  const { rows } = await query(
    `INSERT INTO system_prompts (owner_id, name, content) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [ownerId, data.name, data.content],
  );
  return rows[0];
}

export async function updatePrompt(
  ownerId: string,
  id: string,
  patch: { name?: string; content?: string },
) {
  const { assignments, values } = buildUpdate({ name: "name", content: "content" }, patch);
  if (assignments.length === 0) throw new BadRequestError("Nothing to update");
  assignments.push(`updated_at = now()`);
  values.push(id, ownerId);
  const { rows } = await query(
    `UPDATE system_prompts SET ${assignments.join(", ")}
      WHERE id = $${values.length - 1} AND owner_id = $${values.length}
      RETURNING ${COLUMNS}`,
    values,
  );
  if (rows.length === 0) throw new NotFoundError("System prompt not found");
  return rows[0];
}

export async function deletePrompt(ownerId: string, id: string) {
  const { rowCount } = await query(
    `DELETE FROM system_prompts WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  if (rowCount === 0) throw new NotFoundError("System prompt not found");
}

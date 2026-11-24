import { Router } from "express";
import { query } from "../db.js";
import { DEFAULT_MODEL, isValidModel } from "../models.js";

export const sessionsRouter = Router();

// List sessions, newest activity first.
sessionsRouter.get("/", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, title, model, created_at, updated_at
       FROM sessions
      ORDER BY updated_at DESC`,
  );
  res.json(rows);
});

// Create a session.
sessionsRouter.post("/", async (req, res) => {
  const { title, model } = req.body ?? {};
  const chosenModel = isValidModel(model) ? model : DEFAULT_MODEL;
  const { rows } = await query(
    `INSERT INTO sessions (title, model)
     VALUES ($1, $2)
     RETURNING id, title, model, created_at, updated_at`,
    [typeof title === "string" && title.trim() ? title.trim() : "New chat", chosenModel],
  );
  res.status(201).json(rows[0]);
});

// Get one session with its messages.
sessionsRouter.get("/:id", async (req, res) => {
  const { rows: sessionRows } = await query(
    `SELECT id, title, model, created_at, updated_at FROM sessions WHERE id = $1`,
    [req.params.id],
  );
  if (sessionRows.length === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  const { rows: messages } = await query(
    `SELECT id, role, content, model, created_at
       FROM messages
      WHERE session_id = $1
      ORDER BY created_at ASC`,
    [req.params.id],
  );
  res.json({ ...sessionRows[0], messages });
});

// Update title and/or model.
sessionsRouter.patch("/:id", async (req, res) => {
  const { title, model } = req.body ?? {};

  if (model !== undefined && !isValidModel(model)) {
    return res.status(400).json({ error: "Invalid model" });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof title === "string") {
    fields.push(`title = $${fields.length + 1}`);
    values.push(title.trim() || "New chat");
  }
  if (model !== undefined) {
    fields.push(`model = $${fields.length + 1}`);
    values.push(model);
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  fields.push(`updated_at = now()`);
  values.push(req.params.id);

  const { rows } = await query(
    `UPDATE sessions SET ${fields.join(", ")}
      WHERE id = $${values.length}
      RETURNING id, title, model, created_at, updated_at`,
    values,
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(rows[0]);
});

// Delete a session (messages cascade).
sessionsRouter.delete("/:id", async (req, res) => {
  const { rowCount } = await query(`DELETE FROM sessions WHERE id = $1`, [req.params.id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.status(204).end();
});

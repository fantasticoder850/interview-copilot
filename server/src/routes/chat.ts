import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { anthropic, INTERVIEW_SYSTEM_PROMPT } from "../anthropic.js";
import { query } from "../db.js";
import { isValidModel } from "../models.js";

export const chatRouter = Router();

interface SessionRow {
  id: string;
  model: string;
  title: string;
}

interface MessageRow {
  role: "user" | "assistant";
  content: string;
}

// POST /api/sessions/:id/messages
// Appends the user message, then streams Claude's reply back as SSE.
chatRouter.post("/:id/messages", async (req, res) => {
  const sessionId = req.params.id;
  const { content, model } = req.body ?? {};

  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required" });
  }
  if (model !== undefined && !isValidModel(model)) {
    return res.status(400).json({ error: "Invalid model" });
  }

  // Load the session.
  const { rows: sessionRows } = await query<SessionRow>(
    `SELECT id, model, title FROM sessions WHERE id = $1`,
    [sessionId],
  );
  if (sessionRows.length === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  const session = sessionRows[0];

  // Apply a model switch if the client sent one.
  const activeModel = isValidModel(model) ? model : session.model;

  // Is this the first message? (for auto-titling)
  const { rows: countRows } = await query<{ count: string }>(
    `SELECT count(*)::int AS count FROM messages WHERE session_id = $1`,
    [sessionId],
  );
  const isFirstMessage = Number(countRows[0].count) === 0;

  // Persist the user message + any model/title/activity updates.
  await query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, content],
  );
  const newTitle = isFirstMessage ? content.trim().slice(0, 60) : null;
  await query(
    `UPDATE sessions
        SET model = $1,
            title = COALESCE($2, title),
            updated_at = now()
      WHERE id = $3`,
    [activeModel, newTitle, sessionId],
  );

  // Build the full history for the API (stateless — send it all each turn).
  const { rows: historyRows } = await query<MessageRow>(
    `SELECT role, content FROM messages
      WHERE session_id = $1
      ORDER BY created_at ASC`,
    [sessionId],
  );
  const messages: Anthropic.MessageParam[] = historyRows.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Open the SSE stream.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Tell the client which model/title are in effect (so the UI can sync).
  send("meta", { model: activeModel, title: newTitle ?? session.title });

  const stream = anthropic.messages.stream({
    model: activeModel,
    max_tokens: 64000,
    system: INTERVIEW_SYSTEM_PROMPT,
    messages,
  });

  // Abort generation if the client disconnects.
  req.on("close", () => stream.abort());

  let full = "";
  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        full += event.delta.text;
        send("delta", { text: event.delta.text });
      }
    }

    const finalMsg = await stream.finalMessage();

    // Persist the assistant reply.
    const { rows: inserted } = await query<{ id: string }>(
      `INSERT INTO messages (session_id, role, content, model)
       VALUES ($1, 'assistant', $2, $3)
       RETURNING id`,
      [sessionId, full, activeModel],
    );
    await query(`UPDATE sessions SET updated_at = now() WHERE id = $1`, [sessionId]);

    send("done", { messageId: inserted[0].id, usage: finalMsg.usage });
    res.end();
  } catch (err) {
    // Client aborts surface as an error — don't treat those as failures.
    if (res.writableEnded) return;

    let message = "Something went wrong generating the response.";
    if (err instanceof Anthropic.RateLimitError) {
      message = "Rate limited by the Claude API. Please try again shortly.";
    } else if (err instanceof Anthropic.AuthenticationError) {
      message = "Claude API authentication failed. Check ANTHROPIC_API_KEY.";
    } else if (err instanceof Anthropic.APIError) {
      message = `Claude API error (${err.status}): ${err.message}`;
    }
    console.error("Streaming error:", err);
    send("error", { message });
    res.end();
  }
});

import type { Model, SessionDetail, SessionSummary } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getModels: () => fetch("/api/models").then(json<Model[]>),

  listSessions: () => fetch("/api/sessions").then(json<SessionSummary[]>),

  createSession: (model?: string) =>
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    }).then(json<SessionSummary>),

  getSession: (id: string) =>
    fetch(`/api/sessions/${id}`).then(json<SessionDetail>),

  updateSession: (id: string, patch: { title?: string; model?: string }) =>
    fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(json<SessionSummary>),

  deleteSession: (id: string) =>
    fetch(`/api/sessions/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
    }),
};

export interface StreamHandlers {
  onMeta?: (data: { model: string; title: string }) => void;
  onDelta: (text: string) => void;
  onDone: (data: { messageId: string; usage: unknown }) => void;
  onError: (message: string) => void;
}

/**
 * Sends a message and consumes the SSE stream. Uses fetch + a streaming reader
 * because the request is a POST with a body (EventSource is GET-only).
 */
export async function sendMessage(
  sessionId: string,
  content: string,
  model: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    handlers.onError((body as any).error || `Request failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      dispatchFrame(frame, handlers);
    }
  }
}

function dispatchFrame(frame: string, handlers: StreamHandlers): void {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;

  const parsed = JSON.parse(data);
  switch (event) {
    case "meta":
      handlers.onMeta?.(parsed);
      break;
    case "delta":
      handlers.onDelta(parsed.text);
      break;
    case "done":
      handlers.onDone(parsed);
      break;
    case "error":
      handlers.onError(parsed.message);
      break;
  }
}

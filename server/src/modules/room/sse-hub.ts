import type { Response } from "express";
import { randomUUID } from "node:crypto";

// Pure SSE transport for interview rooms. Knows nothing about interviews, AI,
// or persistence — it only tracks connected clients per room, fans out events,
// and remembers the current in-flight answer so a late joiner can catch up.

export interface InflightAnswer {
  messageId: string;
  quick: string;
  content: string;
  qaRef: string | null;
  state: "streaming";
}

interface Room {
  clients: Map<string, Response>;
  inflight: InflightAnswer | null;
}

const rooms = new Map<string, Room>();

function getRoom(interviewId: string): Room {
  let room = rooms.get(interviewId);
  if (!room) {
    room = { clients: new Map(), inflight: null };
    rooms.set(interviewId, room);
  }
  return room;
}

function writeEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function addClient(interviewId: string, res: Response): string {
  const room = getRoom(interviewId);
  const clientId = randomUUID();
  room.clients.set(clientId, res);
  broadcastPresence(interviewId);
  return clientId;
}

export function removeClient(interviewId: string, clientId: string) {
  const room = rooms.get(interviewId);
  if (!room) return;
  room.clients.delete(clientId);
  if (room.clients.size === 0 && !room.inflight) {
    rooms.delete(interviewId);
  } else {
    broadcastPresence(interviewId);
  }
}

export function presenceCount(interviewId: string): number {
  return rooms.get(interviewId)?.clients.size ?? 0;
}

function broadcastPresence(interviewId: string) {
  broadcast(interviewId, "presence", { count: presenceCount(interviewId) });
}

export function broadcast(interviewId: string, event: string, data: unknown) {
  const room = rooms.get(interviewId);
  if (!room) return;
  for (const res of room.clients.values()) {
    try {
      writeEvent(res, event, data);
    } catch {
      // a broken pipe is cleaned up when the connection's close handler fires
    }
  }
}

export function sendTo(res: Response, event: string, data: unknown) {
  writeEvent(res, event, data);
}

// In-flight answer tracking, so a late joiner (or the manager's reconnecting
// tab) sees the partial answer immediately.
export function startInflight(interviewId: string, messageId: string): InflightAnswer {
  const room = getRoom(interviewId);
  room.inflight = { messageId, quick: "", content: "", qaRef: null, state: "streaming" };
  return room.inflight;
}

export function getInflight(interviewId: string): InflightAnswer | null {
  return rooms.get(interviewId)?.inflight ?? null;
}

export function clearInflight(interviewId: string) {
  const room = rooms.get(interviewId);
  if (room) room.inflight = null;
}

// Heartbeat comment keeps nginx (and proxies) from closing an idle stream.
setInterval(() => {
  for (const room of rooms.values()) {
    for (const res of room.clients.values()) {
      try {
        res.write(`: ping\n\n`);
      } catch {
        /* ignore */
      }
    }
  }
}, 25_000).unref();

// Thin wrapper over EventSource for an interview room. Reconnects
// automatically; on (re)connect the caller refetches the transcript so nothing
// is missed during a gap.
export type RoomEvent =
  | { type: "snapshot"; status: string; presence: number; inflight: Inflight | null }
  | { type: "presence"; count: number }
  | { type: "status"; status: string }
  | { type: "question"; id: string; content: string; imageId: string | null; authorId: string; action: string | null; created_at: string }
  | { type: "note"; id: string; content: string; authorId: string; created_at: string }
  | { type: "answer_start"; messageId: string }
  | { type: "quick_delta"; messageId: string; text: string }
  | { type: "quick_done"; messageId: string; qaRef: string | null }
  | { type: "qa_match"; messageId: string; index: number }
  | { type: "delta"; messageId: string; text: string }
  | { type: "answer_done"; messageId: string; qaRef?: string | null; quickMs?: number; detailMs?: number; stopped?: boolean }
  | { type: "answer_error"; messageId?: string; message?: string }
  | { type: "follow_ups"; messageId: string; followUps: string[] }
  | { type: "summary"; summary: string };

export interface Inflight {
  messageId: string;
  quick: string;
  content: string;
  qaRef: string | null;
}

const EVENT_NAMES = [
  "snapshot", "presence", "status", "question", "note", "answer_start",
  "quick_delta", "quick_done", "qa_match", "delta", "answer_done",
  "answer_error", "follow_ups", "summary",
];

export function connectRoom(
  interviewId: string,
  onEvent: (e: RoomEvent) => void,
  onReconnect: () => void,
  onConnection?: (up: boolean) => void,
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let firstConnect = true;

  const open = () => {
    source = new EventSource(`/api/interviews/${interviewId}/events`, { withCredentials: true });
    for (const name of EVENT_NAMES) {
      source.addEventListener(name, (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          onEvent({ type: name, ...data } as RoomEvent);
        } catch {
          /* ignore malformed frame */
        }
      });
    }
    source.onopen = () => {
      onConnection?.(true);
      if (!firstConnect) onReconnect();
      firstConnect = false;
    };
    source.onerror = () => {
      onConnection?.(false);
      // EventSource retries on its own; close + reopen to force a clean refetch.
      source?.close();
      if (!closed) setTimeout(() => !closed && open(), 1500);
    };
  };
  open();

  return () => {
    closed = true;
    source?.close();
  };
}

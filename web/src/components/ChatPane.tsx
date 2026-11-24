import { useEffect, useRef, useState } from "react";
import { api, sendMessage } from "../api";
import type { Message, Model, SessionDetail } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ModelSelector } from "./ModelSelector";

interface Props {
  session: SessionDetail;
  models: Model[];
  onModelChange: (modelId: string) => void;
  onActivity: () => void;
  onMenu: () => void;
}

export function ChatPane({
  session,
  models,
  onModelChange,
  onActivity,
  onMenu,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(session.messages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset local state when switching sessions.
  useEffect(() => {
    setMessages(session.messages);
    setInput("");
    setStreaming(false);
    setStreamingId(null);
    setError(null);
  }, [session.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingId]);

  async function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;

    setError(null);
    setInput("");

    const userMsg: Message = {
      id: `tmp-user-${Date.now()}`,
      role: "user",
      content,
      model: null,
      created_at: new Date().toISOString(),
    };
    const assistantId = `tmp-asst-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: session.model,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setStreamingId(assistantId);

    const appendDelta = (text: string) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + text } : m,
        ),
      );

    await sendMessage(session.id, content, session.model, {
      onDelta: appendDelta,
      onDone: ({ messageId }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, id: messageId } : m)),
        );
        setStreaming(false);
        setStreamingId(null);
        onActivity();
      },
      onError: (message) => {
        setError(message);
        setStreaming(false);
        setStreamingId(null);
        // Drop the empty assistant placeholder on failure.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      },
    });
  }

  return (
    <section className="chat-pane">
      <header className="chat-header">
        <button className="menu-btn" aria-label="Open sessions" onClick={onMenu}>
          ☰
        </button>
        <div className="chat-title">{session.title}</div>
        <ModelSelector
          models={models}
          value={session.model}
          disabled={streaming}
          onChange={onModelChange}
        />
      </header>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-chat">
            <h2>Ready to practice?</h2>
            <p>Ask for a mock interview, feedback on an answer, or likely questions
              for a role.</p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            streaming={m.id === streamingId}
          />
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="composer">
        <textarea
          value={input}
          placeholder="Send a message…"
          rows={1}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="send-btn"
          disabled={streaming || !input.trim()}
          onClick={handleSend}
        >
          {streaming ? "…" : "Send"}
        </button>
      </div>
    </section>
  );
}

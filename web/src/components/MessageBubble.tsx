import type { Message } from "../types";

interface Props {
  message: Message;
  streaming?: boolean;
}

export function MessageBubble({ message, streaming }: Props) {
  const isUser = message.role === "user";
  return (
    <div className={`bubble-row ${isUser ? "user" : "assistant"}`}>
      <div className="bubble">
        <div className="bubble-role">{isUser ? "You" : "Assistant"}</div>
        <div className="bubble-content">
          {message.content}
          {streaming && <span className="caret" />}
        </div>
      </div>
    </div>
  );
}

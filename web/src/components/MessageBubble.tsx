import ReactMarkdown from "react-markdown";
import type { Message } from "../types";

interface Props {
  message: Message;
  interviewId: string;
  streaming?: boolean;
  onSaveQA?: (msg: Message) => void;
  onShape?: (action: string) => void;
  onFollowUp?: (q: string) => void;
  canManage?: boolean;
}

function time(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageBubble({
  message, interviewId, streaming, onSaveQA, onShape, onFollowUp, canManage,
}: Props) {
  if (message.kind === "note") {
    return (
      <div className="row-msg note">
        <div className="note-bubble">
          <span className="note-tag">Note</span> {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="row-msg user">
        <div className="bubble q">
          <div className="q-label">Question · {time(message.created_at)}</div>
          {message.image_id && (
            <img className="q-image" src={`/api/interviews/${interviewId}/images/${message.image_id}`} alt="attached" />
          )}
          {message.content && <div>{message.content}</div>}
        </div>
      </div>
    );
  }

  // assistant answer
  const showActions = !streaming && message.state === "complete";
  return (
    <div className="row-msg assistant">
      <div className="bubble a">
        {message.qa_ref != null && <span className="prepared-tag">Prepared answer</span>}
        {message.quick && <div className="opener">{message.quick}</div>}
        {message.content && (
          <div className="detail">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {streaming && <span className="caret" />}
        {message.state === "stopped" && <div className="meta-note">Stopped</div>}
        {message.state === "error" && <div className="meta-note err">Generation error</div>}

        {showActions && canManage && (onShape || onSaveQA) && (
          <>
            <hr className="answer-divider" />
            <div className="answer-actions">
              {onShape && (
                <>
                  <button className="btn-sm" onClick={() => onShape("shorter")}>Shorter</button>
                  <button className="btn-sm" onClick={() => onShape("detail")}>More detail</button>
                  <button className="btn-sm" onClick={() => onShape("example")}>Example</button>
                  <button className="btn-sm" onClick={() => onShape("star")}>STAR</button>
                </>
              )}
              {onSaveQA && (
                <button className="btn-sm save-qa" onClick={() => onSaveQA(message)}>Save to Basic Info</button>
              )}
            </div>
          </>
        )}

        {!streaming && message.follow_ups && message.follow_ups.length > 0 && onFollowUp && (
          <>
            <div className="followups-label">Follow-ups</div>
            <div className="followups">
              {message.follow_ups.map((f, i) => (
                <button key={i} className="chip" onClick={() => onFollowUp(f)}>↪ {f}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

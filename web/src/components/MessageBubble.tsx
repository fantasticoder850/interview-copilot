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

export function MessageBubble({
  message, interviewId, streaming, onSaveQA, onShape, onFollowUp, canManage,
}: Props) {
  if (message.kind === "note") {
    return (
      <div className="row note">
        <div className="note-bubble">
          <span className="note-tag">Note</span> {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="row user">
        <div className="bubble q">
          {message.image_id && (
            <img className="q-image" src={`/api/interviews/${interviewId}/images/${message.image_id}`} alt="attached" />
          )}
          {message.content && <div>{message.content}</div>}
        </div>
      </div>
    );
  }

  // assistant answer
  return (
    <div className="row assistant">
      <div className="bubble a">
        {message.qa_ref != null && <span className="prepared-tag">Prepared answer</span>}
        {message.quick && <div className="quick-line">{message.quick}</div>}
        {message.content && (
          <div className="detail">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {streaming && <span className="caret" />}
        {message.state === "stopped" && <div className="meta-note">stopped</div>}
        {message.state === "error" && <div className="meta-note err">generation error</div>}

        {!streaming && message.state === "complete" && (
          <div className="answer-actions">
            {canManage && onShape && (
              <>
                <button onClick={() => onShape("shorter")}>Shorter</button>
                <button onClick={() => onShape("detail")}>More detail</button>
                <button onClick={() => onShape("example")}>Example</button>
                <button onClick={() => onShape("star")}>STAR</button>
              </>
            )}
            {canManage && onSaveQA && (
              <button className="save-qa" onClick={() => onSaveQA(message)}>Save to Basic Info</button>
            )}
          </div>
        )}
        {!streaming && message.follow_ups && message.follow_ups.length > 0 && onFollowUp && (
          <div className="followups">
            {message.follow_ups.map((f, i) => (
              <button key={i} className="chip" onClick={() => onFollowUp(f)}>↪ {f}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

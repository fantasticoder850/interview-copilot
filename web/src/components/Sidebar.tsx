import type { SessionSummary } from "../types";

interface Props {
  sessions: SessionSummary[];
  activeId: string | null;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Sidebar({
  sessions,
  activeId,
  open,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: Props) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <span className="app-title">Interview Assistant</span>
          <button
            className="close-btn"
            aria-label="Close sessions"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <button className="new-btn" onClick={onNew}>
          + New chat
        </button>
      </div>
      <nav className="session-list">
        {sessions.length === 0 && (
          <p className="empty-hint">No chats yet. Start one above.</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${s.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="session-main">
              <div className="session-title">{s.title}</div>
              <div className="session-meta">{relativeTime(s.updated_at)}</div>
            </div>
            <button
              className="delete-btn"
              title="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}

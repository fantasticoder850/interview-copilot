import { useEffect, useState } from "react";
import { api } from "./api";
import { ChatPane } from "./components/ChatPane";
import { Sidebar } from "./components/Sidebar";
import type { Model, SessionDetail, SessionSummary } from "./types";

export function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<SessionDetail | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initial load: models + session list.
  useEffect(() => {
    api.getModels().then(setModels).catch(console.error);
    refreshSessions();
  }, []);

  // Load the active session's detail whenever the selection changes.
  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }
    api.getSession(activeId).then(setActive).catch(console.error);
  }, [activeId]);

  async function refreshSessions(): Promise<SessionSummary[]> {
    const list = await api.listSessions();
    setSessions(list);
    return list;
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setSidebarOpen(false); // close the drawer on mobile after picking
  }

  async function handleNew() {
    const session = await api.createSession();
    await refreshSessions();
    setActiveId(session.id);
    setSidebarOpen(false);
  }

  async function handleDelete(id: string) {
    await api.deleteSession(id);
    const list = await refreshSessions();
    if (activeId === id) {
      setActiveId(list[0]?.id ?? null);
    }
  }

  async function handleModelChange(modelId: string) {
    if (!active) return;
    const updated = await api.updateSession(active.id, { model: modelId });
    setActive({ ...active, model: updated.model });
    refreshSessions();
  }

  return (
    <div className="layout">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        open={sidebarOpen}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        onClose={() => setSidebarOpen(false)}
      />
      {/* Backdrop behind the drawer on mobile */}
      <div
        className={`backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      {active ? (
        <ChatPane
          key={active.id}
          session={active}
          models={models}
          onModelChange={handleModelChange}
          onActivity={refreshSessions}
          onMenu={() => setSidebarOpen(true)}
        />
      ) : (
        <main className="welcome">
          <button
            className="menu-btn welcome-menu"
            aria-label="Open sessions"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div>
            <h1>Interview Assistant</h1>
            <p>Open the menu to create a new chat.</p>
          </div>
        </main>
      )}
    </div>
  );
}

import type { Conversation, StatusPayload } from '../types';

export function Sidebar({
  conversations, activeId, status, open, onToggle, onSelect, onNew, onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  status: StatusPayload | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-brand">⚖ Model Council</span>
        <button className="icon-btn" onClick={onToggle} aria-label="Hide conversations">‹</button>
      </div>
      <button className="btn-primary new-chat" onClick={onNew}>New question</button>
      <nav className="convo-list" aria-label="Conversations">
        {conversations.length === 0 && (
          <p className="convo-empty">Questions you ask appear here.</p>
        )}
        {conversations.map((c) => (
          <div key={c.id} className={`convo-item ${c.id === activeId ? 'active' : ''}`}>
            <button className="convo-title" onClick={() => onSelect(c.id)} title={c.title}>
              {c.title}
            </button>
            <button
              className="icon-btn convo-delete"
              aria-label={`Delete "${c.title}"`}
              onClick={() => onDelete(c.id)}
            >×</button>
          </div>
        ))}
      </nav>
      {status && (
        <footer className="sidebar-status">
          <div className="status-line">
            <span className={`dot ${status.detected?.ollama?.reachable ? 'ok' : 'down'}`} />
            Ollama {status.detected?.ollama?.reachable ? 'up' : 'down'}
          </div>
          <div className="status-line">
            <span className={`dot ${status.detected?.claude?.usable ? 'ok' : 'down'}`} />
            Claude CLI {status.detected?.claude?.usable ? 'ready' : 'off'}
          </div>
          <div className="status-line">
            <span className={`dot ${status.detected?.codex?.usable ? 'ok' : 'down'}`} />
            Codex CLI {status.detected?.codex?.usable ? 'ready' : 'off'}
          </div>
          <div className="status-count">{status.council.count} council members</div>
        </footer>
      )}
    </aside>
  );
}

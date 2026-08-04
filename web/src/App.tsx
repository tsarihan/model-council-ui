import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api';
import { loadConversations, newId, saveConversations } from './lib/store';
import type {
  AskOptions, Attachment, ChatMessage, ConfigPayload, Conversation,
  CouncilMessage, ModelEntry, StatusPayload,
} from './types';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { Composer } from './components/Composer';
import { CouncilPanel } from './components/CouncilPanel';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const pollTimers = useRef(new Map<string, number>());

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  useEffect(() => { saveConversations(conversations); }, [conversations]);

  const refreshCouncil = useCallback(async () => {
    try {
      setBackendError(null);
      const [s, c] = await Promise.all([api.status(), api.config()]);
      setStatus(s);
      setConfig(c);
      api.models().then((m) => setModels(m.models)).catch(() => {});
    } catch (err) {
      setBackendError(String((err as Error).message || err));
    }
  }, []);

  useEffect(() => { refreshCouncil(); }, [refreshCouncil]);

  const patchMessage = useCallback((convoId: string, msgIndex: number, patch: Partial<CouncilMessage>) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convoId) return c;
      const messages = c.messages.slice();
      messages[msgIndex] = { ...(messages[msgIndex] as CouncilMessage), ...patch };
      return { ...c, messages };
    }));
  }, []);

  const pollJob = useCallback((convoId: string, msgIndex: number, jobId: string, startedAt: number) => {
    const tick = async () => {
      try {
        const job = await api.job(jobId);
        if (job.status === 'running') {
          pollTimers.current.set(jobId, window.setTimeout(tick, 4000));
          return;
        }
        pollTimers.current.delete(jobId);
        if (job.status === 'done') {
          patchMessage(convoId, msgIndex, {
            status: 'done', result: job.result, elapsedMs: job.elapsedMs ?? Date.now() - startedAt,
          });
        } else {
          patchMessage(convoId, msgIndex, { status: 'error', error: job.error ?? 'Background run failed.' });
        }
      } catch (err) {
        patchMessage(convoId, msgIndex, { status: 'error', error: String((err as Error).message || err) });
      }
    };
    tick();
  }, [patchMessage]);

  // Resume polling for background jobs restored from localStorage.
  useEffect(() => {
    for (const c of conversations) {
      c.messages.forEach((m, i) => {
        if (m.role === 'council' && m.status === 'running' && m.jobId && !pollTimers.current.has(m.jobId)) {
          pollTimers.current.set(m.jobId, -1);
          pollJob(c.id, i, m.jobId, m.startedAt);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = useCallback(async (question: string, attachments: Attachment[], opts: AskOptions) => {
    const members = config?.council.members ?? status?.council.members ?? [];
    let convoId = activeId;

    const userMsg: ChatMessage = {
      role: 'user', question, attachments, mode: opts.mode, effort: opts.effort, at: Date.now(),
    };
    const councilMsg: CouncilMessage = {
      role: 'council', status: 'running', startedAt: Date.now(), members,
    };

    let msgIndex = 0;
    setConversations((prev) => {
      if (!convoId || !prev.some((c) => c.id === convoId)) {
        convoId = newId();
        const convo: Conversation = {
          id: convoId,
          title: question.length > 48 ? `${question.slice(0, 48)}…` : question,
          createdAt: Date.now(),
          messages: [userMsg, councilMsg],
        };
        msgIndex = 1;
        setActiveId(convoId);
        return [convo, ...prev];
      }
      return prev.map((c) => {
        if (c.id !== convoId) return c;
        msgIndex = c.messages.length + 1;
        return { ...c, messages: [...c.messages, userMsg, councilMsg] };
      });
    });

    const args: Record<string, unknown> = {
      question,
      mode: opts.mode,
      verbose: opts.verbose,
    };
    if (opts.context?.trim()) args.context = opts.context.trim();
    // Only sent when the composer actually picked a level — omitting it lets
    // the council's own configured default apply, which is not the same as any
    // particular level.
    if (opts.effort) args.reasoning_effort = opts.effort;
    const files = attachments.filter((a) => a.kind === 'file').map((a) => a.path);
    const images = attachments.filter((a) => a.kind === 'image').map((a) => a.path);
    if (files.length) args.files = files;
    if (images.length) args.images = images;

    const id = convoId!;
    try {
      if (opts.background) {
        const job = await api.askAsync(args);
        patchMessage(id, msgIndex, { jobId: job.job_id });
        pollJob(id, msgIndex, job.job_id, Date.now());
      } else {
        const startedAt = Date.now();
        const result = await api.ask(args, (message) => {
          patchMessage(id, msgIndex, { progressMessage: message });
        });
        patchMessage(id, msgIndex, { status: 'done', result, elapsedMs: Date.now() - startedAt });
      }
    } catch (err) {
      patchMessage(id, msgIndex, { status: 'error', error: String((err as Error).message || err) });
    }
  }, [activeId, config, status, patchMessage, pollJob]);

  const newChat = useCallback(() => { setActiveId(null); }, []);
  const deleteConversation = useCallback((cid: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== cid));
    setActiveId((cur) => (cur === cid ? null : cur));
  }, []);

  return (
    <div className={`app ${sidebarOpen ? '' : 'sidebar-closed'} ${panelOpen ? 'panel-open' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        status={status}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelect={setActiveId}
        onNew={newChat}
        onDelete={deleteConversation}
      />
      <main className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle conversations">☰</button>
          <div className="topbar-title">
            <span className="brand-mark">Model Council</span>
            {config && (
              <span className="topbar-sub">
                {config.council.members.length} members · judge {config.council.judgeModel.replace(' (largest member)', '')}
              </span>
            )}
          </div>
          <button className="btn-quiet" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? 'Close council' : 'Council'}
          </button>
        </header>
        {backendError && (
          <div className="banner error" role="alert">
            Can't reach the council server: {backendError}
            <button className="btn-quiet" onClick={refreshCouncil}>Retry</button>
          </div>
        )}
        <Chat conversation={active} config={config} onExampleAsk={(q) =>
          ask(q, [], { mode: config?.council.responseMode ?? 'categorized', verbose: false, background: false })
        } />
        <Composer
          defaultMode={config?.council.responseMode ?? 'categorized'}
          defaultEffort={config?.council.reasoningEffort ?? null}
          disabled={!!backendError}
          onAsk={ask}
        />
      </main>
      {panelOpen && (
        <CouncilPanel
          status={status}
          config={config}
          models={models}
          onClose={() => setPanelOpen(false)}
          onChanged={refreshCouncil}
        />
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { EFFORTS, MODES, type AskOptions, type Attachment, type ReasoningEffort, type ResponseMode } from '../types';

export function Composer({ defaultMode, defaultEffort, defaultWebAccess, members, disabled, onAsk }: {
  defaultMode: ResponseMode;
  /** The council's configured effort, or null when it runs at each model's own default. */
  defaultEffort: ReasoningEffort | null;
  /** The council's configured web-access default, shown so the toggle isn't a mystery. */
  defaultWebAccess: boolean;
  /** Current council members, for per-member effort pins. */
  members: string[];
  disabled: boolean;
  onAsk: (question: string, attachments: Attachment[], opts: AskOptions) => void;
}) {
  const [question, setQuestion] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<ResponseMode | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [background, setBackground] = useState(false);
  const [context, setContext] = useState('');
  // null means "follow the council default" — distinct from a chosen level, so
  // the picker can offer the default explicitly rather than pretending the
  // configured value was picked here.
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  // null = follow the council default; true/false is an explicit override.
  const [webAccess, setWebAccess] = useState<boolean | null>(null);
  const [noCache, setNoCache] = useState(false);
  const [outputFile, setOutputFile] = useState('');
  const [memberFileOutput, setMemberFileOutput] = useState<'auto' | 'on' | 'off'>('auto');
  // Per-member pins: '' = follow the call/default level. Strongest effort tier.
  const [memberEfforts, setMemberEfforts] = useState<Record<string, ReasoningEffort | ''>>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const effectiveMode = mode ?? defaultMode;

  const submit = () => {
    const q = question.trim();
    if (!q || disabled) return;
    onAsk(q, attachments, {
      mode: effectiveMode, verbose, background,
      context: context.trim() || undefined,
      effort: effort ?? undefined,
      webAccess: webAccess ?? undefined,
      noCache: noCache || undefined,
      outputFile: outputFile.trim() || undefined,
      memberFileOutput: memberFileOutput === 'auto' ? undefined : memberFileOutput === 'on',
      memberEfforts: Object.fromEntries(
        Object.entries(memberEfforts).filter(([, v]) => v),
      ) as Record<string, ReasoningEffort> | undefined,
    });
    setQuestion('');
    setAttachments([]);
    setContext('');
    setOptionsOpen(false);
    textarea.current?.focus();
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      const uploaded = await api.upload(Array.from(list));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="composer-wrap">
      <div className="mode-row" role="radiogroup" aria-label="Council mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={effectiveMode === m.id}
            className={`mode-pill ${effectiveMode === m.id ? 'active' : ''}`}
            title={m.hint}
            onClick={() => setMode(m.id)}
          >
            {m.name}
          </button>
        ))}
        <button
          className={`mode-pill options ${optionsOpen ? 'active' : ''}`}
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen((v) => !v)}
        >
          Options {verbose || background || context || effort || webAccess !== null || noCache || outputFile.trim() || memberFileOutput !== 'auto' || Object.values(memberEfforts).some(Boolean) ? '·' : ''}
        </button>
      </div>

      {optionsOpen && (
        <div className="options-sheet">
          <label className="opt">
            <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
            Verbose — include every member's raw answers and per-round detail
          </label>
          <label className="opt">
            <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
            Run in background — get a job you can keep working past
          </label>
          <label className="opt">
            <input
              type="checkbox"
              checked={webAccess ?? defaultWebAccess}
              onChange={(e) => setWebAccess(e.target.checked)}
            />
            Search the web — members research current facts instead of answering from
            training data{defaultWebAccess && webAccess === null ? ' (council default: on)' : ''}
          </label>
          <label className="opt">
            <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
            Force fresh run — skip the 15-minute repeat-ask cache
          </label>
          <label className="opt opt-block">
            Save report to file — the server writes the full result (absolute .md/.txt/.json path)
            <input
              type="text"
              placeholder="/absolute/path/report.md"
              value={outputFile}
              onChange={(e) => setOutputFile(e.target.value)}
            />
          </label>
          <label className="opt opt-block">
            Member files — members write long findings to private scratch dirs (collected + inlined into saved reports)
            <select value={memberFileOutput} onChange={(e) => setMemberFileOutput(e.target.value as 'auto' | 'on' | 'off')}>
              <option value="auto">Auto — on for repo/web asks</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label className="opt opt-block">
            Reasoning effort — how hard every member and the judge think
            <select
              value={effort ?? ''}
              onChange={(e) => setEffort((e.target.value || null) as ReasoningEffort | null)}
            >
              <option value="">
                {defaultEffort
                  ? `Council default (${defaultEffort})`
                  : "Council default (each model's own)"}
              </option>
              {EFFORTS.map((e) => (
                <option key={e.id} value={e.id}>{e.name} — {e.hint}</option>
              ))}
            </select>
          </label>
          {members.length > 0 && (
            <div className="opt opt-block">
              Per-member effort pins — override the levels above for one model
              {members.map((m) => (
                <label key={m} className="member-pin">
                  <span className="member-pin-label" title={m}>{m.split(':').slice(-2).join(':')}</span>
                  <select
                    value={memberEfforts[m] ?? ''}
                    onChange={(e) => setMemberEfforts((prev) => ({ ...prev, [m]: e.target.value as ReasoningEffort | '' }))}
                  >
                    <option value="">follow</option>
                    {EFFORTS.map((ef) => <option key={ef.id} value={ef.id}>{ef.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          <label className="opt opt-block">
            Extra context sent to every member
            <textarea
              rows={3}
              value={context}
              placeholder="Constraints, background, style requirements…"
              onChange={(e) => setContext(e.target.value)}
            />
          </label>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attach-row">
          {attachments.map((a) => (
            <span key={a.path} className={`attach-chip ${a.kind}`}>
              {a.kind === 'image' ? '🖼' : '📄'} {a.name}
              <button
                className="chip-x"
                aria-label={`Remove ${a.name}`}
                onClick={() => setAttachments((prev) => prev.filter((x) => x.path !== a.path))}
              >×</button>
            </span>
          ))}
        </div>
      )}

      <div className="composer">
        <button
          className="icon-btn attach-btn"
          aria-label="Attach documents or images"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? '…' : '+'}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        <textarea
          ref={textarea}
          className="composer-input"
          rows={Math.min(8, Math.max(1, question.split('\n').length))}
          placeholder="Ask the council…"
          value={question}
          disabled={disabled}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <button
          className="btn-primary send-btn"
          disabled={disabled || !question.trim()}
          onClick={submit}
        >
          Convene
        </button>
      </div>
      <p className="composer-hint">
        Enter to ask · Shift+Enter for a new line · attachments stay on this machine
      </p>
    </div>
  );
}

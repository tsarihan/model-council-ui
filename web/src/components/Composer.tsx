import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { MODES, type AskOptions, type Attachment, type ResponseMode } from '../types';

export function Composer({ defaultMode, disabled, onAsk }: {
  defaultMode: ResponseMode;
  disabled: boolean;
  onAsk: (question: string, attachments: Attachment[], opts: AskOptions) => void;
}) {
  const [question, setQuestion] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<ResponseMode | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [background, setBackground] = useState(false);
  const [context, setContext] = useState('');
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
          Options {verbose || background || context ? '·' : ''}
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

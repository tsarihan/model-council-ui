import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { memberIdentity, providerDisplayName } from '../lib/members';
import { EFFORTS, MODES, type ConfigPayload, type ModelEntry, type ReasoningEffort, type ResponseMode, type StatusPayload } from '../types';

const TIER_OPTIONS: Record<string, string[]> = {
  claude: ['free', 'pro', 'max5x', 'max20x'],
  chatgpt: ['free', 'plus', 'pro5x', 'pro20x'],
  ollama: ['free', 'pro', 'max'],
  grok: ['free', 'supergrok', 'premiumplus', 'heavy'],
};

export function CouncilPanel({ status, config, models, onClose, onChanged }: {
  status: StatusPayload | null;
  config: ConfigPayload | null;
  models: ModelEntry[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [judge, setJudge] = useState('auto');
  const [mode, setMode] = useState<ResponseMode>('categorized');
  const [rounds, setRounds] = useState(3);
  // '' is the "each model's own default" choice — saved as the "auto" sentinel,
  // which is NOT the same as the 'none' level (that actively asks for zero
  // reasoning). Keeping them distinct is why this can't just be a plain level.
  const [effort, setEffort] = useState<ReasoningEffort | ''>('');
  const [toolConc, setToolConc] = useState<number>(16);
  const [runTimeoutS, setRunTimeoutS] = useState(300);
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    setSelected(config.council.members);
    setJudge(config.council.judgeModel.startsWith('auto') ? 'auto' : config.council.judgeModel);
    setMode(config.council.responseMode);
    setRounds(config.council.maxDeconflictRounds);
    setEffort(config.council.reasoningEffort ?? '');
    if (typeof config.runtime.harnessToolConcurrency === 'number') setToolConc(config.runtime.harnessToolConcurrency);
  }, [config]);
  useEffect(() => {
    if (!status) return;
    setTiers(status.tiers);
    setRunTimeoutS(Math.round(status.timeouts.run_ms / 1000));
  }, [status]);

  // Union of discoverable models and current members (some members, e.g.
  // subscription CLIs, may not appear in list_models when logged out).
  const grouped = useMemo(() => {
    const byId = new Map<string, ModelEntry>();
    for (const m of models) byId.set(m.id, m);
    for (const id of selected) {
      if (!byId.has(id)) {
        byId.set(id, { id, provider: memberIdentity(id).provider, server: '', model: id, label: id });
      }
    }
    const groups = new Map<string, ModelEntry[]>();
    for (const m of byId.values()) {
      const key = m.provider;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    for (const list of groups.values()) list.sort((a, b) => a.id.localeCompare(b.id));
    return [...groups.entries()].sort();
  }, [models, selected]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setSaving(label);
    setNotice(null);
    try {
      await fn();
      setNotice('Saved.');
      onChanged();
    } catch (err) {
      setNotice(`Failed: ${(err as Error).message}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <aside className="panel" aria-label="Council settings">
      <div className="panel-head">
        <h2>The council</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">×</button>
      </div>
      <div className="panel-scroll">

        <section className="panel-section">
          <h3>Members <span className="muted">({selected.length})</span></h3>
          <p className="panel-hint">Who answers every question. Subscription members spend your own plan quota.</p>
          {grouped.map(([provider, list]) => (
            <div key={provider} className="provider-group">
              <h4>
                <span className="dot" style={{ background: memberIdentity(`${provider}:x`).color }} />
                {providerDisplayName(provider)}
              </h4>
              {list.map((m) => (
                <label key={m.id} className="member-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) => setSelected((prev) =>
                      e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id))}
                  />
                  <span className="member-id">{m.id}</span>
                  {m.paramSize && <span className="muted">{m.paramSize}</span>}
                </label>
              ))}
            </div>
          ))}
          <button
            className="btn-primary"
            disabled={saving !== null || selected.length === 0}
            onClick={() => run('members', () => api.saveConfig({ models: selected }))}
          >{saving === 'members' ? 'Saving…' : 'Save members'}</button>
        </section>

        <section className="panel-section">
          <h3>Deliberation</h3>
          <label className="field">
            Judge model
            <select value={judge} onChange={(e) => setJudge(e.target.value)}>
              <option value="auto">auto (largest member)</option>
              {selected.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label className="field">
            Default mode
            <select value={mode} onChange={(e) => setMode(e.target.value as ResponseMode)}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <p className="panel-hint">{MODES.find((m) => m.id === mode)?.hint}</p>
          <label className="field">
            Default reasoning effort
            <select value={effort} onChange={(e) => setEffort(e.target.value as ReasoningEffort | '')}>
              <option value="">auto (each model's own default)</option>
              {EFFORTS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <p className="panel-hint">
            {effort
              ? `${EFFORTS.find((e) => e.id === effort)?.hint}. Applies to every member and the judge; a level a backend can't take is clamped to its nearest.`
              : "No effort is sent — every member and the judge run at their own default depth."}
          </p>
          <label className="field">
            Max deconfliction rounds
            <input
              type="number" min={1} max={10} value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Harness tool concurrency
            <input
              type="number" min={1} max={64} value={toolConc}
              onChange={(e) => setToolConc(Number(e.target.value))}
            />
          </label>
          <p className="panel-hint">
            Parallel tool executions inside one Claude-CLI member (web fetches, repo reads). Overrides
            any throttle the member would inherit from your own session; seeded to 16 on install.
          </p>
          <button
            className="btn-primary"
            disabled={saving !== null}
            onClick={() => run('deliberation', () => api.saveConfig({
              judge_model: judge, response_mode: mode, max_deconflict_rounds: rounds,
              reasoning_effort: effort || 'auto',
              ...(Number.isFinite(toolConc) && toolConc >= 1 ? { harness_tool_concurrency: Math.min(64, Math.floor(toolConc)) } : {}),
            }))}
          >{saving === 'deliberation' ? 'Saving…' : 'Save deliberation'}</button>
        </section>

        <section className="panel-section">
          <h3>Timeouts</h3>
          <label className="field">
            Per-answer timeout (seconds)
            <input
              type="number" min={10} max={1800} value={runTimeoutS}
              onChange={(e) => setRunTimeoutS(Number(e.target.value))}
            />
          </label>
          <p className="panel-hint">Raise this if slow local models get cut off mid-answer.</p>
          <button
            className="btn-primary"
            disabled={saving !== null}
            onClick={() => run('timeouts', () => api.timeouts({ run_timeout_ms: runTimeoutS * 1000 }))}
          >{saving === 'timeouts' ? 'Saving…' : 'Save timeouts'}</button>
        </section>

        <section className="panel-section">
          <h3>Subscriptions</h3>
          <p className="panel-hint">Your plan tiers gate cloud access and how many requests run at once.</p>
          {Object.entries(TIER_OPTIONS).map(([provider, options]) => (
            <label key={provider} className="field">
              {providerDisplayName(provider === 'chatgpt' ? 'codex-cli' : provider === 'claude' ? 'claude-cli' : provider === 'grok' ? 'grok-cli' : provider).replace(' (subscription)', '')} tier
              <select
                value={tiers[provider] ?? 'free'}
                onChange={(e) => setTiers((prev) => ({ ...prev, [provider]: e.target.value }))}
              >
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
          <button
            className="btn-primary"
            disabled={saving !== null}
            onClick={() => run('tiers', () => api.setup(tiers))}
          >{saving === 'tiers' ? 'Applying…' : 'Apply tiers & re-detect'}</button>
        </section>

        {status && (
          <section className="panel-section">
            <h3>Environment</h3>
            {status.quotaWarning && <p className="banner warn">{status.quotaWarning}</p>}
            {status.hints.map((h, i) => <p key={i} className="panel-hint">{h}</p>)}
            {status.reloadPending && (
              <p className="banner warn">A tier changed since the server started — restart the UI server to apply concurrency changes.</p>
            )}
          </section>
        )}

        {notice && <p className={`panel-notice ${notice.startsWith('Failed') ? 'bad' : ''}`}>{notice}</p>}
      </div>
    </aside>
  );
}

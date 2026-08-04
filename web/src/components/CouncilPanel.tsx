import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { memberIdentity, providerDisplayName } from '../lib/members';
import { MODES, type ConfigPayload, type ModelEntry, type ResponseMode, type StatusPayload } from '../types';

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
            Max deconfliction rounds
            <input
              type="number" min={1} max={10} value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>
          <button
            className="btn-primary"
            disabled={saving !== null}
            onClick={() => run('deliberation', () => api.saveConfig({
              judge_model: judge, response_mode: mode, max_deconflict_rounds: rounds,
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

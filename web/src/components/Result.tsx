import { useMemo, useState } from 'react';
import { Markdown } from '../lib/markdown';
import { memberIdentity } from '../lib/members';
import { buildReport, downloadMarkdown } from '../lib/report';
import type {
  CategorizedResult, ConflictItem, CouncilResult, DeconflictedResult,
  DialecticResult, IndividualResult, PooledDigest, PooledResult, RawResponse,
} from '../types';

const fmt = (ms?: number) => (ms == null ? '' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

function MemberTag({ label }: { label: string }) {
  const id = memberIdentity(label);
  return (
    <span className="member-tag" style={{ ['--seat' as string]: id.color }} title={label}>
      {label}
    </span>
  );
}

function ResponseCards({ list, openFirst }: { list: RawResponse[]; openFirst?: boolean }) {
  return (
    <div className="response-cards">
      {list.map((r, i) => (
        <details key={`${r.label}-${i}`} className="response-card" open={openFirst && i === 0}>
          <summary>
            <MemberTag label={r.label} />
            <span className="latency">{fmt(r.latencyMs)}</span>
            {r.error && <span className="pill warn">failed</span>}
          </summary>
          {r.error
            ? <p className="resp-error">{r.error}</p>
            : <Markdown text={r.response} />}
        </details>
      ))}
    </div>
  );
}

function Conflicts({ items, title }: { items: ConflictItem[]; title: string }) {
  if (!items.length) return null;
  return (
    <section className="section">
      <h3 className="section-title conflict">{title}</h3>
      {items.map((c) => (
        <div key={c.id} className="conflict-card">
          <p className="conflict-topic">{c.topic}</p>
          {c.positions.map((p, i) => (
            <div key={i} className="position">
              <div className="position-models">{p.models.map((m) => <MemberTag key={m} label={m} />)}</div>
              <p>{p.position}</p>
            </div>
          ))}
          {c.resolution && <p className="resolution">Resolved: {c.resolution}</p>}
        </div>
      ))}
    </section>
  );
}

function Pool({ digest, title }: { digest: PooledDigest; title: string }) {
  return (
    <div className="pool">
      <h4>{title}</h4>
      {digest.judgeDegraded && <p className="pill warn">judge failed — empty pool is a fallback</p>}
      {digest.options.map((o, i) => (
        <div key={i} className="pool-option">
          <p className="pool-answer">{o.answer}</p>
          <Markdown text={o.rationale} className="pool-rationale" />
          <div className="position-models">{o.models.map((m) => <MemberTag key={m} label={m} />)}</div>
        </div>
      ))}
      {digest.options.length === 0 && !digest.judgeDegraded && <p className="muted">No distinct options.</p>}
    </div>
  );
}

// ── Per-mode detail views ────────────────────────────────────────────────────

function Individual({ r }: { r: IndividualResult }) {
  return <ResponseCards list={r.responses} openFirst />;
}

function Categorized({ r }: { r: CategorizedResult }) {
  return (
    <>
      {r.commonAgreement && (
        <section className="section">
          <h3 className="section-title agree">Common agreement</h3>
          <Markdown text={r.commonAgreement} />
        </section>
      )}
      {r.complementary.length > 0 && (
        <section className="section">
          <h3 className="section-title">Complementary insights</h3>
          {r.complementary.map((c, i) => (
            <div key={i} className="insight">
              <span className="insight-aspect">{c.aspect}</span>
              <p>{c.insight}</p>
              <div className="position-models">{c.models.map((m) => <MemberTag key={m} label={m} />)}</div>
            </div>
          ))}
        </section>
      )}
      <Conflicts items={r.conflicting} title={`Conflicts (${r.conflicting.length})`} />
      {r.rawResponses && r.rawResponses.length > 0 && (
        <details className="raw-details">
          <summary>Raw member answers ({r.rawResponses.length})</summary>
          <ResponseCards list={r.rawResponses} />
        </details>
      )}
    </>
  );
}

function Deconflicted({ r }: { r: DeconflictedResult }) {
  const score = r.deconflictionScore;
  return (
    <>
      <div className="score-row">
        <div
          className="score-dial"
          role="img"
          aria-label={score === null ? 'No score — judge failed' : `Deconfliction score ${score}%`}
          style={{ ['--score' as string]: `${score ?? 0}` }}
        >
          <span className="score-num">{score === null ? '—' : `${Math.round(score)}%`}</span>
        </div>
        <div className="score-meta">
          <p>{r.resolved} of {r.totalConflicts} conflicts resolved · {r.roundsTaken}/{r.maxRounds} rounds</p>
          {score === null && <p className="pill warn">judge failed before conflicts could be counted</p>}
        </div>
      </div>
      <section className="section">
        <h3 className="section-title agree">Final synthesis</h3>
        <Markdown text={r.finalSynthesis} />
      </section>
      <Conflicts items={r.unresolvedConflicts} title={`Still unresolved (${r.unresolvedConflicts.length})`} />
      {r.roundHistory.length > 0 && (
        <details className="raw-details">
          <summary>Round history</summary>
          <table className="rounds">
            <thead><tr><th>Round</th><th>Entering</th><th>Resolved</th><th>Remaining</th></tr></thead>
            <tbody>
              {r.roundHistory.map((h) => (
                <tr key={h.round}>
                  <td>{h.round}</td><td>{h.conflictsEntering}</td>
                  <td>{h.conflictsResolved}</td><td>{h.conflictsRemaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {r.initialResponses && <details className="raw-details"><summary>Initial answers</summary><ResponseCards list={r.initialResponses} /></details>}
    </>
  );
}

function Pooled({ r }: { r: PooledResult }) {
  return (
    <>
      <div className="pools">
        <Pool digest={r.initialPool} title="Before reconsideration" />
        <Pool digest={r.finalPool} title="After reconsideration" />
      </div>
      <details className="raw-details">
        <summary>Reconsidered answers ({r.reconsidered.length})</summary>
        <ResponseCards list={r.reconsidered} />
      </details>
      {r.initialResponses && <details className="raw-details"><summary>Initial answers</summary><ResponseCards list={r.initialResponses} /></details>}
    </>
  );
}

function Dialectic({ r }: { r: DialecticResult }) {
  return (
    <>
      <section className="section">
        <h3 className="section-title">Options, argued both ways</h3>
        {r.prosCons.map((o, i) => (
          <div key={i} className="dossier">
            <p className="pool-answer">{o.answer}</p>
            <div className="pros-cons">
              <div>
                <h4 className="agree">Pros</h4>
                <ul>{o.pros.map((p, j) => <li key={j}>{p}</li>)}</ul>
              </div>
              <div>
                <h4 className="conflict">Cons</h4>
                <ul>{o.cons.map((c, j) => <li key={j}>{c}</li>)}</ul>
              </div>
            </div>
            {o.championedBy.length > 0 && (
              <div className="position-models">{o.championedBy.map((m) => <MemberTag key={m} label={m} />)}</div>
            )}
          </div>
        ))}
      </section>
      <section className="section">
        <h3 className="section-title agree">Final ranked selections</h3>
        <ResponseCards list={r.selections} openFirst />
      </section>
      <details className="raw-details">
        <summary>Defenses (antithesis round)</summary>
        <ResponseCards list={r.defenses} />
      </details>
      {r.initialResponses && <details className="raw-details"><summary>Thesis (initial answers)</summary><ResponseCards list={r.initialResponses} /></details>}
    </>
  );
}

// ── Shell with tabs + export ─────────────────────────────────────────────────

export function Result({ result, question, askedAt, elapsedMs }: {
  result: CouncilResult;
  question: string;
  askedAt: number;
  elapsedMs?: number;
}) {
  const [tab, setTab] = useState<'result' | 'document' | 'json'>('result');
  const report = useMemo(() => buildReport(question, result, askedAt), [question, result, askedAt]);
  const [copied, setCopied] = useState(false);

  const warnings: string[] = [];
  if ('timeoutNotice' in result && result.timeoutNotice) {
    warnings.push(`Some members were cut off by the timeout: ${(result.timedOutMembers ?? []).join(', ')}. Raise timeouts in the Council panel and re-ask.`);
  }
  if ('judgeDegraded' in result && result.judgeDegraded) {
    warnings.push('The judge model failed on part of this run — empty sections are a fallback, not agreement.');
  }
  if ('note' in result && result.note) warnings.push(result.note);
  if ('visionRouting' in result && result.visionRouting && result.visionRouting.skippedNonVision.length > 0) {
    warnings.push(`Image not sent to non-vision members: ${result.visionRouting.skippedNonVision.join(', ')}.`);
  }

  const body = !('mode' in result) || result.mode === undefined
    ? <Markdown text={(result as { raw: string }).raw} />
    : result.mode === 'individual' ? <Individual r={result} />
    : result.mode === 'categorized' ? <Categorized r={result} />
    : result.mode === 'deconflicted' ? <Deconflicted r={result} />
    : result.mode === 'pooled' ? <Pooled r={result} />
    : <Dialectic r={result} />;

  return (
    <div className="result">
      <div className="result-toolbar">
        <span className="result-mode">{('mode' in result && result.mode) || 'answer'}</span>
        {'judgeModel' in result && result.judgeModel && <span className="result-judge">judge: {result.judgeModel}</span>}
        {elapsedMs != null && <span className="result-elapsed">{fmt(elapsedMs)}</span>}
        <span className="spacer" />
        <div className="tabs" role="tablist">
          {(['result', 'document', 'json'] as const).map((t) => (
            <button
              key={t} role="tab" aria-selected={tab === t}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >{t === 'result' ? 'Result' : t === 'document' ? 'Document' : 'JSON'}</button>
          ))}
        </div>
        <button
          className="btn-quiet"
          onClick={() => {
            navigator.clipboard.writeText(report).then(() => {
              setCopied(true); setTimeout(() => setCopied(false), 1500);
            });
          }}
        >{copied ? 'Copied' : 'Copy'}</button>
        <button
          className="btn-quiet"
          onClick={() => downloadMarkdown(`council-report-${new Date(askedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`, report)}
        >Download .md</button>
      </div>

      {warnings.map((w, i) => <p key={i} className="banner warn">{w}</p>)}

      {tab === 'result' && <div className="result-body">{body}</div>}
      {tab === 'document' && (
        <div className="document">
          <Markdown text={report} className="document-md" />
          <div className="document-actions">
            <button className="btn-quiet" onClick={() => window.print()}>Print / save as PDF</button>
          </div>
        </div>
      )}
      {tab === 'json' && <pre className="json">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

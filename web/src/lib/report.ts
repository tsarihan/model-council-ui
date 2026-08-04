import type { CouncilResult, RawResponse } from '../types';

const fmtLatency = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

function responses(list: RawResponse[] | undefined, heading: string): string {
  if (!list?.length) return '';
  const parts = [`## ${heading}\n`];
  for (const r of list) {
    parts.push(`### ${r.label}${r.latencyMs ? ` · ${fmtLatency(r.latencyMs)}` : ''}\n`);
    parts.push(r.error ? `> ⚠️ ${r.error}\n` : `${r.response}\n`);
  }
  return parts.join('\n');
}

/** Compose a self-contained markdown document from a council result. */
export function buildReport(question: string, result: CouncilResult, askedAt: number): string {
  const date = new Date(askedAt).toLocaleString();
  const head = [
    `# Council report`,
    ``,
    `**Question:** ${question}`,
    ``,
    `*Mode: ${result.mode ?? 'raw'} · ${date}*`,
    ``,
  ];
  const warn: string[] = [];
  if ('timeoutNotice' in result && result.timeoutNotice) {
    warn.push(`> ⚠️ ${result.timeoutNotice} (${(result.timedOutMembers ?? []).join(', ')})`);
  }
  if ('judgeDegraded' in result && result.judgeDegraded) {
    warn.push(`> ⚠️ The judge model failed on part of this run — empty sections are a fallback, not agreement.`);
  }

  const body: string[] = [];
  if (!('mode' in result) || result.mode === undefined) {
    body.push((result as { raw: string }).raw);
  } else if (result.mode === 'individual') {
    body.push(responses(result.responses, 'Member answers'));
  } else if (result.mode === 'categorized') {
    if (result.commonAgreement) body.push(`## Common agreement\n\n${result.commonAgreement}\n`);
    if (result.complementary?.length) {
      body.push('## Complementary insights\n');
      for (const c of result.complementary) body.push(`- **${c.aspect}** (${c.models.join(', ')}): ${c.insight}`);
      body.push('');
    }
    if (result.conflicting?.length) {
      body.push('## Conflicts\n');
      for (const c of result.conflicting) {
        body.push(`### ${c.topic}\n`);
        for (const p of c.positions) body.push(`- **${p.models.join(', ')}**: ${p.position}`);
        body.push('');
      }
    }
    body.push(`*Judge: ${result.judgeModel}*`);
  } else if (result.mode === 'deconflicted') {
    body.push(`## Verdict\n\n${result.finalSynthesis}\n`);
    body.push(`**Deconfliction score:** ${result.deconflictionScore === null ? 'n/a (judge failed)' : `${result.deconflictionScore}%`}`
      + ` — ${result.resolved}/${result.totalConflicts} conflicts resolved in ${result.roundsTaken} round(s)\n`);
    if (result.unresolvedConflicts?.length) {
      body.push('## Still unresolved\n');
      for (const c of result.unresolvedConflicts) {
        body.push(`### ${c.topic}\n`);
        for (const p of c.positions) body.push(`- **${p.models.join(', ')}**: ${p.position}`);
        body.push('');
      }
    }
    if (result.roundHistory?.length) {
      body.push('## Rounds\n');
      body.push('| Round | Entering | Resolved | Remaining |', '|---|---|---|---|');
      for (const r of result.roundHistory) {
        body.push(`| ${r.round} | ${r.conflictsEntering} | ${r.conflictsResolved} | ${r.conflictsRemaining} |`);
      }
      body.push('');
    }
    body.push(`*Judge: ${result.judgeModel}*`);
  } else if (result.mode === 'pooled') {
    const pool = (title: string, digest: typeof result.initialPool) => {
      body.push(`## ${title}\n`);
      if (digest.judgeDegraded) body.push('> ⚠️ Judge failed on this digest — empty is a fallback.\n');
      for (const o of digest.options) {
        body.push(`### ${o.answer}\n`, `${o.rationale}\n`, `*Held by: ${o.models.join(', ')}*\n`);
      }
    };
    pool('Initial pool', result.initialPool);
    body.push(responses(result.reconsidered, 'Reconsidered answers'));
    pool('Final pool', result.finalPool);
    body.push(`*Judge: ${result.judgeModel}*`);
  } else if (result.mode === 'dialectic') {
    if (result.prosCons?.length) {
      body.push('## Options dossier\n');
      for (const o of result.prosCons) {
        body.push(`### ${o.answer}\n`);
        if (o.pros.length) body.push('**Pros**\n', ...o.pros.map((p) => `- ${p}`), '');
        if (o.cons.length) body.push('**Cons**\n', ...o.cons.map((c) => `- ${c}`), '');
        if (o.championedBy.length) body.push(`*Championed by: ${o.championedBy.join(', ')}*\n`);
      }
    }
    body.push(responses(result.selections, 'Final ranked selections'));
    body.push(responses(result.defenses, 'Defenses (antithesis)'));
    body.push(`*Judge: ${result.judgeModel}*`);
  }

  return [...head, ...warn, warn.length ? '' : null, ...body]
    .filter((l): l is string => l !== null)
    .join('\n');
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

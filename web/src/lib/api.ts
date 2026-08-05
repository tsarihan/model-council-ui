import type {
  Attachment, ConfigPayload, CouncilResult, ModelEntry, StatusPayload,
} from '../types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error || `${res.status} ${res.statusText}`);
  return body as T;
}

export const api = {
  status: () => fetch('/api/status').then((r) => json<StatusPayload>(r)),
  config: () => fetch('/api/config').then((r) => json<ConfigPayload>(r)),
  models: () => fetch('/api/models').then((r) => json<{ total: number; models: ModelEntry[] }>(r)),

  saveConfig: (body: {
    models?: string[]; judge_model?: string; response_mode?: string; max_deconflict_rounds?: number;
    /** A level, or 'auto' to clear it back to each model's own default. */
    reasoning_effort?: string;
  }) => fetch('/api/config', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => json<unknown>(r)),

  setup: (tiers: Record<string, string>) => fetch('/api/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tiers),
  }).then((r) => json<unknown>(r)),

  timeouts: (body: { run_timeout_ms?: number; repo_timeout_ms?: number }) => fetch('/api/timeouts', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => json<unknown>(r)),

  upload: async (files: File[]): Promise<Attachment[]> => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await json<{ files: Attachment[] }>(res);
    return data.files;
  },

  /** Price an ask before running it — free, no model calls (server ≥0.2.90). */
  estimate: (body: { mode?: string; web_access?: boolean; max_deconflict_rounds?: number }) =>
    fetch('/api/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then((r) => json<Record<string, unknown>>(r)),

  askAsync: (args: Record<string, unknown>) => fetch('/api/ask-async', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  }).then((r) => json<{ status: string; job_id: string }>(r)),

  job: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}`).then(
    (r) => json<{ status: 'running' | 'done' | 'error'; result?: CouncilResult; error?: string; elapsedMs?: number }>(r),
  ),

  /** ask_council over SSE. Resolves with the result; onProgress gets live status lines. */
  ask: async (
    args: Record<string, unknown>,
    onProgress: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<CouncilResult> => {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`ask failed: ${res.status} ${res.statusText}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: CouncilResult | undefined;
    let error: string | undefined;

    const handle = (chunk: string) => {
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) return;
      const parsed = JSON.parse(data);
      if (event === 'progress' && parsed.message) onProgress(parsed.message);
      else if (event === 'result') result = parsed;
      else if (event === 'error') error = parsed.error;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (chunk.trim() && !chunk.startsWith(':')) handle(chunk);
      }
    }
    if (error) throw new Error(error);
    if (!result) throw new Error('The council run ended without a result — the server may have restarted.');
    return result;
  },
};

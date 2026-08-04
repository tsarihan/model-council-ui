import type { Conversation } from '../types';

const KEY = 'model-council-ui.conversations.v1';

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const convos = JSON.parse(raw) as Conversation[];
    // A run that was in flight when the tab closed can never complete.
    for (const c of convos) {
      for (const m of c.messages) {
        if (m.role === 'council' && m.status === 'running' && !m.jobId) {
          m.status = 'error';
          m.error = 'This run was interrupted when the page closed.';
        }
      }
    }
    return convos;
  } catch {
    return [];
  }
}

export function saveConversations(convos: Conversation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(convos.slice(0, 100)));
  } catch {
    // Quota exceeded — drop oldest conversations and retry once.
    try {
      localStorage.setItem(KEY, JSON.stringify(convos.slice(0, 20)));
    } catch { /* give up quietly; chat still works in memory */ }
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

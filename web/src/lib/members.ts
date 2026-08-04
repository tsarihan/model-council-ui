// Provider identity: color + short name derived from a member label
// like "ollama:llama3", "claude-cli:opus", "codex-cli:default",
// "claude-cli/claude-cli-ollama:glm-5.2:cloud".

export interface MemberIdentity {
  provider: string;
  short: string;     // model part, shown in the seat tooltip / chip
  initials: string;  // 2 chars for the seat
  color: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  'claude-cli': '#C46848',
  anthropic: '#C46848',
  'codex-cli': '#5E8D7C',
  openai: '#5E8D7C',
  ollama: '#56687A',
  'grok-cli': '#2F2F35',
  xai: '#2F2F35',
  vllm: '#6B7BD6',
  sglang: '#6B7BD6',
  trtllm: '#6B7BD6',
};

export function memberIdentity(label: string): MemberIdentity {
  const colon = label.indexOf(':');
  const head = colon === -1 ? label : label.slice(0, colon);
  const model = colon === -1 ? label : label.slice(colon + 1);
  const provider = head.split('/')[0];
  const isHarness = head.includes('/');
  const cleaned = model.replace(/:cloud$/, '');
  const initials = cleaned.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
  return {
    provider,
    short: isHarness ? `${cleaned} (harness)` : cleaned,
    initials,
    color: PROVIDER_COLORS[provider] ?? '#7A6F63',
  };
}

export function providerDisplayName(provider: string): string {
  switch (provider) {
    case 'claude-cli': return 'Claude (subscription)';
    case 'codex-cli': return 'ChatGPT (subscription)';
    case 'grok-cli': return 'Grok (subscription)';
    case 'ollama': return 'Ollama';
    case 'openai': return 'OpenAI API';
    case 'anthropic': return 'Anthropic API';
    case 'xai': return 'X.AI API';
    default: return provider;
  }
}

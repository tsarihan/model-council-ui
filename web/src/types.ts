// ── Council result shapes (mirrors model-council-mcp/src/types.ts) ──────────

export type ResponseMode =
  | 'individual'
  | 'categorized'
  | 'deconflicted'
  | 'pooled'
  | 'dialectic';

export const MODES: { id: ResponseMode; name: string; hint: string }[] = [
  { id: 'individual', name: 'Individual', hint: 'Each member answers side by side' },
  { id: 'categorized', name: 'Categorized', hint: 'Judge sorts answers into agreement, insights, and conflicts' },
  { id: 'deconflicted', name: 'Deconflicted', hint: 'Judge re-questions the council until conflicts resolve, with a score' },
  { id: 'pooled', name: 'Pooled · Delphi', hint: 'Members reconsider against a neutral, anonymous pool of answers' },
  { id: 'dialectic', name: 'Dialectic', hint: 'Defend, argue pros and cons, then re-select a ranked top 3' },
];

/**
 * How hard every member AND the judge think. `null` is a real option, not an
 * absence: it means "send nothing", leaving each model at its own default —
 * which is not the same as any one level and must stay selectable.
 */
export type ReasoningEffort =
  | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORTS: { id: ReasoningEffort; name: string; hint: string }[] = [
  { id: 'none', name: 'None', hint: 'No reasoning pass at all — fastest, cheapest' },
  { id: 'minimal', name: 'Minimal', hint: 'Barely think; for simple lookups' },
  { id: 'low', name: 'Low', hint: 'A little reasoning' },
  { id: 'medium', name: 'Medium', hint: 'Balanced depth and cost' },
  { id: 'high', name: 'High', hint: 'Deeper reasoning; noticeably slower' },
  { id: 'xhigh', name: 'Extra high', hint: 'Very deep; heavy on time and quota' },
  { id: 'max', name: 'Max', hint: 'Maximum depth — slowest and most expensive' },
];

/** Which deliberation round produced an answer (mirrors the server's ResponsePhase). */
export type ResponsePhase =
  | 'thesis'        // round 0: each member's initial, independent answer
  | 'antithesis'    // dialectic: defend your pick, critique the alternatives
  | 'synthesis'     // dialectic: final ranked re-selection
  | 'reconsidered'  // pooled: fresh answer after seeing the neutral pool
  | 'deconflict';   // deconflicted: a re-question aimed at the open conflicts

export interface RawResponse {
  label: string;
  response: string;
  error?: string;
  latencyMs: number;
  phase?: ResponsePhase;
  /** 1-based deconfliction round; only set when phase is 'deconflict'. */
  round?: number;
}

export interface VisionRouting {
  imagesAttached: number;
  queriedVisionModels: string[];
  skippedNonVision: string[];
}

export interface ComplementaryItem { aspect: string; models: string[]; insight: string }
export interface ConflictPosition { models: string[]; position: string }
export interface ConflictItem {
  id: string; topic: string; positions: ConflictPosition[];
  resolved?: boolean; resolution?: string;
}
export interface RoundSummary {
  round: number; conflictsEntering: number; conflictsResolved: number; conflictsRemaining: number;
}
export interface PooledOption { answer: string; rationale: string; models: string[] }
export interface PooledDigest { options: PooledOption[]; judgeDegraded?: boolean }
export interface DialecticOption { answer: string; pros: string[]; cons: string[]; championedBy: string[] }

interface ResultBase {
  question?: string;
  visionRouting?: VisionRouting;
  timedOutMembers?: string[];
  timeoutNotice?: string;
  judgeDegraded?: boolean;
  note?: string;
}

export interface IndividualResult extends ResultBase {
  mode: 'individual';
  responses: RawResponse[];
}
export interface CategorizedResult extends ResultBase {
  mode: 'categorized';
  commonAgreement: string | null;
  complementary: ComplementaryItem[];
  conflicting: ConflictItem[];
  rawResponses?: RawResponse[];
  judgeModel: string;
}
export interface DeconflictedResult extends ResultBase {
  mode: 'deconflicted';
  roundsTaken: number;
  maxRounds: number;
  deconflictionScore: number | null;
  resolved: number;
  totalConflicts: number;
  finalSynthesis: string;
  unresolvedConflicts: ConflictItem[];
  roundHistory: RoundSummary[];
  judgeModel: string;
  initialResponses?: RawResponse[];
}
export interface PooledResult extends ResultBase {
  mode: 'pooled';
  judgeModel: string;
  initialPool: PooledDigest;
  reconsidered: RawResponse[];
  finalPool: PooledDigest;
  initialResponses?: RawResponse[];
}
export interface DialecticResult extends ResultBase {
  mode: 'dialectic';
  judgeModel: string;
  defenses: RawResponse[];
  prosCons: DialecticOption[];
  selections: RawResponse[];
  initialResponses?: RawResponse[];
}

export type CouncilResult =
  | IndividualResult
  | CategorizedResult
  | DeconflictedResult
  | PooledResult
  | DialecticResult
  | { raw: string; mode?: undefined };

// ── Backend API payloads ─────────────────────────────────────────────────────

export interface ModelEntry {
  id: string;
  provider: string;
  server: string;
  model: string;
  label: string;
  paramSize?: string;
  family?: string;
  contextLength?: number;
}

export interface ConfigPayload {
  council: {
    members: string[];
    membershipSource: string;
    autoCouncil: boolean;
    judgeModel: string;
    responseMode: ResponseMode;
    maxDeconflictRounds: number;
    /** null = unset, i.e. each model runs at its own default depth. */
    reasoningEffort: ReasoningEffort | null;
  };
  providers: { id: string; type: string; label: string; baseUrl: string; hasApiKey: boolean }[];
  runtime: {
    requestTimeoutMs: number;
    repoRequestTimeoutMs: number;
    verbose: boolean;
    [k: string]: unknown;
  };
}

export interface StatusPayload {
  tiers: Record<string, string>;
  detected: Record<string, any>;
  council: { members: string[]; count: number };
  concurrency: Record<string, number>;
  timeouts: { run_ms: number; repo_ms: number };
  reloadPending: boolean;
  quotaWarning?: string | null;
  hints: string[];
}

export interface Attachment {
  path: string;
  name: string;
  size: number;
  kind: 'image' | 'file';
}

// ── Chat state ───────────────────────────────────────────────────────────────

export interface AskOptions {
  mode: ResponseMode;
  verbose: boolean;
  background: boolean;
  context?: string;
  /** Undefined = don't send one, so the council's configured default applies. */
  effort?: ReasoningEffort;
}

export interface UserMessage {
  role: 'user';
  question: string;
  attachments: Attachment[];
  mode: ResponseMode;
  at: number;
}

export interface CouncilMessage {
  role: 'council';
  status: 'running' | 'done' | 'error';
  progressMessage?: string;
  result?: CouncilResult;
  error?: string;
  jobId?: string;
  startedAt: number;
  elapsedMs?: number;
  members: string[];
}

export type ChatMessage = UserMessage | CouncilMessage;

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

# model-council-ui — design spec (2026-08-03)

## Purpose

A local web app that gives model-council-mcp a ChatGPT/Claude-class chat UX:
pick council members, pick a deliberation mode (individual / categorized /
deconflicted / pooled / dialectic), attach documents or images, ask, watch the
council deliberate live, and read the result as chat or export it as a document.

## Architecture

```
Browser (React/Vite SPA)
   │  REST + SSE (fetch)
   ▼
Node backend (Express, server/)
   │  MCP over stdio (@modelcontextprotocol/sdk Client)
   ▼
model-council-mcp bundle/server.cjs   ← the SAME server the Claude Code plugin runs
   │
   ├── Ollama (local + :cloud)
   ├── claude CLI  (your Claude subscription)
   ├── codex CLI   (your ChatGPT subscription)
   ├── grok CLI    (fail-closed, per plugin)
   └── OpenAI / Anthropic / X.AI APIs, vLLM / SGLang / TRT-LLM
```

Key decision: the backend is a genuine **MCP client** spawning the plugin's
zero-dependency bundle over stdio. It shares `~/.config/model-council/state.json`
with Claude Code, so council membership, tiers, timeouts, and vision caches are
one source of truth across both surfaces. No plugin code is duplicated.

Server bundle resolution order:
1. `MODEL_COUNCIL_SERVER` env var (absolute path to a `server.cjs`)
2. Newest version under `~/.claude/plugins/cache/model-council/model-council/*/bundle/server.cjs`
3. Sibling checkout `../model-council-mcp/bundle/server.cjs`

## Backend API

| Endpoint | MCP tool | Notes |
|---|---|---|
| `GET /api/status` | `council_status` | env, members, tiers, quota |
| `GET /api/config` | `get_council_config` | current settings |
| `GET /api/models` | `list_models` | grouped by provider in UI |
| `PUT /api/config` | `configure_council` | members / judge / mode / rounds |
| `POST /api/setup` | `setup_council` | subscription tiers |
| `PUT /api/timeouts` | `set_council_timeouts` | run/repo timeouts |
| `POST /api/upload` | — | multipart → temp path `{path,name,size,kind}` |
| `POST /api/ask` | `ask_council` | **SSE**: `progress` events (MCP notifications/progress) then `result` |
| `POST /api/ask-async` | `ask_council_async` | returns job_id |
| `GET /api/jobs/:id?` | `get_council_result` | poll / list |

- `ask_council` runs with `resetTimeoutOnProgress` and a long ceiling; SSE
  heartbeats every 15 s keep proxies from cutting the stream.
- Result text arrives wrapped in `═══ BEGINNING/END OF RESPONSE ═══` markers;
  backend strips them and returns parsed JSON (falls back to `{raw}`).
- Uploads are written to a per-boot temp dir; images (png/jpg/gif/webp) are
  routed to `images`, everything else to `files`. Both stay on this machine —
  the MCP server reads them from disk exactly like the plugin does.

## Frontend

Vite + React + TypeScript, no component framework. Layout, three zones:

```
┌──────────┬──────────────────────────────┬───────────────┐
│ sidebar  │  chat thread                 │ council panel │
│ convos   │  … messages …                │ members       │
│ + status │  [bench: seats light up]     │ judge, mode   │
│          │  composer  [mode][attach][→] │ options,tiers │
└──────────┴──────────────────────────────┴───────────────┘
```

- **Conversations** persist in `localStorage` (this is a single-user local
  tool; no server-side chat DB in v1).
- **Composer**: question textarea, attachment chips (upload → path), mode
  segmented control, options popover (verbose, run in background, extra
  context), Ask button.
- **The bench (signature element)**: a row of member seats above the run.
  During deliberation, MCP progress messages animate the seats (asking →
  answered) with a live status line ("Asking claude-cli:opus…").
- **Results**, per mode:
  - `individual` — answer cards per member, collapsible
  - `categorized` — Agreement / Complementary insights / Conflicts sections
  - `deconflicted` — score meter, rounds history, final synthesis, unresolved
  - `pooled` — initial pool vs final pool side by side (Delphi drift visible)
  - `dialectic` — pros/cons dossier per option + final ranked selections
  - every result: Raw JSON tab, **Download .md**, Copy, Print/document view
  - `judgeDegraded` / `timeoutNotice` surfaced as visible warnings, never
    silently rendered as clean results
- **Council panel**: member picker grouped by provider (from `list_models` +
  current config), judge select, default mode, max rounds, verbose default,
  timeouts, subscription tiers; save → `configure_council`/`setup_council`.

## Visual identity

Council-chamber, not sci-fi. Palette ("verdigris & ink"): ink `#131C1A`,
paper `#F4F6F5`, verdigris accent `#2E7D6E`, seat-lit `#3FA98F`, conflict
amber `#B4762A`, error madder `#A43636`. Dark theme via the same
tokens. Type: Fraunces (display, brand + section heads, used sparingly),
Public Sans (body/UI), JetBrains Mono (model ids, JSON, latencies) — all
bundled via @fontsource so the app works fully offline. Motion: seat pulse
while a member is thinking, one reveal on verdict; `prefers-reduced-motion`
respected.

## Error handling

- MCP process death → backend auto-respawns on next call; SSE emits `error`
  event with the message; UI shows a retriable error bubble.
- Tool errors (bad ref, oversized file, busy queue) pass through verbatim —
  the plugin's errors are already user-worthy.
- `full_repo_access` is deliberately **not** exposed in v1 (real permission
  grant; belongs to the CLI surface where the repo context is unambiguous).

## Testing

- Backend smoke: curl status/models/config against the real plugin bundle.
- E2E: drive the UI with browser tooling, run one real `individual`-mode ask
  against the fastest local Ollama model, screenshot each surface.

## Out of scope (v1)

Multi-user auth, server-side history, git_ref/full-repo review UI, streaming
partial member tokens (the MCP server returns whole completions).

# model-council-ui

A local web UI for [model-council-mcp](https://github.com/tsarihan/model-council-mcp) — ask one question, get a **council** of AI models (local Ollama, your Claude and ChatGPT subscriptions, self-hosted servers) deliberating in five modes, from a chat interface that works like the tools you already use.

- **Chat like ChatGPT/Claude** — conversations in the sidebar, composer with attachments, Enter to ask.
- **Pick your deliberation mode per question** — Individual, Categorized, Deconflicted (with a live score dial), Pooled (Delphi), or Dialectic (thesis → antithesis → synthesis) — each rendered with its own structured view, not a wall of text.
- **The bench** — every council member gets a seat; seats light up live as each model answers.
- **Documents in, documents out** — attach text files or images (vision-capable members are auto-routed); export any result as Markdown, copy it, or print it to PDF from the Document tab.
- **Dial the reasoning depth** — set how hard every member and the judge think (`none` … `max`), per question in the composer's Options or as a council-wide default in the Council panel. A level a given backend can't take is clamped to its nearest supported one, so one setting works across a mixed council.
- **Full council control** — members grouped by provider, judge model, default mode, default reasoning effort, deconfliction rounds, per-answer timeouts, and subscription tiers, all editable in the Council panel.
- **Background runs** — long deconfliction runs can run as background jobs; the UI polls and fills in the answer when it's done, even after a page reload.

## How it works

```
Browser (React) ── REST + SSE ──► Node bridge (Express)
                                        │  MCP over stdio
                                        ▼
                    model-council-mcp bundle/server.cjs  ← the same server
                        │                                   your Claude Code
                        ├── Ollama (local + :cloud)          plugin runs
                        ├── claude CLI (your subscription)
                        ├── codex CLI (your ChatGPT subscription)
                        └── OpenAI / Anthropic / X.AI APIs, vLLM / SGLang / TRT-LLM
```

The backend is a real **MCP client** that spawns the plugin's zero-dependency server bundle. It shares `~/.config/model-council/state.json` with your Claude Code plugin install, so council membership, tiers, and timeouts stay in sync between both surfaces. Everything runs on your machine; prompts only go to the model endpoints you configured in the council.

## Dependencies

Runtime (installed by `npm install`):

| Package | Role |
|---|---|
| `@modelcontextprotocol/sdk` | MCP stdio client that talks to the council server |
| `express`, `multer` | HTTP API, SSE streaming, file uploads |
| `react`, `react-dom` | UI |
| `marked`, `dompurify` | Sanitized Markdown rendering of member answers |
| `@fontsource/*` (Fraunces, Public Sans, JetBrains Mono) | Bundled fonts — fully offline |

Build tooling: Vite 6, TypeScript 5. No database, no external services — the only thing the app talks to is the local MCP server process.

## Setup

Requirements: Node 20+, and **one** of:
- the model-council Claude Code plugin installed (`/plugin install model-council@model-council`), or
- a clone of `model-council-mcp` sitting next to this repo, or
- `MODEL_COUNCIL_SERVER=/path/to/bundle/server.cjs`

```bash
git clone https://github.com/tsarihan/model-council-ui.git
cd model-council-ui
npm install
npm run build
npm start          # → http://localhost:8787
```

Development (Vite hot reload on :5173, API on :8787):

```bash
npm run dev
```

| Env var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port for the UI server | `8787` |
| `MODEL_COUNCIL_SERVER` | Explicit path to the MCP server bundle | auto-detected |

All model-council env vars (`OLLAMA_ADDRESS`, `REQUEST_TIMEOUT_MS`, …) pass through to the spawned MCP server.

## Notes

- Conversations are stored in your browser's localStorage — nothing leaves your machine.
- Uploaded files are written to a temp directory and passed to the MCP server as local paths (same trust model as the plugin's `files`/`images` parameters).
- `full_repo_access` is intentionally not exposed in the UI; use the Claude Code plugin for repo-wide reviews.
- Background jobs live in the MCP server's memory — restarting the UI server drops running jobs.

## License

Apache License 2.0 — Copyright (c) 2026 Tom Sarihan (Desnet AI LLC). See [LICENSE](LICENSE) and [NOTICE](NOTICE). Same license as model-council-mcp.

# Eve Studio — Roadmap & Architecture

A native desktop control center for **every Eve agent you own** — run them, chat with them, inspect
and edit their structure, give them **Arcana memory**, wire connections/channels, deploy, and keep
them in parity with Eve releases. Think "Claude Desktop / Hermes / OpenClaw" but for Eve, and
better. Shippable product; Electron + React + TypeScript + Tailwind + shadcn/ui.

Grounded in first-source research of Eve 0.23.0 (session protocol, CLI surface, authoring contract +
manifests, and the Arcana/Vercel wiring proven in the live `eve-gtm` agent).

## Core architecture

Electron with `contextIsolation` + a locked-down preload IPC bridge. Renderer is React/TS/Tailwind/
shadcn (Zustand for state). Heavy lifting lives in **main-process services**:

| Service | Responsibility |
|---|---|
| **AgentRegistry** | Known agents `{id, name, path, eveVersion, status}`; add-existing (pick a folder) or created-new. Persisted. |
| **AgentProcessManager** | Spawns & supervises one `eve dev --no-ui --port <free>` per running agent; health-gates on `GET /eve/v1/health`; assigns ports; restarts; stops all on quit. Loopback ⇒ no auth needed. |
| **ManifestReader** | Parses `.eve/compile/compiled-agent-manifest.json` (resolved tool JSON-schemas, connections, skills, channels+routes, schedules+cron, subagent graph, model) and `.eve/discovery/*` (raw markdown + diagnostics). Refreshes via `eve build` / `eve info --json`. |
| **CliRunner** | Structured spawns of `eve` / `vercel` / `pnpm` — `info --json`, `eval --json`, `deploy` (parse `Deployed: <url>` + exit code), `channels add web -y`, `build`. Knows scriptable-vs-hand-off. |
| **ChatService (+ SQLite)** | Eve has **no history API** — Studio owns persistence: per-thread `{SessionState cursor, ordered event log}`. Drives sessions with first-party `eve/client`; forwards the event stream to the renderer over IPC. |
| **ArcanaService** | Validate `kb_` keys read-only against `api.arcana.kybernesis.ai`; list/create workspaces; write the static-key MCP connection + env; browse/query a brain (timeline/entities/facts). |
| **VercelService** | Link (hand-off), deploy, env, runtime logs; channel connectors. |
| **UpdateService** | Per-agent installed-eve vs npm-latest; changelog; guided upgrade (`pnpm add eve@latest` → detect known breaking changes → migrate → gate on typecheck + `eve info`). |
| **SecretsVault** | OS keychain for `kb_` keys / tokens; never plaintext. |

### Decisions locked by research
- **Reuse Eve's client, don't hand-roll HTTP.** Chat = spawn `eve dev --no-ui --port N` + `eve/client` `Client`/`ClientSession` (or `eve/react` `useEveAgent` in the renderer). One process/port per running agent = true isolation. Loopback needs no credentials.
- **Studio owns chat history** (SQLite) — Eve exposes only a resume cursor, no session/turn list. This is what makes it feel like Claude Desktop.
- **Structure = read the compiled manifest, write files.** There is **no `eve model` command** and no mutation API — every edit (model, tools, connections, skills, schedules, subagents) is a **file write** against the documented templates, then re-run `eve info`/`build` to re-derive `.eve/` and surface diagnostics (0/0 gate).
- **Rich chat rendering** from the event union: `message.appended` deltas, tool calls correlated by `callId` (`actions.requested`+`action.result`), nested subagents (inline `subagent.event` wrappers or child `childSessionId` streams), HITL `input.requested`, OAuth `authorization.required`, token/cost from `step.completed.usage`.
- **Arcana the eve-gtm way**: a static `kb_` key MCP connection (`url: mcp.arcana.kybernesis.ai/mcp`, `getToken` from env, `X-Kyberagent-Agent: <workspace>` header) — app-scoped so it even works in scheduled turns. Keys validated read-only; per-subagent separate brains supported.
- **Parity**: `pnpm add eve@latest` + a migration catalog (e.g. `vercelSandboxBackend()`→`vercel()`, tool `needsApproval`→`approval`) + typecheck/`eve info` gates.

## Phases (milestones — reviewed as we go)

- **P0 — Foundation.** Repo, electron-vite, app shell, IPC bridge, design system, AgentRegistry, AgentProcessManager (spawn/health/stop), settings + secrets vault.
- **P1 — Library + live Chat.** Add existing agents; boot them; **stream chat with `eve-gtm`** rendering tool calls, subagents, approvals, cost; SQLite thread history + resume. *(First daily-usable build.)*
- **P2 — Structure Explorer.** Read the compiled manifest → render model, tools (+JSON-schema forms), connections, skills, channels+routes, schedules+cron, subagent graph, hooks, sandbox. Diagnostics panel.
- **P3 — Arcana Memory ⭐.** Wire a brain to any agent (workspace picker + key validate + connection/env write); per-subagent brains; **brain browser** (timeline, entities, facts, live query).
- **P4 — Structure editing.** Create/edit tools, connections, skills, schedules, subagents, hooks; change model; every edit is a templated file write + gate.
- **P5 — New-Agent wizard.** `eve init <name>` + guided model/channels/connections/Arcana in one flow.
- **P6 — Connections & Channels.** MCP/OpenAPI connections; Slack/Discord/Telegram via the Vercel Connect flow (automate what we can, hand off the browser steps).
- **P7 — Deploy & Logs.** Deploy when linked; link hand-off; production URL/status; Vercel runtime logs/errors.
- **P8 — Eval runner.** `eve eval --list/--json`; run + results UI; per-agent regression status.
- **P9 — Update / Parity center.** Version badges, changelog, guided upgrade + migration + verification.
- **P10 — Ship.** electron-builder packaging + notarization + auto-update; onboarding; command palette; multi-agent dashboard.

## Stack
Electron · electron-vite · React · TypeScript · Tailwind · shadcn/ui · Zustand · better-sqlite3 ·
`eve` (client) · electron-builder (+ notarization/auto-update). Separate repo from the agents.

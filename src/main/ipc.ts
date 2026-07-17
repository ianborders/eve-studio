import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  app,
  dialog,
  ipcMain,
} from "electron";
import {
  type AddAgentResult,
  type AgentRecord,
  type AppInfo,
  type BrainInfo,
  type DetectedBrain,
  IPC,
  type WireBrainInput,
  type WireBrainResult,
} from "../shared/ipc";
import { AgentManager } from "./agentManager";
import {
  createHook,
  createSandbox,
  createSchedule,
  createSubagent,
  createTool,
  readEnv,
  readModelConfig,
  readSandbox,
  writeEnv,
  writeModelConfig,
} from "./agentAuthoring";
import {
  addConnection,
  createSkill,
  deleteConnectionFile,
  readConnectionFile,
  readInstructions,
  scanConnectorUsage,
  writeConnectionFile,
  writeInstructions,
} from "./agentFiles";
import {
  capabilityFiles,
  deleteCapability,
  writeCapabilityFile,
} from "./agentCapabilities";
import { ensureNodeRuntime } from "./runtime";
import {
  arcanaQuery,
  arcanaStats,
  arcanaTimeline,
  arcanaValidate,
} from "./arcana";
import {
  brainFromConnection,
  detectBrain,
  keyFromEnv,
  wireBrain,
} from "./arcanaWire";
import { ChatController } from "./chat";
import {
  addChannel,
  CliRunner,
  initAgent,
  listChannels,
  listEvals,
} from "./cli";
import { checkHealth, getAgentInfo, type SessionConn } from "./eveSession";
import * as store from "./store";
import { readStructure } from "./structure";
import {
  channelConnectors,
  deleteChannelFile,
  writeChannel,
} from "./agentChannels";
import {
  openConnectExternal,
  openConnector,
  openConnectWindow,
} from "./connectWindow";
import {
  vercelConnectAttach,
  vercelConnectCreate,
  vercelBlobCreateStore,
  vercelConnectCreateStream,
  vercelConnectList,
  vercelConnectProjectsMap,
  vercelEnvAdd,
  vercelEnvLs,
  vercelEnvPull,
  vercelEnvSetAll,
  startVercelLogin,
  vercelLink,
  vercelProdInfo,
  vercelStatus,
  vercelTeams,
  vercelWhoami,
} from "./vercel";
import { modelReadiness } from "./vercel";
import {
  applyProposal,
  detectPatterns,
  draftProposal,
  getProposeTool,
  listQueuedProposals,
  type ProposalQueue,
  resolveQueuedProposal,
  setProposeTool,
} from "./evolve";
import type { EvolveProposal } from "../shared/ipc";

/** Read a variable from an agent's .env.local (for deployed route auth). */
function readEnvLocal(agentPath: string, name: string): string | null {
  const p = join(agentPath, ".env.local");
  if (!existsSync(p)) {
    return null;
  }
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, "m");
  const m = re.exec(readFileSync(p, "utf8"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

function agentPathOf(id: string): string {
  const a = store.getAgent(id);
  if (!a) {
    throw new Error("Unknown agent.");
  }
  return a.path;
}
function tryWrite(fn: () => { relPath: string }): {
  ok: boolean;
  relPath?: string;
  error?: string;
} {
  try {
    return { ok: true, ...fn() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** What registerIpc hands back for lifecycle cleanup on quit. */
export interface IpcHandles {
  agents: AgentManager;
  cli: CliRunner;
}

function brainInfo(cred: store.BrainCred | undefined): BrainInfo | null {
  return cred
    ? {
        workspace: cred.workspace,
        envVar: cred.envVar,
        hasKey: Boolean(cred.key),
      }
    : null;
}

function requireBrain(agentId: string): store.BrainCred {
  const cred = store.getBrain(agentId);
  if (!cred) {
    throw new Error("No brain configured for this agent.");
  }
  return cred;
}

/**
 * Resolve an agent's Arcana brain credential — a brain saved in Studio, else
 * detected from the agent's own Arcana connection + env key. Lets the proposal
 * queue work without the user separately wiring the brain in Studio.
 */
function resolveBrainCred(agentId: string): store.BrainCred | null {
  const saved = store.getBrain(agentId);
  if (saved) {
    return saved;
  }
  const path = agentPathOf(agentId);
  const d = brainFromConnection(path);
  if (d.workspace && d.envVar) {
    const key = keyFromEnv(path, d.envVar);
    if (key) {
      return { workspace: d.workspace, envVar: d.envVar, key };
    }
  }
  return null;
}

/**
 * Where to look for proposals the agent queued while deployed.
 *
 * @remarks
 * Mirrors the backend baked into the generated tool: an Arcana brain when the
 * agent has one, else Vercel Blob. The Blob token has to be the static
 * `BLOB_READ_WRITE_TOKEN` — Studio runs outside Vercel, where OIDC is refused —
 * and arrives via `vercel env pull`.
 */
function resolveQueue(agentId: string): ProposalQueue | null {
  const brain = resolveBrainCred(agentId);
  if (brain) {
    return { kind: "arcana", brain };
  }
  const token = keyFromEnv(agentPathOf(agentId), "BLOB_READ_WRITE_TOKEN");
  return token ? { kind: "blob", token } : null;
}

/**
 * Whether the agent can actually queue a proposal raised while deployed.
 *
 * @remarks
 * The UI needs this up front: without somewhere to queue, an agent asked over
 * Slack to change itself can only report that it failed. Blob is the default
 * backend and needs a store — which Studio can create.
 */
function proposeQueueStatus(agentId: string): {
  backend: "arcana" | "blob";
  ready: boolean;
} {
  const queue = resolveQueue(agentId);
  if (queue) {
    return { backend: queue.kind, ready: true };
  }
  const brain = brainFromConnection(agentPathOf(agentId));
  return {
    backend: brain.workspace && brain.envVar ? "arcana" : "blob",
    ready: false,
  };
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

function hashPath(p: string): string {
  let h = 0;
  for (let i = 0; i < p.length; i += 1) {
    h = (h * 31 + p.charCodeAt(i)) | 0;
  }
  return `a${(h >>> 0).toString(36)}`;
}

function addAgentFromPath(dir: string): AddAgentResult {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return { ok: false, error: "No package.json — this isn't an Eve project." };
  }
  const hasAgentDir = existsSync(join(dir, "agent"));
  const flatAgent =
    existsSync(join(dir, "agent.ts")) ||
    existsSync(join(dir, "instructions.md"));
  if (!(hasAgentDir || flatAgent)) {
    return { ok: false, error: "No agent/ directory found in that folder." };
  }

  let name = basename(dir);
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
    if (pkg.name) {
      name = pkg.name;
    }
  } catch {
    // fall back to dir name
  }

  let eveVersion: string | null = null;
  try {
    eveVersion = (
      JSON.parse(
        readFileSync(join(dir, "node_modules", "eve", "package.json"), "utf8"),
      ) as { version: string }
    ).version;
  } catch {
    // eve not installed here
  }

  const id = hashPath(dir);
  const existing = store.getAgent(id);
  if (existing) {
    return { ok: true, agent: existing };
  }
  const agent: AgentRecord = {
    id,
    name,
    path: dir,
    eveVersion,
    addedAt: Date.now(),
  };
  store.upsertAgent(agent);
  return { ok: true, agent };
}

/** Registers every ipcMain handler. Returns handles so callers can clean up on quit. */
export function registerIpc(): IpcHandles {
  const agents = new AgentManager();
  agents.onStatus((state) => broadcast(IPC.agentStatusChanged, state));
  agents.onLog((agentId, data) => broadcast(IPC.agentLog, { agentId, data }));

  const cli = new CliRunner(
    (runId, data) => broadcast(IPC.cliChunk, { runId, data }),
    (runId, code) => broadcast(IPC.cliExit, { runId, code }),
  );

  const chat = new ChatController(
    (threadId, event) => broadcast(IPC.chatEvent, { threadId, event }),
    (msg) => broadcast(IPC.chatStatus, msg),
  );

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
  }));

  // --- agents ---
  ipcMain.handle(IPC.agentsList, () => store.listAgents());

  ipcMain.handle(IPC.agentsAdd, async (): Promise<AddAgentResult> => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const picked = win
      ? await dialog.showOpenDialog(win, {
          properties: ["openDirectory"],
          title: "Select an Eve agent folder",
        })
      : await dialog.showOpenDialog({
          properties: ["openDirectory"],
          title: "Select an Eve agent folder",
        });
    if (picked.canceled || !picked.filePaths[0]) {
      return { ok: false, error: "cancelled" };
    }
    return addAgentFromPath(picked.filePaths[0]);
  });

  ipcMain.handle(IPC.agentsRemove, (_e: IpcMainInvokeEvent, id: string) => {
    agents.stop(id);
    store.removeAgent(id);
    return store.listAgents();
  });

  ipcMain.handle(IPC.dialogPickDir, async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const opts = {
      properties: ["openDirectory", "createDirectory"] as Array<
        "openDirectory" | "createDirectory"
      >,
      title: "Choose a folder",
    };
    const picked = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });

  ipcMain.handle(
    IPC.agentCreate,
    (
      _e: IpcMainInvokeEvent,
      input: import("../shared/ipc").CreateAgentInput,
    ) => {
      const runId = store.rid();
      void (async () => {
        try {
          // Make sure Node/npm exist first (downloads a runtime on a fresh
          // machine), streaming setup progress into the same console.
          await ensureNodeRuntime((msg) =>
            broadcast(IPC.cliChunk, { runId, data: msg }),
          );
          initAgent(
            cli,
            runId,
            input.parentDir,
            input.name,
            Boolean(input.webChat),
          );
        } catch (err) {
          broadcast(IPC.cliChunk, {
            runId,
            data: `\n[setup failed] ${err instanceof Error ? err.message : String(err)}\n`,
          });
          broadcast(IPC.cliExit, { runId, code: -1 });
        }
      })();
      return runId;
    },
  );

  ipcMain.handle(IPC.agentRegister, (_e: IpcMainInvokeEvent, dir: string) =>
    addAgentFromPath(dir),
  );

  // --- runtime ---
  ipcMain.handle(IPC.agentStart, async (_e: IpcMainInvokeEvent, id: string) => {
    const a = store.getAgent(id);
    if (!a) {
      throw new Error("Unknown agent.");
    }
    // Running an agent needs `node` on PATH too.
    await ensureNodeRuntime();
    return agents.start(id, a.path);
  });
  ipcMain.handle(IPC.agentStop, (_e: IpcMainInvokeEvent, id: string) => {
    agents.stop(id);
    return agents.state(id);
  });
  ipcMain.handle(
    IPC.agentRestart,
    async (_e: IpcMainInvokeEvent, id: string) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      await ensureNodeRuntime();
      return agents.restart(id, a.path);
    },
  );
  ipcMain.handle(IPC.agentStatus, (_e: IpcMainInvokeEvent, id: string) =>
    agents.state(id),
  );
  ipcMain.handle(
    IPC.scheduleRun,
    async (_e: IpcMainInvokeEvent, id: string, name: string) => {
      const st = agents.state(id);
      if (st.status !== "running" || !st.url) {
        return {
          ok: false,
          output:
            "Start the agent locally first — the test route only runs under eve dev.",
        };
      }
      try {
        const res = await fetch(
          `${st.url}/eve/v1/dev/schedules/${encodeURIComponent(name)}`,
          { method: "POST" },
        );
        const body = await res.text();
        return res.ok
          ? { ok: true, output: body.slice(0, 600) }
          : { ok: false, output: `HTTP ${res.status}: ${body.slice(0, 300)}` };
      } catch (e) {
        return {
          ok: false,
          output: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );
  ipcMain.handle(IPC.agentInfo, (_e: IpcMainInvokeEvent, id: string) => {
    const url = agents.url(id);
    if (!url) {
      throw new Error("Agent is not running.");
    }
    return getAgentInfo(url);
  });
  ipcMain.handle(IPC.agentStructure, (_e: IpcMainInvokeEvent, id: string) => {
    const a = store.getAgent(id);
    if (!a) {
      throw new Error("Unknown agent.");
    }
    return readStructure(a.path);
  });

  // --- model / config ---
  ipcMain.handle(IPC.modelRead, (_e: IpcMainInvokeEvent, id: string) =>
    readModelConfig(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.modelWrite,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      model: string,
      reasoning: string | null,
    ) => {
      try {
        writeModelConfig(agentPathOf(id), model, reasoning);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // --- env ---
  ipcMain.handle(IPC.envRead, (_e: IpcMainInvokeEvent, id: string) =>
    readEnv(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.envWrite,
    (_e: IpcMainInvokeEvent, id: string, name: string, content: string) => {
      try {
        writeEnv(agentPathOf(id), name, content);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // --- authoring scaffolds ---
  ipcMain.handle(
    IPC.toolCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").ToolInput,
    ) => tryWrite(() => createTool(agentPathOf(id), input)),
  );
  ipcMain.handle(
    IPC.subagentCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").SubagentInput,
    ) => tryWrite(() => createSubagent(agentPathOf(id), input)),
  );
  ipcMain.handle(
    IPC.hookCreate,
    (_e: IpcMainInvokeEvent, id: string, name: string) =>
      tryWrite(() => createHook(agentPathOf(id), name)),
  );
  ipcMain.handle(
    IPC.scheduleCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").ScheduleInput,
    ) => tryWrite(() => createSchedule(agentPathOf(id), input)),
  );

  // --- capability read / edit / delete (tools, skills, subagents, hooks, schedules) ---
  ipcMain.handle(
    IPC.capabilityFiles,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      kind: import("../shared/ipc").CapabilityKind,
      name: string,
    ) => capabilityFiles(agentPathOf(id), kind, name),
  );
  ipcMain.handle(
    IPC.capabilityWrite,
    (_e: IpcMainInvokeEvent, id: string, relPath: string, content: string) =>
      tryWrite(() => writeCapabilityFile(agentPathOf(id), relPath, content)),
  );
  ipcMain.handle(
    IPC.capabilityDelete,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      kind: import("../shared/ipc").CapabilityKind,
      name: string,
    ) => tryWrite(() => deleteCapability(agentPathOf(id), kind, name)),
  );

  // --- sandbox ---
  ipcMain.handle(IPC.sandboxRead, (_e: IpcMainInvokeEvent, id: string) =>
    readSandbox(agentPathOf(id)),
  );
  ipcMain.handle(IPC.sandboxCreate, (_e: IpcMainInvokeEvent, id: string) =>
    tryWrite(() => createSandbox(agentPathOf(id))),
  );

  // --- channels ---
  ipcMain.handle(IPC.channelsList, (_e: IpcMainInvokeEvent, id: string) =>
    listChannels(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.channelAdd,
    (_e: IpcMainInvokeEvent, id: string, kind: "slack" | "web") =>
      addChannel(agentPathOf(id), kind),
  );
  ipcMain.handle(
    IPC.channelWrite,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").ChannelAddInput,
    ) => {
      try {
        return { ok: true, ...writeChannel(agentPathOf(id), input) };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle(
    IPC.channelDelete,
    (_e: IpcMainInvokeEvent, id: string, name: string) => {
      try {
        deleteChannelFile(agentPathOf(id), name);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle(
    IPC.channelWiring,
    async (_e: IpcMainInvokeEvent, id: string) => {
      const path = agentPathOf(id);
      const projectId = vercelStatus(path).projectId ?? "";
      const chans = channelConnectors(path);
      const map = await vercelConnectProjectsMap(path);
      return chans.map((c) => ({
        name: c.name,
        connector: c.connector,
        attached: c.connector
          ? (map[c.connector]?.includes(projectId) ?? false)
          : null,
      }));
    },
  );

  // --- vercel ---
  ipcMain.handle(IPC.vercelStatus, (_e: IpcMainInvokeEvent, id: string) =>
    vercelStatus(agentPathOf(id)),
  );
  ipcMain.handle(IPC.vercelEnvLs, (_e: IpcMainInvokeEvent, id: string) =>
    vercelEnvLs(agentPathOf(id)),
  );
  ipcMain.handle(IPC.vercelEnvPull, (_e: IpcMainInvokeEvent, id: string) =>
    vercelEnvPull(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.vercelEnvAdd,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      name: string,
      value: string,
      target: string,
    ) => vercelEnvAdd(agentPathOf(id), name, value, target),
  );
  ipcMain.handle(
    IPC.vercelEnvSetAll,
    (_e: IpcMainInvokeEvent, id: string, name: string, value: string) =>
      vercelEnvSetAll(agentPathOf(id), name, value),
  );
  ipcMain.handle(
    IPC.connectorList,
    (_e: IpcMainInvokeEvent, id: string, service?: string) =>
      vercelConnectList(agentPathOf(id), service),
  );
  ipcMain.handle(
    IPC.connectorCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      type: string,
      name: string,
      triggers: boolean,
    ) => vercelConnectCreate(agentPathOf(id), type, name, triggers),
  );
  ipcMain.handle(
    IPC.vercelConnectorCreateStream,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      type: string,
      name: string,
      triggers: boolean,
    ) =>
      vercelConnectCreateStream(
        agentPathOf(id),
        type,
        name,
        triggers,
        // The authorize URL is single-use and short-lived — get it on screen the
        // instant the CLI prints it, not when the command finally exits.
        (data) => broadcast(IPC.vercelConnectorCreateChunk, { id, data }),
      ),
  );
  ipcMain.handle(
    IPC.connectorAttach,
    (_e: IpcMainInvokeEvent, id: string, connector: string, kind?: string) =>
      vercelConnectAttach(
        agentPathOf(id),
        connector,
        kind ? `/eve/v1/${kind}` : undefined,
      ),
  );
  ipcMain.handle(IPC.connectOpen, (_e: IpcMainInvokeEvent, id: string) =>
    openConnectWindow(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.connectOpenExternal,
    (_e: IpcMainInvokeEvent, id: string) =>
      openConnectExternal(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.connectorOpenPage,
    (_e: IpcMainInvokeEvent, id: string, connector: string) =>
      openConnector(agentPathOf(id), connector),
  );

  ipcMain.handle(
    IPC.agentReadInstructions,
    (_e: IpcMainInvokeEvent, id: string) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      return readInstructions(a.path);
    },
  );
  ipcMain.handle(
    IPC.agentWriteInstructions,
    (_e: IpcMainInvokeEvent, id: string, content: string) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      writeInstructions(a.path, content);
      return true;
    },
  );

  // --- CLI (build / deploy / eval), logs, scaffolding ---
  ipcMain.handle(
    IPC.cliRun,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      kind: "build" | "deploy" | "evalRun",
      extra?: { ids?: string[] },
    ) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      const runId = store.rid();
      const args =
        kind === "build"
          ? ["build"]
          : kind === "deploy"
            ? ["deploy"]
            : ["eval", ...(extra?.ids ?? []), "--json"];
      cli.run(runId, a.path, args);
      return runId;
    },
  );
  ipcMain.handle(IPC.cliCancel, (_e: IpcMainInvokeEvent, runId: string) => {
    cli.cancel(runId);
    return true;
  });
  ipcMain.handle(IPC.evalList, (_e: IpcMainInvokeEvent, id: string) => {
    const a = store.getAgent(id);
    if (!a) {
      throw new Error("Unknown agent.");
    }
    return listEvals(a.path);
  });
  ipcMain.handle(IPC.agentLogs, (_e: IpcMainInvokeEvent, id: string) =>
    agents.logs(id),
  );

  ipcMain.handle(
    IPC.skillCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").SkillInput,
    ) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      try {
        return { ok: true, ...createSkill(a.path, input) };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle(
    IPC.connectionAdd,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").ConnectionInput,
    ) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      try {
        return { ok: true, ...addConnection(a.path, input) };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle(
    IPC.connectionRead,
    (_e: IpcMainInvokeEvent, id: string, name: string) =>
      readConnectionFile(agentPathOf(id), name),
  );
  ipcMain.handle(
    IPC.connectionWrite,
    (_e: IpcMainInvokeEvent, id: string, name: string, content: string) => {
      try {
        writeConnectionFile(agentPathOf(id), name, content);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle(
    IPC.connectionDelete,
    (_e: IpcMainInvokeEvent, id: string, name: string) => {
      try {
        deleteConnectionFile(agentPathOf(id), name);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle(
    IPC.connectorUsage,
    (_e: IpcMainInvokeEvent, id: string, uids: string[]) =>
      scanConnectorUsage(agentPathOf(id), uids),
  );

  // --- arcana (memory) ---
  ipcMain.handle(
    IPC.arcanaDetect,
    (_e: IpcMainInvokeEvent, id: string): DetectedBrain => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      const detected = detectBrain(a.path, readStructure(a.path));
      return { ...detected, saved: brainInfo(store.getBrain(id)) };
    },
  );

  ipcMain.handle(
    IPC.arcanaSaveBrain,
    async (
      _e: IpcMainInvokeEvent,
      id: string,
      input: {
        workspace: string;
        envVar: string;
        key?: string;
        fromEnv?: boolean;
      },
    ) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      const key = input.fromEnv
        ? keyFromEnv(a.path, input.envVar)
        : (input.key ?? null);
      if (!key) {
        return { ok: false, error: "No key found." };
      }
      const check = await arcanaValidate(input.workspace, key);
      if (!check.ok) {
        return { ok: false, error: check.error ?? "Validation failed." };
      }
      store.setBrain(id, {
        workspace: input.workspace,
        envVar: input.envVar,
        key,
      });
      return { ok: true, info: brainInfo(store.getBrain(id)) };
    },
  );

  ipcMain.handle(
    IPC.arcanaForgetBrain,
    (_e: IpcMainInvokeEvent, id: string) => {
      store.deleteBrain(id);
      return true;
    },
  );

  ipcMain.handle(
    IPC.arcanaValidate,
    (_e: IpcMainInvokeEvent, workspace: string, key: string) =>
      arcanaValidate(workspace, key),
  );

  ipcMain.handle(IPC.arcanaStats, (_e: IpcMainInvokeEvent, id: string) => {
    const c = requireBrain(id);
    return arcanaStats(c.workspace, c.key);
  });
  ipcMain.handle(
    IPC.arcanaTimeline,
    (_e: IpcMainInvokeEvent, id: string, limit?: number) => {
      const c = requireBrain(id);
      return arcanaTimeline(c.workspace, c.key, limit ?? 30);
    },
  );
  ipcMain.handle(
    IPC.arcanaQuery,
    (_e: IpcMainInvokeEvent, id: string, q: string) => {
      const c = requireBrain(id);
      return arcanaQuery(c.workspace, c.key, q);
    },
  );

  ipcMain.handle(
    IPC.arcanaWire,
    async (
      _e: IpcMainInvokeEvent,
      id: string,
      input: WireBrainInput,
    ): Promise<WireBrainResult> => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      const check = await arcanaValidate(input.workspace, input.key);
      if (!check.ok) {
        return { ok: false, error: `Key rejected: ${check.error}` };
      }
      try {
        const { files } = wireBrain(a.path, input);
        store.setBrain(id, {
          workspace: input.workspace,
          envVar: input.envVar,
          key: input.key,
        });
        // Real fix: if the agent is linked to Vercel, push the key to its env
        // too, so the DEPLOYED agent has memory (deploys don't ship local .env).
        let pushedToVercel = false;
        if (vercelStatus(a.path).linked) {
          pushedToVercel = (
            await vercelEnvSetAll(a.path, input.envVar, input.key)
          ).ok;
        }
        return { ok: true, files, pushedToVercel };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // --- chat ---
  ipcMain.handle(
    IPC.chatListThreads,
    (_e: IpcMainInvokeEvent, agentId: string) => store.listThreads(agentId),
  );
  ipcMain.handle(
    IPC.chatCreateThread,
    (_e: IpcMainInvokeEvent, agentId: string, title?: string) =>
      store.createThread(agentId, title || "New chat"),
  );
  ipcMain.handle(
    IPC.chatGetThread,
    (_e: IpcMainInvokeEvent, threadId: string) => store.readEvents(threadId),
  );
  ipcMain.handle(
    IPC.chatDeleteThread,
    (_e: IpcMainInvokeEvent, threadId: string) => {
      store.deleteThread(threadId);
      return true;
    },
  );
  ipcMain.handle(
    IPC.chatArchiveThread,
    (_e: IpcMainInvokeEvent, threadId: string, archived: boolean) => {
      store.setThreadArchived(threadId, archived);
      return true;
    },
  );
  /** Resolve the session connection for a chat target (local dev vs deployed). */
  const resolveConn = (
    agentId: string,
    target: "local" | "deployed",
  ): SessionConn => {
    if (target === "deployed") {
      const d = store.getDeploy(agentId);
      if (!d.url) {
        throw new Error("No deployed URL set — set it in Chat → Deployed.");
      }
      const a = store.getAgent(agentId);
      const path = a?.path;
      const oidc = path ? readEnvLocal(path, "VERCEL_OIDC_TOKEN") : null;
      // Prefer the secret the user pasted; else the one Vercel exposes in .env.local.
      const bypass =
        d.bypassSecret ||
        (path ? readEnvLocal(path, "VERCEL_AUTOMATION_BYPASS_SECRET") : null);
      const headers: Record<string, string> = {};
      if (bypass) {
        // Header alone grants per-request access; do NOT set-bypass-cookie —
        // that makes Vercel issue a redirect that reads as "still protected".
        headers["x-vercel-protection-bypass"] = bypass;
      }
      if (oidc) {
        headers.Authorization = `Bearer ${oidc}`;
      }
      return { baseUrl: d.url.replace(/\/$/, ""), headers };
    }
    const url = agents.url(agentId);
    if (!url) {
      throw new Error("Agent isn't running — start it first.");
    }
    return { baseUrl: url };
  };

  ipcMain.handle(
    IPC.chatSend,
    (
      _e: IpcMainInvokeEvent,
      threadId: string,
      text: string,
      target: "local" | "deployed" = "local",
    ) => {
      const t = store.getThread(threadId);
      if (!t) {
        throw new Error("Unknown thread.");
      }
      const conn = resolveConn(t.agentId, target);
      if (t.title === "New chat") {
        store.touchThread(threadId, text.slice(0, 48));
      }
      void chat.send(threadId, conn, text);
      return true;
    },
  );
  ipcMain.handle(
    IPC.chatRespond,
    (
      _e: IpcMainInvokeEvent,
      threadId: string,
      requestId: string,
      optionId?: string,
      text?: string,
      target: "local" | "deployed" = "local",
    ) => {
      const t = store.getThread(threadId);
      if (!t) {
        throw new Error("Unknown thread.");
      }
      const conn = resolveConn(t.agentId, target);
      void chat.respond(threadId, conn, requestId, optionId, text);
      return true;
    },
  );

  // --- deploy target / status ---
  ipcMain.handle(IPC.deployGet, (_e: IpcMainInvokeEvent, id: string) =>
    store.getDeploy(id),
  );
  ipcMain.handle(
    IPC.deploySet,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      settings: import("../shared/ipc").DeploySettings,
    ) => {
      store.setDeploy(id, settings);
      return store.getDeploy(id);
    },
  );
  ipcMain.handle(IPC.vercelProdInfo, (_e: IpcMainInvokeEvent, id: string) =>
    vercelProdInfo(agentPathOf(id)),
  );
  ipcMain.handle(IPC.modelReadiness, (_e: IpcMainInvokeEvent, id: string) =>
    modelReadiness(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.evolveDraft,
    (_e: IpcMainInvokeEvent, id: string, intent: string, timezone?: string) =>
      draftProposal(agentPathOf(id), intent, timezone),
  );
  ipcMain.handle(
    IPC.evolveApply,
    (_e: IpcMainInvokeEvent, id: string, proposal: EvolveProposal) =>
      applyProposal(agentPathOf(id), proposal, store.getBrain(id) ?? null),
  );
  ipcMain.handle(IPC.evolveDetect, (_e: IpcMainInvokeEvent, id: string) =>
    detectPatterns(
      agentPathOf(id),
      store.listThreads(id).map((t) => t.title),
      store.getBrain(id) ?? null,
    ),
  );
  ipcMain.handle(
    IPC.evolveGetProposeTool,
    (_e: IpcMainInvokeEvent, id: string) => getProposeTool(agentPathOf(id)),
  );
  ipcMain.handle(
    IPC.evolveSetProposeTool,
    (_e: IpcMainInvokeEvent, id: string, enabled: boolean) =>
      setProposeTool(agentPathOf(id), enabled),
  );
  ipcMain.handle(IPC.evolveQueueStatus, (_e: IpcMainInvokeEvent, id: string) =>
    proposeQueueStatus(id),
  );
  ipcMain.handle(
    IPC.evolveCreateQueueStore,
    async (_e: IpcMainInvokeEvent, id: string) => {
      const a = store.getAgent(id);
      if (!a) {
        return { ok: false, output: "Unknown agent." };
      }
      const r = await vercelBlobCreateStore(a.path, `${a.name}-proposals`);
      // Only a token that actually landed locally means the inbox can read.
      return r.ok && proposeQueueStatus(id).ready
        ? r
        : {
            ok: false,
            output:
              r.output ||
              "Store created, but no BLOB_READ_WRITE_TOKEN arrived — is the project linked to Vercel?",
          };
    },
  );
  ipcMain.handle(
    IPC.evolveListProposals,
    async (_e: IpcMainInvokeEvent, id: string) => {
      const queue = resolveQueue(id);
      if (!queue) {
        return {
          ok: false,
          proposals: [],
          error:
            "Can't reach this agent's proposal queue. Deploy the agent, then run Pull env in the Deploy tab so Studio has its BLOB_READ_WRITE_TOKEN.",
        };
      }
      return { ok: true, proposals: await listQueuedProposals(queue) };
    },
  );
  ipcMain.handle(
    IPC.evolveResolveProposal,
    async (_e: IpcMainInvokeEvent, id: string, note: string) => {
      const queue = resolveQueue(id);
      if (queue) {
        await resolveQueuedProposal(queue, note);
      }
      return { ok: true };
    },
  );
  ipcMain.handle(
    IPC.vercelLink,
    async (_e: IpcMainInvokeEvent, id: string, team?: string) => {
      await ensureNodeRuntime();
      return vercelLink(agentPathOf(id), team);
    },
  );
  ipcMain.handle(
    IPC.vercelTeams,
    async (_e: IpcMainInvokeEvent, id: string) => {
      await ensureNodeRuntime();
      return vercelTeams(agentPathOf(id));
    },
  );
  ipcMain.handle(
    IPC.vercelWhoami,
    async (_e: IpcMainInvokeEvent, id: string) => {
      await ensureNodeRuntime();
      return vercelWhoami(agentPathOf(id));
    },
  );
  ipcMain.handle(
    IPC.vercelLogin,
    async (_e: IpcMainInvokeEvent, id: string, email: string) => {
      await ensureNodeRuntime();
      const runId = store.rid();
      const child = startVercelLogin(
        agentPathOf(id),
        email,
        (data) => broadcast(IPC.cliChunk, { runId, data }),
        (code) => broadcast(IPC.cliExit, { runId, code }),
      );
      // Don't leave a login process hanging if the user never finishes.
      setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // already gone
        }
      }, 5 * 60_000);
      return runId;
    },
  );
  ipcMain.handle(
    IPC.deployHealth,
    async (_e: IpcMainInvokeEvent, id: string) => {
      let conn: SessionConn;
      try {
        conn = resolveConn(id, "deployed");
      } catch (err) {
        return {
          ok: false,
          status: 0,
          protected: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
      const h = await checkHealth(conn);
      let reason: string | undefined;
      if (h.protected) {
        reason =
          "Blocked by Vercel Deployment Protection — add a Protection Bypass secret below.";
      } else if (h.status === 401 || h.status === 403) {
        reason =
          "Reached the agent but route auth rejected the request — run `vercel env pull` to refresh the OIDC token, or the agent's eve channel auth blocks external clients.";
      } else if (!h.ok && h.status === 0) {
        reason = "Couldn't reach the URL.";
      }
      return { ...h, reason };
    },
  );

  return { agents, cli };
}

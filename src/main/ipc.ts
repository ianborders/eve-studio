import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { BrowserWindow, type IpcMainInvokeEvent, app, dialog, ipcMain } from "electron";
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
  arcanaQuery,
  arcanaStats,
  arcanaTimeline,
  arcanaValidate,
} from "./arcana";
import { detectBrain, keyFromEnv, wireBrain } from "./arcanaWire";
import { ChatController } from "./chat";
import { addChannel, CliRunner, initAgent, listChannels, listEvals } from "./cli";
import { getAgentInfo } from "./eveSession";
import * as store from "./store";
import { readStructure } from "./structure";
import { writeChannel } from "./agentChannels";
import {
  openConnectExternal,
  openConnector,
  openConnectWindow,
} from "./connectWindow";
import {
  vercelConnectAttach,
  vercelConnectCreate,
  vercelConnectList,
  vercelEnvAdd,
  vercelEnvLs,
  vercelEnvPull,
  vercelStatus,
} from "./vercel";

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
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** What registerIpc hands back for lifecycle cleanup on quit. */
export interface IpcHandles {
  agents: AgentManager;
  cli: CliRunner;
}

function brainInfo(cred: store.BrainCred | undefined): BrainInfo | null {
  return cred
    ? { workspace: cred.workspace, envVar: cred.envVar, hasKey: Boolean(cred.key) }
    : null;
}

function requireBrain(agentId: string): store.BrainCred {
  const cred = store.getBrain(agentId);
  if (!cred) {
    throw new Error("No brain configured for this agent.");
  }
  return cred;
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
    existsSync(join(dir, "agent.ts")) || existsSync(join(dir, "instructions.md"));
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
        readFileSync(join(dir, "node_modules", "eve", "package.json"), "utf8")
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
  const agent: AgentRecord = { id, name, path: dir, eveVersion, addedAt: Date.now() };
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
    (runId, code) => broadcast(IPC.cliExit, { runId, code })
  );

  const chat = new ChatController(
    (threadId, event) => broadcast(IPC.chatEvent, { threadId, event }),
    (msg) => broadcast(IPC.chatStatus, msg)
  );

  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
    })
  );

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
    (_e: IpcMainInvokeEvent, input: import("../shared/ipc").CreateAgentInput) => {
      const runId = store.rid();
      initAgent(cli, runId, input.parentDir, input.name, Boolean(input.webChat));
      return runId;
    }
  );

  ipcMain.handle(IPC.agentRegister, (_e: IpcMainInvokeEvent, dir: string) =>
    addAgentFromPath(dir)
  );

  // --- runtime ---
  ipcMain.handle(IPC.agentStart, (_e: IpcMainInvokeEvent, id: string) => {
    const a = store.getAgent(id);
    if (!a) {
      throw new Error("Unknown agent.");
    }
    return agents.start(id, a.path);
  });
  ipcMain.handle(IPC.agentStop, (_e: IpcMainInvokeEvent, id: string) => {
    agents.stop(id);
    return agents.state(id);
  });
  ipcMain.handle(IPC.agentStatus, (_e: IpcMainInvokeEvent, id: string) =>
    agents.state(id)
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
    readModelConfig(agentPathOf(id))
  );
  ipcMain.handle(
    IPC.modelWrite,
    (_e: IpcMainInvokeEvent, id: string, model: string, reasoning: string | null) => {
      try {
        writeModelConfig(agentPathOf(id), model, reasoning);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- env ---
  ipcMain.handle(IPC.envRead, (_e: IpcMainInvokeEvent, id: string) =>
    readEnv(agentPathOf(id))
  );
  ipcMain.handle(
    IPC.envWrite,
    (_e: IpcMainInvokeEvent, id: string, name: string, content: string) => {
      try {
        writeEnv(agentPathOf(id), name, content);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- authoring scaffolds ---
  ipcMain.handle(
    IPC.toolCreate,
    (_e: IpcMainInvokeEvent, id: string, input: import("../shared/ipc").ToolInput) =>
      tryWrite(() => createTool(agentPathOf(id), input))
  );
  ipcMain.handle(
    IPC.subagentCreate,
    (_e: IpcMainInvokeEvent, id: string, input: import("../shared/ipc").SubagentInput) =>
      tryWrite(() => createSubagent(agentPathOf(id), input))
  );
  ipcMain.handle(
    IPC.hookCreate,
    (_e: IpcMainInvokeEvent, id: string, name: string) =>
      tryWrite(() => createHook(agentPathOf(id), name))
  );
  ipcMain.handle(
    IPC.scheduleCreate,
    (_e: IpcMainInvokeEvent, id: string, input: import("../shared/ipc").ScheduleInput) =>
      tryWrite(() => createSchedule(agentPathOf(id), input))
  );

  // --- sandbox ---
  ipcMain.handle(IPC.sandboxRead, (_e: IpcMainInvokeEvent, id: string) =>
    readSandbox(agentPathOf(id))
  );
  ipcMain.handle(IPC.sandboxCreate, (_e: IpcMainInvokeEvent, id: string) =>
    tryWrite(() => createSandbox(agentPathOf(id)))
  );

  // --- channels ---
  ipcMain.handle(IPC.channelsList, (_e: IpcMainInvokeEvent, id: string) =>
    listChannels(agentPathOf(id))
  );
  ipcMain.handle(
    IPC.channelAdd,
    (_e: IpcMainInvokeEvent, id: string, kind: "slack" | "web") =>
      addChannel(agentPathOf(id), kind)
  );
  ipcMain.handle(
    IPC.channelWrite,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").ChannelAddInput
    ) => {
      try {
        return { ok: true, ...writeChannel(agentPathOf(id), input) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // --- vercel ---
  ipcMain.handle(IPC.vercelStatus, (_e: IpcMainInvokeEvent, id: string) =>
    vercelStatus(agentPathOf(id))
  );
  ipcMain.handle(IPC.vercelEnvLs, (_e: IpcMainInvokeEvent, id: string) =>
    vercelEnvLs(agentPathOf(id))
  );
  ipcMain.handle(IPC.vercelEnvPull, (_e: IpcMainInvokeEvent, id: string) =>
    vercelEnvPull(agentPathOf(id))
  );
  ipcMain.handle(
    IPC.vercelEnvAdd,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      name: string,
      value: string,
      target: string
    ) => vercelEnvAdd(agentPathOf(id), name, value, target)
  );
  ipcMain.handle(
    IPC.connectorList,
    (_e: IpcMainInvokeEvent, id: string, service?: string) =>
      vercelConnectList(agentPathOf(id), service)
  );
  ipcMain.handle(
    IPC.connectorCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      type: string,
      name: string,
      triggers: boolean
    ) => vercelConnectCreate(agentPathOf(id), type, name, triggers)
  );
  ipcMain.handle(
    IPC.connectorAttach,
    (_e: IpcMainInvokeEvent, id: string, connector: string, kind?: string) =>
      vercelConnectAttach(
        agentPathOf(id),
        connector,
        kind ? `/eve/v1/${kind}` : undefined
      )
  );
  ipcMain.handle(IPC.connectOpen, (_e: IpcMainInvokeEvent, id: string) =>
    openConnectWindow(agentPathOf(id))
  );
  ipcMain.handle(IPC.connectOpenExternal, (_e: IpcMainInvokeEvent, id: string) =>
    openConnectExternal(agentPathOf(id))
  );
  ipcMain.handle(
    IPC.connectorOpenPage,
    (_e: IpcMainInvokeEvent, id: string, connector: string) =>
      openConnector(agentPathOf(id), connector)
  );

  ipcMain.handle(
    IPC.agentReadInstructions,
    (_e: IpcMainInvokeEvent, id: string) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      return readInstructions(a.path);
    }
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
    }
  );

  // --- CLI (build / deploy / eval), logs, scaffolding ---
  ipcMain.handle(
    IPC.cliRun,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      kind: "build" | "deploy" | "evalRun",
      extra?: { ids?: string[] }
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
    }
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
    agents.logs(id)
  );

  ipcMain.handle(
    IPC.skillCreate,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").SkillInput
    ) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      try {
        return { ok: true, ...createSkill(a.path, input) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  ipcMain.handle(
    IPC.connectionAdd,
    (
      _e: IpcMainInvokeEvent,
      id: string,
      input: import("../shared/ipc").ConnectionInput
    ) => {
      const a = store.getAgent(id);
      if (!a) {
        throw new Error("Unknown agent.");
      }
      try {
        return { ok: true, ...addConnection(a.path, input) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  ipcMain.handle(
    IPC.connectionRead,
    (_e: IpcMainInvokeEvent, id: string, name: string) =>
      readConnectionFile(agentPathOf(id), name)
  );
  ipcMain.handle(
    IPC.connectionWrite,
    (_e: IpcMainInvokeEvent, id: string, name: string, content: string) => {
      try {
        writeConnectionFile(agentPathOf(id), name, content);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  ipcMain.handle(
    IPC.connectionDelete,
    (_e: IpcMainInvokeEvent, id: string, name: string) => {
      try {
        deleteConnectionFile(agentPathOf(id), name);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  ipcMain.handle(
    IPC.connectorUsage,
    (_e: IpcMainInvokeEvent, id: string, uids: string[]) =>
      scanConnectorUsage(agentPathOf(id), uids)
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
    }
  );

  ipcMain.handle(
    IPC.arcanaSaveBrain,
    async (
      _e: IpcMainInvokeEvent,
      id: string,
      input: { workspace: string; envVar: string; key?: string; fromEnv?: boolean }
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
      store.setBrain(id, { workspace: input.workspace, envVar: input.envVar, key });
      return { ok: true, info: brainInfo(store.getBrain(id)) };
    }
  );

  ipcMain.handle(IPC.arcanaForgetBrain, (_e: IpcMainInvokeEvent, id: string) => {
    store.deleteBrain(id);
    return true;
  });

  ipcMain.handle(
    IPC.arcanaValidate,
    (
      _e: IpcMainInvokeEvent,
      workspace: string,
      key: string
    ) => arcanaValidate(workspace, key)
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
    }
  );
  ipcMain.handle(
    IPC.arcanaQuery,
    (_e: IpcMainInvokeEvent, id: string, q: string) => {
      const c = requireBrain(id);
      return arcanaQuery(c.workspace, c.key, q);
    }
  );

  ipcMain.handle(
    IPC.arcanaWire,
    async (
      _e: IpcMainInvokeEvent,
      id: string,
      input: WireBrainInput
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
        return { ok: true, files };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  // --- chat ---
  ipcMain.handle(
    IPC.chatListThreads,
    (_e: IpcMainInvokeEvent, agentId: string) => store.listThreads(agentId)
  );
  ipcMain.handle(
    IPC.chatCreateThread,
    (_e: IpcMainInvokeEvent, agentId: string, title?: string) =>
      store.createThread(agentId, title || "New chat")
  );
  ipcMain.handle(IPC.chatGetThread, (_e: IpcMainInvokeEvent, threadId: string) =>
    store.readEvents(threadId)
  );
  ipcMain.handle(
    IPC.chatDeleteThread,
    (_e: IpcMainInvokeEvent, threadId: string) => {
      store.deleteThread(threadId);
      return true;
    }
  );
  ipcMain.handle(
    IPC.chatSend,
    (_e: IpcMainInvokeEvent, threadId: string, text: string) => {
      const t = store.getThread(threadId);
      if (!t) {
        throw new Error("Unknown thread.");
      }
      const url = agents.url(t.agentId);
      if (!url) {
        throw new Error("Agent isn't running — start it first.");
      }
      if (t.title === "New chat") {
        store.touchThread(threadId, text.slice(0, 48));
      }
      void chat.send(threadId, url, text);
      return true;
    }
  );
  ipcMain.handle(
    IPC.chatRespond,
    (
      _e: IpcMainInvokeEvent,
      threadId: string,
      requestId: string,
      optionId?: string,
      text?: string
    ) => {
      const t = store.getThread(threadId);
      if (!t) {
        throw new Error("Unknown thread.");
      }
      const url = agents.url(t.agentId);
      if (!url) {
        throw new Error("Agent isn't running.");
      }
      void chat.respond(threadId, url, requestId, optionId, text);
      return true;
    }
  );

  return { agents, cli };
}

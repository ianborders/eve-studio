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
  arcanaQuery,
  arcanaStats,
  arcanaTimeline,
  arcanaValidate,
} from "./arcana";
import { detectBrain, keyFromEnv, wireBrain } from "./arcanaWire";
import { ChatController } from "./chat";
import { getAgentInfo } from "./eveSession";
import * as store from "./store";
import { readStructure } from "./structure";

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

/** Registers every ipcMain handler. Returns the AgentManager so callers can stop it on quit. */
export function registerIpc(): AgentManager {
  const agents = new AgentManager();
  agents.onStatus((state) => broadcast(IPC.agentStatusChanged, state));

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

  return agents;
}

import { electronAPI } from "@electron-toolkit/preload";
import { type IpcRendererEvent, contextBridge, ipcRenderer } from "electron";
import {
  type AddAgentResult,
  type AgentRecord,
  type AgentRuntimeState,
  type AgentStructure,
  type AppInfo,
  type ArcanaResult,
  type ArcanaStats,
  type BrainInfo,
  type ChatEventMessage,
  type ChatStatusMessage,
  type DetectedBrain,
  type EveEvent,
  IPC,
  type InstructionsFile,
  type QueryHit,
  type ThreadRecord,
  type TimelineEvent,
  type WireBrainInput,
  type WireBrainResult,
} from "../shared/ipc";

function sub<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),

  agents: {
    list: (): Promise<AgentRecord[]> => ipcRenderer.invoke(IPC.agentsList),
    add: (): Promise<AddAgentResult> => ipcRenderer.invoke(IPC.agentsAdd),
    remove: (id: string): Promise<AgentRecord[]> =>
      ipcRenderer.invoke(IPC.agentsRemove, id),
    start: (id: string): Promise<AgentRuntimeState> =>
      ipcRenderer.invoke(IPC.agentStart, id),
    stop: (id: string): Promise<AgentRuntimeState> =>
      ipcRenderer.invoke(IPC.agentStop, id),
    status: (id: string): Promise<AgentRuntimeState> =>
      ipcRenderer.invoke(IPC.agentStatus, id),
    info: (id: string): Promise<unknown> => ipcRenderer.invoke(IPC.agentInfo, id),
    structure: (id: string): Promise<AgentStructure> =>
      ipcRenderer.invoke(IPC.agentStructure, id),
    readInstructions: (id: string): Promise<InstructionsFile> =>
      ipcRenderer.invoke(IPC.agentReadInstructions, id),
    writeInstructions: (id: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.agentWriteInstructions, id, content),
    onStatusChanged: (cb: (s: AgentRuntimeState) => void): (() => void) =>
      sub(IPC.agentStatusChanged, cb),
  },

  arcana: {
    detect: (id: string): Promise<DetectedBrain> =>
      ipcRenderer.invoke(IPC.arcanaDetect, id),
    saveBrain: (
      id: string,
      input: { workspace: string; envVar: string; key?: string; fromEnv?: boolean }
    ): Promise<{ ok: boolean; error?: string; info?: BrainInfo | null }> =>
      ipcRenderer.invoke(IPC.arcanaSaveBrain, id, input),
    forgetBrain: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.arcanaForgetBrain, id),
    validate: (
      workspace: string,
      key: string
    ): Promise<ArcanaResult<ArcanaStats>> =>
      ipcRenderer.invoke(IPC.arcanaValidate, workspace, key),
    stats: (id: string): Promise<ArcanaResult<ArcanaStats>> =>
      ipcRenderer.invoke(IPC.arcanaStats, id),
    timeline: (id: string, limit?: number): Promise<ArcanaResult<TimelineEvent[]>> =>
      ipcRenderer.invoke(IPC.arcanaTimeline, id, limit),
    query: (id: string, q: string): Promise<ArcanaResult<QueryHit[]>> =>
      ipcRenderer.invoke(IPC.arcanaQuery, id, q),
    wire: (id: string, input: WireBrainInput): Promise<WireBrainResult> =>
      ipcRenderer.invoke(IPC.arcanaWire, id, input),
  },

  chat: {
    listThreads: (agentId: string): Promise<ThreadRecord[]> =>
      ipcRenderer.invoke(IPC.chatListThreads, agentId),
    createThread: (agentId: string, title?: string): Promise<ThreadRecord> =>
      ipcRenderer.invoke(IPC.chatCreateThread, agentId, title),
    getThread: (threadId: string): Promise<EveEvent[]> =>
      ipcRenderer.invoke(IPC.chatGetThread, threadId),
    deleteThread: (threadId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.chatDeleteThread, threadId),
    send: (threadId: string, text: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.chatSend, threadId, text),
    respond: (
      threadId: string,
      requestId: string,
      optionId?: string,
      text?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke(IPC.chatRespond, threadId, requestId, optionId, text),
    onEvent: (cb: (m: ChatEventMessage) => void): (() => void) =>
      sub(IPC.chatEvent, cb),
    onStatus: (cb: (m: ChatStatusMessage) => void): (() => void) =>
      sub(IPC.chatStatus, cb),
  },
};

export type StudioApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("studio", api);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: preload bridge setup failure must be visible
    console.error(error);
  }
} else {
  // @ts-ignore — contextIsolation is expected on; this is the fallback
  window.electron = electronAPI;
  // @ts-ignore — see above
  window.studio = api;
}

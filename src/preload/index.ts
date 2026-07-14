import { electronAPI } from "@electron-toolkit/preload";
import { type IpcRendererEvent, contextBridge, ipcRenderer } from "electron";
import {
  type AddAgentResult,
  type AgentRecord,
  type AgentRuntimeState,
  type AgentStructure,
  type AppInfo,
  type ChatEventMessage,
  type ChatStatusMessage,
  type EveEvent,
  IPC,
  type ThreadRecord,
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
    onStatusChanged: (cb: (s: AgentRuntimeState) => void): (() => void) =>
      sub(IPC.agentStatusChanged, cb),
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

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
  type ChannelItem,
  type CliChunk,
  type CliExit,
  type CmdResult,
  type ConnectionInput,
  type CreateAgentInput,
  type DetectedBrain,
  type EnvState,
  type EvalItem,
  type EveEvent,
  type FileWriteResult,
  IPC,
  type InstructionsFile,
  type LogChunk,
  type ModelConfig,
  type QueryHit,
  type SandboxInfo,
  type ScheduleInput,
  type SkillInput,
  type SubagentInput,
  type ThreadRecord,
  type TimelineEvent,
  type ToolInput,
  type VercelStatus,
  type WireBrainInput,
  type WireBrainResult,
} from "../shared/ipc";

type WriteResult = { ok: boolean; error?: string };

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
    logs: (id: string): Promise<string> => ipcRenderer.invoke(IPC.agentLogs, id),
    create: (input: CreateAgentInput): Promise<string> =>
      ipcRenderer.invoke(IPC.agentCreate, input),
    register: (dir: string): Promise<AddAgentResult> =>
      ipcRenderer.invoke(IPC.agentRegister, dir),
    createSkill: (id: string, input: SkillInput): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.skillCreate, id, input),
    addConnection: (id: string, input: ConnectionInput): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.connectionAdd, id, input),
    modelRead: (id: string): Promise<ModelConfig> =>
      ipcRenderer.invoke(IPC.modelRead, id),
    modelWrite: (
      id: string,
      model: string,
      reasoning: string | null
    ): Promise<WriteResult> => ipcRenderer.invoke(IPC.modelWrite, id, model, reasoning),
    envRead: (id: string): Promise<EnvState> => ipcRenderer.invoke(IPC.envRead, id),
    envWrite: (id: string, name: string, content: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.envWrite, id, name, content),
    createTool: (id: string, input: ToolInput): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.toolCreate, id, input),
    createSubagent: (id: string, input: SubagentInput): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.subagentCreate, id, input),
    createHook: (id: string, name: string): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.hookCreate, id, name),
    createSchedule: (id: string, input: ScheduleInput): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.scheduleCreate, id, input),
    sandboxRead: (id: string): Promise<SandboxInfo> =>
      ipcRenderer.invoke(IPC.sandboxRead, id),
    sandboxCreate: (id: string): Promise<FileWriteResult> =>
      ipcRenderer.invoke(IPC.sandboxCreate, id),
    channelsList: (id: string): Promise<ChannelItem[]> =>
      ipcRenderer.invoke(IPC.channelsList, id),
    channelAdd: (id: string, kind: "slack" | "web"): Promise<CmdResult> =>
      ipcRenderer.invoke(IPC.channelAdd, id, kind),
    onStatusChanged: (cb: (s: AgentRuntimeState) => void): (() => void) =>
      sub(IPC.agentStatusChanged, cb),
    onLog: (cb: (m: LogChunk) => void): (() => void) => sub(IPC.agentLog, cb),
  },

  vercel: {
    status: (id: string): Promise<VercelStatus> =>
      ipcRenderer.invoke(IPC.vercelStatus, id),
    envLs: (id: string): Promise<CmdResult> => ipcRenderer.invoke(IPC.vercelEnvLs, id),
    envPull: (id: string): Promise<CmdResult> =>
      ipcRenderer.invoke(IPC.vercelEnvPull, id),
    envAdd: (
      id: string,
      name: string,
      value: string,
      target: string
    ): Promise<CmdResult> =>
      ipcRenderer.invoke(IPC.vercelEnvAdd, id, name, value, target),
  },

  dialog: {
    pickDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogPickDir),
  },

  cli: {
    run: (
      id: string,
      kind: "build" | "deploy" | "evalRun",
      extra?: { ids?: string[] }
    ): Promise<string> => ipcRenderer.invoke(IPC.cliRun, id, kind, extra),
    cancel: (runId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.cliCancel, runId),
    onChunk: (cb: (c: CliChunk) => void): (() => void) => sub(IPC.cliChunk, cb),
    onExit: (cb: (c: CliExit) => void): (() => void) => sub(IPC.cliExit, cb),
  },

  evals: {
    list: (id: string): Promise<EvalItem[]> => ipcRenderer.invoke(IPC.evalList, id),
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

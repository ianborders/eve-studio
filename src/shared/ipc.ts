/**
 * Shared IPC contract between the main process and the renderer.
 * Channel names + payload types live here so both sides stay in sync.
 */

export interface AppInfo {
  appVersion: string;
  electron: string;
  node: string;
  chrome: string;
  platform: NodeJS.Platform;
}

/** A registered agent (a folder on disk containing an Eve `agent/`). */
export interface AgentRecord {
  id: string;
  name: string;
  path: string;
  eveVersion: string | null;
  addedAt: number;
}

export type AgentRunStatus = "stopped" | "starting" | "running" | "error";

export interface AgentRuntimeState {
  agentId: string;
  status: AgentRunStatus;
  port: number | null;
  url: string | null;
  error: string | null;
}

export interface ThreadRecord {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * An Eve session stream event. Permissive by design — the UI switches on `type`.
 * Shapes are documented in Eve's protocol/message module.
 */
export interface EveEvent {
  type: string;
  data?: Record<string, unknown>;
  meta?: { at?: string };
  sequence?: number;
  turnId?: string;
  stepIndex?: number;
}

export interface ChatEventMessage {
  threadId: string;
  event: EveEvent;
}

export type ChatStatus =
  | "idle"
  | "streaming"
  | "waiting"
  | "completed"
  | "failed"
  | "error";

export interface ChatStatusMessage {
  threadId: string;
  status: ChatStatus;
  error?: string;
}

/** Result of adding an agent (validated on the main side). */
export interface AddAgentResult {
  ok: boolean;
  agent?: AgentRecord;
  error?: string;
}

// --- structure (read from the compiled manifest) ---
export interface StructureTool {
  name: string;
  description?: string;
}
export interface StructureConnection {
  name: string;
  protocol?: string;
  url?: string;
  description?: string;
}
export interface StructureNamed {
  name: string;
  description?: string;
}
export interface StructureChannel {
  name: string;
  method?: string;
  urlPath?: string;
  kind?: string;
}
export interface StructureSchedule {
  name: string;
  cron?: string;
}
export interface StructureRemote {
  name: string;
  url?: string;
}
export interface AgentStructure {
  source: "compiled" | "cli" | "none";
  model: string | null;
  displayName?: string | null;
  tools: StructureTool[];
  connections: StructureConnection[];
  skills: StructureNamed[];
  channels: StructureChannel[];
  schedules: StructureSchedule[];
  subagents: StructureNamed[];
  remoteAgents: StructureRemote[];
  hooks: string[];
  sandbox: string | null;
  diagnostics: { errors: number; warnings: number };
  error?: string;
}

export const IPC = {
  appInfo: "app:info",

  agentsList: "agents:list",
  agentsAdd: "agents:add",
  agentsRemove: "agents:remove",

  agentStart: "agent:start",
  agentStop: "agent:stop",
  agentStatus: "agent:status",
  agentInfo: "agent:info",
  agentStructure: "agent:structure",

  chatListThreads: "chat:listThreads",
  chatCreateThread: "chat:createThread",
  chatGetThread: "chat:getThread",
  chatDeleteThread: "chat:deleteThread",
  chatSend: "chat:send",
  chatRespond: "chat:respond",

  // push channels (main -> renderer)
  chatEvent: "chat:event",
  chatStatus: "chat:status",
  agentStatusChanged: "agent:statusChanged",
} as const;

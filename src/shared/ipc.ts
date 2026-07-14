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

// --- arcana (memory) ---
/** A brain credential as surfaced to the renderer — never includes the key. */
export interface BrainInfo {
  workspace: string;
  envVar: string;
  hasKey: boolean;
}
export interface ArcanaStats {
  workspace: string;
  timeline: {
    total_events: number;
    by_type: Record<string, number>;
    date_range?: { earliest?: string; latest?: string };
  };
  entityGraph: {
    total_entities: number;
    total_mentions: number;
    total_relations: number;
    by_type: Record<string, number>;
  };
}
export interface TimelineEvent {
  id: number | string;
  type: string;
  timestamp: string;
  title: string;
  summary?: string;
  entities?: string[];
  topics?: string[];
}
export interface QueryHit {
  id: string;
  title: string;
  content: string;
  type: string;
  timestamp: string;
  hybridScore?: number;
  matchType?: string;
}
export interface ArcanaResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
/** What Studio can infer about an agent's Arcana wiring from its files. */
export interface DetectedBrain {
  connections: { name: string; url?: string }[];
  workspace?: string;
  envVar?: string;
  keyPresent?: boolean;
  saved?: BrainInfo | null;
}
export interface WireBrainInput {
  workspace: string;
  envVar: string;
  key: string;
  description?: string;
}
export interface WireBrainResult {
  ok: boolean;
  files?: string[];
  error?: string;
}

export interface InstructionsFile {
  path: string;
  relPath: string;
  content: string;
  exists: boolean;
}

// --- CLI runner (build / deploy / eval / init) ---
export type CliKind = "build" | "deploy" | "evalRun";
export interface CliChunk {
  runId: string;
  data: string;
}
export interface CliExit {
  runId: string;
  code: number | null;
}
export interface LogChunk {
  agentId: string;
  data: string;
}
export interface EvalItem {
  id: string;
  description?: string;
}
export interface CreateAgentInput {
  parentDir: string;
  name: string;
  webChat?: boolean;
}
export interface CreateAgentResult {
  ok: boolean;
  agent?: AgentRecord;
  error?: string;
  runId?: string;
}
export interface SkillInput {
  name: string;
  description: string;
  body?: string;
}
export interface ConnectionInput {
  name: string;
  url: string;
  description?: string;
  envVar?: string;
}
export interface FileWriteResult {
  ok: boolean;
  relPath?: string;
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
  agentReadInstructions: "agent:readInstructions",
  agentWriteInstructions: "agent:writeInstructions",
  agentLogs: "agent:logs",
  agentCreate: "agent:create",
  agentRegister: "agent:register",
  skillCreate: "agent:skillCreate",
  connectionAdd: "agent:connectionAdd",
  dialogPickDir: "dialog:pickDir",

  cliRun: "cli:run",
  cliCancel: "cli:cancel",
  evalList: "eval:list",

  // push channels
  cliChunk: "cli:chunk",
  cliExit: "cli:exit",
  agentLog: "agent:log",

  arcanaDetect: "arcana:detect",
  arcanaSaveBrain: "arcana:saveBrain",
  arcanaForgetBrain: "arcana:forgetBrain",
  arcanaValidate: "arcana:validate",
  arcanaStats: "arcana:stats",
  arcanaTimeline: "arcana:timeline",
  arcanaQuery: "arcana:query",
  arcanaWire: "arcana:wire",

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

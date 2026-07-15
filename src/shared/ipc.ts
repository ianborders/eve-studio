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
  /** True when the key was also pushed to the linked Vercel project's env. */
  pushedToVercel?: boolean;
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
  description?: string;
  kind?: "mcp" | "openapi";
  /** MCP endpoint URL (kind=mcp). */
  url?: string;
  /** OpenAPI spec URL (kind=openapi). */
  spec?: string;
  /** OpenAPI base URL override (kind=openapi). */
  baseUrl?: string;
  authMode?: "static" | "header" | "connect-user" | "connect-app" | "none";
  /** Static bearer env var (authMode=static). */
  envVar?: string;
  /** Custom header name (authMode=header). */
  headerName?: string;
  /** Vercel Connect connector UID (authMode=connect-*). */
  connector?: string;
}
export interface FileWriteResult {
  ok: boolean;
  relPath?: string;
  error?: string;
}

// --- model / config ---
export interface ModelConfig {
  model: string | null;
  reasoning: string | null;
  editable: boolean;
  note: string | null;
}

// --- env ---
export interface EnvFile {
  name: string;
  exists: boolean;
  content: string;
}
export interface EnvState {
  files: EnvFile[];
}
export interface VercelStatus {
  linked: boolean;
  projectName?: string | null;
  projectId?: string | null;
  orgId?: string | null;
}
/** Whether an agent can actually run its model locally. */
export interface ModelReadiness {
  linked: boolean;
  hasCredential: boolean;
}
export interface CmdResult {
  ok: boolean;
  output: string;
}
/** Latest production deployment info from `vercel ls --prod`. */
export interface ProdInfo {
  ok: boolean;
  url?: string;
  age?: string;
  ready?: boolean;
  error?: string;
}
export interface DeploySettings {
  url?: string;
  bypassSecret?: string;
}
export type ChatTarget = "local" | "deployed";
export interface DeployHealth {
  ok: boolean;
  status: number;
  protected: boolean;
  reason?: string;
}

// --- authoring inputs ---
export interface ToolInput {
  name: string;
  description: string;
  approval?: "never" | "once" | "always";
}
export interface SubagentInput {
  name: string;
  description: string;
  model?: string;
  instructions?: string;
}
export interface ScheduleInput {
  name: string;
  cron: string;
  prompt: string;
}
export interface SandboxInfo {
  exists: boolean;
  relPath: string | null;
  content: string;
}

// --- channels ---
export interface ChannelItem {
  name: string;
  kind?: string;
  method?: string;
  urlPath?: string;
}
export type ChannelKind =
  | "slack"
  | "discord"
  | "teams"
  | "telegram"
  | "twilio"
  | "github"
  | "linear"
  | "custom";
export interface ChannelAddInput {
  kind: ChannelKind;
  /** Vercel Connect connector UID (slack/github/linear). */
  connector?: string;
  /** File name for a custom channel. */
  name?: string;
}
export interface ChannelWriteResult {
  ok: boolean;
  relPath?: string;
  envVars?: string[];
  connect?: boolean;
  error?: string;
}

// --- vercel connect ---
export interface ConnectorItem {
  uid: string;
  id: string;
  name: string;
  type: string;
}
/** Where a connector UID is referenced in the agent's files. */
export interface ConnectorUsage {
  uid: string;
  kind: "connection" | "channel";
  name: string;
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
  connectionRead: "agent:connectionRead",
  connectionWrite: "agent:connectionWrite",
  connectionDelete: "agent:connectionDelete",
  connectorUsage: "agent:connectorUsage",
  dialogPickDir: "dialog:pickDir",

  modelRead: "agent:modelRead",
  modelWrite: "agent:modelWrite",
  envRead: "agent:envRead",
  envWrite: "agent:envWrite",
  toolCreate: "agent:toolCreate",
  subagentCreate: "agent:subagentCreate",
  hookCreate: "agent:hookCreate",
  scheduleCreate: "agent:scheduleCreate",
  sandboxRead: "agent:sandboxRead",
  sandboxCreate: "agent:sandboxCreate",
  channelsList: "agent:channelsList",
  channelAdd: "agent:channelAdd",
  channelWrite: "agent:channelWrite",

  vercelStatus: "vercel:status",
  vercelEnvLs: "vercel:envLs",
  vercelEnvPull: "vercel:envPull",
  vercelEnvAdd: "vercel:envAdd",
  vercelProdInfo: "vercel:prodInfo",
  vercelLink: "vercel:link",
  modelReadiness: "vercel:modelReadiness",
  deployGet: "agent:deployGet",
  deploySet: "agent:deploySet",
  deployHealth: "agent:deployHealth",
  connectorList: "vercel:connectorList",
  connectorCreate: "vercel:connectorCreate",
  connectorAttach: "vercel:connectorAttach",
  connectOpen: "vercel:connectOpen",
  connectOpenExternal: "vercel:connectOpenExternal",
  connectorOpenPage: "vercel:connectorOpenPage",

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

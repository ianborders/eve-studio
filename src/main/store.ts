import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AgentRecord, EveEvent, ThreadRecord } from "../shared/ipc";

/** Resume state for an Eve session (Eve has no server-side history — we own it). */
export interface SessionCursor {
  sessionId?: string;
  continuationToken?: string;
  streamIndex: number;
}

/**
 * A stored Arcana brain credential, keyed by agent id.
 *
 * @remarks
 * Stored so Studio can browse a brain without re-parsing the agent's files.
 * Held in the local userData JSON for now; an OS-keychain vault is a later
 * hardening pass.
 */
export interface BrainCred {
  workspace: string;
  envVar: string;
  key: string;
}

interface Db {
  agents: AgentRecord[];
  threads: ThreadRecord[];
  cursors: Record<string, SessionCursor>;
  brains: Record<string, BrainCred>;
}

let dbPath = "";
let eventsDir = "";
let db: Db = { agents: [], threads: [], cursors: {}, brains: {} };

export function initStore(): void {
  const dataDir = app.getPath("userData");
  dbPath = join(dataDir, "studio-db.json");
  eventsDir = join(dataDir, "events");
  mkdirSync(eventsDir, { recursive: true });
  if (existsSync(dbPath)) {
    try {
      const parsed = JSON.parse(readFileSync(dbPath, "utf8")) as Partial<Db>;
      db = {
        agents: parsed.agents ?? [],
        threads: parsed.threads ?? [],
        cursors: parsed.cursors ?? {},
        brains: parsed.brains ?? {},
      };
    } catch {
      db = { agents: [], threads: [], cursors: {}, brains: {} };
    }
  } else {
    persist();
  }
}

function persist(): void {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export function rid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// --- agents ---
export function listAgents(): AgentRecord[] {
  return [...db.agents].sort((a, b) => b.addedAt - a.addedAt);
}
export function getAgent(id: string): AgentRecord | undefined {
  return db.agents.find((a) => a.id === id);
}
export function upsertAgent(agent: AgentRecord): void {
  const i = db.agents.findIndex((a) => a.id === agent.id);
  if (i >= 0) {
    db.agents[i] = agent;
  } else {
    db.agents.push(agent);
  }
  persist();
}
export function removeAgent(id: string): void {
  db.agents = db.agents.filter((a) => a.id !== id);
  for (const t of db.threads.filter((x) => x.agentId === id)) {
    deleteThread(t.id);
  }
  persist();
}

// --- threads ---
export function listThreads(agentId: string): ThreadRecord[] {
  return db.threads
    .filter((t) => t.agentId === agentId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getThread(id: string): ThreadRecord | undefined {
  return db.threads.find((t) => t.id === id);
}
export function createThread(agentId: string, title: string): ThreadRecord {
  const now = Date.now();
  const thread: ThreadRecord = { id: rid(), agentId, title, createdAt: now, updatedAt: now };
  db.threads.push(thread);
  persist();
  return thread;
}
export function touchThread(id: string, title?: string): void {
  const t = getThread(id);
  if (!t) {
    return;
  }
  t.updatedAt = Date.now();
  if (title) {
    t.title = title;
  }
  persist();
}
export function deleteThread(id: string): void {
  db.threads = db.threads.filter((t) => t.id !== id);
  delete db.cursors[id];
  persist();
  try {
    rmSync(eventFile(id));
  } catch {
    // no event file yet — fine
  }
}

// --- brains (Arcana credentials, keyed by agent id) ---
export function getBrain(agentId: string): BrainCred | undefined {
  return db.brains[agentId];
}
export function setBrain(agentId: string, cred: BrainCred): void {
  db.brains[agentId] = cred;
  persist();
}
export function deleteBrain(agentId: string): void {
  delete db.brains[agentId];
  persist();
}

// --- cursors ---
export function getCursor(threadId: string): SessionCursor {
  return db.cursors[threadId] ?? { streamIndex: 0 };
}
export function setCursor(threadId: string, cursor: SessionCursor): void {
  db.cursors[threadId] = cursor;
  persist();
}

// --- events (jsonl per thread) ---
function eventFile(threadId: string): string {
  return join(eventsDir, `${threadId}.jsonl`);
}
export function appendEvent(threadId: string, event: EveEvent): void {
  appendFileSync(eventFile(threadId), `${JSON.stringify(event)}\n`);
}
export function readEvents(threadId: string): EveEvent[] {
  const f = eventFile(threadId);
  if (!existsSync(f)) {
    return [];
  }
  const out: EveEvent[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line) {
      continue;
    }
    try {
      out.push(JSON.parse(line) as EveEvent);
    } catch {
      // skip a corrupt line
    }
  }
  return out;
}

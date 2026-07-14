import type {
  AgentRecord,
  AgentRuntimeState,
  ChatStatus,
  EveEvent,
  ThreadRecord,
} from "@shared/ipc";
import { create } from "zustand";

export type Section =
  | "library"
  | "chat"
  | "structure"
  | "memory"
  | "connections"
  | "deploy"
  | "evals"
  | "updates"
  | "settings";

interface State {
  section: Section;
  agents: AgentRecord[];
  runtime: Record<string, AgentRuntimeState>;
  activeAgentId: string | null;
  threads: Record<string, ThreadRecord[]>;
  activeThreadId: string | null;
  events: Record<string, EveEvent[]>;
  status: Record<string, ChatStatus>;
  booted: boolean;

  init: () => Promise<void>;
  setSection: (s: Section) => void;
  refreshAgents: () => Promise<void>;
  addAgent: () => Promise<void>;
  removeAgent: (id: string) => Promise<void>;
  startAgent: (id: string) => Promise<void>;
  stopAgent: (id: string) => Promise<void>;
  openAgentChat: (id: string) => Promise<void>;
  loadThreads: (agentId: string) => Promise<void>;
  newThread: (agentId: string) => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  respond: (requestId: string, optionId?: string, text?: string) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  section: "library",
  agents: [],
  runtime: {},
  activeAgentId: null,
  threads: {},
  activeThreadId: null,
  events: {},
  status: {},
  booted: false,

  init: async () => {
    if (get().booted) {
      return;
    }
    set({ booted: true });

    window.studio.agents.onStatusChanged((s) =>
      set((st) => ({ runtime: { ...st.runtime, [s.agentId]: s } }))
    );
    window.studio.chat.onEvent(({ threadId, event }) =>
      set((st) => ({
        events: {
          ...st.events,
          [threadId]: [...(st.events[threadId] ?? []), event],
        },
      }))
    );
    window.studio.chat.onStatus(({ threadId, status }) =>
      set((st) => ({ status: { ...st.status, [threadId]: status } }))
    );

    await get().refreshAgents();
  },

  setSection: (s) => set({ section: s }),

  refreshAgents: async () => {
    const agents = await window.studio.agents.list();
    const runtime: Record<string, AgentRuntimeState> = { ...get().runtime };
    for (const a of agents) {
      runtime[a.id] = await window.studio.agents.status(a.id);
    }
    set({ agents, runtime });
  },

  addAgent: async () => {
    const res = await window.studio.agents.add();
    if (!res.ok) {
      if (res.error && res.error !== "cancelled") {
        window.alert(res.error);
      }
      return;
    }
    await get().refreshAgents();
  },

  removeAgent: async (id) => {
    await window.studio.agents.remove(id);
    if (get().activeAgentId === id) {
      set({ activeAgentId: null, activeThreadId: null });
    }
    await get().refreshAgents();
  },

  startAgent: async (id) => {
    const s = await window.studio.agents.start(id);
    set((st) => ({ runtime: { ...st.runtime, [id]: s } }));
  },

  stopAgent: async (id) => {
    const s = await window.studio.agents.stop(id);
    set((st) => ({ runtime: { ...st.runtime, [id]: s } }));
  },

  openAgentChat: async (id) => {
    const rt = get().runtime[id];
    if (!rt || rt.status !== "running") {
      await get().startAgent(id);
    }
    set({ activeAgentId: id, section: "chat" });
    await get().loadThreads(id);
    const threads = get().threads[id] ?? [];
    if (threads[0]) {
      await get().selectThread(threads[0].id);
    } else {
      await get().newThread(id);
    }
  },

  loadThreads: async (agentId) => {
    const threads = await window.studio.chat.listThreads(agentId);
    set((st) => ({ threads: { ...st.threads, [agentId]: threads } }));
  },

  newThread: async (agentId) => {
    const t = await window.studio.chat.createThread(agentId);
    await get().loadThreads(agentId);
    set((st) => ({ activeThreadId: t.id, events: { ...st.events, [t.id]: [] } }));
  },

  selectThread: async (threadId) => {
    const events = await window.studio.chat.getThread(threadId);
    set((st) => ({
      activeThreadId: threadId,
      events: { ...st.events, [threadId]: events },
    }));
  },

  deleteThread: async (threadId) => {
    await window.studio.chat.deleteThread(threadId);
    const aid = get().activeAgentId;
    if (aid) {
      await get().loadThreads(aid);
    }
    if (get().activeThreadId === threadId) {
      set({ activeThreadId: null });
    }
  },

  send: async (text) => {
    const tid = get().activeThreadId;
    if (tid) {
      await window.studio.chat.send(tid, text);
    }
  },

  respond: async (requestId, optionId, text) => {
    const tid = get().activeThreadId;
    if (tid) {
      await window.studio.chat.respond(tid, requestId, optionId, text);
    }
  },
}));

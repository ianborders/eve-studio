import type { EveEvent } from "@shared/ipc";

export type ToolStatus = "pending" | "completed" | "failed" | "rejected";

export type Block =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      callId: string;
      name: string;
      input: unknown;
      status: ToolStatus;
      output?: unknown;
      error?: string;
    }
  | {
      kind: "subagent";
      id: string;
      callId: string;
      name: string;
      status: "pending" | "completed";
      output?: unknown;
    }
  | {
      kind: "input";
      id: string;
      requestId: string;
      prompt: string;
      toolName?: string;
      options?: { id: string; label: string; style?: string }[];
      allowFreeform?: boolean;
    }
  | {
      kind: "auth";
      id: string;
      name: string;
      url?: string;
      userCode?: string;
      instructions?: string;
    };

export interface Projection {
  blocks: Block[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

// biome-ignore lint: intentional loose typing over the untyped event payloads
type Any = Record<string, any>;

/** Fold the raw Eve event log into an ordered list of renderable blocks. */
export function projectEvents(events: EveEvent[]): Projection {
  const blocks: Block[] = [];
  const byCall = new Map<string, number>();
  let curAssistant: number | null = null;
  let curReasoning: number | null = null;
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let n = 0;

  for (const e of events) {
    n += 1;
    const data = (e.data ?? {}) as Any;

    if (e.type === "message.received") {
      const text = typeof data.message === "string" ? data.message : "";
      if (text) {
        blocks.push({ kind: "user", id: `u${n}`, text });
      }
      curAssistant = null;
      curReasoning = null;
    } else if (e.type === "message.appended") {
      const soFar = typeof data.messageSoFar === "string" ? data.messageSoFar : "";
      if (curAssistant === null) {
        blocks.push({ kind: "assistant", id: `a${n}`, text: soFar, streaming: true });
        curAssistant = blocks.length - 1;
      } else {
        const b = blocks[curAssistant];
        if (b.kind === "assistant") {
          b.text = soFar;
        }
      }
    } else if (e.type === "message.completed") {
      const msg = typeof data.message === "string" ? data.message : null;
      if (curAssistant !== null) {
        const b = blocks[curAssistant];
        if (b.kind === "assistant") {
          if (msg) {
            b.text = msg;
          }
          b.streaming = false;
        }
      } else if (msg) {
        blocks.push({ kind: "assistant", id: `a${n}`, text: msg, streaming: false });
      }
      curAssistant = null;
    } else if (e.type === "reasoning.appended") {
      const soFar =
        typeof data.reasoningSoFar === "string" ? data.reasoningSoFar : "";
      if (curReasoning === null) {
        blocks.push({ kind: "reasoning", id: `r${n}`, text: soFar, streaming: true });
        curReasoning = blocks.length - 1;
      } else {
        const b = blocks[curReasoning];
        if (b.kind === "reasoning") {
          b.text = soFar;
        }
      }
    } else if (e.type === "reasoning.completed") {
      if (curReasoning !== null) {
        const b = blocks[curReasoning];
        if (b.kind === "reasoning") {
          b.streaming = false;
        }
      }
      curReasoning = null;
    } else if (e.type === "actions.requested") {
      const actions: Any[] = Array.isArray(data.actions) ? data.actions : [];
      for (const a of actions) {
        const callId = String(a.callId ?? `c${n}`);
        if (byCall.has(callId)) {
          continue;
        }
        if (a.kind === "subagent-call" || a.kind === "remote-agent-call") {
          blocks.push({
            kind: "subagent",
            id: `s${callId}`,
            callId,
            name: String(a.subagentName ?? a.remoteAgentName ?? a.name ?? "subagent"),
            status: "pending",
          });
        } else {
          const name = a.kind === "load-skill" ? "load_skill" : String(a.toolName ?? "tool");
          blocks.push({
            kind: "tool",
            id: `t${callId}`,
            callId,
            name,
            input: a.input,
            status: "pending",
          });
        }
        byCall.set(callId, blocks.length - 1);
      }
      curAssistant = null;
      curReasoning = null;
    } else if (e.type === "action.result") {
      const result = (data.result ?? {}) as Any;
      const idx = byCall.get(String(result.callId ?? ""));
      if (idx !== undefined) {
        const b = blocks[idx];
        const status = (data.status as ToolStatus) ?? "completed";
        if (b.kind === "tool") {
          b.status = status;
          b.output = result.output;
          if (data.error) {
            b.error = String((data.error as Any).message ?? data.error);
          }
        } else if (b.kind === "subagent") {
          b.status = "completed";
          b.output = result.output;
        }
      }
    } else if (e.type === "subagent.called") {
      const callId = String(data.callId ?? `c${n}`);
      if (!byCall.has(callId)) {
        blocks.push({
          kind: "subagent",
          id: `s${callId}`,
          callId,
          name: String(data.name ?? "subagent"),
          status: "pending",
        });
        byCall.set(callId, blocks.length - 1);
      }
    } else if (e.type === "subagent.completed") {
      const idx = byCall.get(String(data.callId ?? ""));
      if (idx !== undefined) {
        const b = blocks[idx];
        if (b.kind === "subagent") {
          b.status = "completed";
          b.output = data.output;
        }
      }
    } else if (e.type === "input.requested") {
      const reqs: Any[] = Array.isArray(data.requests) ? data.requests : [];
      for (const r of reqs) {
        const options = Array.isArray(r.options)
          ? (r.options as Any[]).map((o) => ({
              id: String(o.id),
              label: String(o.label),
              style: o.style as string | undefined,
            }))
          : undefined;
        blocks.push({
          kind: "input",
          id: `i${String(r.requestId)}`,
          requestId: String(r.requestId),
          prompt: String(r.prompt ?? "Approve?"),
          toolName: r.action?.toolName as string | undefined,
          options,
          allowFreeform: Boolean(r.allowFreeform),
        });
      }
      curAssistant = null;
    } else if (e.type === "authorization.required") {
      const auth = (data.authorization ?? {}) as Any;
      blocks.push({
        kind: "auth",
        id: `auth${n}`,
        name: String(data.name ?? "connection"),
        url: auth.url as string | undefined,
        userCode: auth.userCode as string | undefined,
        instructions: (auth.instructions ?? data.description) as string | undefined,
      });
    } else if (e.type === "step.completed") {
      const usage = (data.usage ?? {}) as Any;
      if (typeof usage.costUsd === "number") {
        costUsd += usage.costUsd;
      }
      if (typeof usage.inputTokens === "number") {
        inputTokens += usage.inputTokens;
      }
      if (typeof usage.outputTokens === "number") {
        outputTokens += usage.outputTokens;
      }
    }
  }

  return { blocks, costUsd, inputTokens, outputTokens };
}

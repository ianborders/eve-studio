import { useEffect, useMemo, useRef, useState } from "react";
import { type Block, projectEvents } from "../lib/events";
import { useStore } from "../store";

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function BlockView({
  block,
  onRespond,
}: {
  block: Block;
  onRespond: (requestId: string, optionId?: string) => void;
}): JSX.Element | null {
  if (block.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-white/10 px-3.5 py-2 text-sm text-neutral-100">
          {block.text}
        </div>
      </div>
    );
  }
  if (block.kind === "assistant") {
    return (
      <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
        {block.text}
        {block.streaming ? <span className="ml-0.5 animate-pulse">▍</span> : null}
      </div>
    );
  }
  if (block.kind === "reasoning") {
    return (
      <details className="max-w-[85%] text-xs text-muted">
        <summary className="cursor-pointer select-none">thinking…</summary>
        <div className="mt-1 whitespace-pre-wrap border-l border-border pl-3 italic">
          {block.text}
        </div>
      </details>
    );
  }
  if (block.kind === "tool") {
    return (
      <details className="max-w-[85%] rounded-md border border-border bg-panel/60 text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5">
          <span className="text-neutral-400">🔧</span>
          <span className="font-mono text-neutral-200">{block.name}</span>
          <span
            className={
              block.status === "completed"
                ? "text-accent"
                : block.status === "pending"
                  ? "text-yellow-400"
                  : "text-red-400"
            }
          >
            {block.status}
          </span>
        </summary>
        <div className="space-y-1 px-2.5 pb-2">
          <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-neutral-300">
            {json(block.input)}
          </pre>
          {block.output !== undefined ? (
            <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-neutral-400">
              {json(block.output)}
            </pre>
          ) : null}
          {block.error ? (
            <div className="text-[11px] text-red-400">{block.error}</div>
          ) : null}
        </div>
      </details>
    );
  }
  if (block.kind === "subagent") {
    return (
      <details className="max-w-[85%] rounded-md border border-border bg-panel/60 text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5">
          <span className="text-neutral-400">◆</span>
          <span className="text-neutral-200">delegated to {block.name}</span>
          <span className={block.status === "completed" ? "text-accent" : "text-yellow-400"}>
            {block.status}
          </span>
        </summary>
        {block.output !== undefined ? (
          <pre className="mx-2.5 mb-2 overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-neutral-400">
            {json(block.output)}
          </pre>
        ) : null}
      </details>
    );
  }
  if (block.kind === "input") {
    return (
      <div className="max-w-[85%] rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3 text-sm">
        <div className="text-neutral-100">{block.prompt}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(block.options ?? [
            { id: "approve", label: "Approve" },
            { id: "deny", label: "Deny" },
          ]).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onRespond(block.requestId, o.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                o.style === "danger"
                  ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                  : "bg-white/10 text-neutral-100 hover:bg-white/15"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === "auth") {
    return (
      <div className="max-w-[85%] rounded-md border border-blue-500/40 bg-blue-500/5 p-3 text-sm">
        <div className="text-neutral-100">Sign in to {block.name}</div>
        {block.instructions ? (
          <div className="mt-1 text-xs text-muted">{block.instructions}</div>
        ) : null}
        {block.url ? (
          <a
            href={block.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block rounded-md bg-white/10 px-3 py-1.5 text-xs text-neutral-100 hover:bg-white/15"
          >
            Open sign-in
          </a>
        ) : null}
        {block.userCode ? (
          <div className="mt-2 font-mono text-xs text-neutral-300">
            Code: {block.userCode}
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}

export function Chat(): JSX.Element {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const agents = useStore((s) => s.agents);
  const runtime = useStore((s) => s.runtime);
  const threads = useStore((s) => s.threads);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const events = useStore((s) => s.events);
  const statusMap = useStore((s) => s.status);
  const newThread = useStore((s) => s.newThread);
  const selectThread = useStore((s) => s.selectThread);
  const deleteThread = useStore((s) => s.deleteThread);
  const send = useStore((s) => s.send);
  const respond = useStore((s) => s.respond);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadEvents = activeThreadId ? (events[activeThreadId] ?? []) : [];
  const projection = useMemo(() => projectEvents(threadEvents), [threadEvents]);
  const chatStatus = activeThreadId ? statusMap[activeThreadId] : undefined;
  const streaming = chatStatus === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [projection.blocks]);

  if (!activeAgentId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Pick an agent in the Agents tab to start chatting.
      </div>
    );
  }

  const agent = agents.find((a) => a.id === activeAgentId);
  const rt = runtime[activeAgentId];
  const agentThreads = threads[activeAgentId] ?? [];

  const submit = (): void => {
    const text = draft.trim();
    if (!text || streaming || rt?.status !== "running") {
      return;
    }
    setDraft("");
    void send(text);
  };

  return (
    <div className="flex h-full">
      {/* Threads */}
      <div className="flex w-56 flex-col border-r border-border">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium text-muted">Threads</span>
          <button
            type="button"
            onClick={() => newThread(activeAgentId)}
            className="rounded px-1.5 text-neutral-300 hover:bg-white/10"
          >
            +
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-auto px-2 pb-2">
          {agentThreads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectThread(t.id)}
              className={`group flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs ${
                t.id === activeThreadId
                  ? "bg-white/10 text-neutral-100"
                  : "text-neutral-400 hover:bg-white/5"
              }`}
            >
              <span className="flex-1 truncate">{t.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteThread(t.id);
                }}
                className="hidden text-muted hover:text-red-300 group-hover:inline"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-2.5 text-sm">
          <span className="font-medium text-neutral-100">{agent?.name}</span>
          <span
            className={`text-xs ${rt?.status === "running" ? "text-accent" : "text-muted"}`}
          >
            {rt?.status ?? "stopped"}
          </span>
          <div className="flex-1" />
          {projection.costUsd > 0 || projection.outputTokens > 0 ? (
            <span className="text-[11px] text-muted">
              ${projection.costUsd.toFixed(4)} · {projection.inputTokens}↑{" "}
              {projection.outputTokens}↓ tok
            </span>
          ) : null}
        </div>

        <div className="flex-1 space-y-3 overflow-auto px-5 py-5">
          {projection.blocks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {rt?.status === "running"
                ? "Say something to start."
                : "Agent isn't running — start it in the Agents tab."}
            </div>
          ) : (
            projection.blocks.map((b) => (
              <BlockView
                key={b.id}
                block={b}
                onRespond={(reqId, optId) => respond(reqId, optId)}
              />
            ))
          )}
          {chatStatus === "error" ? (
            <div className="text-xs text-red-400">Turn failed — see the agent logs.</div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-lg border border-border bg-panel px-3 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={
                rt?.status === "running" ? "Message the agent…" : "Start the agent to chat"
              }
              disabled={rt?.status !== "running"}
              className="max-h-40 flex-1 resize-none bg-transparent text-sm text-neutral-100 outline-none placeholder:text-muted disabled:opacity-50"
            />
            <button
              type="button"
              onClick={submit}
              disabled={streaming || !draft.trim() || rt?.status !== "running"}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-neutral-100 hover:bg-white/15 disabled:opacity-40"
            >
              {streaming ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

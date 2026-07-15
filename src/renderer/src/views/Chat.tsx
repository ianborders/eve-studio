import { useEffect, useMemo, useRef, useState } from "react";
import { type Block, projectEvents } from "../lib/events";
import { useStore } from "../store";
import { IconChat, IconExternal, IconPlus, IconWrench, IconX } from "../ui/icons";
import { Badge, Button, EmptyState } from "../ui/kit";
import { ChatTargetBar } from "./ChatTargetBar";

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
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2 text-[13px] text-text">
          {block.text}
        </div>
      </div>
    );
  }
  if (block.kind === "assistant") {
    return (
      <div className="max-w-[85%] whitespace-pre-wrap text-[13px] leading-relaxed text-text">
        {block.text}
        {block.streaming ? (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-accent" />
        ) : null}
      </div>
    );
  }
  if (block.kind === "reasoning") {
    return (
      <details className="max-w-[85%] text-xs text-muted">
        <summary className="cursor-pointer select-none text-faint">thinking…</summary>
        <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-3 italic">
          {block.text}
        </div>
      </details>
    );
  }
  if (block.kind === "tool") {
    const tone =
      block.status === "completed"
        ? "accent"
        : block.status === "pending"
          ? "warn"
          : "danger";
    return (
      <details className="max-w-[85%] overflow-hidden rounded-lg border border-border bg-panel text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5">
          <IconWrench className="h-3.5 w-3.5 text-faint" />
          <span className="font-mono text-text">{block.name}</span>
          <Badge tone={tone}>{block.status}</Badge>
        </summary>
        <div className="space-y-1 px-2.5 pb-2">
          <pre className="overflow-x-auto rounded bg-subtle border border-border p-2 text-2xs text-muted">
            {json(block.input)}
          </pre>
          {block.output !== undefined ? (
            <pre className="overflow-x-auto rounded bg-subtle border border-border p-2 text-2xs text-muted">
              {json(block.output)}
            </pre>
          ) : null}
          {block.error ? <div className="text-2xs text-danger">{block.error}</div> : null}
        </div>
      </details>
    );
  }
  if (block.kind === "subagent") {
    return (
      <details className="max-w-[85%] overflow-hidden rounded-lg border border-violet/30 bg-violet/[0.04] text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5">
          <span className="text-violet">◆</span>
          <span className="text-text">delegated to {block.name}</span>
          <Badge tone={block.status === "completed" ? "accent" : "warn"}>
            {block.status}
          </Badge>
        </summary>
        {block.output !== undefined ? (
          <pre className="mx-2.5 mb-2 overflow-x-auto rounded bg-subtle border border-border p-2 text-2xs text-muted">
            {json(block.output)}
          </pre>
        ) : null}
      </details>
    );
  }
  if (block.kind === "input") {
    return (
      <div className="max-w-[85%] rounded-lg border border-warn/40 bg-warn/[0.06] p-3 text-[13px]">
        <div className="text-text">{block.prompt}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(block.options ?? [
            { id: "approve", label: "Approve" },
            { id: "deny", label: "Deny" },
          ]).map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant={o.style === "danger" ? "danger" : "secondary"}
              onClick={() => onRespond(block.requestId, o.id)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === "auth") {
    return (
      <div className="max-w-[85%] rounded-lg border border-info/40 bg-info/[0.06] p-3 text-[13px]">
        <div className="text-text">Sign in to {block.name}</div>
        {block.instructions ? (
          <div className="mt-1 text-xs text-muted">{block.instructions}</div>
        ) : null}
        {block.url ? (
          <a
            href={block.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-black/[0.05] px-3 py-1.5 text-xs text-text hover:bg-black/[0.08]"
          >
            <IconExternal className="h-3.5 w-3.5" />
            Open sign-in
          </a>
        ) : null}
        {block.userCode ? (
          <div className="mt-2 font-mono text-xs text-muted">Code: {block.userCode}</div>
        ) : null}
      </div>
    );
  }
  return null;
}

export function Chat(): JSX.Element {
  const activeAgentId = useStore((s) => s.activeAgentId);
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
  const chatTargetMap = useStore((s) => s.chatTarget);

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
    return <div className="flex-1" />;
  }

  const rt = runtime[activeAgentId];
  const running = rt?.status === "running";
  const target = chatTargetMap[activeAgentId] ?? "local";
  const ready = target === "deployed" ? true : running;
  const agentThreads = threads[activeAgentId] ?? [];

  const submit = (): void => {
    const text = draft.trim();
    if (!text || streaming || !ready) {
      return;
    }
    setDraft("");
    void send(text);
  };

  return (
    <div className="flex h-full">
      {/* Threads */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-faint">
            Threads
          </span>
          <button
            type="button"
            onClick={() => newThread(activeAgentId)}
            className="rounded p-0.5 text-muted hover:bg-black/[0.05] hover:text-text"
          >
            <IconPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-auto px-2 pb-2">
          {agentThreads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectThread(t.id)}
              className={`group flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-xs ${
                t.id === activeThreadId
                  ? "bg-black/[0.05] text-text"
                  : "text-muted hover:bg-black/[0.03]"
              }`}
            >
              <span className="flex-1 truncate">{t.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteThread(t.id);
                }}
                className="hidden text-faint hover:text-danger group-hover:inline"
              >
                <IconX className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatTargetBar agentId={activeAgentId} />
        {projection.costUsd > 0 || projection.outputTokens > 0 ? (
          <div className="flex items-center justify-end border-b border-border px-5 py-1.5 text-2xs text-faint">
            ${projection.costUsd.toFixed(4)} · {projection.inputTokens}↑{" "}
            {projection.outputTokens}↓ tok
          </div>
        ) : null}

        <div className="flex-1 space-y-3 overflow-auto px-5 py-5">
          {!activeThreadId ? (
            <EmptyState
              icon={<IconChat className="h-5 w-5" />}
              title="No thread selected"
              action={
                <Button variant="primary" size="sm" onClick={() => newThread(activeAgentId)}>
                  <IconPlus className="h-3.5 w-3.5" />
                  New chat
                </Button>
              }
            >
              Start a conversation with this agent.
            </EmptyState>
          ) : projection.blocks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {ready
                ? "Say something to start."
                : "Start the agent (or switch to Deployed) to chat."}
            </div>
          ) : (
            projection.blocks.map((b) => (
              <BlockView key={b.id} block={b} onRespond={(r, o) => respond(r, o)} />
            ))
          )}
          {chatStatus === "error" ? (
            <div className="text-xs text-danger">Turn failed — see the agent logs.</div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-panel px-3 py-2 focus-within:border-accent/50">
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
                ready
                  ? target === "deployed"
                    ? "Message the deployed agent…"
                    : "Message the agent…"
                  : "Start the agent to chat"
              }
              disabled={!ready || !activeThreadId}
              className="max-h-40 flex-1 resize-none bg-transparent text-[13px] text-text outline-none placeholder:text-faint disabled:opacity-50"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={streaming || !draft.trim() || !ready || !activeThreadId}
            >
              {streaming ? "…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

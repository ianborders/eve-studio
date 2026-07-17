import { PROPOSE_TOOL_NAME } from "@shared/ipc";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProposalReview } from "../components/ProposalReview";
import { type Block, projectEvents } from "../lib/events";
import { looksLikeEvolveIntent } from "../lib/evolveIntent";
import { useEvolve } from "../lib/useEvolve";
import { useStore } from "../store";
import {
  IconArrowUp,
  IconChat,
  IconExternal,
  IconPlus,
  IconWand,
  IconWrench,
} from "../ui/icons";
import { Badge, Button, EmptyState, Modal, Spinner } from "../ui/kit";
import { NeedsLink } from "../components/NeedsLink";
import { ChatTargetBar } from "./ChatTargetBar";

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Quiet mono label above a turn, e.g. "YOU" or the agent name. */
function TurnLabel({ label }: { label: string }): JSX.Element {
  return (
    <div className="mb-1 font-spacemono text-2xs uppercase tracking-widest text-faint">
      {label}
    </div>
  );
}

function BlockView({
  block,
  agentName,
  onRespond,
}: {
  block: Block;
  agentName: string;
  onRespond: (requestId: string, optionId?: string) => void;
}): JSX.Element | null {
  if (block.kind === "user") {
    return (
      <div>
        <TurnLabel label="You" />
        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">
          {block.text}
        </div>
      </div>
    );
  }
  if (block.kind === "assistant") {
    return (
      <div>
        <TurnLabel label={agentName} />
        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">
          {block.text}
          {block.streaming ? (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-text" />
          ) : null}
        </div>
      </div>
    );
  }
  if (block.kind === "reasoning") {
    return (
      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none text-faint">
          thinking…
        </summary>
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
      <details className="overflow-hidden rounded-lg border border-border bg-panel text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5">
          <IconWrench className="h-3.5 w-3.5 text-faint" />
          <span className="font-mono text-text">{block.name}</span>
          <Badge tone={tone}>{block.status}</Badge>
        </summary>
        <div className="space-y-1 px-2.5 pb-2">
          <pre className="overflow-x-auto rounded border border-border bg-subtle p-2 text-2xs text-muted">
            {json(block.input)}
          </pre>
          {block.output !== undefined ? (
            <pre className="overflow-x-auto rounded border border-border bg-subtle p-2 text-2xs text-muted">
              {json(block.output)}
            </pre>
          ) : null}
          {block.error ? (
            <div className="text-2xs text-danger">{block.error}</div>
          ) : null}
        </div>
      </details>
    );
  }
  if (block.kind === "subagent") {
    return (
      <details className="overflow-hidden rounded-lg border border-violet/30 bg-violet/[0.04] text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5">
          <span className="text-violet">◆</span>
          <span className="text-text">delegated to {block.name}</span>
          <Badge tone={block.status === "completed" ? "accent" : "warn"}>
            {block.status}
          </Badge>
        </summary>
        {block.output !== undefined ? (
          <pre className="mx-2.5 mb-2 overflow-x-auto rounded border border-border bg-subtle p-2 text-2xs text-muted">
            {json(block.output)}
          </pre>
        ) : null}
      </details>
    );
  }
  if (block.kind === "input") {
    return (
      <div className="rounded-lg border border-warn/40 bg-warn/[0.06] p-3 text-[13px]">
        <div className="text-text">{block.prompt}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            block.options ?? [
              { id: "approve", label: "Approve" },
              { id: "deny", label: "Deny" },
            ]
          ).map((o) => (
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
      <div className="rounded-lg border border-info/40 bg-info/[0.06] p-3 text-[13px]">
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
          <div className="mt-2 font-mono text-xs text-muted">
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
  const activeThreadId = useStore((s) => s.activeThreadId);
  const events = useStore((s) => s.events);
  const statusMap = useStore((s) => s.status);
  const newThread = useStore((s) => s.newThread);
  const send = useStore((s) => s.send);
  const respond = useStore((s) => s.respond);
  const chatTargetMap = useStore((s) => s.chatTarget);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const ev = useEvolve(activeAgentId);
  const [evolveOpen, setEvolveOpen] = useState(false);
  const [evolveText, setEvolveText] = useState("");

  const openEvolve = (): void => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    setEvolveText(text);
    setEvolveOpen(true);
    void ev.draft(text);
  };

  const closeEvolve = (): void => {
    if (ev.result?.ok) {
      setDraft("");
    }
    ev.reset();
    setEvolveOpen(false);
  };
  const handledProposals = useRef<Set<string>>(new Set());

  const threadEvents = activeThreadId ? (events[activeThreadId] ?? []) : [];
  const projection = useMemo(() => projectEvents(threadEvents), [threadEvents]);
  const chatStatus = activeThreadId ? statusMap[activeThreadId] : undefined;
  const streaming = chatStatus === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [projection.blocks]);

  // Catch the agent's own `propose_change` tool call in the live stream and open
  // the same diff/approve flow, seeded from what it proposed.
  useEffect(() => {
    for (const b of projection.blocks) {
      if (b.kind !== "tool" || b.name !== PROPOSE_TOOL_NAME) {
        continue;
      }
      if (handledProposals.current.has(b.callId)) {
        continue;
      }
      const intent = (b.input as { intent?: string } | null)?.intent?.trim();
      if (!intent) {
        continue;
      }
      handledProposals.current.add(b.callId);
      setEvolveText(intent);
      setEvolveOpen(true);
      void ev.draft(intent);
      break;
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: only react to new stream blocks; ev handlers are stable
  }, [projection.blocks]);

  if (!activeAgentId) {
    return <div className="flex-1" />;
  }

  const rt = runtime[activeAgentId];
  const running = rt?.status === "running";
  const target = chatTargetMap[activeAgentId] ?? "local";
  const ready = target === "deployed" ? true : running;
  const agentName = agents.find((a) => a.id === activeAgentId)?.name ?? "Agent";

  const submit = (asMessage = false): void => {
    const text = draft.trim();
    if (!text || streaming || !ready || !activeThreadId) {
      return;
    }
    // A self-change request goes to the approval flow, not the agent — the agent
    // can't edit itself, so sending it there just gets a refusal.
    if (!asMessage && looksLikeEvolveIntent(text)) {
      openEvolve();
      return;
    }
    setDraft("");
    void send(text);
  };

  // Escape hatch from the Evolve modal: send the text as a normal message.
  const sendAsMessage = (): void => {
    const text = draft.trim();
    setEvolveOpen(false);
    ev.reset();
    setDraft("");
    if (text && ready && activeThreadId) {
      void send(text);
    }
  };

  const canSend =
    !streaming && draft.trim().length > 0 && ready && !!activeThreadId;
  const showEvolveChip = ready && !streaming && looksLikeEvolveIntent(draft);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <NeedsLink agentId={activeAgentId} />
      <ChatTargetBar agentId={activeAgentId} />

      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-7">
          {!activeThreadId ? (
            <EmptyState
              icon={<IconChat className="h-5 w-5" />}
              title="No thread selected"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => newThread(activeAgentId)}
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  New chat
                </Button>
              }
            >
              Pick a thread in the sidebar, or start a new one.
            </EmptyState>
          ) : projection.blocks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <div className="text-[15px] font-medium text-text">
                {agentName}
              </div>
              <div className="text-[13px] text-muted">
                {ready
                  ? "What can I help you with?"
                  : "Start the agent (or switch to Deployed) to chat."}
              </div>
            </div>
          ) : (
            projection.blocks.map((b) => (
              <BlockView
                key={b.id}
                block={b}
                agentName={agentName}
                onRespond={(r, o) => respond(r, o)}
              />
            ))
          )}
          {chatStatus === "error" ? (
            <div className="text-xs text-danger">
              Turn failed — see the agent logs.
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pb-5 pt-1">
        {showEvolveChip ? (
          <div className="mb-2 flex justify-center">
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-1 text-2xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
              onClick={openEvolve}
              type="button"
            >
              <IconWand className="h-3.5 w-3.5" />
              Turn this into a change to the agent
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2.5 rounded-[18px] border border-border bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
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
            className="field-auto max-h-44 flex-1 resize-none self-center border-0 bg-transparent text-[14px] leading-6 text-text outline-none placeholder:text-faint disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={!canSend}
            title="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-text text-white transition-[background-color,transform] duration-150 hover:bg-text/80 active:scale-95 disabled:bg-black/[0.05] disabled:text-faint"
          >
            {streaming ? (
              <Spinner className="h-[18px] w-[18px]" />
            ) : (
              <IconArrowUp className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
        {projection.costUsd > 0 || projection.outputTokens > 0 ? (
          <div className="mt-2.5 flex items-center gap-3 px-1">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
              <div
                className="h-full rounded-full bg-text/25 transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (projection.inputTokens / 200_000) * 100)}%`,
                }}
              />
            </div>
            <span className="shrink-0 font-spacemono text-[10px] uppercase tracking-wider text-faint">
              ${projection.costUsd.toFixed(4)} ·{" "}
              {projection.inputTokens.toLocaleString()}↑{" "}
              {projection.outputTokens.toLocaleString()}↓
            </span>
          </div>
        ) : null}
      </div>

      {evolveOpen ? (
        <Modal onClose={closeEvolve} title="Evolve this" width="max-w-xl">
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
              <span className="text-[13px] text-muted">“{evolveText}”</span>
              <button
                className="shrink-0 whitespace-nowrap text-2xs text-faint underline decoration-border-strong underline-offset-2 hover:text-foreground"
                onClick={sendAsMessage}
                type="button"
              >
                send as a message instead
              </button>
            </div>
            {ev.phase === "drafting" ? (
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner />
                Drafting the change…
              </div>
            ) : null}
            {ev.error ? (
              <div className="text-xs text-danger">{ev.error}</div>
            ) : null}
            <ProposalReview doneLabel="Close" ev={ev} onDone={closeEvolve} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

import type {
  ArcanaStats,
  DetectedBrain,
  QueryHit,
  TimelineEvent,
} from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { IconBrain, IconRefresh, IconSearch } from "../ui/icons";
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Kicker,
  List,
  ListRow,
  Spinner,
  StatusDot,
  ViewHeader,
} from "../ui/kit";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) {
    return "just now";
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  return `${Math.floor(h / 24)}d ago`;
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <Card className="px-4 py-3">
      <div className="text-2xl font-semibold tracking-tight text-text">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 font-spacemono text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </div>
    </Card>
  );
}

function Browse({ agentId }: { agentId: string }): JSX.Element {
  const [stats, setStats] = useState<ArcanaStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<QueryHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const [s, t] = await Promise.all([
      window.studio.arcana.stats(agentId),
      window.studio.arcana.timeline(agentId, 40),
    ]);
    if (s.ok && s.data) {
      setStats(s.data);
    } else {
      setErr(s.error ?? "Failed to load stats.");
    }
    if (t.ok && t.data) {
      setTimeline(t.data);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runQuery = async (): Promise<void> => {
    const query = q.trim();
    if (!query) {
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await window.studio.arcana.query(agentId, query);
    setBusy(false);
    if (r.ok && r.data) {
      setHits(r.data);
    } else {
      setErr(r.error ?? "Query failed.");
    }
  };

  return (
    <div className="space-y-5">
      {err ? (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {err}
        </div>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="events" value={stats.timeline.total_events} />
          <Stat label="entities" value={stats.entityGraph.total_entities} />
          <Stat label="mentions" value={stats.entityGraph.total_mentions} />
          <Stat label="relations" value={stats.entityGraph.total_relations} />
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2">
        <IconSearch className="h-4 w-4 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void runQuery();
            }
          }}
          placeholder="Ask the brain — hybrid semantic + graph search…"
          className="no-drag flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
        />
        <Button
          size="sm"
          variant="primary"
          onClick={() => void runQuery()}
          disabled={busy || !q.trim()}
        >
          {busy ? "…" : "Search"}
        </Button>
      </div>

      {hits ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Kicker>
              {hits.length} result{hits.length === 1 ? "" : "s"}
            </Kicker>
            <button
              type="button"
              onClick={() => setHits(null)}
              className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors hover:text-text"
            >
              back to timeline
            </button>
          </div>
          {hits.map((h) => (
            <Card key={h.id} className="p-3">
              <div className="flex items-center gap-2">
                <Badge>{h.type}</Badge>
                <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-faint">
                  {timeAgo(h.timestamp)}
                </span>
                {typeof h.hybridScore === "number" ? (
                  <span className="ml-auto font-mono text-2xs text-faint">
                    {h.hybridScore.toFixed(3)}
                  </span>
                ) : null}
              </div>
              {h.title && h.title !== "Untitled" ? (
                <div className="mt-1.5 text-[13px] text-text">{h.title}</div>
              ) : null}
              {h.content ? (
                <div className="mt-1 line-clamp-3 text-xs leading-snug text-muted">
                  {h.content}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          <Kicker>Recent timeline</Kicker>
          {timeline.map((e) => (
            <Card key={String(e.id)} className="p-3">
              <div className="flex items-center gap-2">
                <Badge>{e.type}</Badge>
                <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-faint">
                  {timeAgo(e.timestamp)}
                </span>
              </div>
              <div className="mt-1.5 text-[13px] leading-snug text-text">
                {e.title}
              </div>
              {e.entities && e.entities.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {e.entities.slice(0, 8).map((ent) => (
                    <span
                      key={ent}
                      className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-2xs text-muted"
                    >
                      {ent}
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Setup({
  agentId,
  detected,
  onConnected,
}: {
  agentId: string;
  detected: DetectedBrain;
  onConnected: () => void;
}): JSX.Element {
  const [workspace, setWorkspace] = useState(detected.workspace ?? "");
  const [envVar, setEnvVar] = useState(detected.envVar ?? "ARCANA_API_KEY");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [err, setErr] = useState<string | null>(null);

  const canBrowseFromEnv =
    detected.keyPresent &&
    Boolean(detected.workspace) &&
    Boolean(detected.envVar);

  const run = async (
    kind: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<void> => {
    setBusy(kind);
    setErr(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      onConnected();
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-subtle text-faint">
          <IconBrain className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text">
            {detected.connections.length > 0
              ? "This agent already has an Arcana connection"
              : "Give this agent an Arcana brain"}
          </div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {detected.connections.length > 0
              ? "Connect Studio to browse and query its memory."
              : "Writes connections/arcana.ts + sets the key in .env, like eve-gtm."}
          </div>
        </div>
      </Card>

      {canBrowseFromEnv ? (
        <Button
          variant="primary"
          size="md"
          className="w-full"
          disabled={busy !== null}
          onClick={() =>
            void run("env", () =>
              window.studio.arcana.saveBrain(agentId, {
                workspace: detected.workspace ?? workspace,
                envVar: detected.envVar ?? envVar,
                fromEnv: true,
              }),
            )
          }
        >
          {busy === "env"
            ? "Connecting…"
            : `Connect using key in .env  (${detected.envVar} → ${detected.workspace})`}
        </Button>
      ) : null}

      <Card className="space-y-3 p-4">
        <Field label="Workspace slug">
          <Input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="eve-gtm"
          />
        </Field>
        <Field label="Env var name">
          <Input
            value={envVar}
            onChange={(e) => setEnvVar(e.target.value)}
            placeholder="ARCANA_API_KEY"
            className="font-mono"
          />
        </Field>
        <Field label="API key (kb_…)">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            placeholder="kb_live_…"
            className="font-mono"
          />
        </Field>

        {err ? <div className="text-xs text-danger">{err}</div> : null}

        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy !== null || !workspace || !key}
            onClick={() =>
              void run("connect", () =>
                window.studio.arcana.saveBrain(agentId, {
                  workspace,
                  envVar,
                  key,
                }),
              )
            }
          >
            {busy === "connect" ? "Validating…" : "Connect (browse only)"}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={busy !== null || !workspace || !key || !envVar}
            onClick={() =>
              void run("wire", () =>
                window.studio.arcana.wire(agentId, { workspace, envVar, key }),
              )
            }
          >
            {busy === "wire" ? "Wiring…" : "Wire into agent"}
          </Button>
        </div>
        <p className="text-2xs leading-snug text-faint">
          <b className="text-muted">Connect</b> just lets Studio read the brain.{" "}
          <b className="text-muted">Wire</b> writes the connection into the
          agent — restart it, and it automatically gets Arcana's memory tools
          (remember/recall/search). Add a line in{" "}
          <b className="text-muted">Instructions</b> telling it when to recall
          and remember.
        </p>
      </Card>
    </div>
  );
}

const NATIVE = [
  {
    title: "Durable sessions + compaction",
    body: "Every conversation persists and auto-summarizes as it approaches the context limit — nothing is authored or configured.",
  },
  {
    title: "defineState",
    body: "Durable key/value state that survives steps, crashes, and redeploys (eve/context). The agent's own working memory for a session lineage.",
  },
  {
    title: "todo",
    body: "A built-in durable working list the agent uses to track multi-step tasks.",
  },
  {
    title: "Sandbox /workspace",
    body: "A filesystem the agent can read and write during a run.",
  },
];

function NativeMemory(): JSX.Element {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Kicker>Native memory</Kicker>
        <Badge tone="success">built in</Badge>
        <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-faint">
          every agent · no setup
        </span>
      </div>
      <Card>
        <List>
          {NATIVE.map((n) => (
            <ListRow key={n.title} title={n.title} desc={n.body} />
          ))}
        </List>
        <div className="border-t border-border px-4 py-3 text-[13px] leading-relaxed text-muted">
          What Eve does <b className="text-text">not</b> do natively is
          cross-conversation semantic recall (facts, timeline, search). That's
          the one thing <b className="text-text">Arcana</b> adds — optional,
          below.
        </div>
      </Card>
    </section>
  );
}

const MEMORY_SNIPPET = `## Memory

You have long-term memory (Arcana). Use it on every turn:

- **Recall first** — at the start of a task or check-in, recall what you already
  know about the user, the topic, and any open threads before you respond.
- **Remember as you go** — when the user shares a fact, decision, preference,
  plan, or outcome, or when you finish something, record it so it persists across
  conversations.
- Keep the durable state — profile, current plan, the running log, and results —
  in memory, not just this chat.`;

function MemoryInstructions({ agentId }: { agentId: string }): JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(MEMORY_SNIPPET);
    setStatus("copied ✓");
    setTimeout(() => setStatus(null), 1500);
  };

  const addToInstructions = async (): Promise<void> => {
    setBusy(true);
    const f = await window.studio.agents.readInstructions(agentId);
    if (/^##\s*Memory\b/m.test(f.content)) {
      setBusy(false);
      setStatus("already in Instructions");
      setTimeout(() => setStatus(null), 2000);
      return;
    }
    const next = `${f.content.trimEnd()}\n\n${MEMORY_SNIPPET}\n`;
    await window.studio.agents.writeInstructions(agentId, next);
    setBusy(false);
    setStatus("added to Instructions ✓ — restart the agent");
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-text">
          Teach it to use memory
        </span>
        <div className="flex-1" />
        {status ? (
          <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-success">
            {status}
          </span>
        ) : null}
        <Button variant="secondary" size="sm" onClick={copy}>
          Copy
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={addToInstructions}
          disabled={busy}
        >
          {busy ? "Adding…" : "Add to Instructions"}
        </Button>
      </div>
      <p className="mt-1.5 text-2xs leading-relaxed text-muted">
        The tools load automatically — this tells the agent{" "}
        <b className="text-text">when</b> to recall and remember. Add it once
        (idempotent), then restart the agent.
      </p>
      <pre className="mt-2 overflow-auto rounded-lg border border-border bg-subtle p-3 font-mono text-2xs leading-relaxed text-muted">
        {MEMORY_SNIPPET}
      </pre>
    </Card>
  );
}

export function Memory(): JSX.Element {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const [detected, setDetected] = useState<DetectedBrain | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeAgentId) {
      return;
    }
    setLoading(true);
    try {
      setDetected(await window.studio.arcana.detect(activeAgentId));
    } finally {
      setLoading(false);
    }
  }, [activeAgentId]);

  useEffect(() => {
    setDetected(null);
    void refresh();
  }, [refresh]);

  const forget = async (): Promise<void> => {
    if (activeAgentId) {
      await window.studio.arcana.forgetBrain(activeAgentId);
      await refresh();
    }
  };

  const connected = detected?.saved ?? null;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker="Brain"
        title="Memory"
        right={
          <>
            {connected ? (
              <Badge tone="success">active · {connected.workspace}</Badge>
            ) : null}
            {connected ? (
              <Button variant="ghost" size="sm" onClick={() => void forget()}>
                Disconnect
              </Button>
            ) : null}
            <IconButton onClick={() => void refresh()} title="Reload">
              <IconRefresh className="h-3.5 w-3.5" />
            </IconButton>
          </>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
          <NativeMemory />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Kicker>Long-term memory · Arcana</Kicker>
              {connected ? (
                <Badge tone="success">active</Badge>
              ) : (
                <Badge>optional add-on</Badge>
              )}
            </div>
            {loading && !detected ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Inspecting…
              </div>
            ) : connected && activeAgentId ? (
              <div className="space-y-4">
                <Card className="flex items-start gap-3 p-4">
                  <StatusDot status="running" className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold tracking-tight text-text">
                        Long-term memory active
                      </span>
                      <Badge tone="success">on</Badge>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                      Arcana workspace{" "}
                      <span className="font-mono text-text">
                        {connected.workspace}
                      </span>
                      {detected?.connections.length
                        ? " — wired into the agent."
                        : " — browsing only (not wired into the agent)."}
                    </p>
                  </div>
                </Card>
                <MemoryInstructions agentId={activeAgentId} />
                <Browse agentId={activeAgentId} />
              </div>
            ) : detected && activeAgentId ? (
              <Setup
                agentId={activeAgentId}
                detected={detected}
                onConnected={refresh}
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

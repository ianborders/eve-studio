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
  Spinner,
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
      <div className="text-2xs uppercase tracking-wide text-faint">{label}</div>
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
    <div className="mx-auto max-w-3xl space-y-5">
      {err ? (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="events" value={stats.timeline.total_events} />
          <Stat label="entities" value={stats.entityGraph.total_entities} />
          <Stat label="mentions" value={stats.entityGraph.total_mentions} />
          <Stat label="relations" value={stats.entityGraph.total_relations} />
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 shadow-card">
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
          className="flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
        />
        <Button size="sm" variant="primary" onClick={() => void runQuery()} disabled={busy || !q.trim()}>
          {busy ? "…" : "Search"}
        </Button>
      </div>

      {hits ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">
              {hits.length} result{hits.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setHits(null)}
              className="text-xs text-muted hover:text-text"
            >
              back to timeline
            </button>
          </div>
          {hits.map((h) => (
            <Card key={h.id} className="p-3">
              <div className="flex items-center gap-2 text-2xs text-faint">
                <Badge>{h.type}</Badge>
                <span>{timeAgo(h.timestamp)}</span>
                {typeof h.hybridScore === "number" ? (
                  <span className="ml-auto font-mono">{h.hybridScore.toFixed(3)}</span>
                ) : null}
              </div>
              {h.title && h.title !== "Untitled" ? (
                <div className="mt-1 text-[13px] text-text">{h.title}</div>
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
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted">Recent timeline</span>
          {timeline.map((e) => (
            <Card key={String(e.id)} className="p-3">
              <div className="flex items-center gap-2 text-2xs text-faint">
                <Badge>{e.type}</Badge>
                <span>{timeAgo(e.timestamp)}</span>
              </div>
              <div className="mt-1 text-[13px] leading-snug text-text">{e.title}</div>
              {e.entities && e.entities.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {e.entities.slice(0, 8).map((ent) => (
                    <span
                      key={ent}
                      className="rounded bg-black/[0.04] px-1.5 py-0.5 text-2xs text-muted"
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
    detected.keyPresent && Boolean(detected.workspace) && Boolean(detected.envVar);

  const run = async (
    kind: string,
    fn: () => Promise<{ ok: boolean; error?: string }>
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
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <IconBrain className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[13px] font-medium text-text">
              {detected.connections.length > 0
                ? "This agent already has an Arcana connection"
                : "Give this agent an Arcana brain"}
            </div>
            <div className="text-2xs text-muted">
              {detected.connections.length > 0
                ? "Connect Studio to browse and query its memory."
                : "Writes connections/arcana.ts + sets the key in .env, like eve-gtm."}
            </div>
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
              })
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
          <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="eve-gtm" />
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
                window.studio.arcana.saveBrain(agentId, { workspace, envVar, key })
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
                window.studio.arcana.wire(agentId, { workspace, envVar, key })
              )
            }
          >
            {busy === "wire" ? "Wiring…" : "Wire into agent"}
          </Button>
        </div>
        <p className="text-2xs leading-snug text-faint">
          <b className="text-muted">Connect</b> just lets Studio read the brain.{" "}
          <b className="text-muted">Wire</b> writes files into the agent — restart it
          afterward to load the connection.
        </p>
      </Card>
    </div>
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
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-medium text-text">
          Memory
          {connected ? (
            <Badge tone="accent">
              <IconBrain className="h-3 w-3" />
              {connected.workspace}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {connected ? (
            <Button variant="ghost" size="sm" onClick={() => void forget()}>
              Disconnect
            </Button>
          ) : null}
          <IconButton onClick={() => void refresh()} title="Reload">
            <IconRefresh className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading && !detected ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
            <Spinner /> Inspecting…
          </div>
        ) : connected && activeAgentId ? (
          <Browse agentId={activeAgentId} />
        ) : detected && activeAgentId ? (
          <Setup agentId={activeAgentId} detected={detected} onConnected={refresh} />
        ) : null}
      </div>
    </div>
  );
}

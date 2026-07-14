import type {
  ArcanaStats,
  DetectedBrain,
  QueryHit,
  TimelineEvent,
} from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";

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

function Stat({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-panel px-4 py-3">
      <div className="text-xl font-semibold text-neutral-100">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function StatsRow({ stats }: { stats: ArcanaStats }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Stat label="events" value={stats.timeline.total_events} />
      <Stat label="entities" value={stats.entityGraph.total_entities} />
      <Stat label="mentions" value={stats.entityGraph.total_mentions} />
      <Stat label="relations" value={stats.entityGraph.total_relations} />
    </div>
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
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </div>
      ) : null}

      {stats ? <StatsRow stats={stats} /> : null}

      {/* search */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2">
        <span className="text-muted">🔎</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void runQuery();
            }
          }}
          placeholder="Ask the brain — hybrid semantic + graph search…"
          className="flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => void runQuery()}
          disabled={busy || !q.trim()}
          className="rounded-md bg-white/10 px-3 py-1 text-xs text-neutral-100 hover:bg-white/15 disabled:opacity-40"
        >
          {busy ? "…" : "Search"}
        </button>
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
              className="text-xs text-muted hover:text-neutral-200"
            >
              back to timeline
            </button>
          </div>
          {hits.map((h) => (
            <div key={h.id} className="rounded-md border border-border bg-panel p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="rounded bg-white/5 px-1.5 py-0.5">{h.type}</span>
                <span>{timeAgo(h.timestamp)}</span>
                {typeof h.hybridScore === "number" ? (
                  <span className="ml-auto font-mono">
                    {h.hybridScore.toFixed(3)}
                  </span>
                ) : null}
              </div>
              {h.title && h.title !== "Untitled" ? (
                <div className="mt-1 text-sm text-neutral-100">{h.title}</div>
              ) : null}
              {h.content ? (
                <div className="mt-1 line-clamp-3 text-xs leading-snug text-muted">
                  {h.content}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted">Recent timeline</span>
          {timeline.map((e) => (
            <div key={String(e.id)} className="rounded-md border border-border bg-panel p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="rounded bg-white/5 px-1.5 py-0.5">{e.type}</span>
                <span>{timeAgo(e.timestamp)}</span>
              </div>
              <div className="mt-1 text-sm leading-snug text-neutral-100">
                {e.title}
              </div>
              {e.entities && e.entities.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {e.entities.slice(0, 8).map((ent) => (
                    <span
                      key={ent}
                      className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted"
                    >
                      {ent}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
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

  const connectFromEnv = async (): Promise<void> => {
    setBusy("env");
    setErr(null);
    const r = await window.studio.arcana.saveBrain(agentId, {
      workspace: detected.workspace ?? workspace,
      envVar: detected.envVar ?? envVar,
      fromEnv: true,
    });
    setBusy(null);
    if (r.ok) {
      onConnected();
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  const connect = async (): Promise<void> => {
    setBusy("connect");
    setErr(null);
    const r = await window.studio.arcana.saveBrain(agentId, {
      workspace,
      envVar,
      key,
    });
    setBusy(null);
    if (r.ok) {
      onConnected();
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  const wire = async (): Promise<void> => {
    setBusy("wire");
    setErr(null);
    const r = await window.studio.arcana.wire(agentId, { workspace, envVar, key });
    setBusy(null);
    if (r.ok) {
      onConnected();
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="text-sm font-medium text-neutral-100">
          {detected.connections.length > 0
            ? "This agent already has an Arcana connection"
            : "Give this agent an Arcana brain"}
        </div>
        <div className="mt-1 text-xs text-muted">
          {detected.connections.length > 0
            ? "Connect Studio to its brain to browse and query memory, or re-wire the key."
            : "Wire a workspace + kb_ key into the agent — it writes connections/arcana.ts and sets the key in .env, exactly like eve-gtm."}
        </div>
      </div>

      {canBrowseFromEnv ? (
        <button
          type="button"
          onClick={() => void connectFromEnv()}
          disabled={busy !== null}
          className="w-full rounded-md bg-accent/20 px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
        >
          {busy === "env"
            ? "Connecting…"
            : `Connect using key in .env (${detected.envVar} → ${detected.workspace})`}
        </button>
      ) : null}

      <div className="space-y-2.5 rounded-lg border border-border bg-panel p-4">
        <label className="block text-xs text-muted">
          Workspace slug
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="eve-gtm"
            className="mt-1 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </label>
        <label className="block text-xs text-muted">
          Env var name
          <input
            value={envVar}
            onChange={(e) => setEnvVar(e.target.value)}
            placeholder="ARCANA_API_KEY"
            className="mt-1 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </label>
        <label className="block text-xs text-muted">
          API key (kb_…)
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            placeholder="kb_live_…"
            className="mt-1 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </label>

        {err ? <div className="text-xs text-red-400">{err}</div> : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy !== null || !workspace || !key}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-40"
          >
            {busy === "connect" ? "Validating…" : "Connect (browse only)"}
          </button>
          <button
            type="button"
            onClick={() => void wire()}
            disabled={busy !== null || !workspace || !key || !envVar}
            className="flex-1 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-white/15 disabled:opacity-40"
          >
            {busy === "wire" ? "Wiring…" : "Wire into agent"}
          </button>
        </div>
        <div className="text-[11px] leading-snug text-muted">
          <b className="text-neutral-400">Connect</b> just lets Studio read the brain.{" "}
          <b className="text-neutral-400">Wire</b> writes files into the agent —
          restart it afterward to load the connection.
        </div>
      </div>
    </div>
  );
}

export function Memory(): JSX.Element {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const setActiveAgent = useStore((s) => s.setActiveAgent);

  const [detected, setDetected] = useState<DetectedBrain | null>(null);
  const [loading, setLoading] = useState(false);

  const current = activeAgentId ?? agents[0]?.id ?? null;

  const refresh = useCallback(async () => {
    if (!current) {
      return;
    }
    setLoading(true);
    try {
      setDetected(await window.studio.arcana.detect(current));
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    setDetected(null);
    void refresh();
  }, [refresh]);

  const forget = async (): Promise<void> => {
    if (current) {
      await window.studio.arcana.forgetBrain(current);
      await refresh();
    }
  };

  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Add an agent first (Agents tab).
      </div>
    );
  }

  const connected = detected?.saved ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <span className="text-xs text-muted">Agent</span>
        <div className="flex flex-wrap gap-1.5">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveAgent(a.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                a.id === current
                  ? "bg-white/10 text-neutral-100"
                  : "text-neutral-400 hover:bg-white/5"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {connected ? (
          <span className="flex items-center gap-2 text-[11px] text-muted">
            <span className="font-mono text-accent">{connected.workspace}</span>
            <button
              type="button"
              onClick={() => void forget()}
              className="rounded border border-border px-2 py-0.5 hover:bg-white/5"
            >
              Disconnect
            </button>
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading && !detected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Inspecting…
          </div>
        ) : connected && current ? (
          <Browse agentId={current} />
        ) : detected && current ? (
          <Setup agentId={current} detected={detected} onConnected={refresh} />
        ) : null}
      </div>
    </div>
  );
}

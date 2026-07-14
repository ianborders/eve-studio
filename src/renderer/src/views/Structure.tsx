import type { AgentStructure } from "@shared/ipc";
import { useEffect } from "react";
import { useStore } from "../store";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium text-neutral-100">{title}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted">
          {count}
        </span>
      </div>
      <div className="p-2">
        {count === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted">none</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Row({
  name,
  tag,
  desc,
}: {
  name: string;
  tag?: string;
  desc?: string;
}): JSX.Element {
  return (
    <div className="rounded-md px-2 py-1.5 hover:bg-white/5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-neutral-100">{name}</span>
        {tag ? (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
            {tag}
          </span>
        ) : null}
      </div>
      {desc ? (
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
          {desc}
        </div>
      ) : null}
    </div>
  );
}

function StructureBody({ s }: { s: AgentStructure }): JSX.Element {
  return (
    <div className="space-y-4">
      {/* header strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-panel px-4 py-3 text-xs">
        <span className="text-muted">
          model{" "}
          <span className="font-mono text-neutral-100">{s.model ?? "—"}</span>
        </span>
        <span className="text-muted">
          sandbox{" "}
          <span className="font-mono text-neutral-100">{s.sandbox ?? "none"}</span>
        </span>
        <span className="text-muted">
          source <span className="text-neutral-300">{s.source}</span>
        </span>
        <div className="flex-1" />
        <span
          className={
            s.diagnostics.errors > 0
              ? "text-red-400"
              : s.diagnostics.warnings > 0
                ? "text-yellow-400"
                : "text-accent"
          }
        >
          {s.diagnostics.errors} err · {s.diagnostics.warnings} warn
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="Tools" count={s.tools.length}>
          {s.tools.map((t) => (
            <Row key={t.name} name={t.name} desc={t.description} />
          ))}
        </Section>

        <Section title="Connections" count={s.connections.length}>
          {s.connections.map((c) => (
            <Row key={c.name} name={c.name} tag={c.protocol} desc={c.description} />
          ))}
        </Section>

        <Section title="Skills" count={s.skills.length}>
          {s.skills.map((k) => (
            <Row key={k.name} name={k.name} desc={k.description} />
          ))}
        </Section>

        <Section title="Subagents" count={s.subagents.length}>
          {s.subagents.map((a) => (
            <Row key={a.name} name={a.name} tag="subagent" desc={a.description} />
          ))}
        </Section>

        <Section title="Channels" count={s.channels.length}>
          {s.channels.map((c) => (
            <Row
              key={c.name}
              name={c.name}
              tag={c.kind}
              desc={c.method && c.urlPath ? `${c.method} ${c.urlPath}` : undefined}
            />
          ))}
        </Section>

        <Section title="Schedules" count={s.schedules.length}>
          {s.schedules.map((sch) => (
            <Row key={sch.name} name={sch.name} tag={sch.cron} />
          ))}
        </Section>

        {s.remoteAgents.length > 0 ? (
          <Section title="Remote agents" count={s.remoteAgents.length}>
            {s.remoteAgents.map((r) => (
              <Row key={r.name} name={r.name} desc={r.url} />
            ))}
          </Section>
        ) : null}

        {s.hooks.length > 0 ? (
          <Section title="Hooks" count={s.hooks.length}>
            {s.hooks.map((h) => (
              <Row key={h} name={h} />
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

export function Structure(): JSX.Element {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const runtime = useStore((s) => s.runtime);
  const structure = useStore((s) => s.structure);
  const structureLoading = useStore((s) => s.structureLoading);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const loadStructure = useStore((s) => s.loadStructure);

  useEffect(() => {
    if (activeAgentId) {
      void loadStructure(activeAgentId);
    }
  }, [activeAgentId, loadStructure]);

  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Add an agent first (Agents tab).
      </div>
    );
  }

  const current = activeAgentId ?? agents[0]?.id ?? null;
  const s = current ? structure[current] : undefined;
  const loading = current ? structureLoading[current] : false;

  return (
    <div className="flex h-full flex-col">
      {/* agent picker */}
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
        {current ? (
          <button
            type="button"
            onClick={() => loadStructure(current, true)}
            disabled={runtime[current]?.status === "starting"}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/5"
          >
            Refresh
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading && !s ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Reading manifest… (builds the agent if needed)
          </div>
        ) : s?.error ? (
          <div className="mx-auto max-w-lg rounded-lg border border-border bg-panel p-5 text-center text-sm text-muted">
            {s.error}
          </div>
        ) : s ? (
          <StructureBody s={s} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Pick an agent to inspect.
          </div>
        )}
      </div>
    </div>
  );
}

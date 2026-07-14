import type { AgentRunStatus } from "@shared/ipc";
import { useStore } from "../store";

const DOT: Record<AgentRunStatus, string> = {
  running: "bg-accent",
  starting: "bg-yellow-400 animate-pulse",
  stopped: "bg-neutral-600",
  error: "bg-red-500",
};

export function Library(): JSX.Element {
  const agents = useStore((s) => s.agents);
  const runtime = useStore((s) => s.runtime);
  const addAgent = useStore((s) => s.addAgent);
  const startAgent = useStore((s) => s.startAgent);
  const stopAgent = useStore((s) => s.stopAgent);
  const removeAgent = useStore((s) => s.removeAgent);
  const openAgentChat = useStore((s) => s.openAgentChat);

  if (agents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="text-2xl">▤</div>
        <div className="mt-3 text-lg font-medium text-neutral-100">No agents yet</div>
        <div className="mt-2 max-w-md text-sm text-muted">
          Add an existing Eve agent by pointing at its project folder (the one containing an{" "}
          <code className="text-neutral-300">agent/</code> directory).
        </div>
        <button
          type="button"
          onClick={addAgent}
          className="mt-5 rounded-md border border-border bg-white/10 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-white/15"
        >
          + Add existing agent
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-100">Agents</h2>
        <button
          type="button"
          onClick={addAgent}
          className="rounded-md border border-border bg-white/10 px-3 py-1.5 text-sm text-neutral-100 hover:bg-white/15"
        >
          + Add agent
        </button>
      </div>

      <div className="space-y-2.5">
        {agents.map((a) => {
          const rt = runtime[a.id];
          const status = rt?.status ?? "stopped";
          const running = status === "running";
          const busy = status === "starting";
          return (
            <div
              key={a.id}
              className="rounded-lg border border-border bg-panel p-3.5"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`}
                  title={status}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-100">
                    {a.name}
                  </div>
                  <div className="truncate text-xs text-muted">{a.path}</div>
                </div>
                <div className="text-right text-[11px] text-muted">
                  eve {a.eveVersion ?? "?"}
                  {rt?.port ? (
                    <div className="text-neutral-500">:{rt.port}</div>
                  ) : null}
                </div>
              </div>

              {rt?.error ? (
                <div className="mt-2 whitespace-pre-wrap rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                  {rt.error}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAgentChat(a.id)}
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-neutral-100 hover:bg-white/15"
                >
                  {running ? "Open chat" : "Start & chat"}
                </button>
                {running ? (
                  <button
                    type="button"
                    onClick={() => stopAgent(a.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startAgent(a.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    {busy ? "Starting…" : "Start"}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => removeAgent(a.id)}
                  className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

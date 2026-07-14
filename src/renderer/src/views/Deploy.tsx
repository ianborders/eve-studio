import { useCallback, useEffect, useState } from "react";
import { useCliRun } from "../lib/useCli";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconRefresh, IconRocket, IconTerminal, IconWrench } from "../ui/icons";
import { Badge, Button } from "../ui/kit";

export function Deploy(): JSX.Element {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const runtime = useStore((s) => (activeAgentId ? s.runtime[activeAgentId] : undefined));
  const { output, running, exitCode, start, cancel } = useCliRun();
  const [devLogs, setDevLogs] = useState("");
  const [action, setAction] = useState<"build" | "deploy" | null>(null);

  const seedLogs = useCallback(async () => {
    if (activeAgentId) {
      setDevLogs(await window.studio.agents.logs(activeAgentId));
    }
  }, [activeAgentId]);

  useEffect(() => {
    void seedLogs();
    const off = window.studio.agents.onLog(({ agentId, data }) => {
      if (agentId === activeAgentId) {
        setDevLogs((l) => (l + data).slice(-20_000));
      }
    });
    return off;
  }, [activeAgentId, seedLogs]);

  const run = (kind: "build" | "deploy"): void => {
    if (!activeAgentId) {
      return;
    }
    setAction(kind);
    void start(() => window.studio.cli.run(activeAgentId, kind));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">Deploy &amp; Logs</div>
        <div className="flex-1" />
        {running ? (
          <>
            <Badge tone="warn">running {action}…</Badge>
            <Button variant="secondary" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {exitCode !== undefined ? (
              <Badge tone={exitCode === 0 ? "accent" : "danger"}>
                {action} {exitCode === 0 ? "ok" : `exit ${exitCode}`}
              </Badge>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => run("build")}>
              <IconWrench className="h-3.5 w-3.5" />
              Build
            </Button>
            <Button variant="primary" size="sm" onClick={() => run("deploy")}>
              <IconRocket className="h-3.5 w-3.5" />
              Deploy
            </Button>
          </>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 p-4">
        <div className="flex min-h-0 flex-col">
          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-faint">
            <IconTerminal className="h-3.5 w-3.5" />
            Command output
          </div>
          <Console
            text={output}
            placeholder="Run Build or Deploy to see output. Deploy links to Vercel and may open a browser for the first run."
            className="min-h-0 flex-1"
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-faint">
              <IconTerminal className="h-3.5 w-3.5" />
              Dev server logs
              {runtime?.status === "running" ? (
                <span className="text-accent">· live</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void seedLogs()}
              className="text-faint hover:text-text"
              title="Refresh"
            >
              <IconRefresh className="h-3.5 w-3.5" />
            </button>
          </div>
          <Console
            text={devLogs}
            placeholder="Start the agent to stream its dev-server logs here."
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </div>
  );
}

import type { EvalItem } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useCliRun } from "../lib/useCli";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconCheck, IconPlay, IconRefresh } from "../ui/icons";
import { Badge, Button, Card, EmptyState, Spinner } from "../ui/kit";

export function Evals(): JSX.Element {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const [items, setItems] = useState<EvalItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const { output, running, exitCode, start, cancel } = useCliRun();

  const load = useCallback(async () => {
    if (!activeAgentId) {
      return;
    }
    setLoading(true);
    try {
      setItems(await window.studio.evals.list(activeAgentId));
    } finally {
      setLoading(false);
    }
  }, [activeAgentId]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const runEvals = (ids?: string[]): void => {
    if (!activeAgentId) {
      return;
    }
    setTarget(ids && ids.length === 1 ? ids[0] : "all");
    void start(() => window.studio.cli.run(activeAgentId, "evalRun", { ids }));
  };

  if (loading && !items) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Evals <span className="text-faint">· {items?.length ?? 0}</span>
        </div>
        <div className="flex-1" />
        {running ? (
          <>
            <Badge tone="warn">running {target}…</Badge>
            <Button variant="secondary" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {exitCode !== undefined ? (
              <Badge tone={exitCode === 0 ? "accent" : "danger"}>
                {exitCode === 0 ? "all passed" : "failures"}
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="text-faint hover:text-text"
              title="Reload"
            >
              <IconRefresh className="h-3.5 w-3.5" />
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runEvals()}
              disabled={!items || items.length === 0}
            >
              <IconPlay className="h-3.5 w-3.5" />
              Run all
            </Button>
          </>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">
        <div className="min-h-0 overflow-auto">
          {!items || items.length === 0 ? (
            <EmptyState icon={<IconCheck className="h-5 w-5" />} title="No evals">
              Add scored checks as
              <code className="mx-1 rounded bg-black/[0.05] px-1 font-mono text-xs">
                evals/*.eval.ts
              </code>
              with defineEval.
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {items.map((e) => (
                <Card key={e.id} className="flex items-start gap-3 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-muted">
                    <IconCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] text-text">{e.id}</div>
                    {e.description ? (
                      <div className="mt-0.5 text-2xs leading-snug text-muted">
                        {e.description}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={running}
                    onClick={() => runEvals([e.id])}
                  >
                    <IconPlay className="h-3.5 w-3.5" />
                    Run
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">
            Output
          </div>
          <Console
            text={output}
            placeholder="Run evals to see results. They execute against a live model, so a run can take a while."
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </div>
  );
}

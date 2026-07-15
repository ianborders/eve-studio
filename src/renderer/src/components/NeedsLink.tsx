import type { ModelReadiness } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { Button } from "../ui/kit";

/**
 * Shown in Chat when an agent has no model credential (not linked to Vercel).
 * One click links it + pulls the AI Gateway token — no terminal.
 */
export function NeedsLink({ agentId }: { agentId: string }): JSX.Element | null {
  const runtime = useStore((s) => s.runtime[agentId]);
  const stopAgent = useStore((s) => s.stopAgent);
  const startAgent = useStore((s) => s.startAgent);
  const bumpDeploy = useStore((s) => s.bumpDeploy);
  const [ready, setReady] = useState<ModelReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const check = useCallback(async () => {
    setReady(await window.studio.vercel.modelReadiness(agentId));
  }, [agentId]);

  useEffect(() => {
    setLinked(false);
    void check();
  }, [check]);

  if (!ready || ready.hasCredential) {
    return null;
  }

  const connect = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    setOutput("Connecting to Vercel — creating/linking the project and pulling the AI Gateway credential…\n");
    const r = await window.studio.vercel.link(agentId);
    setOutput(r.output);
    const now = await window.studio.vercel.modelReadiness(agentId);
    setReady(now);
    setBusy(false);
    if (now.hasCredential) {
      setLinked(true);
      bumpDeploy(); // refresh the header's linked/deployed badges
      // reload so eve dev picks up the new .env.local
      if (runtime?.status === "running") {
        await stopAgent(agentId);
        await startAgent(agentId);
      }
    } else {
      setErr("Linking didn't produce a credential — check the output.");
    }
  };

  if (linked && ready.hasCredential) {
    return (
      <div className="border-b border-accent/40 bg-success/[0.08] px-5 py-2.5 text-[13px] text-text">
        Connected to Vercel ✓ — the model can run now.{" "}
        {runtime?.status === "running" ? "Restarted." : "Hit Start (top right), then chat."}
      </div>
    );
  }

  return (
    <div className="border-b border-warn/40 bg-warn/[0.07] px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="text-base text-warn">⚠</span>
        <div className="flex-1 text-[13px] leading-snug text-text">
          <b>Not connected to Vercel.</b> This agent's model runs through the Vercel
          AI Gateway, so it can't respond until it's linked. One click sets it up —
          no terminal.
        </div>
        <Button variant="primary" size="sm" onClick={connect} disabled={busy}>
          {busy ? "Connecting…" : "Connect to Vercel"}
        </Button>
      </div>
      {err ? <div className="mt-2 text-2xs text-danger">{err}</div> : null}
      {output && (busy || err) ? <Console text={output} className="mt-2 max-h-40" /> : null}
    </div>
  );
}

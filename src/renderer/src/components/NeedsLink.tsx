import type { ModelReadiness, VercelTeam } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconPlug } from "../ui/icons";
import { Button, Kicker } from "../ui/kit";

/**
 * Shown in Chat when an agent has no model credential (not linked to Vercel).
 * One click links it + pulls the AI Gateway token — no terminal.
 */
export function NeedsLink({
  agentId,
}: {
  agentId: string;
}): JSX.Element | null {
  const runtime = useStore((s) => s.runtime[agentId]);
  const stopAgent = useStore((s) => s.stopAgent);
  const startAgent = useStore((s) => s.startAgent);
  const bumpDeploy = useStore((s) => s.bumpDeploy);
  const [ready, setReady] = useState<ModelReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [teams, setTeams] = useState<VercelTeam[]>([]);
  const [team, setTeam] = useState("");

  const check = useCallback(async () => {
    setReady(await window.studio.vercel.modelReadiness(agentId));
  }, [agentId]);

  useEffect(() => {
    setLinked(false);
    void check();
    // Load the user's Vercel teams so we can disambiguate multi-team accounts.
    void window.studio.vercel.teams(agentId).then((r) => {
      if (r.ok) {
        setTeams(r.teams);
        setTeam((t) => t || r.teams[0]?.id || "");
      }
    });
  }, [check, agentId]);

  if (!ready || ready.hasCredential) {
    return null;
  }

  const connect = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    setOutput(
      "Connecting to Vercel — creating/linking the project and pulling the AI Gateway credential…\n",
    );
    const r = await window.studio.vercel.link(agentId, team || undefined);
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
      <div className="flex items-center gap-2.5 border-b border-border bg-success/[0.06] px-5 py-2.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
        <span className="text-[13px] text-text">
          Connected to Vercel — the model can run now.{" "}
          <span className="text-muted">
            {runtime?.status === "running"
              ? "Restarted."
              : "Hit Start (top right), then chat."}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-subtle px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-faint">
          <IconPlug className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <Kicker className="mb-1">Not connected to Vercel</Kicker>
          <div className="text-[13px] leading-snug text-muted">
            This agent's model runs through the Vercel AI Gateway, so it can't
            respond until it's linked. One click sets it up — no terminal.
          </div>
        </div>
        {teams.length > 1 ? (
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            disabled={busy}
            title="Vercel team"
            className="no-drag shrink-0 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[13px] text-text outline-none hover:border-border-strong focus:border-border-strong"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        <Button variant="primary" size="sm" onClick={connect} disabled={busy}>
          {busy ? "Connecting…" : "Connect to Vercel"}
        </Button>
      </div>
      {err ? <div className="mt-2 text-2xs text-danger">{err}</div> : null}
      {output && (busy || err) ? (
        <Console text={output} className="mt-2 max-h-40" />
      ) : null}
    </div>
  );
}

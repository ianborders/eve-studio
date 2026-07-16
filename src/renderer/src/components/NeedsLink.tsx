import type { ModelReadiness, VercelTeam, VercelWhoami } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useCliRun } from "../lib/useCli";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconPlug } from "../ui/icons";
import { Button, Kicker } from "../ui/kit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shown in Chat when an agent has no model credential (not linked to Vercel).
 * Handles the whole no-terminal path: sign in to Vercel (email verification) →
 * pick a team → link + pull the AI Gateway token.
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
  const [auth, setAuth] = useState<VercelWhoami | null>(null);
  const [teams, setTeams] = useState<VercelTeam[]>([]);
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [output, setOutput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const login = useCliRun();

  const loadTeams = useCallback(async () => {
    const t = await window.studio.vercel.teams(agentId);
    if (t.ok) {
      setTeams(t.teams);
      setTeam((cur) => cur || t.teams[0]?.id || "");
    }
  }, [agentId]);

  const refresh = useCallback(async () => {
    const rd = await window.studio.vercel.modelReadiness(agentId);
    setReady(rd);
    if (rd.hasCredential) {
      return; // already linked — no need to probe Vercel auth/teams
    }
    const who = await window.studio.vercel.whoami(agentId);
    setAuth(who);
    if (who.authed) {
      await loadTeams();
    }
  }, [agentId, loadTeams]);

  useEffect(() => {
    setLinked(false);
    void refresh();
  }, [refresh]);

  // While the email sign-in is in flight, poll whoami — the CLI writes the auth
  // once the user confirms in their email, so this is how we detect success.
  useEffect(() => {
    if (!signingIn) {
      return;
    }
    const iv = setInterval(async () => {
      const who = await window.studio.vercel.whoami(agentId);
      if (who.authed) {
        setSigningIn(false);
        setAuth(who);
        await loadTeams();
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [signingIn, agentId, loadTeams]);

  if (!ready || ready.hasCredential) {
    return null;
  }

  const signIn = async (): Promise<void> => {
    if (!EMAIL_RE.test(email.trim())) {
      setErr("Enter the email for your Vercel account.");
      return;
    }
    setErr(null);
    setSigningIn(true);
    await login.start(() =>
      window.studio.vercel.loginStart(agentId, email.trim()),
    );
  };

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
      bumpDeploy();
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

  const authed = auth?.authed === true;

  return (
    <div className="border-b border-border bg-subtle px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-faint">
          <IconPlug className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <Kicker className="mb-1">
            {authed ? "Not connected to Vercel" : "Sign in to Vercel"}
          </Kicker>
          <div className="text-[13px] leading-snug text-muted">
            {authed
              ? "This agent's model runs through the Vercel AI Gateway — pick a team and connect. No terminal."
              : "This agent's model runs through the Vercel AI Gateway. Sign in with your Vercel email to continue — no terminal."}
          </div>
        </div>

        {auth === null ? (
          <span className="shrink-0 text-2xs text-faint">Checking…</span>
        ) : authed ? (
          <>
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
            <Button
              variant="primary"
              size="sm"
              onClick={connect}
              disabled={busy}
            >
              {busy ? "Connecting…" : "Connect to Vercel"}
            </Button>
          </>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void signIn();
                }
              }}
              placeholder="you@email.com"
              disabled={signingIn}
              className="no-drag w-52 shrink-0 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-faint hover:border-border-strong focus:border-border-strong disabled:opacity-60"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={signIn}
              disabled={signingIn}
            >
              {signingIn ? "Waiting…" : "Sign in"}
            </Button>
          </>
        )}
      </div>

      {!authed && (signingIn || login.output) ? (
        <div className="mt-2.5">
          <div className="mb-1.5 text-2xs text-muted">
            Follow the steps in the email Vercel just sent — this updates
            automatically once you confirm.
          </div>
          <Console text={login.output} className="max-h-40" />
        </div>
      ) : null}

      {err ? <div className="mt-2 text-2xs text-danger">{err}</div> : null}
      {output && busy ? (
        <Console text={output} className="mt-2 max-h-40" />
      ) : null}
    </div>
  );
}

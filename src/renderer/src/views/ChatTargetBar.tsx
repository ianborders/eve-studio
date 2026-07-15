import type { ChatTarget, DeployHealth, DeploySettings } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Input } from "../ui/kit";

export function ChatTargetBar({ agentId }: { agentId: string }): JSX.Element {
  const target = useStore((s) => s.chatTarget[agentId] ?? "local");
  const setChatTarget = useStore((s) => s.setChatTarget);

  const [deploy, setDeploy] = useState<DeploySettings | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<null | "test" | "detect">(null);
  const [health, setHealth] = useState<DeployHealth | null>(null);

  const loadDeploy = useCallback(async () => {
    const d = await window.studio.agents.getDeploy(agentId);
    setDeploy(d);
    setUrl(d.url ?? "");
    setSecret(d.bypassSecret ?? "");
  }, [agentId]);

  useEffect(() => {
    setHealth(null);
    void loadDeploy();
  }, [loadDeploy]);

  const save = async (): Promise<void> => {
    const d = await window.studio.agents.setDeploy(agentId, {
      url: url.trim() || undefined,
      bypassSecret: secret.trim() || undefined,
    });
    setDeploy(d);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const detect = async (): Promise<void> => {
    setBusy("detect");
    const info = await window.studio.vercel.prodInfo(agentId);
    setBusy(null);
    if (info.ok && info.url) {
      setUrl(info.url);
    }
  };

  const test = async (): Promise<void> => {
    await save();
    setBusy("test");
    setHealth(await window.studio.agents.deployHealth(agentId));
    setBusy(null);
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 px-5 py-1.5">
        <span className="text-2xs text-faint">Chatting with</span>
        <div className="flex rounded-md border border-border p-0.5">
          {(["local", "deployed"] as ChatTarget[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setChatTarget(agentId, t)}
              className={`rounded px-2 py-0.5 text-2xs transition-colors ${
                target === t ? "bg-text text-white" : "text-muted hover:bg-hover"
              }`}
            >
              {t === "local" ? "Local" : "Deployed"}
            </button>
          ))}
        </div>
        {target === "deployed" && deploy?.url ? (
          <span className="truncate font-mono text-2xs text-faint">{deploy.url}</span>
        ) : null}
      </div>

      {target === "deployed" ? (
        <div className="space-y-2 border-t border-border bg-subtle px-5 py-2.5">
          <div className="text-2xs leading-relaxed text-muted">
            Studio talks to your <b className="text-text">production</b> deployment.
            Generate a <b className="text-text">Protection Bypass for Automation</b>{" "}
            secret in Vercel → Project → Settings → Deployment Protection, then{" "}
            <b className="text-text">Pull env</b> in the Environment tab — Studio
            reads it (and the OIDC token) from{" "}
            <span className="font-mono">.env.local</span> automatically. Or paste the
            secret below to override.
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://<project>.vercel.app"
              className="font-mono text-2xs"
            />
            <Input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type="password"
              placeholder="bypass secret (optional — auto from .env.local)"
              className="font-mono text-2xs"
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={detect} disabled={busy !== null}>
                {busy === "detect" ? "…" : "Detect"}
              </Button>
              <Button size="sm" variant="secondary" onClick={save}>
                {saved ? "Saved ✓" : "Save"}
              </Button>
              <Button size="sm" variant="primary" onClick={test} disabled={busy !== null || !url.trim()}>
                {busy === "test" ? "Testing…" : "Test"}
              </Button>
            </div>
          </div>
          {health ? (
            <div className={`text-2xs ${health.ok ? "text-success" : "text-danger"}`}>
              {health.ok
                ? "Reachable ✓ — deployed chat is ready."
                : (health.reason ?? `Failed (status ${health.status}).`)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

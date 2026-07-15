import type { EnvState, VercelStatus } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconRefresh } from "../ui/icons";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Kicker,
  Spinner,
  Textarea,
  ViewHeader,
} from "../ui/kit";

function EnvEditor({ agentId }: { agentId: string }): JSX.Element {
  const [env, setEnv] = useState<EnvState | null>(null);
  const [active, setActive] = useState(".env.local");
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const e = await window.studio.agents.envRead(agentId);
    setEnv(e);
    const f = e.files.find((x) => x.name === active) ?? e.files[0];
    if (f) {
      setActive(f.name);
      setDraft(f.content);
    }
  }, [agentId, active]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const current = env?.files.find((f) => f.name === active);
  const dirty = current ? draft !== current.content : false;

  const pick = (name: string): void => {
    const f = env?.files.find((x) => x.name === name);
    setActive(name);
    setDraft(f?.content ?? "");
  };

  const save = async (): Promise<void> => {
    await window.studio.agents.envWrite(agentId, active, draft);
    setEnv((e) =>
      e
        ? {
            files: e.files.map((f) =>
              f.name === active ? { ...f, content: draft, exists: true } : f
            ),
          }
        : e
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {[".env", ".env.local"].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              className={`rounded-[6px] px-3 py-1 font-mono text-[12px] transition-colors ${
                active === name
                  ? "bg-text text-white"
                  : "text-muted hover:text-text"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {dirty ? (
          <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-warn">
            unsaved
          </span>
        ) : null}
        {saved ? (
          <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-success">
            saved
          </span>
        ) : null}
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty}>
          Save
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        placeholder={`KEY=value\nANOTHER_KEY=value`}
        className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-[12px] focus:border-0"
      />
    </Card>
  );
}

function VercelPanel({ agentId }: { agentId: string }): JSX.Element {
  const [status, setStatus] = useState<VercelStatus | null>(null);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState("production");

  const load = useCallback(async () => {
    setStatus(await window.studio.vercel.status(agentId));
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<{ output: string }>): Promise<void> => {
    setBusy(label);
    setOutput(`$ ${label}\n`);
    const r = await fn();
    setBusy(null);
    setOutput((o) => o + r.output);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[13px] font-semibold tracking-tight text-text">
          Vercel
        </span>
        {status?.linked ? (
          <Badge tone="success">linked · {status.projectName}</Badge>
        ) : (
          <Badge tone="warn">not linked</Badge>
        )}
        <div className="flex-1" />
        <IconButton onClick={() => void load()} title="Refresh">
          <IconRefresh className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {status?.linked ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => run("vercel env ls", () => window.studio.vercel.envLs(agentId))}
            >
              List remote env
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => run("vercel env pull", () => window.studio.vercel.envPull(agentId))}
            >
              Pull env → .env.local
            </Button>
          </div>

          <div className="mt-3 rounded-lg border border-border p-3">
            <Kicker className="mb-2">Add production env var</Kicker>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="NAME" className="font-mono" />
              <Input value={value} onChange={(e) => setValue(e.target.value)} type="password" placeholder="value" className="font-mono" />
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="no-drag rounded-lg border border-border bg-bg px-2 text-[13px] text-text"
              >
                <option value="production">production</option>
                <option value="preview">preview</option>
                <option value="development">development</option>
              </select>
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={busy !== null || !name || !value}
                onClick={() =>
                  run(`vercel env add ${name} ${target}`, () =>
                    window.studio.vercel.envAdd(agentId, name, value, target)
                  )
                }
              >
                {busy?.startsWith("vercel env add") ? "Adding…" : "Add & encrypt"}
              </Button>
            </div>
          </div>

          {output ? <Console text={output} className="mt-3 max-h-52" /> : null}
        </>
      ) : (
        <div className="text-[13px] leading-relaxed text-muted">
          This project isn't linked to Vercel. Link it from a terminal in the
          project folder:{" "}
          <code className="rounded bg-black/[0.05] px-1 font-mono text-xs">
            vercel link
          </code>{" "}
          (or <code className="rounded bg-black/[0.05] px-1 font-mono text-xs">eve link</code>,
          which also pulls AI Gateway creds). Then reload.
        </div>
      )}
    </Card>
  );
}

export function Environment(): JSX.Element {
  const id = useStore((s) => s.activeAgentId);
  if (!id) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }
  return (
    <div className="flex h-full flex-col">
      <ViewHeader kicker="Deploy" title="Environment & secrets" />
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-4 overflow-auto p-4">
        <div className="flex min-h-[220px] flex-col">
          <Kicker className="mb-2">
            Local env files (gitignored, auto-reloaded by eve dev)
          </Kicker>
          <EnvEditor agentId={id} />
        </div>
        <VercelPanel agentId={id} />
      </div>
    </div>
  );
}

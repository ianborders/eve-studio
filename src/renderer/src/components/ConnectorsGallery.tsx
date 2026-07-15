import type { ConnectorItem } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { Console } from "../ui/Console";
import { IconExternal, IconPlus, IconRefresh } from "../ui/icons";
import { Badge, Button, Card, Field, Input, Modal, Spinner } from "../ui/kit";

const TYPE_COLOR: Record<string, string> = {
  slack: "#611f69",
  github: "#24292f",
  linear: "#5E6AD2",
  mcp: "#0070f3",
  oauth: "#0070f3",
};
function color(type: string): string {
  return TYPE_COLOR[type] ?? "#888888";
}

function Logo({ name, type }: { name: string; type: string }): JSX.Element {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
      style={{ background: color(type) }}
    >
      {(name || type || "?")[0]?.toUpperCase()}
    </div>
  );
}

function NewConnectorModal({
  agentId,
  onClose,
  onDone,
}: {
  agentId: string;
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [type, setType] = useState("slack");
  const [name, setName] = useState("");
  const [triggers, setTriggers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");

  const create = async (): Promise<void> => {
    setBusy(true);
    setOutput(`$ vercel connect create ${type} --name ${name || "my-agent"}${triggers ? " --triggers" : ""}\n`);
    const r = await window.studio.vercel.connectorCreate(
      agentId,
      type,
      name || "my-agent",
      triggers
    );
    setBusy(false);
    setOutput((o) => o + r.output);
    if (r.ok) {
      onDone();
    }
  };

  const url = (output.match(/https?:\/\/\S+/) ?? [""])[0];

  return (
    <Modal title="New Vercel Connect connector" onClose={onClose} width="max-w-xl">
      <div className="space-y-3 p-4">
        <Field label="Service / type">
          <div className="flex flex-wrap gap-1.5">
            {["slack", "github", "linear", "discord", "mcp", "oauth"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-2.5 py-1 text-2xs transition-colors ${
                  type === t ? "border-text bg-text text-white" : "border-border text-muted hover:bg-hover"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Input value={type} onChange={(e) => setType(e.target.value)} className="mt-2 font-mono" placeholder="or type a service name" />
        </Field>
        <Field label="Connector name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-agent" className="font-mono" />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={triggers} onChange={(e) => setTriggers(e.target.checked)} className="accent-black" />
          Enable webhook triggers (needed for channels)
        </label>

        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-2xs text-accent hover:underline">
            <IconExternal className="h-3 w-3" />
            Open to finish authorizing in the browser
          </a>
        ) : null}
        {output ? <Console text={output} className="max-h-44" /> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={create} disabled={busy || !type}>
            {busy ? "Creating…" : "Create connector"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ConnectorsGallery({ agentId }: { agentId: string }): JSX.Element {
  const [list, setList] = useState<ConnectorItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const r = await window.studio.vercel.connectorList(agentId);
    if (r.ok) {
      setList(r.connectors);
    } else {
      setErr(r.output ?? "Couldn't list connectors.");
      setList([]);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-2xs font-medium uppercase tracking-wide text-faint">
          Vercel Connect connectors
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus className="h-3.5 w-3.5" />
            New connector
          </Button>
          <button type="button" onClick={() => void load()} className="text-faint hover:text-text" title="Refresh">
            <IconRefresh className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {list === null ? (
        <Card className="flex items-center gap-2 p-4 text-2xs text-muted">
          <Spinner className="h-3.5 w-3.5" /> Loading connectors…
        </Card>
      ) : err ? (
        <Card className="bg-subtle p-4 text-2xs leading-relaxed text-muted">
          {err.toLowerCase().includes("link") || err.toLowerCase().includes("project")
            ? "Link this project to Vercel first (Environment tab), then reload."
            : err.toLowerCase().includes("enoent")
              ? "The Vercel CLI isn't installed. Install it: npm i -g vercel"
              : err}
        </Card>
      ) : list.length === 0 ? (
        <Card className="bg-subtle p-4 text-2xs leading-relaxed text-muted">
          No connectors yet. Create one to broker OAuth for a channel (Slack, GitHub,
          Linear…) or a connection — credentials and webhook verification are managed
          for you.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {list.map((c) => (
            <Card key={c.uid} className="flex items-center gap-3 p-3.5">
              <Logo name={c.name} type={c.type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-text">{c.name}</span>
                  <Badge tone="accent">{c.type}</Badge>
                </div>
                <div className="truncate font-mono text-2xs text-faint">{c.uid}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {addOpen ? (
        <NewConnectorModal
          agentId={agentId}
          onClose={() => setAddOpen(false)}
          onDone={load}
        />
      ) : null}
    </div>
  );
}

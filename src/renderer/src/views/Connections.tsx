import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconExternal, IconPlug, IconPlus, IconRefresh } from "../ui/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Spinner,
} from "../ui/kit";

function AddConnectionModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [envVar, setEnvVar] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.addConnection(agentId, {
      name,
      url,
      description,
      envVar: envVar || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setDone(r.relPath ?? "connection");
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <Modal title="Add MCP connection" onClose={onClose}>
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-accent/10 px-3 py-2 text-[13px] text-accent">
            Wrote <span className="font-mono">{done}</span>.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            Set <span className="font-mono text-text">{envVar || "the token env var"}</span>{" "}
            in the agent's .env, then restart it to load the connection.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Field label="Name" hint="becomes connections/<name>.ts">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="linear" className="font-mono" />
          </Field>
          <Field label="MCP URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className="font-mono" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this connection is for" />
          </Field>
          <Field label="Token env var" hint="optional — defaults to <NAME>_TOKEN">
            <Input value={envVar} onChange={(e) => setEnvVar(e.target.value)} placeholder="LINEAR_TOKEN" className="font-mono" />
          </Field>
          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy || !name || !url}>
              {busy ? "Writing…" : "Add connection"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Connections(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const conns = structure?.connections ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Connections <span className="text-faint">· {conns.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
            <IconPlus className="h-3.5 w-3.5" />
            Add
          </Button>
          <IconButton onClick={reload} title="Reload">
            <IconRefresh className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {conns.length === 0 ? (
          <EmptyState
            icon={<IconPlug className="h-5 w-5" />}
            title="No connections"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                Add connection
              </Button>
            }
          >
            MCP connections give the agent programmatic access to external systems.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {conns.map((c) => (
              <Card key={c.name} className="p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-muted">
                    <IconPlug className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-text">{c.name}</span>
                      {c.protocol ? <Badge tone="info">{c.protocol}</Badge> : null}
                    </div>
                    {c.url ? (
                      <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-2xs text-faint">
                        <IconExternal className="h-3 w-3 shrink-0" />
                        {c.url}
                      </div>
                    ) : null}
                  </div>
                </div>
                {c.description ? (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                    {c.description}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      {addOpen && id ? (
        <AddConnectionModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

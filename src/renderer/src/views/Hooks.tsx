import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconBolt, IconPlus, IconRefresh } from "../ui/icons";
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Spinner,
} from "../ui/kit";

function NewHookModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.createHook(agentId, name);
    setBusy(false);
    if (r.ok) {
      setDone(r.relPath ?? "hook");
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <Modal title="New hook" onClose={onClose}>
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            Created <span className="font-mono">{done}</span>.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            Hooks observe the session event stream (audit, metrics, persistence).
            Edit the events map, then restart the agent.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Field label="Name" hint="becomes hooks/<name>.ts">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="audit" className="font-mono" />
          </Field>
          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy || !name}>
              {busy ? "Creating…" : "Create hook"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Hooks(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const hooks = structure?.hooks ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Hooks <span className="text-faint">· {hooks.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
            <IconPlus className="h-3.5 w-3.5" />
            New
          </Button>
          <IconButton onClick={reload} title="Reload">
            <IconRefresh className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {hooks.length === 0 ? (
          <EmptyState
            icon={<IconBolt className="h-5 w-5" />}
            title="No hooks"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                New hook
              </Button>
            }
          >
            Hooks run observe-only side effects on every session event — audit,
            metrics, alerting, persistence.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {hooks.map((h) => (
              <Card key={h} className="flex items-center gap-3 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-muted">
                  <IconBolt className="h-4 w-4" />
                </div>
                <span className="font-mono text-[13px] text-text">{h}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      {addOpen && id ? (
        <NewHookModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

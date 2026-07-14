import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconPlus, IconRefresh, IconWrench } from "../ui/icons";
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
  Textarea,
} from "../ui/kit";

function NewToolModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [approval, setApproval] = useState<"never" | "once" | "always">("never");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.createTool(agentId, {
      name,
      description,
      approval,
    });
    setBusy(false);
    if (r.ok) {
      setDone(r.relPath ?? "tool");
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <Modal title="New tool" onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            Created <span className="font-mono">{done}</span>.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            It's scaffolded with an empty Zod input schema and a stub{" "}
            <span className="font-mono text-text">execute</span>. Fill in the schema
            and logic, then restart the agent.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Field label="Name" hint="snake_case — becomes tools/<name>.ts">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="get_weather" className="font-mono" />
          </Field>
          <Field label="Description" hint="written for the model">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Get the current weather for a city."
            />
          </Field>
          <Field label="Approval gate" hint="human-in-the-loop for destructive tools">
            <div className="flex gap-1.5">
              {(["never", "once", "always"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setApproval(a)}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] ${
                    approval === a
                      ? "border-text bg-text text-white"
                      : "border-border text-muted hover:bg-hover"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>
          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy || !name || !description}>
              {busy ? "Creating…" : "Create tool"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Tools(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const tools = structure?.tools ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Tools <span className="text-faint">· {tools.length}</span>
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
        {tools.length === 0 ? (
          <EmptyState
            icon={<IconWrench className="h-5 w-5" />}
            title="No tools"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                New tool
              </Button>
            }
          >
            Tools are typed actions the agent can call. They run in the app runtime
            with full env access.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {tools.map((t) => (
              <Card key={t.name} className="p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-muted">
                    <IconWrench className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[13px] text-text">{t.name}</span>
                  <Badge>tool</Badge>
                </div>
                {t.description ? (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                    {t.description}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      {addOpen && id ? (
        <NewToolModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

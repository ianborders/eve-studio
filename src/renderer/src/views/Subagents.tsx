import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconBot, IconPlus, IconRefresh } from "../ui/icons";
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

function NewSubagentModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.createSubagent(agentId, {
      name,
      description,
      instructions: instructions || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setDone(r.relPath ?? "subagent");
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <Modal title="New subagent" onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            Created <span className="font-mono">{done}</span> + instructions.md.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            The parent delegates to it by its name; the description is the routing
            hint. It's its own agent root — add its own tools/skills/connections
            under the subagent folder. Restart the agent to load it.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Field label="Name" hint="becomes subagents/<name>/ — unique vs tools">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="researcher" className="font-mono" />
          </Field>
          <Field label="Description" hint="the delegation trigger, for the parent">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Investigate a topic and gather sources before drafting."
            />
          </Field>
          <Field label="Instructions" hint="optional — its system prompt">
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="You are the research specialist…"
            />
          </Field>
          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy || !name || !description}>
              {busy ? "Creating…" : "Create subagent"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Subagents(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const subagents = structure?.subagents ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Subagents <span className="text-faint">· {subagents.length}</span>
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
        {subagents.length === 0 ? (
          <EmptyState
            icon={<IconBot className="h-5 w-5" />}
            title="No subagents"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                New subagent
              </Button>
            }
          >
            Declared subagents are specialists the root delegates to — each its own
            isolated agent with its own tools, skills, and memory.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {subagents.map((a) => (
              <Card key={a.name} className="p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/10 text-violet">
                    <IconBot className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[13px] text-text">{a.name}</span>
                  <Badge tone="violet">subagent</Badge>
                </div>
                {a.description ? (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                    {a.description}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      {addOpen && id ? (
        <NewSubagentModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

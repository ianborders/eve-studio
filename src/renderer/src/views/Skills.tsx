import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconPlus, IconRefresh, IconWand } from "../ui/icons";
import {
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

function NewSkillModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.createSkill(agentId, {
      name,
      description,
      body: body || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setDone(r.relPath ?? "skill");
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <Modal title="New skill" onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-accent/10 px-3 py-2 text-[13px] text-accent">
            Created <span className="font-mono">{done}</span>.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            Restart the agent to load it. The description is the routing hint that
            decides when the skill loads.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Field label="Name" hint="becomes skills/<name>/SKILL.md">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="pricing-play" className="font-mono" />
          </Field>
          <Field label="Description" hint="routing hint — when should this load?">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="How to talk about pricing. Load when the user asks about cost."
            />
          </Field>
          <Field label="Body (Markdown)" hint="optional">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="# Pricing play&#10;&#10;Steps the agent should follow…"
              className="font-mono"
            />
          </Field>
          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy || !name || !description}>
              {busy ? "Creating…" : "Create skill"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Skills(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const skills = structure?.skills ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Skills <span className="text-faint">· {skills.length}</span>
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
        {skills.length === 0 ? (
          <EmptyState
            icon={<IconWand className="h-5 w-5" />}
            title="No skills"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                New skill
              </Button>
            }
          >
            Skills are load-on-demand instructions the agent pulls in when relevant.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {skills.map((s) => (
              <Card key={s.name} className="p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/10 text-violet">
                    <IconWand className="h-4 w-4" />
                  </div>
                  <span className="text-[13px] font-medium text-text">{s.name}</span>
                </div>
                {s.description ? (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                    {s.description}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      {addOpen && id ? (
        <NewSkillModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

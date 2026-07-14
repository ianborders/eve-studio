import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconCalendar, IconPlus, IconRefresh } from "../ui/icons";
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

function NewScheduleModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.createSchedule(agentId, {
      name,
      cron,
      prompt,
    });
    setBusy(false);
    if (r.ok) {
      setDone(r.relPath ?? "schedule");
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  return (
    <Modal title="New schedule" onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            Created <span className="font-mono">{done}</span>.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            Cron runs in UTC on Vercel. Restart the agent to register it; in dev,
            fire it once via the dev schedules route.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Field label="Name" hint="becomes schedules/<name>.ts">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-summary" className="font-mono" />
          </Field>
          <Field label="Cron" hint="5-field, UTC (min hour dom mon dow)">
            <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *" className="font-mono" />
          </Field>
          <Field label="Prompt" hint="fire-and-forget task the agent runs">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Pull open issues and post a summary to the metrics endpoint."
            />
          </Field>
          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={busy || !name || !cron || !prompt}>
              {busy ? "Creating…" : "Create schedule"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Turn a 5-field cron into a rough human phrase (best-effort). */
function describeCron(cron?: string): string | null {
  if (!cron) {
    return null;
  }
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) {
    return null;
  }
  const [min, hr, dom, , dow] = parts;
  const at =
    /^\d+$/.test(hr) && /^\d+$/.test(min)
      ? `${hr.padStart(2, "0")}:${min.padStart(2, "0")}`
      : null;
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  if (dow !== "*" && /^\d$/.test(dow)) {
    return `Weekly on ${days[Number(dow)]}${at ? ` at ${at}` : ""}`;
  }
  if (dom === "*" && at) {
    return `Daily at ${at}`;
  }
  return null;
}

export function Schedules(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const schedules = structure?.schedules ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Schedules <span className="text-faint">· {schedules.length}</span>
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
        {schedules.length === 0 ? (
          <EmptyState
            icon={<IconCalendar className="h-5 w-5" />}
            title="No schedules"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                New schedule
              </Button>
            }
          >
            Scheduled jobs wake the agent on a cron (root agent only).
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {schedules.map((s) => {
              const human = describeCron(s.cron);
              return (
                <Card key={s.name} className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-muted">
                    <IconCalendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-text">{s.name}</div>
                    {human ? (
                      <div className="text-2xs text-muted">{human}</div>
                    ) : null}
                  </div>
                  {s.cron ? (
                    <code className="rounded bg-black/[0.04] px-2 py-1 font-mono text-2xs text-muted">
                      {s.cron}
                    </code>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {addOpen && id ? (
        <NewScheduleModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

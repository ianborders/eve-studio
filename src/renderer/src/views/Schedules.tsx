import { useActiveStructure } from "../lib/useStructure";
import { IconCalendar, IconRefresh } from "../ui/icons";
import { Card, EmptyState, IconButton, Spinner } from "../ui/kit";

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
  const { structure, loading, reload } = useActiveStructure();

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
        <IconButton onClick={reload} title="Reload">
          <IconRefresh className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {schedules.length === 0 ? (
          <EmptyState icon={<IconCalendar className="h-5 w-5" />} title="No schedules">
            Scheduled jobs wake the agent on a cron. Add them as
            <code className="mx-1 rounded bg-black/[0.05] px-1 font-mono text-xs">
              schedules/*.ts
            </code>
            in the project (root agent only).
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
    </div>
  );
}

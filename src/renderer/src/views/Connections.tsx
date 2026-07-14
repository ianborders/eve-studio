import { useActiveStructure } from "../lib/useStructure";
import { IconExternal, IconPlug, IconRefresh } from "../ui/icons";
import { Badge, Card, EmptyState, IconButton, Spinner } from "../ui/kit";

export function Connections(): JSX.Element {
  const { structure, loading, reload } = useActiveStructure();

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
        <IconButton onClick={reload} title="Reload">
          <IconRefresh className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {conns.length === 0 ? (
          <EmptyState icon={<IconPlug className="h-5 w-5" />} title="No connections">
            This agent has no MCP connections. Add one by dropping a
            <code className="mx-1 rounded bg-white/5 px-1 font-mono text-xs">
              connections/*.ts
            </code>
            file in its project — the Memory tab wires Arcana for you.
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
    </div>
  );
}

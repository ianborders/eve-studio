import type { ConnectorItem } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { IconExternal, IconPlus, IconRefresh } from "../ui/icons";
import { Badge, Button, Card, Spinner } from "../ui/kit";

const TYPE_COLOR: Record<string, string> = {
  slack: "#611f69",
  github: "#24292f",
  linear: "#5E6AD2",
  discord: "#5865F2",
  notion: "#000000",
  figma: "#a259ff",
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

export function ConnectorsGallery({ agentId }: { agentId: string }): JSX.Element {
  const [list, setList] = useState<ConnectorItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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

  const openGallery = async (external: boolean): Promise<void> => {
    setOpening(true);
    const r = external
      ? await window.studio.vercel.openConnectExternal(agentId)
      : await window.studio.vercel.openConnect(agentId);
    setOpening(false);
    if (!r.ok) {
      setErr(r.error ?? "Couldn't open Vercel Connect.");
    } else {
      // give the user a moment to add one, then refresh on next focus
      setTimeout(() => void load(), 4000);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-text">Connections</div>
          <div className="text-2xs text-muted">
            Vercel Connect — the providers your agent can connect to (managed OAuth &amp; API keys).
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => openGallery(true)} title="Open in browser">
            <IconExternal className="h-3.5 w-3.5" />
          </Button>
          <Button variant="primary" size="sm" onClick={() => openGallery(false)} disabled={opening}>
            <IconPlus className="h-3.5 w-3.5" />
            {opening ? "Opening…" : "Add connection"}
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
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="text-[13px] text-muted">
            No connections yet. Browse the full provider catalog — Slack, GitHub,
            Notion, Figma, Shopify, and hundreds more — and add one.
          </div>
          <Button variant="primary" size="sm" onClick={() => openGallery(false)} disabled={opening}>
            <IconPlus className="h-3.5 w-3.5" />
            Add connection
          </Button>
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
    </div>
  );
}

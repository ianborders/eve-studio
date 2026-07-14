import type { AppInfo } from "@shared/ipc";
import { IconServer, IconTrash } from "../ui/icons";
import { useStore } from "../store";
import { Button, Card, PanelHeader } from "../ui/kit";

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-[13px]">
      <span className="text-muted">{k}</span>
      <span className="font-mono text-text">{v}</span>
    </div>
  );
}

export function Settings({ info }: { info: AppInfo | null }): JSX.Element {
  const agents = useStore((s) => s.agents);
  const removeAgent = useStore((s) => s.removeAgent);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-lg font-semibold text-text">Settings</h1>

        <Card>
          <PanelHeader title="Application" />
          <div className="divide-y divide-border">
            <Row k="Version" v={info?.appVersion ?? "—"} />
            <Row k="Electron" v={info?.electron ?? "—"} />
            <Row k="Node" v={info?.node ?? "—"} />
            <Row k="Chromium" v={info?.chrome ?? "—"} />
            <Row k="Platform" v={info?.platform ?? "—"} />
          </div>
        </Card>

        <Card>
          <PanelHeader title="Registered agents" count={agents.length} />
          <div className="divide-y divide-border">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.05] text-muted">
                  <IconServer className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-text">{a.name}</div>
                  <div className="truncate text-2xs text-faint">{a.path}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeAgent(a.id)}>
                  <IconTrash className="h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Storage & secrets" />
          <p className="px-4 py-3 text-[13px] leading-relaxed text-muted">
            Agents, chat threads, and Arcana brain keys are stored locally in this
            app's user-data directory. Brain keys are held in plain JSON for now — an
            OS-keychain vault is a planned hardening pass. Nothing leaves your machine
            except calls to the agents' own dev servers and Arcana.
          </p>
        </Card>
      </div>
    </div>
  );
}

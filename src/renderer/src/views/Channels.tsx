import type { ChannelItem } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconPlug, IconRefresh, IconServer } from "../ui/icons";
import { Badge, Button, Card, Spinner } from "../ui/kit";

export function Channels(): JSX.Element {
  const id = useStore((s) => s.activeAgentId);
  const [channels, setChannels] = useState<ChannelItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    try {
      setChannels(await window.studio.agents.channelsList(id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (kind: "slack" | "web"): Promise<void> => {
    if (!id) {
      return;
    }
    setBusy(kind);
    setOutput(`$ eve channels add ${kind}\n`);
    const r = await window.studio.agents.channelAdd(id, kind);
    setBusy(null);
    setOutput((o) => o + r.output);
    await load();
  };

  if (loading && !channels) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }
  const list = channels ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Channels <span className="text-faint">· {list.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" disabled={busy !== null || !id} onClick={() => add("slack")}>
            {busy === "slack" ? "Adding…" : "Add Slack"}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy !== null || !id} onClick={() => add("web")}>
            {busy === "web" ? "Adding…" : "Add Web Chat"}
          </Button>
          <button type="button" onClick={() => void load()} className="text-faint hover:text-text" title="Reload">
            <IconRefresh className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-5">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* Always-on default */}
          <Card className="flex items-center gap-3 p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-muted">
              <IconServer className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-text">eve HTTP channel</span>
                <Badge tone="success">always on</Badge>
              </div>
              <div className="font-mono text-2xs text-faint">/eve/v1/session*</div>
            </div>
          </Card>

          {list.map((c) => (
            <Card key={c.name} className="flex items-center gap-3 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <IconPlug className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] text-text">{c.name}</span>
                  {c.kind ? <Badge tone="info">{c.kind}</Badge> : null}
                </div>
                {c.method && c.urlPath ? (
                  <div className="font-mono text-2xs text-faint">
                    {c.method} {c.urlPath}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}

          {output ? <Console text={output} className="max-h-52" /> : null}

          <Card className="bg-subtle p-4 text-2xs leading-relaxed text-muted">
            <b className="text-text">Slack needs one more step.</b> Adding the channel
            writes <span className="font-mono">channels/slack.ts</span> and installs
            <span className="font-mono"> @vercel/connect</span>. To actually receive
            messages, provision the connector (browser + CLI):
            <pre className="mt-2 overflow-x-auto rounded bg-black/[0.05] p-2 font-mono text-[11px] text-text">{`vercel connect create slack --triggers
vercel connect attach <uid> --triggers \\
  --trigger-path /eve/v1/slack --yes`}</pre>
            then deploy. Credentials run through Vercel Connect — no bot token or
            signing secret to manage.
          </Card>
        </div>
      </div>
    </div>
  );
}

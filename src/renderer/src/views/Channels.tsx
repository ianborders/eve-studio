import type { ChannelItem, ChannelKind } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { ConnectorPicker } from "../components/ConnectorPicker";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconPlus, IconRefresh, IconServer } from "../ui/icons";
import {
  Badge,
  Button,
  IconButton,
  Kicker,
  List,
  Modal,
  Spinner,
  ViewHeader,
  cx,
} from "../ui/kit";

type Auth = "connect" | "env" | "web" | "custom";
interface Cat {
  kind: ChannelKind | "web";
  label: string;
  desc: string;
  auth: Auth;
  service?: string;
  env?: string[];
  color: string;
}

const CATALOG: Cat[] = [
  {
    kind: "slack",
    label: "Slack",
    desc: "Mentions, DMs, buttons.",
    auth: "connect",
    service: "slack",
    color: "#611f69",
  },
  {
    kind: "discord",
    label: "Discord",
    desc: "Slash commands, components.",
    auth: "env",
    env: ["DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID", "DISCORD_BOT_TOKEN"],
    color: "#5865F2",
  },
  {
    kind: "teams",
    label: "Microsoft Teams",
    desc: "Messages + Adaptive Cards.",
    auth: "env",
    env: ["MICROSOFT_APP_ID"],
    color: "#4b53bc",
  },
  {
    kind: "telegram",
    label: "Telegram",
    desc: "Bot messages.",
    auth: "env",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"],
    color: "#229ED9",
  },
  {
    kind: "twilio",
    label: "Twilio",
    desc: "SMS & speech phone calls.",
    auth: "env",
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    color: "#F22F46",
  },
  {
    kind: "github",
    label: "GitHub",
    desc: "@mentions, PR review w/ checkout.",
    auth: "connect",
    service: "github",
    color: "#24292f",
  },
  {
    kind: "linear",
    label: "Linear",
    desc: "Issue delegation, Agent Sessions.",
    auth: "connect",
    service: "linear",
    color: "#5E6AD2",
  },
  {
    kind: "web",
    label: "Web Chat",
    desc: "A Next.js browser chat app.",
    auth: "web",
    color: "#000000",
  },
  {
    kind: "custom",
    label: "Custom",
    desc: "Your own webhook / WebSocket.",
    auth: "custom",
    color: "#666666",
  },
];

function Logo({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cx(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold text-white",
        className ?? "h-9 w-9 text-sm",
      )}
      style={{ background: color }}
    >
      {label[0]}
    </div>
  );
}

function AddChannelModal({
  agentId,
  cat,
  onClose,
  onDone,
}: {
  agentId: string;
  cat: Cat;
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [connector, setConnector] = useState("");
  const [customName, setCustomName] = useState("intake");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [done, setDone] = useState<{
    envVars?: string[];
    connect?: boolean;
  } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachOut, setAttachOut] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    if (cat.kind === "web") {
      setOutput("$ eve channels add web\n");
      const r = await window.studio.agents.channelAdd(agentId, "web");
      setBusy(false);
      setOutput((o) => o + r.output);
      if (r.ok) {
        setDone({});
      } else {
        setErr("Command failed — see output.");
      }
      return;
    }
    const r = await window.studio.agents.channelWrite(agentId, {
      kind: cat.kind as ChannelKind,
      connector: cat.auth === "connect" ? connector : undefined,
      name: cat.kind === "custom" ? customName : undefined,
    });
    setBusy(false);
    if (r.ok) {
      setDone({ envVars: r.envVars, connect: r.connect });
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  const attach = async (): Promise<void> => {
    setAttaching(true);
    setAttachOut(
      `$ vercel connect attach ${connector} --triggers --trigger-path /eve/v1/${cat.kind}\n`,
    );
    const r = await window.studio.vercel.connectorAttach(
      agentId,
      connector,
      cat.kind,
    );
    setAttaching(false);
    setAttachOut((o) => o + r.output);
  };

  const canAdd =
    cat.auth === "connect"
      ? Boolean(connector)
      : cat.kind === "custom"
        ? Boolean(customName)
        : true;

  return (
    <Modal title={`Add ${cat.label}`} onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            {cat.kind === "web"
              ? "Web Chat app added."
              : `channels/${cat.kind}.ts written.`}
          </div>
          {done.envVars && done.envVars.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-2xs text-muted">
                Set these in the Environment tab, then restart:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {done.envVars.map((v) => (
                  <code
                    key={v}
                    className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-2xs text-text"
                  >
                    {v}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
          {done.connect ? (
            <div className="space-y-2">
              <p className="text-2xs leading-relaxed text-muted">
                Attach the connector to this project so the platform can deliver
                events to{" "}
                <span className="font-mono text-text">/eve/v1/{cat.kind}</span>,
                then deploy.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={attach}
                disabled={attaching}
              >
                {attaching ? "Attaching…" : "Attach for triggers"}
              </Button>
              {attachOut ? (
                <Console
                  text={attachOut}
                  busy={attaching}
                  className="max-h-40"
                />
              ) : null}
            </div>
          ) : null}
          {output ? (
            <Console text={output} busy={busy} className="max-h-40" />
          ) : null}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => {
                onDone();
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Logo label={cat.label} color={cat.color} />
            <div>
              <div className="text-[14px] font-medium text-text">
                {cat.label}
              </div>
              <div className="text-2xs text-muted">{cat.desc}</div>
            </div>
          </div>

          {cat.auth === "connect" ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">
                Vercel Connect connector
              </div>
              <ConnectorPicker
                agentId={agentId}
                service={cat.service}
                value={connector}
                onChange={setConnector}
              />
            </div>
          ) : null}

          {cat.auth === "env" ? (
            <div className="rounded-lg border border-border bg-subtle p-3 text-2xs leading-relaxed text-muted">
              Uses env-var credentials. After adding, set{" "}
              {cat.env?.map((v, i) => (
                <span key={v}>
                  {i > 0 ? ", " : ""}
                  <code className="rounded bg-black/[0.05] px-1 font-mono text-text">
                    {v}
                  </code>
                </span>
              ))}{" "}
              in the Environment tab.
            </div>
          ) : null}

          {cat.auth === "web" ? (
            <div className="rounded-lg border border-border bg-subtle p-3 text-2xs leading-relaxed text-muted">
              Runs{" "}
              <span className="font-mono text-text">eve channels add web</span>{" "}
              to scaffold a Next.js Web Chat app in the project.
            </div>
          ) : null}

          {cat.kind === "custom" ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">
                File name{" "}
                <span className="text-faint">— channels/&lt;name&gt;.ts</span>
              </div>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="no-drag w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-[13px] text-text"
              />
            </div>
          ) : null}

          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={add} disabled={busy || !canAdd}>
              {busy ? "Adding…" : `Add ${cat.label}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Channels(): JSX.Element {
  const id = useStore((s) => s.activeAgentId);
  const [channels, setChannels] = useState<ChannelItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [add, setAdd] = useState<Cat | null>(null);

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

  if (loading && !channels) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const list = channels ?? [];
  // The default eve HTTP channel is always-on and shown separately.
  const authored = list.filter((c) => (c.kind ?? c.name) !== "eve");
  const present = new Set(authored.map((c) => c.kind ?? c.name));

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker="Integrations"
        title="Channels"
        count={authored.length + 1}
        right={
          <IconButton onClick={() => void load()} title="Reload">
            <IconRefresh className="h-3.5 w-3.5" />
          </IconButton>
        }
      />

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto max-w-2xl space-y-7">
          {/* Configured */}
          <div className="space-y-2.5">
            <Kicker>Configured</Kicker>
            <p className="text-2xs leading-relaxed text-muted">
              “Added” means the channel file exists in the agent. Connect-based
              channels (Slack, GitHub, Linear) also need their connector
              attached &amp; authorized in Vercel, plus a redeploy, before they
              can send or receive. A channel lets the agent reply where its
              events arrive and be posted to by schedules — it is{" "}
              <span className="font-medium">not</span> a tool the agent can call
              to message you from a normal chat.
            </p>
            <List>
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-subtle text-faint">
                  <IconServer className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-text">
                      eve HTTP channel
                    </span>
                    <Badge tone="success">always on</Badge>
                  </div>
                  <div className="mt-0.5 font-mono text-2xs text-faint">
                    /eve/v1/session*
                  </div>
                </div>
              </div>
              {authored.map((c) => {
                const cat = CATALOG.find((x) => x.kind === (c.kind ?? c.name));
                return (
                  <div
                    key={c.name}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <Logo
                      label={cat?.label ?? c.name}
                      color={cat?.color ?? "#666"}
                      className="h-8 w-8 text-[13px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text">
                          {cat?.label ?? c.name}
                        </span>
                        <Badge>added</Badge>
                      </div>
                      <div className="mt-0.5 font-mono text-2xs text-faint">
                        channels/{c.name}.ts
                        {c.urlPath
                          ? ` · ${c.method ?? "POST"} ${c.urlPath}`
                          : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </List>
          </div>

          {/* Gallery */}
          <div className="space-y-2.5">
            <Kicker>Add a channel</Kicker>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CATALOG.map((cat) => {
                const added = present.has(cat.kind);
                return (
                  <div
                    key={cat.kind}
                    className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-3 transition-colors hover:border-border-strong hover:bg-black/[0.02]"
                  >
                    <Logo
                      label={cat.label}
                      color={cat.color}
                      className="h-8 w-8 text-[13px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text">
                          {cat.label}
                        </span>
                        {cat.auth === "connect" ? (
                          <Badge tone="accent">Connect</Badge>
                        ) : null}
                        {cat.auth === "env" ? <Badge>env</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-2xs leading-snug text-muted">
                        {cat.desc}
                      </div>
                    </div>
                    {added ? (
                      <Badge>added</Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!id}
                        onClick={() => setAdd(cat)}
                      >
                        <IconPlus className="h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {add && id ? (
        <AddChannelModal
          agentId={id}
          cat={add}
          onClose={() => setAdd(null)}
          onDone={load}
        />
      ) : null}
    </div>
  );
}

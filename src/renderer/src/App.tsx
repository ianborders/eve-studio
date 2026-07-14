import type { AppInfo } from "@shared/ipc";
import { useEffect, useState } from "react";
import { type Section, useStore } from "./store";
import {
  IconBolt,
  IconBot,
  IconBrain,
  IconCalendar,
  IconChat,
  IconCheck,
  IconExternal,
  IconFile,
  IconLayers,
  IconPlay,
  IconPlus,
  IconPlug,
  IconRocket,
  IconServer,
  IconSettings,
  IconStop,
  IconWand,
} from "./ui/icons";
import { Badge, Button, StatusDot, type TabItem, Tabs } from "./ui/kit";
import { Chat } from "./views/Chat";
import { Connections } from "./views/Connections";
import { Instructions } from "./views/Instructions";
import { Memory } from "./views/Memory";
import { Schedules } from "./views/Schedules";
import { Settings } from "./views/Settings";
import { Skills } from "./views/Skills";
import { Structure } from "./views/Structure";
import { Welcome } from "./views/Welcome";

const TABS: TabItem[] = [
  { id: "chat", label: "Chat", icon: IconChat },
  { id: "structure", label: "Structure", icon: IconLayers },
  { id: "memory", label: "Memory", icon: IconBrain },
  { id: "connections", label: "Connections", icon: IconPlug },
  { id: "schedules", label: "Schedules", icon: IconCalendar },
  { id: "skills", label: "Skills", icon: IconWand },
  { id: "instructions", label: "Instructions", icon: IconFile },
  { id: "deploy", label: "Deploy", icon: IconRocket },
  { id: "evals", label: "Evals", icon: IconCheck },
];

function ComingSoon({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-panel text-muted">
        <IconBolt className="h-5 w-5" />
      </div>
      <div className="text-[15px] font-medium text-text">{label}</div>
      <div className="mt-1.5 text-[13px] text-muted">Lands in the next build pass.</div>
    </div>
  );
}

function AgentWorkspace(): JSX.Element {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const agents = useStore((s) => s.agents);
  const runtime = useStore((s) => s.runtime);
  const structure = useStore((s) => (activeAgentId ? s.structure[activeAgentId] : undefined));
  const startAgent = useStore((s) => s.startAgent);
  const stopAgent = useStore((s) => s.stopAgent);

  const agent = agents.find((a) => a.id === activeAgentId);
  const rt = activeAgentId ? runtime[activeAgentId] : undefined;
  const status = rt?.status ?? "stopped";

  if (!agent) {
    return <div className="flex-1" />;
  }

  const tabs = TABS.map((t) => {
    if (t.id === "connections") {
      return { ...t, count: structure?.connections.length };
    }
    if (t.id === "schedules") {
      return { ...t, count: structure?.schedules.length };
    }
    if (t.id === "skills") {
      return { ...t, count: structure?.skills.length };
    }
    return t;
  });

  const busy = status === "starting";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Agent header */}
      <header className="titlebar-drag flex items-center gap-3 border-b border-border px-5 pb-2.5 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold text-text">{agent.name}</h1>
            <Badge tone={status === "running" ? "accent" : status === "error" ? "danger" : "default"}>
              <StatusDot status={status} />
              {status}
            </Badge>
            {rt?.port ? (
              <span className="font-mono text-2xs text-faint">:{rt.port}</span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-2xs text-faint">
            <span className="truncate">{agent.path}</span>
            <span>·</span>
            <span>eve {agent.eveVersion ?? "?"}</span>
          </div>
        </div>
        <div className="flex-1" />
        <div className="no-drag flex items-center gap-2">
          {rt?.url && status === "running" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(`${rt.url}/eve/v1/info`, "_blank")}
              title="Open dev server"
            >
              <IconExternal className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {status === "running" ? (
            <Button variant="secondary" size="sm" onClick={() => stopAgent(agent.id)}>
              <IconStop className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => startAgent(agent.id)}
            >
              <IconPlay className="h-3.5 w-3.5" />
              {busy ? "Starting…" : "Start"}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setSection("deploy")}>
            <IconRocket className="h-3.5 w-3.5" />
            Deploy
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border px-3">
        <Tabs items={tabs} active={section} onChange={(id) => setSection(id as Section)} />
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {section === "chat" ? (
          <Chat />
        ) : section === "structure" ? (
          <Structure />
        ) : section === "memory" ? (
          <Memory />
        ) : section === "connections" ? (
          <Connections />
        ) : section === "schedules" ? (
          <Schedules />
        ) : section === "skills" ? (
          <Skills />
        ) : section === "instructions" ? (
          <Instructions />
        ) : section === "deploy" ? (
          <ComingSoon label="Deploy & Logs" />
        ) : section === "evals" ? (
          <ComingSoon label="Eval runner" />
        ) : null}
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const agents = useStore((s) => s.agents);
  const runtime = useStore((s) => s.runtime);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const addAgent = useStore((s) => s.addAgent);
  const init = useStore((s) => s.init);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void init();
    window.studio
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [init]);

  if (agents.length === 0) {
    return <Welcome onAdd={addAgent} info={info} />;
  }

  const inSettings = section === "settings";

  return (
    <div className="flex h-full bg-bg text-text">
      {/* Rail: agents */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-[#0d0e11]">
        <div className="titlebar-drag h-11 shrink-0" />
        <div className="no-drag flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
              <IconServer className="h-3.5 w-3.5" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-text">
              Eve Studio
            </span>
          </div>
        </div>

        <div className="no-drag px-2.5 pb-2">
          <Button variant="secondary" size="sm" className="w-full" onClick={addAgent}>
            <IconPlus className="h-3.5 w-3.5" />
            Add agent
          </Button>
        </div>

        <div className="mb-1 px-3 text-2xs font-medium uppercase tracking-wide text-faint">
          Agents
        </div>
        <nav className="no-drag flex-1 space-y-0.5 overflow-auto px-2">
          {agents.map((a) => {
            const st = runtime[a.id]?.status ?? "stopped";
            const on = a.id === activeAgentId && !inSettings;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  if (inSettings) {
                    setSection("chat");
                  }
                  void setActiveAgent(a.id);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  on ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                }`}
              >
                <StatusDot status={st} />
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-[13px] ${on ? "text-text" : "text-muted"}`}
                  >
                    {a.name}
                  </div>
                </div>
                {runtime[a.id]?.port ? (
                  <span className="font-mono text-2xs text-faint">
                    :{runtime[a.id]?.port}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="no-drag border-t border-border p-2">
          <button
            type="button"
            onClick={() => setSection("settings")}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
              inSettings ? "bg-white/[0.07] text-text" : "text-muted hover:bg-white/[0.04]"
            }`}
          >
            <IconSettings className="h-4 w-4" />
            Settings
          </button>
          <div className="px-2.5 pt-2 text-2xs leading-relaxed text-faint">
            {info ? (
              <>
                v{info.appVersion} · electron {info.electron}
              </>
            ) : (
              "connecting…"
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      {inSettings ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="titlebar-drag h-11 shrink-0 border-b border-border" />
          <Settings info={info} />
        </div>
      ) : activeAgentId ? (
        <AgentWorkspace />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          <div className="flex flex-col items-center gap-2">
            <IconBot className="h-6 w-6 opacity-50" />
            Select an agent
          </div>
        </div>
      )}
    </div>
  );
}

import type { AppInfo } from "@shared/ipc";
import { useEffect, useState } from "react";
import { type Section, useStore } from "./store";
import {
  IconBot,
  IconBox,
  IconBrain,
  IconCalendar,
  IconChat,
  IconCheck,
  IconCpu,
  IconEve,
  IconExternal,
  IconFile,
  IconFolder,
  IconKey,
  IconLayers,
  IconPlay,
  IconPlus,
  IconPlug,
  IconRadio,
  IconRocket,
  IconSettings,
  IconStop,
  IconWand,
  IconWebhook,
  IconWrench,
} from "./ui/icons";
import { Badge, Button, StatusDot, type TabItem, Tabs } from "./ui/kit";
import { Channels } from "./views/Channels";
import { Chat } from "./views/Chat";
import { Connections } from "./views/Connections";
import { CreateAgent } from "./views/CreateAgent";
import { Deploy } from "./views/Deploy";
import { Environment } from "./views/Environment";
import { Evals } from "./views/Evals";
import { Hooks } from "./views/Hooks";
import { Instructions } from "./views/Instructions";
import { Memory } from "./views/Memory";
import { Model } from "./views/Model";
import { Sandbox } from "./views/Sandbox";
import { Schedules } from "./views/Schedules";
import { Settings } from "./views/Settings";
import { Skills } from "./views/Skills";
import { Structure } from "./views/Structure";
import { Subagents } from "./views/Subagents";
import { Tools } from "./views/Tools";
import { Welcome } from "./views/Welcome";

const TABS: TabItem[] = [
  { id: "chat", label: "Chat", icon: IconChat },
  { id: "structure", label: "Structure", icon: IconLayers },
  { id: "instructions", label: "Instructions", icon: IconFile },
  { id: "model", label: "Model", icon: IconCpu },
  { id: "tools", label: "Tools", icon: IconWrench },
  { id: "connections", label: "Connections", icon: IconPlug },
  { id: "channels", label: "Channels", icon: IconRadio },
  { id: "skills", label: "Skills", icon: IconWand },
  { id: "subagents", label: "Subagents", icon: IconBot },
  { id: "schedules", label: "Schedules", icon: IconCalendar },
  { id: "sandbox", label: "Sandbox", icon: IconBox },
  { id: "hooks", label: "Hooks", icon: IconWebhook },
  { id: "memory", label: "Memory", icon: IconBrain },
  { id: "environment", label: "Environment", icon: IconKey },
  { id: "deploy", label: "Deploy", icon: IconRocket },
  { id: "evals", label: "Evals", icon: IconCheck },
];

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

  const counts: Record<string, number | undefined> = {
    tools: structure?.tools.length,
    connections: structure?.connections.length,
    channels: structure?.channels.length,
    skills: structure?.skills.length,
    subagents: structure?.subagents.length,
    schedules: structure?.schedules.length,
    hooks: structure?.hooks.length,
  };
  const tabs = TABS.map((t) => ({ ...t, count: counts[t.id] }));

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
        ) : section === "instructions" ? (
          <Instructions />
        ) : section === "model" ? (
          <Model />
        ) : section === "tools" ? (
          <Tools />
        ) : section === "connections" ? (
          <Connections />
        ) : section === "channels" ? (
          <Channels />
        ) : section === "skills" ? (
          <Skills />
        ) : section === "subagents" ? (
          <Subagents />
        ) : section === "schedules" ? (
          <Schedules />
        ) : section === "sandbox" ? (
          <Sandbox />
        ) : section === "hooks" ? (
          <Hooks />
        ) : section === "memory" ? (
          <Memory />
        ) : section === "environment" ? (
          <Environment />
        ) : section === "deploy" ? (
          <Deploy />
        ) : section === "evals" ? (
          <Evals />
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
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void init();
    window.studio
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [init]);

  const createModal = createOpen ? (
    <CreateAgent onClose={() => setCreateOpen(false)} />
  ) : null;

  if (agents.length === 0) {
    return (
      <>
        <Welcome
          onAdd={addAgent}
          onCreate={() => setCreateOpen(true)}
          info={info}
        />
        {createModal}
      </>
    );
  }

  const inSettings = section === "settings";

  return (
    <div className="flex h-full bg-bg text-text">
      {/* Rail: agents */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-subtle">
        <div className="titlebar-drag h-11 shrink-0" />
        <div className="no-drag flex items-center justify-between px-3.5 pb-2.5">
          <div className="flex items-center gap-2 text-text">
            <IconEve className="h-4 w-4" />
            <span className="text-[14px] font-semibold tracking-tight">
              Eve Studio
            </span>
          </div>
        </div>

        <div className="no-drag flex gap-1.5 px-2.5 pb-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={addAgent}
          >
            <IconFolder className="h-3.5 w-3.5" />
            Add existing
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            title="Create a new agent"
          >
            <IconPlus className="h-3.5 w-3.5" />
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
                  on
                    ? "border border-border bg-white shadow-card"
                    : "border border-transparent hover:bg-black/[0.03]"
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
              inSettings ? "bg-black/[0.05] text-text" : "text-muted hover:bg-black/[0.03]"
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

      {createModal}
    </div>
  );
}

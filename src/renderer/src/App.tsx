import type { AppInfo } from "@shared/ipc";
import { useEffect, useState } from "react";
import { type Section, useStore } from "./store";
import { Chat } from "./views/Chat";
import { Library } from "./views/Library";
import { Memory } from "./views/Memory";
import { Structure } from "./views/Structure";

const NAV: { id: Section; label: string; icon: string; phase: string }[] = [
  { id: "library", label: "Agents", icon: "▤", phase: "" },
  { id: "chat", label: "Chat", icon: "◇", phase: "" },
  { id: "structure", label: "Structure", icon: "⚙", phase: "" },
  { id: "memory", label: "Memory (Arcana)", icon: "◉", phase: "" },
  { id: "connections", label: "Connections", icon: "⇄", phase: "P6" },
  { id: "deploy", label: "Deploy & Logs", icon: "▲", phase: "P7" },
  { id: "evals", label: "Evals", icon: "✓", phase: "P8" },
  { id: "updates", label: "Updates", icon: "↑", phase: "P9" },
  { id: "settings", label: "Settings", icon: "⋯", phase: "" },
];

function Placeholder({ title, phase }: { title: string; phase: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-lg font-medium text-neutral-200">{title}</div>
      <div className="mt-2 max-w-md text-sm text-muted">
        Scaffolded. Lands in phase {phase || "a later phase"} — see ROADMAP.md.
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const init = useStore((s) => s.init);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void init();
    window.studio
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [init]);

  const current = NAV.find((n) => n.id === section);

  return (
    <div className="flex h-full bg-bg text-neutral-200">
      <aside className="flex w-60 flex-col border-r border-border bg-panel">
        <div className="titlebar-drag h-11" />
        <div className="px-4 pb-3 pt-1">
          <div className="text-sm font-semibold tracking-tight text-neutral-100">
            Eve Studio
          </div>
          <div className="text-[11px] text-muted">agent control center</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((item) => {
            const active = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`no-drag flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-neutral-50"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                <span className="w-4 text-center text-[13px] opacity-80">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.phase && !active ? (
                  <span className="text-[10px] text-muted">{item.phase}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted">
          {info ? (
            <>
              v{info.appVersion} · electron {info.electron}
              <br />
              node {info.node} · {info.platform}
            </>
          ) : (
            "connecting…"
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="titlebar-drag flex h-11 items-center border-b border-border px-5 text-sm font-medium text-neutral-300">
          {current?.label}
        </header>
        <div className="flex-1 overflow-hidden">
          {section === "library" ? (
            <div className="h-full overflow-auto p-6">
              <Library />
            </div>
          ) : section === "chat" ? (
            <Chat />
          ) : section === "structure" ? (
            <Structure />
          ) : section === "memory" ? (
            <Memory />
          ) : (
            <Placeholder title={current?.label ?? ""} phase={current?.phase ?? ""} />
          )}
        </div>
      </main>
    </div>
  );
}

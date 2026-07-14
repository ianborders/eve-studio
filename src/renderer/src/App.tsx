import { useEffect, useState } from "react";
import type { AppInfo } from "@shared/ipc";

type Section =
  | "library"
  | "chat"
  | "structure"
  | "memory"
  | "connections"
  | "deploy"
  | "evals"
  | "updates"
  | "settings";

const NAV: { id: Section; label: string; icon: string; phase: string }[] = [
  { id: "library", label: "Agents", icon: "▤", phase: "P1" },
  { id: "chat", label: "Chat", icon: "◇", phase: "P1" },
  { id: "structure", label: "Structure", icon: "⚙", phase: "P2" },
  { id: "memory", label: "Memory (Arcana)", icon: "◉", phase: "P3" },
  { id: "connections", label: "Connections", icon: "⇄", phase: "P6" },
  { id: "deploy", label: "Deploy & Logs", icon: "▲", phase: "P7" },
  { id: "evals", label: "Evals", icon: "✓", phase: "P8" },
  { id: "updates", label: "Updates", icon: "↑", phase: "P9" },
  { id: "settings", label: "Settings", icon: "⋯", phase: "—" },
];

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-lg font-medium text-neutral-200">{title}</div>
      <div className="mt-2 max-w-md text-sm text-muted">{note}</div>
    </div>
  );
}

function LibraryEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-2xl">▤</div>
      <div className="mt-3 text-lg font-medium text-neutral-100">No agents yet</div>
      <div className="mt-2 max-w-md text-sm text-muted">
        Add an existing Eve agent by pointing at its folder, or create a new one. Coming in Phase 1:
        this list boots each agent's local dev server and lets you chat with it.
      </div>
      <button
        type="button"
        className="no-drag mt-5 rounded-md border border-border bg-panel px-4 py-2 text-sm text-neutral-200 opacity-60"
        disabled
      >
        + Add existing agent (P1)
      </button>
    </div>
  );
}

export function App(): JSX.Element {
  const [section, setSection] = useState<Section>("library");
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    window.studio
      .getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return (
    <div className="flex h-full bg-bg text-neutral-200">
      {/* Sidebar */}
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
                {item.phase !== "—" && !active && (
                  <span className="text-[10px] text-muted">{item.phase}</span>
                )}
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

      {/* Main */}
      <main className="flex flex-1 flex-col">
        <header className="titlebar-drag flex h-11 items-center border-b border-border px-5 text-sm font-medium text-neutral-300">
          {NAV.find((n) => n.id === section)?.label}
        </header>
        <div className="flex-1 overflow-auto p-6">
          {section === "library" ? (
            <LibraryEmpty />
          ) : (
            <Placeholder
              title={NAV.find((n) => n.id === section)?.label ?? ""}
              note={`Scaffolded. Lands in phase ${
                NAV.find((n) => n.id === section)?.phase
              } — see ROADMAP.md.`}
            />
          )}
        </div>
      </main>
    </div>
  );
}

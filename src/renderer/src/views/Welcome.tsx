import type { AppInfo } from "@shared/ipc";
import { IconFolder, IconPlus, IconServer } from "../ui/icons";
import { Button } from "../ui/kit";

export function Welcome({
  onAdd,
  onCreate,
  info,
}: {
  onAdd: () => void;
  onCreate: () => void;
  info: AppInfo | null;
}): JSX.Element {
  return (
    <div className="relative flex h-full flex-col bg-bg text-text">
      <div className="titlebar-drag h-11 shrink-0" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-glow">
          <IconServer className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Eve Studio</h1>
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
          A control center for your Eve agents — chat, inspect structure, wire
          Arcana memory, manage connections and schedules, and deploy. All local,
          all yours.
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <Button variant="primary" size="md" onClick={onAdd} className="px-4">
            <IconFolder className="h-4 w-4" />
            Add an existing agent
          </Button>
          <Button variant="ghost" size="md" onClick={onCreate} className="px-4">
            <IconPlus className="h-4 w-4" />
            Create a new agent
          </Button>
        </div>

        <p className="mt-6 max-w-sm text-2xs leading-relaxed text-faint">
          Point at any Eve project folder (the one with an{" "}
          <code className="rounded bg-white/5 px-1 font-mono">agent/</code>{" "}
          directory). Studio spawns its dev server and talks to it locally.
        </p>
      </div>
      <div className="pb-4 text-center text-2xs text-faint">
        {info ? `v${info.appVersion} · electron ${info.electron} · node ${info.node}` : ""}
      </div>
    </div>
  );
}

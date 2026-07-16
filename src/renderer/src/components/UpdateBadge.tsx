import type { UpdateState } from "@shared/ipc";
import { useEffect, useState } from "react";
import { IconDownload, IconRefresh } from "../ui/icons";

/**
 * The in-app auto-update control (sidebar footer). Mirrors the release flow:
 * an "Update" button downloads, then it flips to "Restart to update", which
 * finalizes the install and relaunches. Renders nothing when up to date.
 */
export function UpdateBadge(): JSX.Element | null {
  const [s, setS] = useState<UpdateState>({ status: "idle", version: null });

  useEffect(() => {
    let mounted = true;
    void window.studio.updates.getState().then((st) => {
      if (mounted) {
        setS(st);
      }
    });
    const off = window.studio.updates.onState(setS);
    return () => {
      mounted = false;
      off();
    };
  }, []);

  if (s.status === "available") {
    return (
      <button
        type="button"
        onClick={() => void window.studio.updates.download()}
        className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-[13px] text-text transition-colors hover:border-border-strong hover:bg-black/[0.02]"
      >
        <IconDownload className="h-4 w-4 shrink-0 text-muted" />
        <span className="flex-1 truncate">Update available</span>
        {s.version ? (
          <span className="font-mono text-2xs text-faint">v{s.version}</span>
        ) : null}
      </button>
    );
  }

  if (s.status === "downloading") {
    return (
      <div className="mb-1.5 rounded-lg border border-border px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[13px] text-muted">
          <span>Downloading…</span>
          <span className="font-mono text-2xs text-faint">
            {s.percent ?? 0}%
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className="h-full rounded-full bg-text/60 transition-[width] duration-200"
            style={{ width: `${s.percent ?? 0}%` }}
          />
        </div>
      </div>
    );
  }

  if (s.status === "downloaded") {
    return (
      <button
        type="button"
        onClick={() => void window.studio.updates.install()}
        className="mb-1.5 flex w-full items-center gap-2 rounded-lg bg-text px-2.5 py-2 text-left text-[13px] text-white transition-colors hover:bg-text/85"
      >
        <IconRefresh className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Restart to update</span>
        {s.version ? (
          <span className="font-mono text-2xs text-white/70">v{s.version}</span>
        ) : null}
      </button>
    );
  }

  return null;
}

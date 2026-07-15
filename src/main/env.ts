import { spawnSync } from "node:child_process";

/**
 * Ensure `process.env.PATH` includes the user's real shell PATH.
 *
 * @remarks
 * macOS GUI apps (and packaged Electron builds) launch with a minimal PATH that
 * omits nvm/homebrew/local bins, so spawning `vercel` (or `npx`) fails with
 * ENOENT. Resolve the login shell's PATH once at startup and merge it in.
 */
export function hydratePath(): void {
  if (process.platform === "win32") {
    return;
  }
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const res = spawnSync(shell, ["-ilc", "echo __P__$PATH__P__"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const m = /__P__(.*)__P__/.exec(res.stdout ?? "");
    const shellPath = m?.[1]?.trim();
    if (shellPath) {
      const have = new Set((process.env.PATH ?? "").split(":").filter(Boolean));
      const merged = [
        ...shellPath.split(":").filter(Boolean),
        ...Array.from(have),
      ];
      process.env.PATH = Array.from(new Set(merged)).join(":");
    }
  } catch {
    // keep the inherited PATH
  }
}

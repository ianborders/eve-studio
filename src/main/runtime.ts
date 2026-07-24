import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * Guarantees a Node.js runtime (with npm/npx) is available so `eve init`,
 * `eve dev`, etc. work on a machine that has never installed Node — without the
 * user ever touching a terminal.
 *
 * @remarks
 * If a recent system Node is already on PATH we use it. Otherwise we download a
 * portable Node into the app's userData dir once and prepend it to PATH. The
 * download is written with `fetch`/`tar` (no `com.apple.quarantine` attribute),
 * so the binary runs as a normal subprocess — it lives outside the signed app
 * bundle and doesn't affect notarization.
 */

// Eve requires Node >= 24, so we provision (and require) Node 24.
const NODE_VERSION = "24.18.0";
const MIN_MAJOR = 24;

function runtimeRoot(): string {
  return join(app.getPath("userData"), "runtime");
}

function bundledBinDir(): string {
  return join(
    runtimeRoot(),
    `node-v${NODE_VERSION}-${process.platform}-${process.arch}`,
    "bin",
  );
}

/** A usable (recent enough) system Node is already resolvable on PATH. */
function systemNodeUsable(): boolean {
  try {
    const r = spawnSync("node", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    if (r.status !== 0) {
      return false;
    }
    const major = /v(\d+)\./.exec(r.stdout ?? "")?.[1];
    return major ? Number(major) >= MIN_MAJOR : false;
  } catch {
    return false;
  }
}

async function downloadNode(onLog?: (msg: string) => void): Promise<void> {
  const name = `node-v${NODE_VERSION}-${process.platform}-${process.arch}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${name}.tar.gz`;
  const root = runtimeRoot();
  mkdirSync(root, { recursive: true });

  onLog?.(
    `Setting up the Node.js ${NODE_VERSION} runtime (first-time setup)…\n`,
  );
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Node runtime download failed (HTTP ${res.status}).`);
  }
  const tgz = join(root, `${name}.tar.gz`);
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));

  onLog?.("Extracting runtime…\n");
  // Absolute path — we're here because PATH may be missing/broken, and `tar`
  // ships at a fixed location on macOS.
  const tarBin = process.platform === "darwin" ? "/usr/bin/tar" : "tar";
  execFileSync(tarBin, ["-xzf", tgz, "-C", root]);
  rmSync(tgz, { force: true });

  if (!existsSync(join(bundledBinDir(), "node"))) {
    throw new Error("Node runtime extraction did not produce a node binary.");
  }
  onLog?.("Runtime ready.\n\n");
}

let pending: Promise<void> | null = null;

/**
 * Ensure `node`/`npm`/`npx` are on PATH. Memoized — safe to call on every spawn.
 * `onLog` receives human-readable progress lines (only emitted when a download
 * actually happens).
 */
export function ensureNodeRuntime(
  onLog?: (msg: string) => void,
): Promise<void> {
  if (pending) {
    return pending;
  }
  pending = (async () => {
    if (systemNodeUsable()) {
      return;
    }
    const bin = bundledBinDir();
    if (!existsSync(join(bin, "node"))) {
      try {
        await downloadNode(onLog);
      } catch (err) {
        // Let a caller retry on the next attempt (e.g. once back online).
        pending = null;
        throw err;
      }
    }
    if (!process.env.PATH?.split(":").includes(bin)) {
      process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
    }
  })();
  return pending;
}

/**
 * Guarantee a `vercel` executable is resolvable by any subprocess we spawn —
 * critically the external `eve deploy`, which shells out to a bare `vercel` and
 * otherwise dies with "Vercel CLI not found" on the ~98% of machines with no
 * global install (and no terminal to run one).
 *
 * @remarks
 * We write a tiny shim that defers to `npx vercel@latest` (the same on-demand
 * CLI the rest of Studio uses, prewarmed by {@link prewarmVercel}) and **append**
 * its directory to PATH. Appending — not prepending — means a real `vercel`
 * already on PATH still wins; the shim only fires as a fallback when nothing
 * else provides one. Idempotent and best-effort: a failure here just leaves the
 * prior PATH untouched. Called at startup and again right before a deploy.
 */
export function ensureVercelShim(): void {
  try {
    const dir = join(runtimeRoot(), "shims");
    mkdirSync(dir, { recursive: true });
    const bundledNpx = join(bundledBinDir(), "npx");
    if (process.platform === "win32") {
      const shim = join(dir, "vercel.cmd");
      // Prefer our bundled npx if it has been provisioned, else PATH's npx.
      writeFileSync(
        shim,
        `@echo off\r\nif exist "${bundledNpx}.cmd" (\r\n  "${bundledNpx}.cmd" --yes vercel@latest %*\r\n) else (\r\n  npx --yes vercel@latest %*\r\n)\r\n`,
      );
    } else {
      const shim = join(dir, "vercel");
      writeFileSync(
        shim,
        `#!/bin/sh\n# Auto-generated by Eve Studio. Resolve the Vercel CLI via npx so deploys\n# work without a global install. A real vercel earlier on PATH wins.\nif [ -x "${bundledNpx}" ]; then exec "${bundledNpx}" --yes vercel@latest "$@"; fi\nexec npx --yes vercel@latest "$@"\n`,
      );
      chmodSync(shim, 0o755);
    }
    const sep = process.platform === "win32" ? ";" : ":";
    const parts = (process.env.PATH ?? "").split(sep).filter(Boolean);
    if (!parts.includes(dir)) {
      process.env.PATH = [...parts, dir].join(sep);
    }
  } catch {
    // Best-effort: without the shim we simply fall back to a PATH/global vercel.
  }
}

let vercelWarmed = false;

/**
 * Warm the npx cache for the Vercel CLI in the background so the first
 * link/deploy isn't a blocking download. Fire-and-forget; safe to call repeatedly.
 */
export function prewarmVercel(): void {
  if (vercelWarmed) {
    return;
  }
  vercelWarmed = true;
  try {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(npx, ["--yes", "vercel@latest", "--version"], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, NO_COLOR: "1" },
    });
    child.on("error", () => {
      // npx/node not ready — the on-demand fallback in vercel.ts still covers it
    });
    child.unref();
  } catch {
    // ignore
  }
}

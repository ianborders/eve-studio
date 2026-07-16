import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

const NODE_VERSION = "22.12.0";
const MIN_MAJOR = 20;

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

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChannelItem, CmdResult, EvalItem } from "../shared/ipc";

/** Resolve the eve CLI: prefer the project-local bin, else fall back to npx. */
export function eveBin(cwd: string): { cmd: string; pre: string[] } {
  const local = join(cwd, "node_modules", ".bin", "eve");
  if (existsSync(local)) {
    return { cmd: local, pre: [] };
  }
  return { cmd: process.platform === "win32" ? "npx.cmd" : "npx", pre: ["eve"] };
}

const CLEAN_ENV = { NO_COLOR: "1", FORCE_COLOR: "0" };

/**
 * Streams long-running eve subcommands (build / deploy / eval / init) to the
 * renderer chunk-by-chunk, keyed by a caller-supplied runId.
 */
export class CliRunner {
  private readonly runs = new Map<string, ChildProcess>();

  constructor(
    private readonly onChunk: (runId: string, data: string) => void,
    private readonly onExit: (runId: string, code: number | null) => void
  ) {}

  /** Spawn `eve <args>` in `cwd`, streaming output under `runId`. */
  run(runId: string, cwd: string, args: string[]): void {
    const bin = eveBin(cwd);
    const proc = spawn(bin.cmd, [...bin.pre, ...args], {
      cwd,
      env: { ...process.env, ...CLEAN_ENV },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.runs.set(runId, proc);

    const emit = (b: Buffer): void => this.onChunk(runId, b.toString());
    proc.stdout?.on("data", emit);
    proc.stderr?.on("data", emit);
    proc.on("error", (err) => {
      this.onChunk(runId, `\n[failed to launch] ${err.message}\n`);
      this.runs.delete(runId);
      this.onExit(runId, -1);
    });
    proc.on("exit", (code) => {
      this.runs.delete(runId);
      this.onExit(runId, code);
    });
  }

  cancel(runId: string): void {
    const p = this.runs.get(runId);
    if (p) {
      try {
        p.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }

  cancelAll(): void {
    for (const [, p] of this.runs) {
      try {
        p.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
    this.runs.clear();
  }
}

/** Discover evals via `eve eval --list --json` (fast, no model calls). */
export function listEvals(cwd: string): EvalItem[] {
  const bin = eveBin(cwd);
  try {
    const res = spawnSync(bin.cmd, [...bin.pre, "eval", "--list", "--json"], {
      cwd,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, ...CLEAN_ENV },
    });
    const out = res.stdout ?? "";
    const start = out.indexOf("[");
    if (start < 0) {
      return [];
    }
    const parsed = JSON.parse(out.slice(start)) as EvalItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Discover user-authored channels via `eve channels list --json`. */
export function listChannels(cwd: string): ChannelItem[] {
  const bin = eveBin(cwd);
  try {
    const res = spawnSync(bin.cmd, [...bin.pre, "channels", "list", "--json"], {
      cwd,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, ...CLEAN_ENV },
    });
    const out = res.stdout ?? "";
    // `eve channels list --json` prints { "channels": ["slack", ...] } (names).
    const s = out.indexOf("{");
    const e = out.lastIndexOf("}");
    if (s < 0 || e < s) {
      return [];
    }
    const parsed = JSON.parse(out.slice(s, e + 1)) as { channels?: unknown };
    const list = Array.isArray(parsed.channels) ? parsed.channels : [];
    return list.map((c) => {
      if (typeof c === "string") {
        return { name: c, kind: c };
      }
      const o = c as Record<string, unknown>;
      const name = String(o.name ?? "");
      return {
        name,
        kind: (o.kind as string | undefined) ?? name,
        method: o.method as string | undefined,
        urlPath: o.urlPath as string | undefined,
      };
    });
  } catch {
    return [];
  }
}

/** Scaffold a channel with `eve channels add <kind> -y` (writes file + dep). */
export function addChannel(cwd: string, kind: "slack" | "web"): CmdResult {
  const bin = eveBin(cwd);
  try {
    const res = spawnSync(
      bin.cmd,
      [...bin.pre, "channels", "add", kind, "-y", "-f"],
      {
        cwd,
        encoding: "utf8",
        timeout: 180_000,
        env: { ...process.env, ...CLEAN_ENV },
      }
    );
    if (res.error) {
      return { ok: false, output: res.error.message };
    }
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
    return { ok: res.status === 0, output: out || `(exit ${res.status})` };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Scaffold a new agent with `eve init <name>` (run from the parent dir).
 *
 * @remarks
 * eve init derives the project name from the bare target argument, so it must
 * be run with `cwd` = parent and a slash-free name. It installs dependencies as
 * part of scaffolding, so this streams under `runId` like other CLI runs.
 */
export function initAgent(
  runner: CliRunner,
  runId: string,
  parentDir: string,
  name: string,
  webChat: boolean
): void {
  const args = ["init", name];
  if (webChat) {
    args.push("--channel-web-nextjs");
  }
  runner.run(runId, parentDir, args);
}

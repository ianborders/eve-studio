import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CmdResult, VercelStatus } from "../shared/ipc";

function vercelBin(): string {
  return process.platform === "win32" ? "vercel.cmd" : "vercel";
}

/** Read link state from .vercel/project.json. */
export function vercelStatus(agentPath: string): VercelStatus {
  const p = join(agentPath, ".vercel", "project.json");
  if (!existsSync(p)) {
    return { linked: false };
  }
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      projectName?: string;
      projectId?: string;
      orgId?: string;
    };
    return {
      linked: true,
      projectName: j.projectName ?? null,
      projectId: j.projectId ?? null,
      orgId: j.orgId ?? null,
    };
  } catch {
    return { linked: false };
  }
}

function run(agentPath: string, args: string[], input?: string): CmdResult {
  try {
    const res = spawnSync(vercelBin(), args, {
      cwd: agentPath,
      encoding: "utf8",
      timeout: 90_000,
      input,
      env: { ...process.env, NO_COLOR: "1" },
    });
    if (res.error) {
      const msg = (res.error as NodeJS.ErrnoException).code === "ENOENT"
        ? "The Vercel CLI isn't installed or on PATH. Install it: npm i -g vercel"
        : res.error.message;
      return { ok: false, output: msg };
    }
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
    return { ok: res.status === 0, output: out || `(exit ${res.status})` };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

/** `vercel env ls` — list production/preview/development env var names. */
export function vercelEnvLs(agentPath: string): CmdResult {
  return run(agentPath, ["env", "ls"]);
}

/** `vercel env pull .env.local --yes` — sync remote env down. */
export function vercelEnvPull(agentPath: string): CmdResult {
  return run(agentPath, ["env", "pull", ".env.local", "--yes"]);
}

/** `vercel env add <NAME> <target>` with the value fed on stdin (non-interactive). */
export function vercelEnvAdd(
  agentPath: string,
  name: string,
  value: string,
  target: string
): CmdResult {
  return run(agentPath, ["env", "add", name, target], `${value}\n`);
}

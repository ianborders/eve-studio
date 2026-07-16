import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CmdResult,
  ConnectorItem,
  ModelReadiness,
  ProdInfo,
  VercelStatus,
} from "../shared/ipc";

function vercelBin(): string {
  return process.platform === "win32" ? "vercel.cmd" : "vercel";
}
function npxBin(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
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

function spawnVercel(
  cmd: string,
  args: string[],
  agentPath: string,
  input?: string,
) {
  return spawnSync(cmd, args, {
    cwd: agentPath,
    encoding: "utf8",
    timeout: 180_000,
    input,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function run(agentPath: string, args: string[], input?: string): CmdResult {
  try {
    let res = spawnVercel(vercelBin(), args, agentPath, input);
    // No global vercel? Fall back to `npx vercel@latest` on our provisioned
    // Node — no `npm i -g vercel`, no terminal. (Pre-warmed at startup so this
    // is normally a cache hit; see prewarmVercel.)
    if ((res.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      res = spawnVercel(
        npxBin(),
        ["--yes", "vercel@latest", ...args],
        agentPath,
        input,
      );
    }
    if (res.error) {
      const msg =
        (res.error as NodeJS.ErrnoException).code === "ENOENT"
          ? "Couldn't run Vercel — the runtime isn't ready yet. Try again in a moment."
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

const MODEL_CRED_VARS = [
  "VERCEL_OIDC_TOKEN",
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
];

/** Can this agent's model actually run locally? (linked + a gateway/provider credential) */
export function modelReadiness(agentPath: string): ModelReadiness {
  const linked = existsSync(join(agentPath, ".vercel", "project.json"));
  let hasCredential = false;
  for (const f of [".env.local", ".env"]) {
    const p = join(agentPath, f);
    if (!existsSync(p)) {
      continue;
    }
    const src = readFileSync(p, "utf8");
    for (const v of MODEL_CRED_VARS) {
      const m = new RegExp(`^\\s*${v}\\s*=\\s*(.+)$`, "m").exec(src);
      if (m && m[1].trim().replace(/^["']|["']$/g, "")) {
        hasCredential = true;
        break;
      }
    }
    if (hasCredential) {
      break;
    }
  }
  return { linked, hasCredential };
}

/**
 * Link the agent to Vercel and pull an AI Gateway credential — all non-interactively.
 * `vercel link --yes` creates/links a project under the default team; `env pull`
 * drops VERCEL_OIDC_TOKEN into .env.local so the model can run locally.
 */
export function vercelLink(agentPath: string): CmdResult {
  const link = run(agentPath, ["link", "--yes"]);
  const pull = run(agentPath, ["env", "pull", ".env.local", "--yes"]);
  return {
    ok: link.ok && pull.ok,
    output: `$ vercel link --yes\n${link.output}\n\n$ vercel env pull\n${pull.output}`,
  };
}

/** Latest production deployment for the linked project, from `vercel ls --prod`. */
export function vercelProdInfo(agentPath: string): ProdInfo {
  let project = "";
  try {
    project =
      (
        JSON.parse(
          readFileSync(join(agentPath, ".vercel", "project.json"), "utf8"),
        ) as { projectName?: string }
      ).projectName ?? "";
  } catch {
    // not linked
  }
  const r = run(agentPath, ["ls", "--prod"]);
  if (!r.ok && !r.output.includes("https://")) {
    return { ok: false, error: r.output };
  }
  for (const line of r.output.split("\n")) {
    if (!line.includes("https://")) {
      continue;
    }
    if (
      project &&
      !line.includes(`/${project} `) &&
      !line.includes(`/${project}\t`)
    ) {
      continue;
    }
    const url = (/https:\/\/\S+/.exec(line) ?? [""])[0];
    const age = (/^\s*(\S+)/.exec(line) ?? ["", ""])[1];
    return { ok: true, url, age, ready: /Ready|●/i.test(line) };
  }
  return { ok: true };
}

/** `vercel env add <NAME> <target>` with the value fed on stdin (non-interactive). */
export function vercelEnvAdd(
  agentPath: string,
  name: string,
  value: string,
  target: string,
): CmdResult {
  return run(agentPath, ["env", "add", name, target], `${value}\n`);
}

/** Idempotently set an env var for a target (remove any existing, then add). */
export function vercelEnvSet(
  agentPath: string,
  name: string,
  value: string,
  target: string,
): CmdResult {
  run(agentPath, ["env", "rm", name, target, "--yes"]); // ignore "not found"
  return run(agentPath, ["env", "add", name, target], `${value}\n`);
}

/** Set an env var across production/preview/development so it works everywhere. */
export function vercelEnvSetAll(
  agentPath: string,
  name: string,
  value: string,
): CmdResult {
  let ok = true;
  let output = "";
  for (const target of ["production", "preview", "development"]) {
    const r = vercelEnvSet(agentPath, name, value, target);
    ok = ok && r.ok;
    output += `[${target}] ${r.output}\n`;
  }
  return { ok, output };
}

// ---------------- Vercel Connect ----------------
/** List Connect connectors for the linked project (optionally by service). */
export function vercelConnectList(
  agentPath: string,
  service?: string,
): { ok: boolean; connectors: ConnectorItem[]; output?: string } {
  const args = [
    "connect",
    "list",
    "--format",
    "json",
    "--non-interactive",
    "--all-projects",
  ];
  if (service) {
    args.push("--service", service);
  }
  const r = run(agentPath, args);
  if (!r.ok) {
    return { ok: false, connectors: [], output: r.output };
  }
  // The CLI prints a banner to stderr; extract just the JSON object
  // (first "{" through the matching last "}") so trailing text can't break parse.
  const start = r.output.indexOf("{");
  const end = r.output.lastIndexOf("}");
  if (start < 0 || end < start) {
    return { ok: true, connectors: [] };
  }
  try {
    const parsed = JSON.parse(r.output.slice(start, end + 1)) as {
      connectors?: Array<Record<string, unknown>>;
    };
    const connectors = (parsed.connectors ?? []).map((c) => ({
      uid: String(c.uid ?? ""),
      id: String(c.id ?? ""),
      name: String(c.name ?? c.uid ?? ""),
      type: String(c.type ?? ""),
    }));
    return { ok: true, connectors };
  } catch {
    return { ok: true, connectors: [], output: r.output };
  }
}

/**
 * Create a Connect connector: `vercel connect create <type> --name <n> [--triggers]`.
 * Managed services (slack/github/linear) may return an authorize URL to complete
 * app installation in the browser.
 */
export function vercelConnectCreate(
  agentPath: string,
  type: string,
  name: string,
  triggers: boolean,
): CmdResult {
  const args = ["connect", "create", type, "--name", name, "--format", "json"];
  if (triggers) {
    args.push("--triggers");
  }
  return run(agentPath, args);
}

/** Attach the current project to a connector (with an eve trigger path for channels). */
export function vercelConnectAttach(
  agentPath: string,
  connector: string,
  triggerPath?: string,
): CmdResult {
  const args = ["connect", "attach", connector, "--yes"];
  if (triggerPath) {
    args.push("--triggers", "--trigger-path", triggerPath);
  }
  return run(agentPath, args);
}

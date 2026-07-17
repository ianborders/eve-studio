import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentStructure,
  DetectedBrain,
  WireBrainInput,
} from "../shared/ipc";

/** The `agent/` root inside a project (Eve projects nest their agent there). */
function agentRoot(agentPath: string): string {
  return existsSync(join(agentPath, "agent"))
    ? join(agentPath, "agent")
    : agentPath;
}

function connectionsDir(agentPath: string): string {
  return join(agentRoot(agentPath), "connections");
}

function envPath(agentPath: string): string {
  return join(agentPath, ".env");
}

/**
 * Read a single `KEY=value` from the agent's dotenv files (value may be quoted).
 *
 * @remarks
 * Checks `.env.local` before `.env`, the same order eve itself uses: an agent
 * linked to Vercel gets its keys from `vercel env pull`, which writes
 * `.env.local` and often leaves no `.env` at all. Reading only `.env` made the
 * brain credential resolve to null for those agents, which silently emptied the
 * Proposals inbox even though the notes were queued fine.
 */
function readEnvVar(agentPath: string, name: string): string | null {
  const key = name.replace(/[^A-Z0-9_]/gi, "");
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m");
  for (const file of [".env.local", envPath(agentPath)]) {
    const p = file.startsWith(".") ? join(agentPath, file) : file;
    if (!existsSync(p)) {
      continue;
    }
    const m = re.exec(readFileSync(p, "utf8"));
    const v = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (v) {
      return v;
    }
  }
  return null;
}

/**
 * Best-effort inspection of an agent's Arcana wiring from its files.
 *
 * @param agentPath - Project root.
 * @param structure - The agent's normalized structure (for its connections).
 * @returns Detected workspace/env-var/key-presence, plus the Arcana
 *   connections found in the manifest.
 */
export function detectBrain(
  agentPath: string,
  structure: AgentStructure,
): DetectedBrain {
  const connections = structure.connections
    .filter((c) => (c.url ?? "").toLowerCase().includes("arcana"))
    .map((c) => ({ name: c.name, url: c.url }));

  const { workspace, envVar } = brainFromConnection(agentPath);
  const keyPresent = envVar ? readEnvVar(agentPath, envVar) !== null : false;

  return { connections, workspace, envVar, keyPresent };
}

/**
 * Parse the agent's Arcana connection file for its workspace + key env var,
 * without needing the compiled structure. Used to resolve a brain credential
 * for the proposal queue.
 */
export function brainFromConnection(agentPath: string): {
  workspace?: string;
  envVar?: string;
} {
  const file = join(connectionsDir(agentPath), "arcana.ts");
  if (!existsSync(file)) {
    return {};
  }
  const src = readFileSync(file, "utf8");
  // A connection often reads several ARCANA_* vars — the kb_ key, but also a
  // workspace-slug override. Take the credential-shaped one, not just the first
  // match, or the proposal queue authenticates with the workspace slug and every
  // queue attempt silently fails.
  const candidates = [
    ...src.matchAll(/process\.env\.([A-Z0-9_]*ARCANA[A-Z0-9_]*)/g),
  ].map((m) => m[1]);
  const envVar =
    candidates.find((v) => /(KEY|TOKEN|SECRET)$/.test(v)) ??
    candidates.find((v) => !/(WORKSPACE|AGENT|SLUG|URL)$/.test(v)) ??
    candidates[0];
  const workspace =
    /X-Kyberagent-Agent["']?\s*[:=]\s*["']([a-z0-9-]+)["']/i.exec(src)?.[1] ??
    /arcanaWorkspace\s*=\s*(?:process\.env\.[A-Z0-9_]+\s*\?\?\s*)?["']([a-z0-9-]+)["']/i.exec(
      src,
    )?.[1];
  return { workspace, envVar };
}

/** Read the key from an agent's `.env` for a given env-var name. */
export function keyFromEnv(agentPath: string, envVar: string): string | null {
  return readEnvVar(agentPath, envVar);
}

function connectionSource(input: WireBrainInput): string {
  const description =
    input.description ||
    `Arcana long-term memory for the ${input.workspace} brain: recall past context and remember what happens.`;
  return `import { defineMcpClientConnection } from "eve/connections";

/**
 * Arcana long-term memory (MCP) for the "${input.workspace}" brain.
 *
 * @remarks
 * Static-key auth (\`${input.envVar}\`, a \`kb_\` key scoped to ${input.workspace}) sent as a
 * Bearer token — app-scoped, so it works in scheduled/proactive turns with no
 * signed-in user. The \`X-Kyberagent-Agent\` header pins the workspace. Wired by
 * Eve Studio.
 *
 * @see {@link https://api.arcana.kybernesis.ai | Arcana}
 */
const arcanaWorkspace = "${input.workspace}";

export default defineMcpClientConnection({
  url: "https://mcp.arcana.kybernesis.ai/mcp",
  description:
    ${JSON.stringify(description)},
  auth: {
    // biome-ignore lint/suspicious/useAwait: connection getToken must return a Promise per the auth type
    getToken: async () => {
      const token = process.env.${input.envVar};
      if (!token) {
        throw new Error(
          "${input.envVar} is not set — add the Arcana kb_ key for the ${input.workspace} workspace."
        );
      }
      return { token };
    },
  },
  headers: { "X-Kyberagent-Agent": arcanaWorkspace },
});
`;
}

/** Set or replace `NAME=value` in a dotenv file, creating it if absent. */
function upsertEnv(agentPath: string, name: string, value: string): void {
  const p = envPath(agentPath);
  const line = `${name}=${value}`;
  if (!existsSync(p)) {
    writeFileSync(p, `${line}\n`);
    return;
  }
  const src = readFileSync(p, "utf8");
  const re = new RegExp(`^\\s*${name}\\s*=.*$`, "m");
  if (re.test(src)) {
    writeFileSync(p, src.replace(re, line));
  } else {
    writeFileSync(p, `${src.replace(/\n?$/, "\n")}${line}\n`);
  }
}

/**
 * Attach an Arcana brain to an agent: write `connections/arcana.ts` and set the
 * key in `.env`.
 *
 * @returns The repo-relative paths that were written.
 */
export function wireBrain(
  agentPath: string,
  input: WireBrainInput,
): { files: string[] } {
  const dir = connectionsDir(agentPath);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "arcana.ts");
  writeFileSync(file, connectionSource(input));
  upsertEnv(agentPath, input.envVar, input.key);
  const rel = existsSync(join(agentPath, "agent"))
    ? "agent/connections/arcana.ts"
    : "connections/arcana.ts";
  return { files: [rel, ".env"] };
}

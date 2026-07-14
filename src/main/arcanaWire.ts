import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStructure, DetectedBrain, WireBrainInput } from "../shared/ipc";

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

/** Read a single `KEY=value` from a dotenv file (value may be quoted). */
function readEnvVar(agentPath: string, name: string): string | null {
  const p = envPath(agentPath);
  if (!existsSync(p)) {
    return null;
  }
  const re = new RegExp(`^\\s*${name.replace(/[^A-Z0-9_]/gi, "")}\\s*=\\s*(.*)$`, "m");
  const m = re.exec(readFileSync(p, "utf8"));
  if (!m) {
    return null;
  }
  return m[1].trim().replace(/^["']|["']$/g, "") || null;
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
  structure: AgentStructure
): DetectedBrain {
  const connections = structure.connections
    .filter((c) => (c.url ?? "").toLowerCase().includes("arcana"))
    .map((c) => ({ name: c.name, url: c.url }));

  let workspace: string | undefined;
  let envVar: string | undefined;

  const file = join(connectionsDir(agentPath), "arcana.ts");
  if (existsSync(file)) {
    const src = readFileSync(file, "utf8");
    envVar = /process\.env\.([A-Z0-9_]*ARCANA[A-Z0-9_]*|ARCANA[A-Z0-9_]*)/.exec(
      src
    )?.[1];
    workspace =
      /X-Kyberagent-Agent["']?\s*[:=]\s*["']([a-z0-9-]+)["']/i.exec(src)?.[1] ??
      /arcanaWorkspace\s*=\s*(?:process\.env\.[A-Z0-9_]+\s*\?\?\s*)?["']([a-z0-9-]+)["']/i.exec(
        src
      )?.[1];
  }

  const keyPresent = envVar
    ? readEnvVar(agentPath, envVar) !== null
    : false;

  return { connections, workspace, envVar, keyPresent };
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
  input: WireBrainInput
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

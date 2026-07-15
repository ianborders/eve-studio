import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ConnectionInput,
  ConnectorUsage,
  SkillInput,
} from "../shared/ipc";

/** The instructions.md path for an agent (nested `agent/` or flat). */
function instructionsPath(agentPath: string): string {
  const nested = join(agentPath, "agent", "instructions.md");
  if (existsSync(nested) || existsSync(join(agentPath, "agent"))) {
    return nested;
  }
  return join(agentPath, "instructions.md");
}

export interface InstructionsFile {
  path: string;
  relPath: string;
  content: string;
  exists: boolean;
}

/** Read an agent's system prompt (instructions.md). */
export function readInstructions(agentPath: string): InstructionsFile {
  const path = instructionsPath(agentPath);
  const exists = existsSync(path);
  const relPath = path.startsWith(agentPath)
    ? path.slice(agentPath.length + 1)
    : path;
  return {
    path,
    relPath,
    exists,
    content: exists ? readFileSync(path, "utf8") : "",
  };
}

/** Write an agent's system prompt. Returns the path written. */
export function writeInstructions(agentPath: string, content: string): string {
  const path = instructionsPath(agentPath);
  writeFileSync(path, content);
  return path;
}

/** The `agent/` root inside a project (Eve projects nest their agent there). */
function agentRoot(agentPath: string): string {
  return existsSync(join(agentPath, "agent"))
    ? join(agentPath, "agent")
    : agentPath;
}

const SLUG_RE = /[^a-z0-9-]/g;

/** Create a load-on-demand skill at `skills/<name>/SKILL.md`. */
export function createSkill(
  agentPath: string,
  input: SkillInput,
): { relPath: string } {
  const slug = input.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(SLUG_RE, "");
  if (!slug) {
    throw new Error("Invalid skill name.");
  }
  const dir = join(agentRoot(agentPath), "skills", slug);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  const body =
    input.body?.trim() ||
    `# ${input.name}\n\nDescribe how the agent should carry out this skill.`;
  const md = `---\ndescription: ${JSON.stringify(input.description)}\n---\n\n${body}\n`;
  writeFileSync(file, md);
  const nested = existsSync(join(agentPath, "agent"));
  return { relPath: `${nested ? "agent/" : ""}skills/${slug}/SKILL.md` };
}

/**
 * Add a connection at `connections/<name>.ts`. Supports MCP + OpenAPI, and
 * static-bearer / custom-header / Vercel-Connect (user or app) / no auth.
 */
export function addConnection(
  agentPath: string,
  input: ConnectionInput,
): { relPath: string; envVar?: string } {
  const slug = input.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(SLUG_RE, "");
  if (!slug) {
    throw new Error("Invalid connection name.");
  }
  const kind = input.kind ?? "mcp";
  const authMode = input.authMode ?? "static";
  const desc = JSON.stringify(input.description || `${input.name} connection`);
  const envVar =
    input.envVar?.trim() || `${slug.toUpperCase().replace(/-/g, "_")}_TOKEN`;

  const imports: string[] = [];
  const factory =
    kind === "openapi"
      ? "defineOpenAPIConnection"
      : "defineMcpClientConnection";
  imports.push(`import { ${factory} } from "eve/connections";`);
  if (authMode === "connect-user" || authMode === "connect-app") {
    imports.push(`import { connect } from "@vercel/connect/eve";`);
  }

  // endpoint block (mcp vs openapi)
  const endpoint =
    kind === "openapi"
      ? `  spec: ${JSON.stringify(input.spec ?? "")},${
          input.baseUrl ? `\n  baseUrl: ${JSON.stringify(input.baseUrl)},` : ""
        }`
      : `  url: ${JSON.stringify(input.url ?? "")},`;

  // auth / headers block
  let authBlock = "";
  let usedEnvVar: string | undefined;
  if (authMode === "static") {
    usedEnvVar = envVar;
    authBlock = `  auth: {
    // biome-ignore lint/suspicious/useAwait: connection getToken must return a Promise per the auth type
    getToken: async () => {
      const token = process.env.${envVar};
      if (!token) {
        throw new Error("${envVar} is not set.");
      }
      return { token };
    },
  },`;
  } else if (authMode === "header") {
    usedEnvVar = envVar;
    const headerName = input.headerName?.trim() || "X-Api-Key";
    authBlock = `  headers: { ${JSON.stringify(headerName)}: process.env.${envVar} ?? "" },`;
  } else if (authMode === "connect-user") {
    authBlock = `  auth: connect(${JSON.stringify(input.connector ?? "connector/uid")}),`;
  } else if (authMode === "connect-app") {
    authBlock = `  auth: connect({ connector: ${JSON.stringify(
      input.connector ?? "connector/uid",
    )}, principalType: "app" }),`;
  }

  const dir = join(agentRoot(agentPath), "connections");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}.ts`);
  if (existsSync(file)) {
    throw new Error(`connections/${slug}.ts already exists.`);
  }
  const src = `${imports.join("\n")}

/**
 * ${input.description || `${input.name} connection.`} Added by Eve Studio.
 */
export default ${factory}({
${endpoint}
  description: ${desc},${authBlock ? `\n${authBlock}` : ""}
});
`;
  writeFileSync(file, src);
  const nested = existsSync(join(agentPath, "agent"));
  return {
    relPath: `${nested ? "agent/" : ""}connections/${slug}.ts`,
    envVar: usedEnvVar,
  };
}

function connectionFile(agentPath: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "");
  return join(agentRoot(agentPath), "connections", `${safe}.ts`);
}

/** Read a connection file's source for viewing/editing. */
export function readConnectionFile(
  agentPath: string,
  name: string,
): { relPath: string; content: string; exists: boolean } {
  const file = connectionFile(agentPath, name);
  const exists = existsSync(file);
  const nested = existsSync(join(agentPath, "agent"));
  return {
    relPath: `${nested ? "agent/" : ""}connections/${name}.ts`,
    content: exists ? readFileSync(file, "utf8") : "",
    exists,
  };
}

/** Overwrite a connection file's source. */
export function writeConnectionFile(
  agentPath: string,
  name: string,
  content: string,
): void {
  const file = connectionFile(agentPath, name);
  if (!existsSync(file)) {
    throw new Error(`connections/${name}.ts does not exist.`);
  }
  writeFileSync(file, content);
}

/** Delete a connection file. */
export function deleteConnectionFile(agentPath: string, name: string): void {
  const file = connectionFile(agentPath, name);
  if (existsSync(file)) {
    rmSync(file);
  }
}

/**
 * Scan the agent's connection + channel files for references to the given
 * connector UIDs (matched as quoted string literals, so env-fallback forms like
 * `process.env.X ?? "slack/eve"` are caught), so the UI can show which
 * connectors are wired in and how.
 */
export function scanConnectorUsage(
  agentPath: string,
  uids: string[],
): ConnectorUsage[] {
  const root = agentRoot(agentPath);
  const wanted = uids.filter(Boolean);
  const out: ConnectorUsage[] = [];

  const scan = (dir: string, kind: "connection" | "channel"): void => {
    if (!existsSync(dir)) {
      return;
    }
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts")) {
        continue;
      }
      const src = readFileSync(join(dir, f), "utf8");
      for (const uid of wanted) {
        if (src.includes(`"${uid}"`) || src.includes(`'${uid}'`)) {
          out.push({ uid, kind, name: f.replace(/\.ts$/, "") });
        }
      }
    }
  };
  scan(join(root, "connections"), "connection");
  scan(join(root, "channels"), "channel");
  return out;
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionInput, SkillInput } from "../shared/ipc";

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
  input: SkillInput
): { relPath: string } {
  const slug = input.name.trim().toLowerCase().replace(/\s+/g, "-").replace(SLUG_RE, "");
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

/** Add a generic MCP connection at `connections/<name>.ts` (bearer-token env). */
export function addConnection(
  agentPath: string,
  input: ConnectionInput
): { relPath: string } {
  const slug = input.name.trim().toLowerCase().replace(/\s+/g, "-").replace(SLUG_RE, "");
  if (!slug) {
    throw new Error("Invalid connection name.");
  }
  const envVar =
    input.envVar?.trim() ||
    `${slug.toUpperCase().replace(/-/g, "_")}_TOKEN`;
  const dir = join(agentRoot(agentPath), "connections");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}.ts`);
  const src = `import { defineMcpClientConnection } from "eve/connections";

/**
 * ${input.description || `${input.name} MCP connection.`}
 *
 * @remarks
 * Static bearer-token auth from \`${envVar}\`. Added by Eve Studio.
 */
export default defineMcpClientConnection({
  url: ${JSON.stringify(input.url)},
  description: ${JSON.stringify(input.description || `${input.name} connection`)},
  auth: {
    // biome-ignore lint/suspicious/useAwait: connection getToken must return a Promise per the auth type
    getToken: async () => {
      const token = process.env.${envVar};
      if (!token) {
        throw new Error("${envVar} is not set.");
      }
      return { token };
    },
  },
});
`;
  writeFileSync(file, src);
  const nested = existsSync(join(agentPath, "agent"));
  return { relPath: `${nested ? "agent/" : ""}connections/${slug}.ts` };
}

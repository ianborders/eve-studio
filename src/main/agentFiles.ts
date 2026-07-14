import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

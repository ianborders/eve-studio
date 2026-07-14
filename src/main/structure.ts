import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStructure } from "../shared/ipc";

const EMPTY = {
  tools: [] as never[],
  connections: [] as never[],
  skills: [] as never[],
  channels: [] as never[],
  schedules: [] as never[],
  subagents: [] as never[],
  remoteAgents: [] as never[],
  hooks: [] as string[],
};

function empty(source: AgentStructure["source"], error?: string): AgentStructure {
  return {
    source,
    model: null,
    ...EMPTY,
    sandbox: null,
    diagnostics: { errors: 0, warnings: 0 },
    ...(error ? { error } : {}),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: manifest is external JSON
function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Normalize the compiled-agent-manifest.json produced by `eve build`/`eve dev`.
 *
 * @remarks
 * Shapes verified against Eve 0.23's compiled manifest: `config.model.id`,
 * `tools[].{name,description}`, `connections[].{connectionName,protocol,url}`,
 * `skills[].{logicalPath,description}` (skill id derived from the folder),
 * `channels[].{name,method,urlPath,adapterKind}`, `schedules[].{name,cron}`,
 * `subagents[].{name,description}`, `sandbox.backendName`, `diagnosticsSummary`.
 */
// biome-ignore lint/suspicious/noExplicitAny: manifest is external JSON
function normalizeCompiled(m: any): AgentStructure {
  return {
    source: "compiled",
    model: m?.config?.model?.id ?? null,
    displayName: m?.config?.name ?? null,
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    tools: arr(m.tools).map((t: any) => ({
      name: t.name,
      description: t.description,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    connections: arr(m.connections).map((c: any) => ({
      name: c.connectionName ?? c.name,
      protocol: c.protocol,
      url: c.url,
      description: c.description,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    skills: arr(m.skills).map((s: any) => ({
      name:
        s.name ??
        s.skillId ??
        String(s.logicalPath ?? "")
          .replace(/^skills\//, "")
          .replace(/\/SKILL\.md$/i, ""),
      description: s.description,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    channels: arr(m.channels).map((c: any) => ({
      name: c.name,
      method: c.method,
      urlPath: c.urlPath,
      kind: c.adapterKind ?? c.kind,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    schedules: arr(m.schedules).map((s: any) => ({
      name: s.name,
      cron: s.cron,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    subagents: arr(m.subagents).map((s: any) => ({
      name: s.name ?? s?.agent?.config?.name,
      description: s.description ?? s?.agent?.config?.description,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    remoteAgents: arr(m.remoteAgents).map((r: any) => ({
      name: r.name ?? r.remoteAgentName,
      url: r.url,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: manifest entry
    hooks: arr(m.hooks).map((h: any) => h.name ?? h.logicalPath ?? "hook"),
    sandbox: m?.sandbox?.backendName ?? null,
    diagnostics: {
      errors: m?.diagnosticsSummary?.errors ?? 0,
      warnings: m?.diagnosticsSummary?.warnings ?? 0,
    },
  };
}

function readCompiledFile(path: string): AgentStructure | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return normalizeCompiled(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Read an agent's structure from its compiled manifest, building it first via
 * `eve build` when no compiled artifact exists yet.
 *
 * @param agentPath - The agent project's root directory.
 * @returns A normalized {@link AgentStructure}; `source: "none"` with an
 *   `error` when the manifest can't be produced.
 */
export function readStructure(agentPath: string): AgentStructure {
  const compiledPath = join(
    agentPath,
    ".eve",
    "compile",
    "compiled-agent-manifest.json"
  );

  const existing = readCompiledFile(compiledPath);
  if (existing) {
    return existing;
  }

  // No compiled artifact yet — build once, then read.
  const bin = join(agentPath, "node_modules", ".bin", "eve");
  const useLocal = existsSync(bin);
  try {
    spawnSync(useLocal ? bin : "npx", useLocal ? ["build"] : ["eve", "build"], {
      cwd: agentPath,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
  } catch {
    // fall through to the read attempt / error below
  }

  const built = readCompiledFile(compiledPath);
  if (built) {
    return built;
  }
  return empty(
    "none",
    "No compiled manifest. Start the agent (or run `eve build` in its folder) to inspect its structure."
  );
}

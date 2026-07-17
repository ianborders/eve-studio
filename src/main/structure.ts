import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStructure } from "../shared/ipc";
import { eveBin } from "./cli";

function agentRootOf(agentPath: string): string {
  return existsSync(join(agentPath, "agent"))
    ? join(agentPath, "agent")
    : agentPath;
}

/** Names in a capability dir — `.ts` files (stripped) or subdirectories. */
function listDir(dir: string, mode: "ts" | "dirs"): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) =>
        mode === "dirs"
          ? e.isDirectory()
          : e.isFile() && e.name.endsWith(".ts"),
      )
      .map((e) => (mode === "dirs" ? e.name : e.name.slice(0, -3)));
  } catch {
    return [];
  }
}

/**
 * Merge capabilities authored on disk that the compiled manifest misses.
 *
 * @remarks
 * `readStructure` reads `.eve/compile`'s manifest, which only `eve build`
 * regenerates — `eve dev` does not. So a freshly authored schedule/tool/skill
 * (e.g. from Evolve) is invisible until the next build. Folding in the source
 * files keeps counts and lists honest immediately, without a slow rebuild.
 */
function mergeAuthored(
  agentPath: string,
  base: AgentStructure,
): AgentStructure {
  const root = agentRootOf(agentPath);
  const named = (
    arr: { name: string }[],
    names: string[],
  ): { name: string }[] => {
    const out = [...arr];
    for (const n of names) {
      if (!out.some((x) => x.name === n)) {
        out.push({ name: n });
      }
    }
    return out;
  };
  const hooks = [...base.hooks];
  for (const n of listDir(join(root, "hooks"), "ts")) {
    if (!hooks.includes(n)) {
      hooks.push(n);
    }
  }
  return {
    ...base,
    schedules: named(base.schedules, listDir(join(root, "schedules"), "ts")),
    tools: named(base.tools, listDir(join(root, "tools"), "ts")),
    skills: named(base.skills, listDir(join(root, "skills"), "dirs")),
    subagents: named(base.subagents, listDir(join(root, "subagents"), "dirs")),
    hooks,
  };
}

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

function empty(
  source: AgentStructure["source"],
  error?: string,
): AgentStructure {
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

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
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
    // Dedupe: the manifest lists the default eve channel once per route.
    channels: dedupeBy(
      // biome-ignore lint/suspicious/noExplicitAny: manifest entry
      arr(m.channels).map((c: any) => ({
        name: c.name,
        method: c.method,
        urlPath: c.urlPath,
        kind: c.adapterKind ?? c.kind,
      })),
      (c) => `${c.name}:${c.kind}`,
    ),
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
    hooks: arr(m.hooks).map(
      // biome-ignore lint/suspicious/noExplicitAny: manifest entry
      (h: any) =>
        h.name ??
        h.slug ??
        String(h.logicalPath ?? "hook")
          .replace(/^hooks\//, "")
          .replace(/\.tsx?$/, ""),
    ),
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
    "compiled-agent-manifest.json",
  );

  const existing = readCompiledFile(compiledPath);
  if (existing) {
    return mergeAuthored(agentPath, existing);
  }

  // No compiled artifact yet — build once, then read. Go through eveBin: a bare
  // `npx eve` can hang on npx's install prompt or resolve an unrelated eve@0.5.4.
  const { cmd, pre } = eveBin(agentPath);
  try {
    spawnSync(cmd, [...pre, "build"], {
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
    return mergeAuthored(agentPath, built);
  }
  return mergeAuthored(
    agentPath,
    empty(
      "none",
      "No compiled manifest. Start the agent (or run `eve build` in its folder) to inspect its structure.",
    ),
  );
}

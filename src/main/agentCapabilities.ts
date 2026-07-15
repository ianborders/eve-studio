import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type {
  CapabilityFile,
  CapabilityFilesResult,
  CapabilityKind,
} from "../shared/ipc";

function agentRoot(agentPath: string): string {
  return existsSync(join(agentPath, "agent"))
    ? join(agentPath, "agent")
    : agentPath;
}
function relRoot(agentPath: string): string {
  return existsSync(join(agentPath, "agent")) ? "agent/" : "";
}

/** Directory each capability kind lives under, relative to the agent root. */
const KIND_DIR: Record<CapabilityKind, string> = {
  tool: "tools",
  skill: "skills",
  subagent: "subagents",
  hook: "hooks",
  schedule: "schedules",
};

function langOf(path: string): CapabilityFile["language"] {
  if (path.endsWith(".md")) {
    return "md";
  }
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    return "ts";
  }
  return "text";
}

/** Recursively find the first path whose basename (sans .ts) matches, or a dir named `name`. */
function findUnder(
  dir: string,
  wantName: string,
  wantDir: boolean,
  depth = 0,
): string | null {
  if (depth > 6 || !existsSync(dir)) {
    return null;
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e === "node_modules" || e.startsWith(".")) {
      continue;
    }
    const full = join(dir, e);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (wantDir && isDir && e === wantName) {
      return full;
    }
    if (
      !wantDir &&
      !isDir &&
      (e === `${wantName}.ts` || e === `${wantName}.tsx`)
    ) {
      return full;
    }
  }
  for (const e of entries) {
    if (e === "node_modules" || e.startsWith(".")) {
      continue;
    }
    const full = join(dir, e);
    try {
      if (statSync(full).isDirectory()) {
        const hit = findUnder(full, wantName, wantDir, depth + 1);
        if (hit) {
          return hit;
        }
      }
    } catch {
      // unreadable — skip
    }
  }
  return null;
}

/** Resolve the on-disk location of a capability (file for tool/hook/schedule, dir for skill/subagent). */
function locate(
  agentPath: string,
  kind: CapabilityKind,
  name: string,
): { path: string | null; isDir: boolean } {
  const root = agentRoot(agentPath);
  const isDir = kind === "skill" || kind === "subagent";
  // Accept either a bare name/slug or a logicalPath like "hooks/intake-audit.ts".
  const clean = name
    .replace(new RegExp(`^${KIND_DIR[kind]}/`), "")
    .replace(/\.tsx?$/, "");
  // Convention first (also handles subpath hook names like "auth/load-profile").
  const conventional = isDir
    ? join(root, KIND_DIR[kind], clean)
    : join(root, KIND_DIR[kind], `${clean}.ts`);
  if (existsSync(conventional)) {
    return { path: conventional, isDir };
  }
  // Fallback: search (covers subagent-owned/nested capabilities).
  const base = clean.includes("/") ? (clean.split("/").pop() ?? clean) : clean;
  return { path: findUnder(root, base, isDir), isDir };
}

function rel(agentPath: string, abs: string): string {
  return (
    relRoot(agentPath) +
    relative(agentRoot(agentPath), abs).split(sep).join("/")
  );
}

/** The editable source files for a capability. */
export function capabilityFiles(
  agentPath: string,
  kind: CapabilityKind,
  name: string,
): CapabilityFilesResult {
  const { path, isDir } = locate(agentPath, kind, name);
  const empty: CapabilityFilesResult = {
    kind,
    name,
    files: [],
    otherPaths: [],
    missing: true,
  };
  if (!path || !existsSync(path)) {
    return empty;
  }

  const read = (abs: string): CapabilityFile => ({
    relPath: rel(agentPath, abs),
    content: readFileSync(abs, "utf8"),
    language: langOf(abs),
  });

  if (!isDir) {
    return { kind, name, files: [read(path)], otherPaths: [], missing: false };
  }

  const files: CapabilityFile[] = [];
  const otherPaths: string[] = [];
  const collect = (dir: string, base = ""): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      let isSub = false;
      try {
        isSub = statSync(full).isDirectory();
      } catch {
        // dangling symlink / unreadable entry — skip it rather than throw
        continue;
      }
      if (isSub) {
        collect(full, `${base}${e}/`);
        continue;
      }
      const primary =
        (kind === "skill" && e === "SKILL.md") ||
        (kind === "subagent" && (e === "agent.ts" || e === "instructions.md"));
      if (primary) {
        try {
          files.push(read(full));
        } catch {
          // couldn't read the file — surface it as an "also includes" path
          otherPaths.push(rel(agentPath, full));
        }
      } else {
        otherPaths.push(rel(agentPath, full));
      }
    }
  };
  collect(path);
  // Keep primary files in a stable, sensible order.
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { kind, name, files, otherPaths, missing: false };
}

/** Guard: the resolved target must stay inside the agent directory. */
function safeJoin(agentPath: string, relPath: string): string {
  const abs = resolve(agentPath, relPath);
  const rootAbs = resolve(agentPath);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("Refusing to write outside the agent directory.");
  }
  return abs;
}

const CAP_DIRS = new Set(Object.values(KIND_DIR));

/** Overwrite one of a capability's source files. */
export function writeCapabilityFile(
  agentPath: string,
  relPath: string,
  content: string,
): { relPath: string } {
  const abs = safeJoin(agentPath, relPath);
  // Defense-in-depth: only ever write files that live under a capability dir,
  // never arbitrary agent files (package.json, .env, agent.ts at the root, …).
  const seg = relative(resolve(agentRoot(agentPath)), abs).split(sep)[0];
  if (!CAP_DIRS.has(seg)) {
    throw new Error("Refusing to write a file outside a capability directory.");
  }
  if (!existsSync(abs)) {
    throw new Error(`${relPath} does not exist.`);
  }
  writeFileSync(abs, content);
  return { relPath };
}

/** Delete a capability — a single file, or the whole directory for skills/subagents. */
export function deleteCapability(
  agentPath: string,
  kind: CapabilityKind,
  name: string,
): { relPath: string } {
  const { path } = locate(agentPath, kind, name);
  if (!path || !existsSync(path)) {
    throw new Error(`${kind} "${name}" not found.`);
  }
  const rootAbs = resolve(agentPath);
  const abs = resolve(path);
  if (!abs.startsWith(rootAbs + sep)) {
    throw new Error("Refusing to delete outside the agent directory.");
  }
  rmSync(abs, { recursive: true, force: true });
  return { relPath: rel(agentPath, abs) };
}

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type {
  EvolveApplyResult,
  EvolveDetectResult,
  EvolveDraftResult,
  EvolveProposal,
  EvolveSuggestion,
  ProposalFileChange,
  ProposalKind,
} from "../shared/ipc";
import { agentRoot, nested, readModelConfig } from "./agentAuthoring";
import { readInstructions, writeInstructions } from "./agentFiles";
import { arcanaRemember, arcanaTimeline } from "./arcana";
import { vercelEnvPull } from "./vercel";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-opus-4.8";
const KINDS: readonly ProposalKind[] = [
  "memory",
  "instructions",
  "skill",
  "tool",
  "schedule",
];

/** Read a var from the agent's .env.local (falling back to .env). */
function readEnv(agentPath: string, key: string): string | null {
  for (const f of [".env.local", ".env"]) {
    try {
      const src = readFileSync(join(agentPath, f), "utf8");
      const m = new RegExp(`^${key}=(.*)$`, "m").exec(src);
      const v = m?.[1]?.trim().replace(/^["']|["']$/g, "");
      if (v) {
        return v;
      }
    } catch {
      // no such file — try the next
    }
  }
  return null;
}

/** The gateway credential Eve itself uses locally: OIDC token or a static key. */
function credential(agentPath: string): string | null {
  return (
    readEnv(agentPath, "AI_GATEWAY_API_KEY") ??
    readEnv(agentPath, "VERCEL_OIDC_TOKEN")
  );
}

interface GatewayReply {
  ok: boolean;
  content?: string;
  error?: string;
}

async function post(
  model: string,
  system: string,
  user: string,
  token: string,
): Promise<{ status: number; body: string }> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  return { status: res.status, body: await res.text() };
}

/**
 * Call the Vercel AI Gateway with the agent's own linked credential.
 *
 * @remarks
 * `VERCEL_OIDC_TOKEN` is short-lived (~12h). On a 401 we refresh it once via
 * `vercel env pull` — the same mechanism Eve relies on locally — then retry.
 */
async function callGateway(
  agentPath: string,
  model: string,
  system: string,
  user: string,
): Promise<GatewayReply> {
  let token = credential(agentPath);
  if (!token) {
    return {
      ok: false,
      error:
        "No AI Gateway credential found. Link the agent to Vercel (Deploy tab) so it can author changes with its own model.",
    };
  }
  let res: { status: number; body: string };
  try {
    res = await post(model, system, user, token);
  } catch (e) {
    return {
      ok: false,
      error: `Gateway request failed: ${(e as Error).message}`,
    };
  }
  if (res.status === 401) {
    // Stale OIDC token — refresh from the linked project and retry once.
    vercelEnvPull(agentPath);
    token = credential(agentPath) ?? token;
    try {
      res = await post(model, system, user, token);
    } catch (e) {
      return {
        ok: false,
        error: `Gateway request failed: ${(e as Error).message}`,
      };
    }
  }
  if (res.status !== 200) {
    return {
      ok: false,
      error: `Gateway returned ${res.status}: ${res.body.slice(0, 300)}`,
    };
  }
  try {
    const json = JSON.parse(res.body);
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return { ok: false, error: "Gateway returned no message content." };
    }
    return { ok: true, content };
  } catch {
    return { ok: false, error: "Could not parse the gateway response." };
  }
}

/** Extract the first balanced top-level JSON object from a model reply. */
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** List the names of an agent's existing capabilities, for context + collisions. */
function inventory(agentPath: string): {
  tools: string[];
  skills: string[];
  schedules: string[];
  channels: string[];
} {
  const root = agentRoot(agentPath);
  const dir = (name: string, ext?: string): string[] => {
    try {
      return readdirSync(join(root, name))
        .filter((e) => (ext ? e.endsWith(ext) : true))
        .map((e) => (ext ? e.slice(0, -ext.length) : e));
    } catch {
      return [];
    }
  };
  return {
    tools: dir("tools", ".ts"),
    skills: dir("skills"),
    schedules: dir("schedules", ".ts"),
    channels: dir("channels", ".ts"),
  };
}

/**
 * Env var NAMES (never values) that likely name a message target or connector —
 * so the model wires a schedule to the right channel-id var instead of guessing.
 */
function targetEnvNames(agentPath: string): string[] {
  const names = new Set<string>();
  const re = /SLACK|DISCORD|TELEGRAM|TWILIO|CHANNEL|WEBHOOK|CONNECTOR/;
  for (const f of [".env", ".env.local"]) {
    try {
      const src = readFileSync(join(agentPath, f), "utf8");
      for (const m of src.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) {
        if (re.test(m[1])) {
          names.add(m[1]);
        }
      }
    } catch {
      // no such file
    }
  }
  return [...names];
}

const SYSTEM = `You are the authoring engine inside Eve Studio. You turn a plain-English request to change an Eve agent into ONE concrete, minimal file change, following Eve's filesystem conventions exactly. Eve discovers capabilities from the filesystem — identity comes from the file path, never a name field.

Route the request to exactly one kind:
- "memory": a durable FACT about the user (preferences, context). Belongs in the agent's brain, not its code. Return no files.
- "instructions": a stable change to BEHAVIOR, policy, or persona. Patch instructions.md.
- "skill": a reusable procedure or body of knowledge. Create <prefix>skills/<slug>/SKILL.md with YAML frontmatter (name, description) then the guidance body. The description is the routing hint.
- "tool": a typed action the agent calls. Create <prefix>tools/<snake_name>.ts using defineTool from "eve/tools" and a zod inputSchema. Relative imports need a .js extension.
- "schedule": recurring proactive work (a cron that wakes the agent). Create <prefix>schedules/<slug>.ts using defineSchedule from "eve/schedules".

Cron & time zones:
- Cron is a 5-field spec evaluated in UTC on Vercel. If the user gives a local time, convert it to UTC and state both the local time (with zone) and the UTC cron in the TSDoc.

Messaging a provider (Slack/Discord/etc.) from a schedule:
- To DM or post, the agent uses an existing CHANNEL — it does NOT need an MCP connection for this. If a channel for the provider is in "Existing channels", REUSE it; never propose a connection, and do not flag it as a prereq.
- Slack pattern — import the channel and post inside run():
    import { defineSchedule } from "eve/schedules";
    import slack from "../channels/slack.js";
    export default defineSchedule({
      cron: "0 2 * * 5",
      run({ receive, waitUntil, appAuth }) {
        const channelId = process.env.SLACK_NUDGE_CHANNEL;
        if (!channelId) return;
        waitUntil(receive(slack, { message: "…instruction to the agent…", target: { channelId }, auth: appAuth }));
      },
    });
  The channel import path is relative to the schedules dir ("../channels/<name>.js", keep the .js). "message" is an instruction to the agent, not the literal text to send.
- If NO channel for the provider exists, still produce the schedule, but add a prereq: "Add a <provider> channel in Integrations (a channel, not an MCP connection)."

Rules:
- Prefer "memory" for facts and "instructions" only for behavior.
- For "instructions", return the COMPLETE new instructions.md content in files[0].content (the current content is provided; make the smallest sensible edit).
- Produce COMPLETE, valid file content — never stubs or TODOs.
- Every file relPath MUST start with the given path prefix.
- Reply with ONLY a JSON object, no prose, no code fences:
{"kind","title","rationale","prereqs":[],"memory":"(only for memory)","files":[{"relPath","content"}]}`;

function langOf(relPath: string): ProposalFileChange["language"] {
  if (relPath.endsWith(".ts")) {
    return "ts";
  }
  if (relPath.endsWith(".md")) {
    return "md";
  }
  return "text";
}

/** Draft a self-change proposal from a natural-language intent. */
export async function draftProposal(
  agentPath: string,
  intent: string,
): Promise<EvolveDraftResult> {
  const trimmed = intent.trim();
  if (!trimmed) {
    return { ok: false, error: "Describe the change you want first." };
  }
  const model = readModelConfig(agentPath).model || DEFAULT_MODEL;
  const prefix = nested(agentPath);
  const inv = inventory(agentPath);
  const instructions = readInstructions(agentPath).content;
  const user = `Path prefix for every relPath: ${JSON.stringify(prefix)}
Existing tools: ${inv.tools.join(", ") || "(none)"}
Existing skills: ${inv.skills.join(", ") || "(none)"}
Existing schedules: ${inv.schedules.join(", ") || "(none)"}
Existing channels: ${inv.channels.join(", ") || "(none)"}
Relevant env vars (names only, for message targets): ${targetEnvNames(agentPath).join(", ") || "(none)"}

Current instructions.md:
"""
${instructions.slice(0, 6000)}
"""

Change request: ${trimmed}`;

  const reply = await callGateway(agentPath, model, SYSTEM, user);
  if (!reply.ok || !reply.content) {
    return { ok: false, error: reply.error ?? "Authoring failed." };
  }
  const raw = extractJson(reply.content);
  if (!raw) {
    return { ok: false, error: "The model did not return a usable proposal." };
  }
  let parsed: {
    kind?: string;
    title?: string;
    rationale?: string;
    prereqs?: unknown;
    memory?: string;
    files?: { relPath?: string; content?: string }[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The model returned malformed JSON." };
  }
  const kind = KINDS.includes(parsed.kind as ProposalKind)
    ? (parsed.kind as ProposalKind)
    : "instructions";

  const files: ProposalFileChange[] = [];
  for (const f of parsed.files ?? []) {
    if (!(f?.relPath && typeof f.content === "string")) {
      continue;
    }
    try {
      assertWritable(agentPath, f.relPath);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    const abs = resolve(agentPath, f.relPath);
    const before = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    files.push({
      relPath: f.relPath,
      language: langOf(f.relPath),
      before,
      after: f.content,
    });
  }

  if (kind !== "memory" && files.length === 0) {
    return { ok: false, error: "The proposal produced no file changes." };
  }

  const proposal: EvolveProposal = {
    kind,
    title: parsed.title?.trim() || "Proposed change",
    rationale: parsed.rationale?.trim() || "",
    files,
    memory: kind === "memory" ? parsed.memory?.trim() : undefined,
    prereqs: Array.isArray(parsed.prereqs)
      ? parsed.prereqs.filter((p): p is string => typeof p === "string")
      : [],
    needsRebuild: kind !== "memory",
  };
  return { ok: true, proposal };
}

const DETECT_SYSTEM = `You analyze an Eve agent's recent activity to find recurring work worth turning into a reusable capability. Eve capabilities: a skill (a repeatable procedure/knowledge), a tool (a typed action), or a schedule (recurring proactive work).

Find at most 3 patterns that recur often enough to be worth automating. Be strict — a one-off is not a pattern. Skip anything already covered by the agent's existing capabilities.

For each, return:
- "title": short label
- "rationale": what recurs and why a capability helps (reference the evidence)
- "kind": "skill" | "tool" | "schedule"
- "intent": a concrete, first-person instruction that could create it, phrased like the user asking for it (e.g. "Create a skill that drafts a weekly investor update from my notes.")

Reply with ONLY a JSON object: {"suggestions":[{"title","rationale","kind","intent"}]}. Return {"suggestions":[]} if nothing clearly recurs.`;

/**
 * Emergent detection: scan recent chat + memory activity for recurring tasks
 * that would be better as a skill, tool, or schedule.
 */
export async function detectPatterns(
  agentPath: string,
  threadTitles: string[],
  brain?: { workspace: string; key: string } | null,
): Promise<EvolveDetectResult> {
  const model = readModelConfig(agentPath).model || DEFAULT_MODEL;
  const inv = inventory(agentPath);

  let timeline: string[] = [];
  if (brain) {
    const t = await arcanaTimeline(brain.workspace, brain.key, 40);
    if (t.ok && t.data) {
      timeline = t.data.map((e) => e.title).filter(Boolean);
    }
  }

  if (threadTitles.length === 0 && timeline.length === 0) {
    return {
      ok: false,
      suggestions: [],
      error:
        "Not enough activity yet. Chat with the agent (or connect its brain) so Studio has patterns to learn from.",
    };
  }

  const user = `Existing skills: ${inv.skills.join(", ") || "(none)"}
Existing tools: ${inv.tools.join(", ") || "(none)"}
Existing schedules: ${inv.schedules.join(", ") || "(none)"}

Recent conversation topics (newest first):
${
  threadTitles
    .slice(0, 30)
    .map((t) => `- ${t}`)
    .join("\n") || "(none)"
}

Recent things the agent did (from memory, newest first):
${
  timeline
    .slice(0, 40)
    .map((t) => `- ${t}`)
    .join("\n") || "(none)"
}`;

  const reply = await callGateway(agentPath, model, DETECT_SYSTEM, user);
  if (!reply.ok || !reply.content) {
    return { ok: false, suggestions: [], error: reply.error ?? "Scan failed." };
  }
  const raw = extractJson(reply.content);
  if (!raw) {
    return {
      ok: false,
      suggestions: [],
      error: "The model returned no usable result.",
    };
  }
  let parsed: { suggestions?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      suggestions: [],
      error: "The model returned malformed JSON.",
    };
  }
  const kinds = new Set(["skill", "tool", "schedule"]);
  const suggestions: EvolveSuggestion[] = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter(
          (s): s is EvolveSuggestion =>
            Boolean(s) &&
            typeof (s as EvolveSuggestion).intent === "string" &&
            typeof (s as EvolveSuggestion).title === "string" &&
            kinds.has((s as EvolveSuggestion).kind),
        )
        .slice(0, 3)
    : [];
  return { ok: true, suggestions };
}

/**
 * Guard: a proposal may only write instructions.md or files under the
 * tools/skills/schedules capability dirs — never agent.ts, .env, or package.json.
 */
function assertWritable(agentPath: string, relPath: string): void {
  const abs = resolve(agentPath, relPath);
  const rootAbs = resolve(agentPath);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error(`Refusing to write outside the agent: ${relPath}`);
  }
  const fromRoot = abs.slice(resolve(agentRoot(agentPath)).length + 1);
  const seg = fromRoot.split(sep)[0];
  const ok =
    fromRoot === "instructions.md" ||
    seg === "skills" ||
    seg === "tools" ||
    seg === "schedules";
  if (!ok) {
    throw new Error(`Refusing to write a protected path: ${relPath}`);
  }
}

/** Best-effort: commit the written files so the change has a revert point. */
function commit(agentPath: string, paths: string[], title: string): boolean {
  const inRepo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: agentPath,
    encoding: "utf8",
  });
  if (inRepo.status !== 0 || inRepo.stdout.trim() !== "true") {
    return false;
  }
  const add = spawnSync("git", ["add", "--", ...paths], {
    cwd: agentPath,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    return false;
  }
  const msg = `studio: ${title}`;
  const done = spawnSync(
    "git",
    ["commit", "--no-verify", "-m", msg, "--", ...paths],
    { cwd: agentPath, encoding: "utf8" },
  );
  return done.status === 0;
}

/** A resolved Arcana brain credential for memory writes. */
export interface BrainCred {
  workspace: string;
  key: string;
}

/** Apply an approved proposal: write the files (or remember the fact), then commit. */
export async function applyProposal(
  agentPath: string,
  proposal: EvolveProposal,
  brain?: BrainCred | null,
): Promise<EvolveApplyResult> {
  if (proposal.kind === "memory") {
    const text = proposal.memory?.trim();
    if (!text) {
      return {
        ok: false,
        written: [],
        committed: false,
        needsRebuild: false,
        error: "No fact to remember.",
      };
    }
    if (!brain) {
      return {
        ok: true,
        written: [],
        committed: false,
        needsRebuild: false,
        note: "This is a fact for the agent's memory, but no brain is configured. Set one up in the Memory tab, then try again.",
      };
    }
    const r = await arcanaRemember(brain.workspace, brain.key, text);
    return {
      ok: r.ok,
      written: [],
      committed: false,
      needsRebuild: false,
      note: r.ok
        ? `Remembered — added to the “${brain.workspace}” brain.`
        : undefined,
      error: r.ok ? undefined : r.error,
    };
  }
  const written: string[] = [];
  try {
    for (const f of proposal.files) {
      assertWritable(agentPath, f.relPath);
      const abs = resolve(agentPath, f.relPath);
      const fromRoot = abs.slice(resolve(agentRoot(agentPath)).length + 1);
      if (fromRoot === "instructions.md") {
        writeInstructions(agentPath, f.after);
      } else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, f.after);
      }
      written.push(f.relPath);
    }
  } catch (e) {
    return {
      ok: false,
      written,
      committed: false,
      needsRebuild: proposal.needsRebuild,
      error: (e as Error).message,
    };
  }
  const committed = commit(agentPath, written, proposal.title);
  return {
    ok: true,
    written,
    committed,
    needsRebuild: proposal.needsRebuild,
  };
}

// ---------------- agent-initiated proposals (opt-in tool) ----------------

/** The Studio-managed tool the agent calls to propose a change to itself. */
export const PROPOSE_TOOL = "propose_change";

function proposeToolFile(agentPath: string): string {
  return join(agentRoot(agentPath), "tools", `${PROPOSE_TOOL}.ts`);
}

const PROPOSE_TOOL_SOURCE = `import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * propose_change — let the agent ask to change itself. Managed by Eve Studio.
 *
 * @remarks
 * The agent cannot edit its own files. When the user asks it to change how it
 * works or what it knows, it calls this tool; Eve Studio catches the call and
 * shows the user a diff to approve. Do not hand-edit — toggle it from Studio's
 * Evolve tab.
 */
export default defineTool({
  description:
    "Propose a change to yourself — a new skill, tool, or schedule, an edit to your instructions, or a fact to remember — when the user asks you to change how you work or what you know. You cannot edit your own files; the operator approves a diff in Eve Studio. Call this instead of claiming you already changed yourself.",
  inputSchema: z.object({
    kind: z
      .enum(["skill", "tool", "schedule", "instructions", "memory"])
      .describe("What kind of change this is."),
    title: z.string().describe("A short label for the change."),
    intent: z
      .string()
      .describe(
        "A concrete, first-person instruction describing exactly what to create or change, phrased as the user would ask for it."
      ),
  }),
  // biome-ignore lint/suspicious/useAwait: the operator applies the change in Studio; no async work here
  async execute({ title }) {
    return {
      status: "pending_approval",
      message: \`Proposed “\${title}”. It’s waiting for the user to approve it in Eve Studio.\`,
    };
  },
});
`;

/** Whether the opt-in propose_change tool is installed in the agent. */
export function getProposeTool(agentPath: string): boolean {
  return existsSync(proposeToolFile(agentPath));
}

/** Install or remove the opt-in propose_change tool. */
export function setProposeTool(
  agentPath: string,
  enabled: boolean,
): { enabled: boolean } {
  const file = proposeToolFile(agentPath);
  if (enabled) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, PROPOSE_TOOL_SOURCE);
  } else if (existsSync(file)) {
    rmSync(file);
  }
  return { enabled: getProposeTool(agentPath) };
}

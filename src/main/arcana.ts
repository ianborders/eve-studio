import type {
  ArcanaResult,
  ArcanaStats,
  QueryHit,
  TimelineEvent,
} from "../shared/ipc";

/**
 * Arcana brain REST base.
 *
 * @remarks
 * Every call authenticates with `Authorization: Bearer <kb_ key>` and pins the
 * workspace via both the `:workspace` path segment and the
 * `X-Kyberagent-Agent` header (the daemon accepts either; we send both).
 */
const BASE = "https://api.arcana.kybernesis.ai";
const TIMEOUT_MS = 20_000;

async function call<T>(
  path: string,
  workspace: string,
  key: string,
): Promise<ArcanaResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BASE}/brain/${encodeURIComponent(workspace)}${path}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "X-Kyberagent-Agent": workspace,
        },
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string };
        msg = parsed.error || parsed.message || msg;
      } catch {
        if (body) {
          msg = body.slice(0, 200);
        }
      }
      return { ok: false, error: msg };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg.includes("abort") ? "Request timed out." : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Timeline + entity-graph aggregates for a workspace. */
export function arcanaStats(
  workspace: string,
  key: string,
): Promise<ArcanaResult<ArcanaStats>> {
  return call<ArcanaStats>("/stats", workspace, key);
}

/** Most-recent timeline events (newest first). */
export function arcanaTimeline(
  workspace: string,
  key: string,
  limit = 30,
): Promise<ArcanaResult<TimelineEvent[]>> {
  return call<TimelineEvent[]>(`/timeline?limit=${limit}`, workspace, key);
}

/** Hybrid (semantic + FTS + graph) search over the brain. */
export function arcanaQuery(
  workspace: string,
  key: string,
  q: string,
  limit = 20,
): Promise<ArcanaResult<QueryHit[]>> {
  return call<QueryHit[]>(
    `/query?q=${encodeURIComponent(q)}&limit=${limit}`,
    workspace,
    key,
  );
}

/** Validate a key/workspace pair by fetching stats (read-only). */
export async function arcanaValidate(
  workspace: string,
  key: string,
): Promise<ArcanaResult<ArcanaStats>> {
  return await arcanaStats(workspace, key);
}

/**
 * Arcana MCP endpoint — the write surface the agent itself uses.
 *
 * @remarks
 * The REST API ({@link BASE}) is read-only (stats/timeline/query); memory is
 * written by calling the `arcana_remember` tool over MCP, which runs the
 * event-sourcing pipeline (timeline + entity graph + facts + embeddings). The
 * server is stateless, so a fresh initialize → tools/call per write is fine.
 */
const MCP_URL = "https://mcp.arcana.kybernesis.ai/mcp";

/** Parse an MCP HTTP reply that may be raw JSON or an SSE `data:` frame. */
function parseMcp(text: string): {
  result?: { isError?: boolean; content?: { text?: string }[] };
  error?: { message?: string };
} | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  const dataLines = text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]);
    } catch {
      // not this frame — keep scanning older ones
    }
  }
  return null;
}

/** One MCP `tools/call` against a brain — returns the first text content. */
async function mcpCall(
  workspace: string,
  key: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ArcanaResult<string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "X-Kyberagent-Agent": workspace,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const rpc = (
    body: unknown,
    extra?: Record<string, string>,
  ): Promise<Response> =>
    fetch(MCP_URL, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  try {
    const init = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "eve-studio", version: "1" },
      },
    });
    if (!init.ok) {
      return {
        ok: false,
        error: `Arcana MCP init failed (HTTP ${init.status}).`,
      };
    }
    const sid = init.headers.get("mcp-session-id");
    await init.text();
    const session = sid ? { "Mcp-Session-Id": sid } : undefined;
    await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, session);
    const res = await rpc(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      session,
    );
    const parsed = parseMcp(await res.text());
    if (parsed?.error) {
      return {
        ok: false,
        error: parsed.error.message || `${toolName} failed.`,
      };
    }
    if (!res.ok || parsed?.result?.isError) {
      return { ok: false, error: `Arcana rejected ${toolName}.` };
    }
    return { ok: true, data: parsed?.result?.content?.[0]?.text ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg.includes("abort") ? "Request timed out." : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Persist a fact to the agent's brain (event-sourced) via `arcana_remember`. */
export async function arcanaRemember(
  workspace: string,
  key: string,
  text: string,
): Promise<ArcanaResult<null>> {
  const r = await mcpCall(workspace, key, "arcana_remember", {
    text,
    channel: "eve-studio",
    tags: ["eve-studio", "evolve"],
  });
  return r.ok ? { ok: true, data: null } : { ok: false, error: r.error };
}

/** Read a brain note's body; missing note → empty string. */
export async function arcanaBrainRead(
  workspace: string,
  key: string,
  name: string,
): Promise<ArcanaResult<string>> {
  const r = await mcpCall(workspace, key, "arcana_brain_read", { name });
  if (!r.ok) {
    // A not-yet-created note reads as empty rather than an error.
    if (/not found|does not exist|no such/i.test(r.error ?? "")) {
      return { ok: true, data: "" };
    }
    return r;
  }
  try {
    const j = JSON.parse(r.data ?? "") as { content?: string };
    return { ok: true, data: String(j.content ?? "") };
  } catch {
    return { ok: true, data: r.data ?? "" };
  }
}

/** List brain note names. */
export async function arcanaBrainList(
  workspace: string,
  key: string,
): Promise<ArcanaResult<string[]>> {
  const r = await mcpCall(workspace, key, "arcana_brain_list", {});
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  try {
    const j = JSON.parse(r.data ?? "") as {
      notes?: { name?: string }[];
      results?: { name?: string }[];
    };
    const names = (j.notes ?? j.results ?? [])
      .map((n) => String(n.name ?? ""))
      .filter(Boolean);
    return { ok: true, data: names };
  } catch {
    return { ok: true, data: [] };
  }
}

/** Create or overwrite a brain note. */
export async function arcanaBrainWrite(
  workspace: string,
  key: string,
  name: string,
  content: string,
): Promise<ArcanaResult<null>> {
  const r = await mcpCall(workspace, key, "arcana_brain_write", {
    name,
    content,
  });
  return r.ok ? { ok: true, data: null } : { ok: false, error: r.error };
}

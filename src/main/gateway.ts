import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GatewayModel, GatewayModelsResult } from "../shared/ipc";

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

/** Read a var from the agent's .env.local (falling back to .env). */
function readEnv(agentPath: string, key: string): string | null {
  for (const f of [".env.local", ".env"]) {
    const p = join(agentPath, f);
    if (!existsSync(p)) {
      continue;
    }
    const m = new RegExp(`^${key}=(.*)$`, "m").exec(readFileSync(p, "utf8"));
    const v = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (v) {
      return v;
    }
  }
  return null;
}

/** The gateway credential Eve itself uses locally: a static key or the OIDC token. */
function credential(agentPath: string): string | null {
  return (
    readEnv(agentPath, "AI_GATEWAY_API_KEY") ??
    readEnv(agentPath, "VERCEL_OIDC_TOKEN")
  );
}

interface RawModel {
  id?: string;
  name?: string;
  owned_by?: string;
  type?: string;
  context_window?: number;
}

/**
 * Fetch the models the agent's linked AI Gateway actually offers.
 *
 * @remarks
 * The gateway exposes hundreds of models across every provider and keeps adding
 * them, so the picker reads the live catalog rather than a list that goes stale.
 * Filtered to `type: "language"` — the chat models — dropping the image, video,
 * speech, and embedding entries that can't back an agent. Uses the same
 * credential Eve uses for the gateway; on any failure the caller falls back to a
 * small curated set, so the picker still works offline or before linking.
 */
export async function gatewayModels(
  agentPath: string,
): Promise<GatewayModelsResult> {
  const token = credential(agentPath);
  if (!token) {
    return { ok: false, models: [], error: "not-linked" };
  }
  let res: Response;
  try {
    res = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { ok: false, models: [], error: (e as Error).message };
  }
  if (!res.ok) {
    return { ok: false, models: [], error: `gateway ${res.status}` };
  }
  try {
    const body = (await res.json()) as { data?: RawModel[] };
    const models: GatewayModel[] = (body.data ?? [])
      .filter((m) => m.type === "language" && m.id)
      .map((m) => ({
        id: m.id as string,
        name: m.name ?? (m.id as string),
        owner: m.owned_by ?? (m.id as string).split("/")[0],
        contextWindow: m.context_window,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, models };
  } catch {
    return { ok: false, models: [], error: "parse" };
  }
}

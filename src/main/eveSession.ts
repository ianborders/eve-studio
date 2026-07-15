import type { EveEvent } from "../shared/ipc";

export interface SessionResponse {
  sessionId: string;
  continuationToken: string;
  ok?: boolean;
}

export interface InputResponse {
  requestId: string;
  optionId?: string;
  text?: string;
}

export interface PostBody {
  message?: string;
  continuationToken?: string;
  inputResponses?: InputResponse[];
}

/** Where a session lives: a base URL plus any auth headers (deployed = bypass + OIDC). */
export interface SessionConn {
  baseUrl: string;
  headers?: Record<string, string>;
}

/**
 * Probe the agent to see if a turn would succeed: hits the auth-gated
 * `/eve/v1/info` (not public `/health`), so a 200 means both Vercel platform
 * protection AND eve route auth are satisfied. 3xx = platform protection;
 * 401/403 = eve route auth rejected the token.
 */
export async function checkHealth(
  conn: SessionConn
): Promise<{ ok: boolean; status: number; protected: boolean }> {
  try {
    const res = await fetch(`${conn.baseUrl}/eve/v1/info`, {
      headers: conn.headers,
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
    });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      return { ok: false, status: 302, protected: true };
    }
    return { ok: res.ok, status: res.status, protected: false };
  } catch {
    return { ok: false, status: 0, protected: false };
  }
}

/** GET /eve/v1/info — the running agent's runtime surface. */
export async function getAgentInfo(
  baseUrl: string,
  headers?: Record<string, string>
): Promise<unknown> {
  const res = await fetch(`${baseUrl}/eve/v1/info`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`info ${res.status}`);
  }
  return res.json();
}

/** POST /eve/v1/session (create) or /eve/v1/session/:id (continue). */
export async function postSession(
  conn: SessionConn,
  sessionId: string | null,
  body: PostBody
): Promise<SessionResponse> {
  const url = sessionId
    ? `${conn.baseUrl}/eve/v1/session/${sessionId}`
    : `${conn.baseUrl}/eve/v1/session`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...conn.headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`session ${res.status}: ${detail}`);
  }
  return (await res.json()) as SessionResponse;
}

/** GET /eve/v1/session/:id/stream?startIndex=n — yields NDJSON events until the caller stops. */
export async function* streamSession(
  conn: SessionConn,
  sessionId: string,
  startIndex: number,
  signal?: AbortSignal
): AsyncGenerator<EveEvent> {
  const res = await fetch(
    `${conn.baseUrl}/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}`,
    { headers: { accept: "application/x-ndjson", ...conn.headers }, signal }
  );
  if (!(res.ok && res.body)) {
    throw new Error(`stream ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          try {
            yield JSON.parse(line) as EveEvent;
          } catch {
            // skip a malformed line
          }
        }
        nl = buf.indexOf("\n");
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // stream already closed
    }
  }
}

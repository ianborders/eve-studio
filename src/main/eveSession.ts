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

/** GET /eve/v1/info — the running agent's runtime surface. */
export async function getAgentInfo(baseUrl: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/eve/v1/info`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`info ${res.status}`);
  }
  return res.json();
}

/** POST /eve/v1/session (create) or /eve/v1/session/:id (continue). */
export async function postSession(
  baseUrl: string,
  sessionId: string | null,
  body: PostBody
): Promise<SessionResponse> {
  const url = sessionId
    ? `${baseUrl}/eve/v1/session/${sessionId}`
    : `${baseUrl}/eve/v1/session`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  baseUrl: string,
  sessionId: string,
  startIndex: number,
  signal?: AbortSignal
): AsyncGenerator<EveEvent> {
  const res = await fetch(
    `${baseUrl}/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}`,
    { headers: { accept: "application/x-ndjson" }, signal }
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

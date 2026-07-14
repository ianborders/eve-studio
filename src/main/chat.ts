import type { ChatStatus, ChatStatusMessage, EveEvent } from "../shared/ipc";
import { type InputResponse, postSession, streamSession } from "./eveSession";
import * as store from "./store";

const BOUNDARY = new Set([
  "session.waiting",
  "session.completed",
  "session.failed",
]);

interface TurnPayload {
  message?: string;
  inputResponses?: InputResponse[];
}

/**
 * Orchestrates a chat turn: pick create-vs-continue, POST, stream events (persist + forward
 * each), and advance the per-thread session cursor. Eve keeps no history, so the store owns it.
 */
export class ChatController {
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly emitEvent: (threadId: string, event: EveEvent) => void,
    private readonly emitStatus: (msg: ChatStatusMessage) => void
  ) {}

  isBusy(threadId: string): boolean {
    return this.active.has(threadId);
  }

  send(threadId: string, baseUrl: string, text: string): Promise<void> {
    return this.runTurn(threadId, baseUrl, { message: text });
  }

  respond(
    threadId: string,
    baseUrl: string,
    requestId: string,
    optionId?: string,
    text?: string
  ): Promise<void> {
    return this.runTurn(threadId, baseUrl, {
      inputResponses: [{ requestId, optionId, text }],
    });
  }

  abort(threadId: string): void {
    this.active.get(threadId)?.abort();
  }

  private async runTurn(
    threadId: string,
    baseUrl: string,
    payload: TurnPayload
  ): Promise<void> {
    if (this.active.has(threadId)) {
      return;
    }
    const abort = new AbortController();
    this.active.set(threadId, abort);
    this.emitStatus({ threadId, status: "streaming" });

    try {
      const cursor = store.getCursor(threadId);
      const canContinue = Boolean(cursor.sessionId && cursor.continuationToken);

      let resp: Awaited<ReturnType<typeof postSession>>;
      let sessionId: string;
      let startIndex: number;

      if (canContinue) {
        try {
          resp = await postSession(baseUrl, cursor.sessionId as string, {
            continuationToken: cursor.continuationToken,
            ...payload,
          });
          sessionId = cursor.sessionId as string;
          startIndex = cursor.streamIndex;
        } catch (err) {
          // Stale/terminal session — restart fresh if this was a message.
          if (!payload.message) {
            throw err;
          }
          resp = await postSession(baseUrl, null, { message: payload.message });
          sessionId = resp.sessionId;
          startIndex = 0;
        }
      } else {
        if (!payload.message) {
          throw new Error("No active session to respond to.");
        }
        resp = await postSession(baseUrl, null, { message: payload.message });
        sessionId = resp.sessionId;
        startIndex = 0;
      }

      const nextToken = resp.continuationToken;
      let idx = startIndex;
      let finalStatus: ChatStatus = "waiting";

      for await (const event of streamSession(
        baseUrl,
        sessionId,
        startIndex,
        abort.signal
      )) {
        store.appendEvent(threadId, event);
        this.emitEvent(threadId, event);
        idx += 1;
        if (BOUNDARY.has(event.type)) {
          if (event.type === "session.waiting") {
            store.setCursor(threadId, {
              sessionId,
              continuationToken: nextToken,
              streamIndex: idx,
            });
            finalStatus = "waiting";
          } else {
            store.setCursor(threadId, { streamIndex: 0 });
            finalStatus =
              event.type === "session.failed" ? "failed" : "completed";
          }
          break;
        }
      }

      store.touchThread(threadId);
      this.emitStatus({ threadId, status: finalStatus });
    } catch (err) {
      this.emitStatus({
        threadId,
        status: "error",
        error: (err as Error).message,
      });
    } finally {
      this.active.delete(threadId);
    }
  }
}

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChannelAddInput, ChannelKind } from "../shared/ipc";

function agentRoot(agentPath: string): string {
  return existsSync(join(agentPath, "agent"))
    ? join(agentPath, "agent")
    : agentPath;
}
function nested(agentPath: string): string {
  return existsSync(join(agentPath, "agent")) ? "agent/" : "";
}

/** Vercel-Connect-backed platform channels (no secrets to manage). */
const CONNECT: Record<
  string,
  { factory: string; mod: string; cred: string; service: string }
> = {
  slack: {
    factory: "slackChannel",
    mod: "eve/channels/slack",
    cred: "connectSlackCredentials",
    service: "slack",
  },
  github: {
    factory: "githubChannel",
    mod: "eve/channels/github",
    cred: "connectGitHubCredentials",
    service: "github",
  },
  linear: {
    factory: "linearChannel",
    mod: "eve/channels/linear",
    cred: "connectLinearCredentials",
    service: "linear",
  },
};

/** Env-var-backed platform channels. */
const ENVCH: Record<
  string,
  { factory: string; mod: string; body: string; env: string[] }
> = {
  discord: {
    factory: "discordChannel",
    mod: "eve/channels/discord",
    body: "discordChannel()",
    env: ["DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID", "DISCORD_BOT_TOKEN"],
  },
  teams: {
    factory: "teamsChannel",
    mod: "eve/channels/teams",
    body: "teamsChannel()",
    env: ["MICROSOFT_APP_ID"],
  },
  telegram: {
    factory: "telegramChannel",
    mod: "eve/channels/telegram",
    body: "telegramChannel({})",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"],
  },
  twilio: {
    factory: "twilioChannel",
    mod: "eve/channels/twilio",
    body: 'twilioChannel({ allowFrom: [] })',
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  },
};

/** Which channels use a Vercel Connect connector (and their service name). */
export function connectService(kind: ChannelKind): string | null {
  return CONNECT[kind]?.service ?? null;
}

/** Metadata used by the renderer gallery. */
export const CHANNEL_CATALOG = { CONNECT, ENVCH };

/** Write `channels/<kind>.ts` for the given kind. */
export function writeChannel(
  agentPath: string,
  input: ChannelAddInput
): { relPath: string; envVars?: string[]; connect?: boolean } {
  const dir = join(agentRoot(agentPath), "channels");
  mkdirSync(dir, { recursive: true });

  if (input.kind === "custom") {
    const slug = (input.name ?? "intake").toLowerCase().replace(/[^a-z0-9-]/g, "");
    const file = join(dir, `${slug || "intake"}.ts`);
    if (existsSync(file)) {
      throw new Error(`channels/${slug}.ts already exists.`);
    }
    writeFileSync(
      file,
      `import { defineChannel, GET, POST } from "eve/channels";

export default defineChannel({
  routes: [
    POST("/message", async (req, { send }) => {
      const body = (await req.json()) as { message: string; token?: string };
      const session = await send(body.message, {
        auth: null,
        continuationToken: body.token,
      });
      return Response.json({ sessionId: session.id });
    }),
    GET("/sessions/:sessionId/stream", async (_req, { getSession, params }) => {
      const session = getSession(params.sessionId);
      const stream = await session.getEventStream();
      return new Response(stream, {
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
      });
    }),
  ],
  events: {
    "message.completed"(_event, _channel, _ctx) {
      // deliver the reply back to your surface
    },
  },
});
`
    );
    return { relPath: `${nested(agentPath)}channels/${slug || "intake"}.ts` };
  }

  const file = join(dir, `${input.kind}.ts`);
  if (existsSync(file)) {
    throw new Error(`channels/${input.kind}.ts already exists.`);
  }

  const c = CONNECT[input.kind];
  if (c) {
    const uid = input.connector ?? `${c.service}/my-agent`;
    writeFileSync(
      file,
      `import { ${c.cred} } from "@vercel/connect/eve";
import { ${c.factory} } from "${c.mod}";

/**
 * ${c.factory} — credentials brokered by Vercel Connect (no secrets to manage).
 * Added by Eve Studio.
 */
export default ${c.factory}({
  credentials: ${c.cred}(${JSON.stringify(uid)}),
});
`
    );
    return { relPath: `${nested(agentPath)}channels/${input.kind}.ts`, connect: true };
  }

  const e = ENVCH[input.kind];
  if (e) {
    writeFileSync(
      file,
      `import { ${e.factory} } from "${e.mod}";

/**
 * ${e.factory} — reads credentials from env (${e.env.join(", ")}). Added by Eve Studio.
 */
export default ${e.body};
`
    );
    return { relPath: `${nested(agentPath)}channels/${input.kind}.ts`, envVars: e.env };
  }

  throw new Error(`Unknown channel kind: ${input.kind}`);
}

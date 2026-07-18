import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ChannelAddInput, ChannelKind } from "../shared/ipc";

/**
 * The Vercel Connect UID each channel file references, so the UI can show which
 * bot a channel is wired to (e.g. `slack/eve-health`) instead of just "added".
 */
export function channelConnectors(
  agentPath: string,
): { name: string; connector: string | null }[] {
  const dir = join(agentRoot(agentPath), "channels");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  } catch {
    return [];
  }
  const re =
    /connect\w*Credentials\(\s*(?:process\.env\.\w+\s*\?\?\s*)?["']([^"']+)["']/;
  return files.map((f) => {
    let connector: string | null = null;
    try {
      connector = re.exec(readFileSync(join(dir, f), "utf8"))?.[1] ?? null;
    } catch {
      // unreadable — leave connector null
    }
    return { name: f.slice(0, -3), connector };
  });
}

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
  {
    factory: string;
    mod: string;
    cred: string;
    service: string;
    /** Emit a `botName` arg (derived from the connector uid) — GitHub gates
     * mention-driven turns on it, so the scaffold must set it. */
    botName?: boolean;
  }
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
    botName: true,
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
  {
    factory: string;
    mod: string;
    body: string;
    env: string[];
    /** Extra guidance emitted as a comment in the scaffold, for knobs the user
     * must hand-edit before the channel does anything (e.g. an allow-list). */
    note?: string;
  }
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
    env: ["MICROSOFT_APP_ID", "MICROSOFT_APP_PASSWORD"],
    note: "Single-tenant bots also need MICROSOFT_TENANT_ID.",
  },
  telegram: {
    factory: "telegramChannel",
    mod: "eve/channels/telegram",
    body: 'telegramChannel({ botUsername: "my_bot" })',
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"],
    note: "Replace botUsername with your bot's @handle (no @) — group @mentions only wake the bot when it matches.",
  },
  twilio: {
    factory: "twilioChannel",
    mod: "eve/channels/twilio",
    body: "twilioChannel({ allowFrom: [] })",
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    note: 'allowFrom is required and starts empty (allows nobody) — add the numbers that may reach the agent, e.g. ["+15551234567"].',
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
  input: ChannelAddInput,
): { relPath: string; envVars?: string[]; connect?: boolean } {
  const dir = join(agentRoot(agentPath), "channels");
  mkdirSync(dir, { recursive: true });

  if (input.kind === "custom") {
    const slug = (input.name ?? "intake")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
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
`,
    );
    return { relPath: `${nested(agentPath)}channels/${slug || "intake"}.ts` };
  }

  const file = join(dir, `${input.kind}.ts`);
  if (existsSync(file) && !input.overwrite) {
    throw new Error(`channels/${input.kind}.ts already exists.`);
  }

  const c = CONNECT[input.kind];
  if (c) {
    const uid = input.connector ?? `${c.service}/my-agent`;
    const botName = c.botName
      ? `  botName: ${JSON.stringify(uid.split("/")[1] ?? "my-agent")},\n`
      : "";
    writeFileSync(
      file,
      `import { ${c.cred} } from "@vercel/connect/eve";
import { ${c.factory} } from "${c.mod}";

/**
 * ${c.factory} — credentials brokered by Vercel Connect (no secrets to manage).
 * Added by Eve Studio.
 */
export default ${c.factory}({
${botName}  credentials: ${c.cred}(${JSON.stringify(uid)}),
});
`,
    );
    return {
      relPath: `${nested(agentPath)}channels/${input.kind}.ts`,
      connect: true,
    };
  }

  const e = ENVCH[input.kind];
  if (e) {
    const note = e.note ? `\n * ${e.note}` : "";
    // Telegram bakes the verified @handle into the factory so group @mentions
    // wake the right bot; Twilio bakes the allow-list + outbound number so it
    // gates inbound and can reply/originate SMS. Other env channels use e.body.
    let body = e.body;
    if (input.kind === "telegram" && input.botUsername) {
      body = `telegramChannel({ botUsername: ${JSON.stringify(input.botUsername)} })`;
    } else if (input.kind === "twilio") {
      const allow = (input.twilioAllowFrom ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const from = input.twilioFrom?.trim();
      const opts: string[] = [`allowFrom: ${JSON.stringify(allow)}`];
      if (from) {
        opts.push(`messaging: { from: ${JSON.stringify(from)} }`);
      }
      body = `twilioChannel({ ${opts.join(", ")} })`;
    }
    writeFileSync(
      file,
      `import { ${e.factory} } from "${e.mod}";

/**
 * ${e.factory} — reads credentials from env (${e.env.join(", ")}). Added by Eve Studio.${note}
 */
export default ${body};
`,
    );
    return {
      relPath: `${nested(agentPath)}channels/${input.kind}.ts`,
      envVars: e.env,
    };
  }

  throw new Error(`Unknown channel kind: ${input.kind}`);
}

/**
 * Delete a channel by removing its `channels/<name>.ts` file.
 *
 * @remarks
 * `name` must be a simple slug (no path separators) so it can never escape the
 * channels directory. Deployed events routed to a removed channel simply stop.
 */
export function deleteChannelFile(agentPath: string, name: string): void {
  if (!/^[a-z0-9-]+$/i.test(name)) {
    throw new Error("Invalid channel name.");
  }
  const file = join(agentRoot(agentPath), "channels", `${name}.ts`);
  if (existsSync(file)) {
    rmSync(file);
  }
}

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";
import type {
  BuzzCredInput,
  BuzzKeyResult,
  BuzzProfileResult,
  BuzzStatus,
  BuzzVerifyResult,
} from "../shared/ipc";
import { getBuzz, setBuzz } from "./store";

/**
 * Buzz (github.com/block/buzz) relay client for the guided channel setup, plus
 * the inbound bridge manager. Buzz is a NIP-29 Nostr relay: identity is a
 * Nostr keypair, REST writes carry a NIP-98 Authorization header, and media
 * uploads use Blossom (kind 24242 auth). All calls run in the main process so
 * the private key never reaches the renderer.
 *
 * INBOUND: hosted Buzz relays (communities.buzz.xyz) currently do not push
 * events out (no workflow webhooks, no live WS fan-out), so a local bridge
 * polls the relay and forwards messages to the DEPLOYED agent's /inbound
 * route. Studio runs it while open; "install" writes a LaunchAgent that keeps
 * it running headlessly (macOS). Self-hosted relays with push can skip the
 * bridge entirely — same channel file either way.
 */

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? []);

const nowSec = (): number => Math.floor(Date.now() / 1000);

function nip98Header(skHex: string, method: string, url: string, body?: string): string {
  const tags: string[][] = [
    ["u", url],
    ["method", method],
    ["nonce", crypto.randomUUID()],
  ];
  if (body !== undefined) {
    tags.push(["payload", createHash("sha256").update(body).digest("hex")]);
  }
  const ev = finalizeEvent(
    { kind: 27235, created_at: nowSec(), tags, content: "" },
    hexToBytes(skHex),
  );
  return `Nostr ${Buffer.from(JSON.stringify(ev)).toString("base64")}`;
}

function httpBase(relayUrl: string): string {
  return relayUrl.replace(/^ws/, "http").replace(/\/+$/, "");
}

// --- identity ---------------------------------------------------------------

export function buzzGenKey(agentId: string, relayUrl: string): BuzzKeyResult {
  try {
    const existing = getBuzz(agentId);
    if (existing?.privateKey) {
      // Reuse the identity — regenerating would orphan the admitted member.
      return { ok: true, publicKey: existing.publicKey, npub: existing.npub };
    }
    const sk = generateSecretKey();
    const privateKey = Buffer.from(sk).toString("hex");
    const publicKey = getPublicKey(sk);
    const npub = npubEncode(publicKey);
    setBuzz(agentId, {
      relayUrl,
      privateKey,
      publicKey,
      npub,
      webhookSecret: crypto.randomUUID(),
    });
    return { ok: true, publicKey, npub };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- membership probe -------------------------------------------------------

export async function buzzVerify(agentId: string): Promise<BuzzVerifyResult> {
  const cred = getBuzz(agentId);
  if (!cred) {
    return { ok: false, error: "No Buzz identity yet — generate one first." };
  }
  // Relay-level admission check: an authed POST /query succeeds (HTTP 200) only
  // for admitted members — outsiders get 403 relay_membership_required. The
  // kind:39002 (group members) filter also tells us how many channels the
  // agent has been added to (0 right after admission is normal).
  const url = `${httpBase(cred.relayUrl)}/query`;
  const body = JSON.stringify([{ kinds: [39002], "#p": [cred.publicKey] }]);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: nip98Header(cred.privateKey, "POST", url, body),
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: true, member: false };
    }
    if (!res.ok) {
      return { ok: false, error: `Relay answered HTTP ${res.status}.` };
    }
    const events = (await res.json().catch(() => [])) as {
      tags?: string[][];
    }[];
    const channels = new Set(
      (Array.isArray(events) ? events : [])
        .map((e) => e.tags?.find((t) => t[0] === "d")?.[1])
        .filter(Boolean),
    ).size;
    return { ok: true, member: true, channels };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- profile (kind:0 + Blossom avatar) --------------------------------------

export async function buzzSetProfile(
  agentId: string,
  input: {
    name: string;
    about?: string;
    avatarPath?: string;
    /** Base64 image bytes from the renderer (Electron 32+ removed File.path). */
    avatarData?: string;
    avatarMime?: string;
  },
): Promise<BuzzProfileResult> {
  const cred = getBuzz(agentId);
  if (!cred) {
    return { ok: false, error: "No Buzz identity yet." };
  }
  const base = httpBase(cred.relayUrl);
  let avatarUrl: string | null = null;
  try {
    let bytes: Buffer | null = null;
    let mime = "image/png";
    if (input.avatarData) {
      bytes = Buffer.from(input.avatarData, "base64");
      mime = input.avatarMime || "image/png";
    } else if (input.avatarPath && existsSync(input.avatarPath)) {
      bytes = readFileSync(input.avatarPath);
      mime = input.avatarPath.toLowerCase().endsWith(".jpg") ||
        input.avatarPath.toLowerCase().endsWith(".jpeg")
        ? "image/jpeg"
        : input.avatarPath.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "image/png";
    }
    if (bytes) {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      // Blossom upload auth: kind 24242, t=upload, x=sha256, expiration.
      const authEv = finalizeEvent(
        {
          kind: 24242,
          created_at: nowSec(),
          tags: [
            ["t", "upload"],
            ["x", sha256],
            ["expiration", String(nowSec() + 600)],
            ["server", new URL(base).host],
          ],
          content: "Upload file",
        },
        hexToBytes(cred.privateKey),
      );
      const auth = `Nostr ${Buffer.from(JSON.stringify(authEv)).toString("base64url")}`;
      // BUD-02 upload; the relay requires the hash as an x-sha-256 header too.
      const up = await fetch(`${base}/upload`, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": mime, "x-sha-256": sha256 },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60_000),
      });
      if (up.ok) {
        const desc = (await up.json().catch(() => ({}))) as { url?: string };
        avatarUrl = desc.url ?? `${base}/media/${sha256}.png`;
      }
    }

    const profile: Record<string, string> = { name: input.name };
    if (input.about) {
      profile.about = input.about;
    }
    if (avatarUrl) {
      profile.picture = avatarUrl;
    }
    const ev = finalizeEvent(
      { kind: 0, created_at: nowSec(), tags: [], content: JSON.stringify(profile) },
      hexToBytes(cred.privateKey),
    );
    const url = `${base}/events`;
    const body = JSON.stringify(ev);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: nip98Header(cred.privateKey, "POST", url, body),
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, error: `Relay rejected the profile (HTTP ${res.status}).` };
    }
    setBuzz(agentId, { ...cred, agentName: input.name });
    return { ok: true, avatarUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read the agent's current profile (kind:0) from the relay for prefill. */
export async function buzzGetProfile(
  agentId: string,
): Promise<{ ok: boolean; name?: string; about?: string; picture?: string; error?: string }> {
  const cred = getBuzz(agentId);
  if (!cred) {
    return { ok: false, error: "No Buzz identity yet." };
  }
  const url = `${httpBase(cred.relayUrl)}/query`;
  const body = JSON.stringify([{ kinds: [0], authors: [cred.publicKey], limit: 1 }]);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: nip98Header(cred.privateKey, "POST", url, body),
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, error: `Relay answered HTTP ${res.status}.` };
    }
    const events = (await res.json().catch(() => [])) as { content?: string; created_at?: number }[];
    const latest = (Array.isArray(events) ? events : []).sort(
      (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
    )[0];
    if (!latest?.content) {
      return { ok: true };
    }
    const prof = JSON.parse(latest.content) as { name?: string; about?: string; picture?: string };
    return { ok: true, name: prof.name, about: prof.about, picture: prof.picture };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- persisted config -------------------------------------------------------

export function buzzSave(agentId: string, patch: Partial<BuzzCredInput>): { ok: boolean } {
  const cur = getBuzz(agentId);
  if (!cur) {
    return { ok: false };
  }
  setBuzz(agentId, { ...cur, ...patch });
  return { ok: true };
}

/** Best-effort: read the project's Vercel protection-bypass secret via the CLI login. */
export async function buzzBypassSecret(agentPath: string): Promise<string | null> {
  try {
    const proj = JSON.parse(
      readFileSync(join(agentPath, ".vercel", "project.json"), "utf8"),
    ) as { projectId: string; orgId: string };
    const auth = JSON.parse(
      readFileSync(
        join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
        "utf8",
      ),
    ) as { token: string };
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${proj.projectId}?teamId=${proj.orgId}`,
      { headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { protectionBypass?: Record<string, unknown> };
    const keys = Object.keys(data.protectionBypass ?? {});
    return keys[0] ?? null;
  } catch {
    return null;
  }
}

// --- bridge (in-process + LaunchAgent) --------------------------------------

const bridges = new Map<string, ChildProcess>();
const bridgeErrors = new Map<string, string>();

function bridgeScriptPath(): string {
  // In dev the script lives in resources/; packaged it is shipped alongside.
  const dev = join(app.getAppPath(), "resources", "buzz-bridge.mjs");
  if (existsSync(dev)) {
    return dev;
  }
  return join(process.resourcesPath, "buzz-bridge.mjs");
}

function bridgeConfigPath(agentId: string): string {
  const dir = join(app.getPath("userData"), "buzz-bridge");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${agentId}.json`);
}

function writeBridgeConfig(agentId: string): string | null {
  const cred = getBuzz(agentId);
  if (!cred?.targetUrl) {
    return null;
  }
  const path = bridgeConfigPath(agentId);
  writeFileSync(
    path,
    JSON.stringify(
      {
        relayUrl: cred.relayUrl,
        privateKey: cred.privateKey,
        publicKey: cred.publicKey,
        npub: cred.npub,
        agentName: cred.agentName ?? "",
        targetUrl: cred.targetUrl,
        webhookSecret: cred.webhookSecret,
        bypassSecret: cred.bypassSecret ?? "",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return path;
}

export function buzzBridgeStart(agentId: string): { ok: boolean; error?: string } {
  if (bridges.get(agentId)) {
    return { ok: true };
  }
  const cfg = writeBridgeConfig(agentId);
  if (!cfg) {
    return { ok: false, error: "Set the deployed target URL first (deploy the agent)." };
  }
  try {
    const child = spawn(process.execPath, [bridgeScriptPath(), cfg], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errBuf = "";
    child.stderr?.on("data", (d) => {
      errBuf = (errBuf + String(d)).slice(-2000);
    });
    child.on("exit", (code) => {
      bridges.delete(agentId);
      if (code !== 0 && code !== null) {
        bridgeErrors.set(agentId, errBuf.split("\n").filter(Boolean).pop() ?? `exit ${code}`);
      }
    });
    bridges.set(agentId, child);
    bridgeErrors.delete(agentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function buzzBridgeStop(agentId: string): { ok: boolean } {
  const child = bridges.get(agentId);
  if (child) {
    child.kill("SIGTERM");
    bridges.delete(agentId);
  }
  return { ok: true };
}

function launchAgentPath(agentId: string): string {
  return join(homedir(), "Library", "LaunchAgents", `studio.buzz-bridge.${agentId}.plist`);
}

export function buzzBridgeInstall(agentId: string): { ok: boolean; error?: string } {
  const cfg = writeBridgeConfig(agentId);
  if (!cfg) {
    return { ok: false, error: "Set the deployed target URL first (deploy the agent)." };
  }
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>studio.buzz-bridge.${agentId}</string>
  <key>ProgramArguments</key><array>
    <string>${process.execPath}</string>
    <string>${bridgeScriptPath()}</string>
    <string>${cfg}</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>ELECTRON_RUN_AS_NODE</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${join(app.getPath("userData"), "buzz-bridge", `${agentId}.log`)}</string>
</dict></plist>
`;
  try {
    writeFileSync(launchAgentPath(agentId), plist);
    spawn("launchctl", ["load", "-w", launchAgentPath(agentId)], { stdio: "ignore" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function buzzBridgeUninstall(agentId: string): { ok: boolean } {
  const p = launchAgentPath(agentId);
  try {
    spawn("launchctl", ["unload", p], { stdio: "ignore" });
  } catch {
    // best effort
  }
  if (existsSync(p)) {
    rmSync(p);
  }
  return { ok: true };
}

export async function buzzStatus(agentId: string): Promise<BuzzStatus> {
  const cred = getBuzz(agentId);
  if (!cred) {
    return { configured: false, bridgeRunning: false, bridgeInstalled: false };
  }
  const verify = await buzzVerify(agentId).catch(() => null);
  return {
    configured: true,
    member: verify?.member,
    bridgeRunning: bridges.has(agentId),
    bridgeInstalled: existsSync(launchAgentPath(agentId)),
    npub: cred.npub,
    relayUrl: cred.relayUrl,
    lastError: bridgeErrors.get(agentId) ?? null,
  };
}

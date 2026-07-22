#!/usr/bin/env node
/**
 * buzz-bridge — forwards Buzz messages to a deployed Eve agent's /inbound route.
 *
 * Run: node buzz-bridge.mjs <config.json>
 * Config: { relayUrl, privateKey, publicKey, npub, agentName, targetUrl,
 *           webhookSecret, bypassSecret }
 *
 * WHY THIS EXISTS: hosted Buzz relays (communities.buzz.xyz) accept REQ
 * lookbacks but do not push — workflow webhooks don't execute and live WS
 * subscriptions never receive fan-out. So the bridge holds one NIP-42-authed
 * WebSocket and re-REQs a sliding window every 5s (dedup by event id),
 * forwarding: every DM message, and @mentions elsewhere. Replies come from
 * the deployed agent posting its own signed events — the bridge is inbound-only.
 *
 * Self-contained: only needs nostr-tools, resolved from the Studio app that
 * installed it (path baked below at install time via import resolution).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Dev: resources/ sits next to node_modules. Packaged: app.asar/node_modules.
const req = createRequire(join(here, "..", "package.json"));
const { finalizeEvent } = req("nostr-tools/pure");
// Electron's bundled Node (v20) has no global WebSocket — use `ws` there.
const WebSocketImpl = globalThis.WebSocket ?? req("ws").WebSocket;

const cfg = JSON.parse(readFileSync(process.argv[2], "utf8"));
const SK = Uint8Array.from(cfg.privateKey.match(/.{2}/g).map((b) => parseInt(b, 16)));
const WS_URL = cfg.relayUrl.replace(/^http/, "ws").replace(/\/+$/, "");
const HTTP_URL = cfg.relayUrl.replace(/^ws/, "http").replace(/\/+$/, "");

const log = (...a) => console.error(new Date().toISOString(), "[buzz-bridge]", ...a);

const seen = new Set();
let channels = [];      // member channel ids (includes hidden DM groups)
let dmChannels = new Set(); // subset that are DMs (forward everything)
let pollSince = Math.floor(Date.now() / 1000);
let ws = null;
let stopping = false;

const now = () => Math.floor(Date.now() / 1000);

function nip98(method, url, body) {
  const tags = [["u", url], ["method", method], ["nonce", Math.random().toString(36).slice(2)]];
  if (body !== undefined) {
    const { createHash } = req("node:crypto");
    tags.push(["payload", createHash("sha256").update(body).digest("hex")]);
  }
  const ev = finalizeEvent({ kind: 27235, created_at: now(), tags, content: "" }, SK);
  return `Nostr ${Buffer.from(JSON.stringify(ev)).toString("base64")}`;
}

/** POST /query with NIP-98 auth; body is an ARRAY of Nostr filters. */
async function query(filters) {
  const url = `${HTTP_URL}/query`;
  const body = JSON.stringify(filters);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: nip98("POST", url, body), "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`query HTTP ${res.status}`);
  return res.json();
}

/**
 * Refresh member channels: kind:39002 (relay-signed member lists) tagged with
 * our pubkey → channel ids; kind:39000 metadata marks DM groups `hidden`.
 */
async function discover() {
  try {
    const members = await query([{ kinds: [39002], "#p": [cfg.publicKey] }]);
    const ids = [...new Set(
      members.map((e) => (e.tags ?? []).find((t) => t[0] === "d")?.[1]).filter(Boolean),
    )];
    if (ids.length === 0) {
      channels = [];
      dmChannels = new Set();
      return;
    }
    const meta = await query([{ kinds: [39000], "#d": ids }]);
    const hidden = new Set(
      meta
        .filter((e) => (e.tags ?? []).some((t) => t[0] === "hidden"))
        .map((e) => (e.tags ?? []).find((t) => t[0] === "d")?.[1])
        .filter(Boolean),
    );
    channels = ids;
    dmChannels = hidden;
  } catch (e) {
    log("discover failed:", e?.message ?? e);
  }
}

function mentionsAgent(ev) {
  if (cfg.agentName && new RegExp(`@\\s*${cfg.agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(ev.content)) return true;
  if (cfg.npub && ev.content.includes(cfg.npub)) return true;
  return (ev.tags ?? []).some((t) => t[0] === "p" && t[1] === cfg.publicKey);
}

async function forward(ev, channelId) {
  try {
    const res = await fetch(cfg.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-buzz-secret": cfg.webhookSecret,
        ...(cfg.bypassSecret ? { "x-vercel-protection-bypass": cfg.bypassSecret } : {}),
      },
      body: JSON.stringify({ text: ev.content, author: ev.pubkey, channelId, messageId: ev.id }),
      signal: AbortSignal.timeout(20000),
    });
    log(`forwarded ${ev.id.slice(0, 8)} ch=${channelId.slice(0, 8)} → HTTP ${res.status}`);
  } catch (e) {
    log("forward failed:", e?.message ?? e);
  }
}

function onEvent(ev) {
  if (ev.kind !== 9) return;
  if (ev.pubkey === cfg.publicKey) return; // never react to our own messages
  if (seen.has(ev.id)) return;
  seen.add(ev.id);
  if (seen.size > 1000) seen.delete(seen.values().next().value);
  const channelId = (ev.tags ?? []).find((t) => t[0] === "h")?.[1];
  if (!channelId || !channels.includes(channelId)) return;
  if (dmChannels.has(channelId) || mentionsAgent(ev)) void forward(ev, channelId);
}

function subscribe() {
  if (!ws || ws.readyState !== WebSocketImpl.OPEN || channels.length === 0) return;
  ws.send(
    JSON.stringify([
      "REQ",
      "bridge",
      { kinds: [9], "#h": channels, since: Math.max(pollSince - 30, now() - 300) },
    ]),
  );
  pollSince = now();
}

function presence() {
  if (!ws || ws.readyState !== WebSocketImpl.OPEN) return;
  ws.send(JSON.stringify(["EVENT", finalizeEvent({ kind: 20001, created_at: now(), tags: [], content: "online" }, SK)]));
}

function connect() {
  if (stopping) return;
  ws = new WebSocketImpl(WS_URL);
  ws.onopen = () => {
    log("connected", WS_URL);
    presence();
  };
  ws.onmessage = (m) => {
    try {
      const f = JSON.parse(String(m.data));
      if (f[0] === "AUTH" && typeof f[1] === "string") {
        const auth = finalizeEvent(
          { kind: 22242, created_at: now(), tags: [["relay", WS_URL], ["challenge", f[1]]], content: "" },
          SK,
        );
        ws.send(JSON.stringify(["AUTH", auth]));
      } else if (f[0] === "EVENT" && f[1] === "bridge" && f[2]) {
        onEvent(f[2]);
      }
    } catch {
      /* ignore non-JSON frames */
    }
  };
  ws.onclose = () => {
    if (!stopping) setTimeout(connect, 15000);
  };
  ws.onerror = () => {};
}

process.on("SIGTERM", () => {
  stopping = true;
  try { ws?.close(); } catch {}
  process.exit(0);
});

await discover();
connect();
let tick = 0;
setInterval(() => {
  subscribe(); // 5s message poll (lookback REQ — the delivery form hosted relays honor)
  tick += 1;
  if (tick % 12 === 0) {
    presence();
    void discover(); // pick up new channels/DMs the agent was added to
  }
}, 5000);
log("bridge live — target:", cfg.targetUrl);

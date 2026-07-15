import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, shell } from "electron";

function vercelBin(): string {
  return process.platform === "win32" ? "vercel.cmd" : "vercel";
}

function vc(agentPath: string, args: string[]): string {
  const res = spawnSync(vercelBin(), args, {
    cwd: agentPath,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return `${res.stdout ?? ""}`;
}

function parseJson(out: string): unknown {
  const s = out.indexOf("{");
  const e = out.lastIndexOf("}");
  if (s < 0 || e < s) {
    return null;
  }
  try {
    return JSON.parse(out.slice(s, e + 1));
  } catch {
    return null;
  }
}

/** Vercel's deep-link redirector — resolves [team]/[project] from context. */
const CONNECT_DEEPLINK =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fconnect&title=Open+Vercel+Connect";

/**
 * Resolve the team's Vercel Connect dashboard URL. Prefers the exact
 * `https://vercel.com/<team>/~/connect` (derived from an existing connector);
 * falls back to Vercel's context-resolving deep link when there are none.
 */
export function connectBaseUrl(agentPath: string): string | null {
  if (!existsSync(join(agentPath, ".vercel", "project.json"))) {
    return null;
  }
  const list = parseJson(
    vc(agentPath, ["connect", "list", "--format", "json", "--non-interactive"])
  ) as { connectors?: Array<{ id?: string; uid?: string }> } | null;
  const first = list?.connectors?.[0];
  const id = first?.id ?? first?.uid;
  if (id) {
    const opened = parseJson(
      vc(agentPath, ["connect", "open", id, "--format=json"])
    ) as { url?: string } | null;
    if (opened?.url) {
      // .../~/connect/<connectorId>  ->  .../~/connect
      return opened.url.replace(/\/[^/]+$/, "");
    }
  }
  return CONNECT_DEEPLINK;
}

/** Open the Vercel Connect provider gallery in an in-app window. */
export function openConnectWindow(
  agentPath: string
): { ok: boolean; error?: string } {
  const base = connectBaseUrl(agentPath);
  if (!base) {
    return {
      ok: false,
      error:
        "Couldn't resolve the Vercel Connect URL. Make sure the project is linked to Vercel (Environment tab).",
    };
  }
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    title: "Vercel Connect",
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      partition: "persist:vercel-connect",
      contextIsolation: true,
    },
  });
  // External links (docs, OAuth provider consent) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  void win.loadURL(base);
  return { ok: true };
}

/** Open the same gallery in the user's default browser (already signed in). */
export function openConnectExternal(agentPath: string): { ok: boolean; error?: string } {
  const base = connectBaseUrl(agentPath);
  if (!base) {
    return { ok: false, error: "Couldn't resolve the Vercel Connect URL. Link the project first." };
  }
  void shell.openExternal(base);
  return { ok: true };
}

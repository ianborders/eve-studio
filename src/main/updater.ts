/**
 * Auto-update via electron-updater. Polls the GitHub Releases feed (configured
 * in package.json `build.publish` → github ianborders/eve-studio) and pushes a
 * single UpdateState to the renderer, which renders the UPDATE → RESTART badge.
 * No native dialogs.
 *
 * Signed macOS builds only: Squirrel.Mac validates the code signature, so
 * updates only apply to notarized/signed releases (which CI produces).
 */
import { type BrowserWindow, app, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { IPC, type UpdateState } from "../shared/ipc";

const state: UpdateState = { status: "idle", version: null };

let getWindow: (() => BrowserWindow | null) | null = null;

function push(next: Partial<UpdateState>): void {
  Object.assign(state, next);
  const win = getWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.updaterState, state);
  }
}

export function setupAutoUpdater(
  getMainWindow: () => BrowserWindow | null,
): void {
  getWindow = getMainWindow;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // ── renderer → main ──
  ipcMain.handle(IPC.updaterGetState, () => state);

  ipcMain.handle(IPC.updaterCheck, async () => {
    if (!app.isPackaged) {
      return { ok: false, error: "Updates only run in packaged builds." };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.updaterDownload, async () => {
    if (state.status !== "available") {
      return { ok: false, error: "No update available." };
    }
    try {
      push({ status: "downloading", percent: 0 });
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      push({ status: "error", error: String(err) });
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.updaterInstall, () => {
    // isSilent=false (show the installer progress), isForceRunAfter=true
    // (relaunch the app once the update is applied).
    autoUpdater.quitAndInstall(false, true);
  });

  // ── update lifecycle ──
  autoUpdater.on("checking-for-update", () => push({ status: "checking" }));
  autoUpdater.on("update-available", (info) =>
    push({ status: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () =>
    push({ status: "idle", version: null, percent: undefined }),
  );
  autoUpdater.on("download-progress", (p) =>
    push({ status: "downloading", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    push({ status: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) => {
    // Stay quiet on routine "no releases yet / offline" noise — just log.
    console.warn("[updater]", err.message);
    push({ status: "idle", error: err.message });
  });

  // Packaged only: check shortly after launch, then every 6 hours.
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // ignore — surfaced via the 'error' event
      });
    }, 8000);
    setInterval(
      () => {
        autoUpdater.checkForUpdates().catch(() => {
          // ignore
        });
      },
      6 * 60 * 60 * 1000,
    );
  }
}

import { existsSync } from "node:fs";
import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { BrowserWindow, app, nativeImage, shell } from "electron";
import { hydratePath } from "./env";
import { type IpcHandles, registerIpc } from "./ipc";
import { ensureNodeRuntime, prewarmVercel } from "./runtime";
import { initStore } from "./store";
import { setupAutoUpdater } from "./updater";

let handles: IpcHandles | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#ffffff",
    icon: join(app.getAppPath(), "build", "icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("ai.kybernesis.evestudio");

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Dock icon (macOS, dev — packaged builds use build/icon.icns).
  if (process.platform === "darwin" && app.dock) {
    for (const p of [
      join(app.getAppPath(), "build", "icon.png"),
      join(app.getAppPath(), "resources", "brand", "icon-1024.png"),
    ]) {
      if (existsSync(p)) {
        app.dock.setIcon(nativeImage.createFromPath(p));
        break;
      }
    }
  }

  hydratePath();
  initStore();
  handles = registerIpc();

  // Kick off the Node runtime check early (memoized) so a fresh machine starts
  // downloading before the user tries to create an agent.
  void ensureNodeRuntime()
    .then(() => {
      // Cache the Vercel CLI in the background so the first link/deploy is fast.
      prewarmVercel();
    })
    .catch(() => {
      // surfaced on demand in the create/start flows
    });

  createWindow();
  setupAutoUpdater(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  handles?.cli.cancelAll();
  handles?.agents.stopAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import { type AppInfo, IPC } from "../shared/ipc";

/**
 * The typed surface exposed to the renderer as `window.studio`.
 * Every capability the UI needs is added here and backed by an ipcMain handler.
 */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
};

export type StudioApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("studio", api);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: preload bridge setup failure must be visible
    console.error(error);
  }
} else {
  // @ts-ignore — contextIsolation is expected on; this is the fallback
  window.electron = electronAPI;
  // @ts-ignore — see above
  window.studio = api;
}

/**
 * Shared IPC contract between the main process and the renderer.
 * Channel names live here so both sides stay in sync.
 */

export interface AppInfo {
  appVersion: string;
  electron: string;
  node: string;
  chrome: string;
  platform: NodeJS.Platform;
}

export const IPC = {
  appInfo: "app:info",
} as const;

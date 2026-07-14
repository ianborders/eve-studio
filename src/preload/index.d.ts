import type { ElectronAPI } from "@electron-toolkit/preload";
import type { StudioApi } from "./index";

declare global {
  interface Window {
    electron: ElectronAPI;
    studio: StudioApi;
  }
}

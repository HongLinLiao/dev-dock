import type { DevDockAPI } from "../electron/types";
declare global {
  interface Window {
    devdock?: DevDockAPI;
  }
}
export {};

import { contextBridge, ipcRenderer } from "electron";
import type { DevDockAPI, Snapshot } from "./types";
const api: DevDockAPI = {
  snapshot: () => ipcRenderer.invoke("snapshot"),
  stop: (id, force) => ipcRenderer.invoke("stop", id, force),
  preferences: (value) => ipcRenderer.invoke("preferences", value),
  open: (port) => ipcRenderer.invoke("open", port),
  reveal: (id) => ipcRenderer.invoke("reveal", id),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  onChange: (callback) => {
    const listener = (_: unknown, value: Snapshot) => callback(value);
    ipcRenderer.on("changed", listener);
    return () => ipcRenderer.removeListener("changed", listener);
  },
};
contextBridge.exposeInMainWorld("devdock", api);

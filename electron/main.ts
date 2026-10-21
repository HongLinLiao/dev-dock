import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  shell,
  dialog,
} from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { scan, processes, isSameStoppableService } from "./scanner";
import type {
  Activity,
  Preferences,
  Snapshot,
  Service,
  StopResult,
} from "./types";
let window: BrowserWindow | null = null,
  tray: Tray | null = null,
  quitting = false;
let services: Service[] = [],
  history: Activity[] = [],
  scannedAt = "",
  scanError: string | undefined;
let preferences: Preferences = {
  refreshSeconds: 5,
  launchAtLogin: false,
  showOther: false,
  longRunningHours: 8,
};
let timer: ReturnType<typeof setInterval> | undefined,
  scanning: Promise<Snapshot> | undefined,
  stopping = false;
const stateFile = () => path.join(app.getPath("userData"), "state.json");
const snapshot = (): Snapshot => ({
  services,
  history,
  preferences,
  scannedAt,
  hostname: os.hostname().replace(/\.local$/, ""),
  error: scanError,
});
let saveQueue = Promise.resolve();
function save() {
  const content = JSON.stringify({ history, preferences });
  const job = saveQueue
    .catch(() => {})
    .then(async () => {
      const file = stateFile();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(`${file}.tmp`, content);
      await fs.rename(`${file}.tmp`, file);
    });
  saveQueue = job;
  return job;
}
function publish() {
  window?.webContents.send("changed", snapshot());
  updateTray();
}
async function refresh(): Promise<Snapshot> {
  if (scanning) return scanning;
  scanning = (async () => {
    try {
      services = await scan();
      scannedAt = new Date().toISOString();
      scanError = undefined;
    } catch (e) {
      scanError = e instanceof Error ? e.message : String(e);
    }
    publish();
    return snapshot();
  })();
  try {
    return await scanning;
  } finally {
    scanning = undefined;
  }
}
function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => void refresh(), preferences.refreshSeconds * 1000);
}
async function showWindow() {
  if (quitting) return;
  if (process.platform === "darwin" && !app.dock?.isVisible()) {
    await app.dock?.show();
  }
  if (quitting) return;
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  window = new BrowserWindow({
    width: 1320,
    height: 870,
    minWidth: 980,
    minHeight: 700,
    title: "DevDock",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 22, y: 23 },
    backgroundColor: "#101419",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window?.hide();
      if (process.platform === "darwin") app.dock?.hide();
    }
  });
  window.on("closed", () => {
    window = null;
  });
  if (
    process.env.VITE_DEV_SERVER_URL === "http://127.0.0.1:5173" &&
    !app.isPackaged
  )
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(__dirname, "../dist/index.html"));
}
async function openService(port: number) {
  if (!Number.isInteger(port) || !services.some((s) => s.ports.includes(port)))
    throw new Error("此連接埠已不在目前的服務清單中。");
  await shell.openExternal(`http://localhost:${port}`);
}
async function stopService(
  id: unknown,
  force: unknown = false,
): Promise<StopResult> {
  if (typeof id !== "string" || typeof force !== "boolean")
    throw new Error("無效的程序識別碼。");
  if (stopping) throw new Error("另一個停止操作進行中，請稍後再試。");
  stopping = true;
  try {
    await refresh();
    const service = services.find((s) => s.id === id);
    if (!service || !service.canStop)
      throw new Error("程序已結束，或屬於受保護的服務。請重新整理後再試。");
    const options = {
      type: "warning" as const,
      title: force ? "強制停止服務" : "停止服務",
      message: `${force ? "強制停止" : "停止"} ${service.name}？`,
      detail: `PID ${service.pid} · Port ${service.ports.join(", ")}\n${service.cwd || service.command}\n\n${force ? "將送出 SIGKILL，尚未儲存的程序資料可能遺失。" : "將送出 SIGTERM，讓服務正常結束。若程序由其他工具管理，可能會自動重啟。"}`,
      buttons: ["取消", force ? "強制停止" : "停止服務"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const answer = window?.isVisible()
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    if (answer.response !== 1) return { status: "cancelled" };
    // Revalidate identity after the user has spent time in the confirmation dialog.
    const fresh = (await scan()).find((s) => s.id === service.id);
    if (!isSameStoppableService(service, fresh))
      throw new Error("程序狀態已變更，請重新整理。");
    process.kill(service.pid, force ? "SIGKILL" : "SIGTERM");
    let exited = false;
    for (let n = 0; n < 16; n++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const p = (await processes()).get(service.pid);
      if (!p || p.startedAt !== service.startedAt) {
        exited = true;
        break;
      }
    }
    if (exited) {
      history.unshift({
        id: `${Date.now()}-${service.pid}`,
        name: service.name,
        pid: service.pid,
        ports: service.ports,
        at: new Date().toISOString(),
        action: force ? "forced" : "stopped",
      });
      history = history.slice(0, 200);
      await save();
    }
    await refresh();
    return { status: exited ? "stopped" : "still-running", name: service.name };
  } finally {
    stopping = false;
  }
}
async function trayStop(service: Service) {
  try {
    const result = await stopService(service.id);
    if (result.status === "still-running") {
      const choice = await dialog.showMessageBox({
        type: "warning",
        message: `${service.name} 尚未結束`,
        detail: "正常停止未生效，可選擇強制停止。",
        buttons: ["保留服務", "強制停止"],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice.response === 1) await stopService(service.id, true);
    }
  } catch (e) {
    dialog.showErrorBox(
      "無法停止服務",
      e instanceof Error ? e.message : String(e),
    );
  }
}
function updateTray() {
  if (!tray) return;
  const list = services.filter((s) => preferences.showOther || s.development);
  tray.setToolTip(
    `DevDock · ${list.length} 個本機服務${scanError ? " · 掃描失敗" : ""}`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "DevDock", enabled: false },
      {
        label: scanError
          ? "掃描失敗，請開啟 DevDock 查看"
          : `${list.length} 個服務運行中`,
        enabled: false,
      },
      { type: "separator" },
      ...list.map((s) => ({
        label: `${s.name}  :${s.ports.join(", :")}`,
        submenu: [
          { label: `${s.runtime} · PID ${s.pid}`, enabled: false },
          {
            label: "在瀏覽器開啟",
            click: () =>
              void openService(s.ports[0]).catch((e) =>
                dialog.showErrorBox("無法開啟服務", String(e)),
              ),
          },
          {
            label: s.canStop ? "停止服務…" : "受保護 / 僅供檢視",
            enabled: s.canStop,
            click: () => void trayStop(s),
          },
        ],
      })),
      { type: "separator" },
      { label: "重新掃描", click: () => void refresh() },
      { label: "開啟 DevDock", click: () => void showWindow() },
      { label: "結束 DevDock", click: () => app.quit() },
    ]),
  );
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => void showWindow());
  app
    .whenReady()
    .then(async () => {
      try {
        const stored = JSON.parse(await fs.readFile(stateFile(), "utf8"));
        if (Array.isArray(stored.history))
          history = stored.history.slice(0, 200);
        if (stored.preferences)
          preferences = { ...preferences, ...stored.preferences };
      } catch {
        /* First launch. */
      }
      preferences.launchAtLogin = app.getLoginItemSettings().openAtLogin;
      if (![3, 5, 10, 30].includes(preferences.refreshSeconds))
        preferences.refreshSeconds = 5;
      if (![1, 4, 8, 24].includes(preferences.longRunningHours))
        preferences.longRunningHours = 8;
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "DevDock",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          { role: "editMenu" },
          { role: "viewMenu" },
          { role: "windowMenu" },
        ]),
      );
      const image = nativeImage.createFromPath(
        path.join(__dirname, "../public/trayTemplate.png"),
      );
      image.setTemplateImage(true);
      tray = new Tray(image);
      updateTray();
      ipcMain.handle("snapshot", () => refresh());
      ipcMain.handle("stop", (_, id, force = false) => stopService(id, force));
      ipcMain.handle("open", (_, port) => openService(port));
      ipcMain.handle("reveal", async (_, id) => {
        const service = services.find((s) => s.id === id);
        if (!service?.cwd) throw new Error("此程序沒有可用的專案路徑。");
        const error = await shell.openPath(service.cwd);
        if (error) throw new Error(error);
      });
      ipcMain.handle("clear-history", async () => {
        history = [];
        await save();
        publish();
      });
      ipcMain.handle("preferences", async (_, value: Partial<Preferences>) => {
        if (!value || typeof value !== "object") throw new Error("無效設定");
        if (
          value.refreshSeconds !== undefined &&
          [3, 5, 10, 30].includes(value.refreshSeconds)
        )
          preferences.refreshSeconds = value.refreshSeconds;
        if (
          value.longRunningHours !== undefined &&
          [1, 4, 8, 24].includes(value.longRunningHours)
        )
          preferences.longRunningHours = value.longRunningHours;
        if (typeof value.showOther === "boolean")
          preferences.showOther = value.showOther;
        if (typeof value.launchAtLogin === "boolean") {
          app.setLoginItemSettings({ openAtLogin: value.launchAtLogin });
          preferences.launchAtLogin = app.getLoginItemSettings().openAtLogin;
        }
        await save();
        schedule();
        publish();
        return preferences;
      });
      await refresh();
      schedule();
      await showWindow();
      app.on("activate", () => void showWindow());
    })
    .catch((e) => {
      dialog.showErrorBox("DevDock 無法啟動", String(e));
      app.quit();
    });
  app.on("before-quit", () => {
    quitting = true;
    if (timer) clearInterval(timer);
  });
  app.on("window-all-closed", () => {
    /* Keep the menu bar utility running. */
  });
}

import type { DevDockAPI, Snapshot, Service } from "../electron/types";
const rows = [
  ["acme-web", "Next.js", 3000, 182, 1.8, 2700],
  ["design-system", "Vite", 5173, 94, 0.6, 6300],
  ["api-server", "Node.js", 4000, 128, 0.3, 35400],
  ["ai-playground", "Vite", 5174, 86, 0.1, 93600],
  ["content-api", "FastAPI", 8000, 67, 0.2, 5100],
  ["portfolio", "Next.js", 3001, 146, 0.0, 172800],
] as const;
let state: Snapshot = {
  services: rows.map(
    ([name, runtime, port, memory, cpu, uptime], i): Service => ({
      id: `preview-${i}`,
      pid: 24018 + i * 123,
      name,
      runtime,
      ports: [port],
      addresses: [`127.0.0.1:${port}`],
      command:
        runtime === "FastAPI"
          ? "python -m uvicorn main:app --reload"
          : `node node_modules/${runtime === "Next.js" ? "next/dist/bin/next" : runtime === "Vite" ? "vite/bin/vite.js" : "tsx/dist/cli.mjs"} dev`,
      cwd: `/Users/developer/Projects/${name}`,
      memory: memory * 1024 * 1024,
      cpu,
      uptime,
      startedAt: new Date(Date.now() - uptime * 1000).toString(),
      canStop: true,
      protected: false,
      development: true,
    }),
  ),
  history: [],
  preferences: {
    refreshSeconds: 5,
    launchAtLogin: false,
    showOther: false,
    longRunningHours: 8,
  },
  scannedAt: new Date().toISOString(),
  hostname: "MacBook Pro",
};
const listeners = new Set<(s: Snapshot) => void>();
const emit = () => listeners.forEach((fn) => fn({ ...state }));
export const previewAPI: DevDockAPI = {
  snapshot: async () => {
    state = { ...state, scannedAt: new Date().toISOString() };
    return state;
  },
  stop: async (id) => {
    const service = state.services.find((s) => s.id === id);
    if (
      !service ||
      !window.confirm(
        `這是介面預覽。要模擬停止 ${service.name} 嗎？\n不會影響電腦上的實際程序。`,
      )
    )
      return { status: "cancelled" };
    state = {
      ...state,
      services: state.services.filter((s) => s.id !== id),
      history: [
        {
          id: String(Date.now()),
          name: service.name,
          pid: service.pid,
          ports: service.ports,
          at: new Date().toISOString(),
          action: "stopped",
        },
        ...state.history,
      ],
    };
    emit();
    return { status: "stopped", name: service.name };
  },
  preferences: async (value) => {
    if (value.launchAtLogin)
      throw new Error("登入時啟動僅在 Electron 桌面版可用。");
    state = { ...state, preferences: { ...state.preferences, ...value } };
    emit();
    return state.preferences;
  },
  open: async () => {
    throw new Error(
      "介面預覽未連接本機服務，請使用 Electron 桌面版開啟實際服務。",
    );
  },
  reveal: async () => {
    throw new Error("在 Finder 顯示專案僅在 Electron 桌面版可用。");
  },
  clearHistory: async () => {
    state = { ...state, history: [] };
    emit();
  },
  onChange: (callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
};

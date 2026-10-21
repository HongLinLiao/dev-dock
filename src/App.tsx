import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  ExternalLink,
  Folder,
  FolderOpen,
  History,
  LayoutGrid,
  List,
  LoaderCircle,
  Monitor,
  MoreHorizontal,
  PanelTop,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import type { Preferences, Service, Snapshot } from "../electron/types";
import { previewAPI } from "./preview";
const isPreview = !window.devdock;
const api = window.devdock || previewAPI;
const memory = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : `${Math.round(n / 1024 ** 2)} MB`;
const duration = (seconds: number) =>
  seconds >= 86400
    ? `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小時`
    : seconds >= 3600
      ? `${Math.floor(seconds / 3600)} 小時 ${Math.floor((seconds % 3600) / 60)} 分`
      : `${Math.max(0, Math.floor(seconds / 60))} 分鐘`;
const time = (value: string) =>
  value
    ? new Date(value).toLocaleTimeString("zh-TW", { hour12: false })
    : "尚未更新";
const initial: Snapshot = {
  services: [],
  history: [],
  preferences: {
    refreshSeconds: 5,
    launchAtLogin: false,
    showOther: false,
    longRunningHours: 8,
  },
  scannedAt: "",
  hostname: "",
};
type Page = "services" | "projects" | "history" | "settings";
function RuntimeIcon({
  service,
  small = false,
}: {
  service: Service;
  small?: boolean;
}) {
  const Icon =
    service.runtime === "Vite"
      ? Zap
      : service.runtime === "FastAPI"
        ? Terminal
        : service.runtime === "Next.js"
          ? Box
          : Braces;
  return (
    <span
      className={`runtime-icon ${service.runtime.toLowerCase().replace(/\W/g, "")} ${small ? "small" : ""}`}
    >
      <Icon size={small ? 16 : 21} aria-hidden="true" />
    </span>
  );
}
function App() {
  const [data, setData] = useState(initial);
  const [page, setPage] = useState<Page>("services");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("port");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [forceId, setForceId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Service | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api.snapshot());
    } catch (e) {
      setToast({ message: String(e), error: true });
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return api.onChange(setData);
  }, [refresh]);
  useEffect(() => {
    if (!isPreview) return;
    const t = setInterval(() => {
      void refresh();
    }, data.preferences.refreshSeconds * 1000);
    return () => clearInterval(t);
  }, [refresh, data.preferences.refreshSeconds]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("services");
        setTimeout(() => search.current?.focus(), 0);
      }
      if (e.key === "Escape") setTrayOpen(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (selected) detailDialog.current?.showModal();
    else detailDialog.current?.close();
  }, [selected]);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);
  useEffect(() => {
    if (!trayOpen) return;
    const fn = (e: PointerEvent) => {
      if (!trayRef.current?.contains(e.target as Node)) setTrayOpen(false);
    };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, [trayOpen]);
  const services = data.services.filter(
    (s) => data.preferences.showOther || s.development,
  );
  const long = services.filter(
    (s) => s.canStop && s.uptime >= data.preferences.longRunningHours * 3600,
  );
  const projects = new Set(services.map((s) => s.cwd || s.name));
  const totalMemory = services.reduce((a, s) => a + s.memory, 0);
  const list = useMemo(
    () =>
      services
        .filter(
          (s) =>
            (filter !== "long" || long.some((l) => l.id === s.id)) &&
            (filter !== "protected" || !s.canStop) &&
            `${s.name} ${s.ports.join(" ")} ${s.pid} ${s.runtime} ${s.cwd}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "memory"
            ? b.memory - a.memory
            : sort === "uptime"
              ? b.uptime - a.uptime
              : a.ports[0] - b.ports[0],
        ),
    [services, long, filter, query, sort],
  );
  const stale =
    !!data.scannedAt &&
    Date.now() - new Date(data.scannedAt).getTime() >
      data.preferences.refreshSeconds * 3000;
  async function stop(service: Service, force = false) {
    setPending(service.id);
    try {
      const result = await api.stop(service.id, force);
      if (result.status === "stopped") {
        notify(`${result.name} 已${force ? "強制" : "正常"}停止`);
        setSelected(null);
        setForceId(null);
      } else if (result.status === "still-running") {
        setForceId(service.id);
        notify("服務尚未結束。確認狀態後，可選擇強制停止。", true);
      }
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    } finally {
      setPending(null);
    }
  }
  async function act(fn: () => Promise<unknown>, message?: string) {
    try {
      await fn();
      if (message) notify(message);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }
  async function preference(value: Partial<Preferences>) {
    await act(async () => {
      const preferences = await api.preferences(value);
      setData((d) => ({ ...d, preferences }));
    }, "設定已儲存");
  }
  function nav(next: Page) {
    setPage(next);
    setQuery("");
    setFilter("all");
  }
  const title = {
    services: "服務總覽",
    projects: "專案空間",
    history: "操作紀錄",
    settings: "偏好設定",
  }[page];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳至主要內容
      </a>
      <aside className="sidebar">
        <div className="window-drag" aria-hidden="true" />
        <a
          aria-label="DevDock 首頁"
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("services");
          }}
        >
          <img src="./favicon.svg" alt="" />
          <span>
            DevDock<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-card">
          <span className="workspace-icon">
            <Monitor size={18} />
          </span>
          <div>
            <strong>Local workspace</strong>
            <span title={data.hostname}>
              {data.hostname || "此 Mac 上的開發服務"}
            </span>
          </div>
          <span className="online-dot" />
        </div>
        <nav aria-label="主要導覽">
          <button
            aria-label="服務總覽"
            className={page === "services" ? "nav-item active" : "nav-item"}
            onClick={() => nav("services")}
            aria-current={page === "services" ? "page" : undefined}
          >
            <LayoutGrid size={18} />
            <span>服務總覽</span>
            <span className="nav-count">{services.length}</span>
          </button>
          <button
            aria-label="專案空間"
            className={page === "projects" ? "nav-item active" : "nav-item"}
            onClick={() => nav("projects")}
            aria-current={page === "projects" ? "page" : undefined}
          >
            <Folder size={18} />
            <span>專案空間</span>
          </button>
          <button
            aria-label="操作紀錄"
            className={page === "history" ? "nav-item active" : "nav-item"}
            onClick={() => nav("history")}
            aria-current={page === "history" ? "page" : undefined}
          >
            <History size={18} />
            <span>操作紀錄</span>
            {data.history.length > 0 && (
              <span className="nav-count">{data.history.length}</span>
            )}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            aria-label="偏好設定"
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => nav("settings")}
          >
            <Settings2 size={18} />
            <span>偏好設定</span>
          </button>
          <button
            aria-label="使用說明"
            className="nav-item"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
            <span>使用說明</span>
            <ArrowUpRight size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Monitor size={15} />
            <span>工作空間</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <span
              className={`connection ${data.error || stale ? "warning-text" : ""}`}
            >
              <span className="online-dot" />
              {isPreview
                ? "介面預覽"
                : data.error
                  ? "掃描異常"
                  : stale
                    ? "資料待更新"
                    : "本機監測中"}
            </span>
            <span className="top-divider" />
            <div ref={trayRef} className="tray-anchor">
              <button
                className={`icon-button ${trayOpen ? "pressed" : ""}`}
                title="選單列快速面板"
                aria-label="選單列快速面板"
                aria-expanded={trayOpen}
                onClick={() => setTrayOpen(!trayOpen)}
              >
                <PanelTop size={19} />
              </button>
              {trayOpen && (
                <div className="tray-popover">
                  <div className="tray-title">
                    <img src="./favicon.svg" alt="" />
                    <strong>DevDock</strong>
                    <span>{services.length} 個服務</span>
                  </div>
                  <div className="tray-services">
                    {services.length === 0 && <p>目前沒有監聽中的服務</p>}
                    {services.map((s) => (
                      <div key={s.id}>
                        <RuntimeIcon service={s} small />
                        <span>
                          <strong>{s.name}</strong>
                          <small>localhost:{s.ports[0]}</small>
                        </span>
                        <button
                          aria-label={`停止 ${s.name}`}
                          className="icon-button stop-icon"
                          disabled={!s.canStop || !!pending}
                          onClick={() => void stop(s)}
                        >
                          <Square size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="tray-bottom"
                    onClick={() => {
                      nav("services");
                      setTrayOpen(false);
                    }}
                  >
                    查看所有服務
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <button
              className="avatar"
              title="本機工作空間"
              onClick={() => nav("settings")}
              aria-label="開啟本機工作空間設定"
            >
              <Terminal size={17} />
            </button>
          </div>
        </header>
        <main id="main">
          {isPreview && (
            <div className="preview-banner">
              <Monitor size={14} />
              <span>
                瀏覽器預覽 · 以下為示範資料，桌面版會顯示真實本機服務。
              </span>
              <span className="mono">npm run dev</span>
            </div>
          )}
          <section className="page-heading">
            <h1>{title}</h1>
            <button
              className="button refresh-button"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw size={15} className={busy ? "spin" : ""} />
              {busy ? "掃描中" : "重新掃描"}
              <kbd>↻</kbd>
            </button>
          </section>
          {data.error && (
            <div className="error-banner" role="alert">
              <strong>無法取得最新服務</strong>
              <span>{data.error}</span>
              <button onClick={() => void refresh()}>重試</button>
            </div>
          )}
          {(page === "services" || page === "projects") && (
            <>
              <section className="stats-grid" aria-label="服務統計">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>運行中的服務</span>
                    <span className="stat-symbol green">
                      <Server size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {busy && !data.scannedAt ? "—" : services.length}
                    <span>個服務</span>
                    <div className="activity-bars" aria-hidden="true">
                      {[7, 13, 9, 20, 14, 26, 18, 32, 24, 36, 29, 42].map(
                        (h, i) => (
                          <i
                            key={i}
                            style={{
                              height: services.length ? `${h}px` : "3px",
                              opacity: 0.2 + i * 0.06,
                            }}
                          />
                        ),
                      )}
                    </div>
                  </div>
                  <div className="stat-bottom">
                    <span className="online-dot" />
                    {projects.size} 個專案
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>服務記憶體用量</span>
                    <span className="stat-symbol blue">
                      <Cpu size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {totalMemory >= 1024 ** 3
                      ? (totalMemory / 1024 ** 3).toFixed(2)
                      : Math.round(totalMemory / 1024 ** 2)}
                    <span>{totalMemory >= 1024 ** 3 ? "GB" : "MB"}</span>
                  </div>
                  <div
                    className="memory-distribution"
                    aria-label="各程序記憶體用量分布"
                  >
                    {services.slice(0, 12).map((s, i) => (
                      <i
                        key={s.id}
                        title={`${s.name}: ${memory(s.memory)}`}
                        style={{
                          flex: Math.max(1, s.memory),
                          opacity: 1 - i * 0.055,
                        }}
                      />
                    ))}
                  </div>
                  <div className="stat-bottom">程序 RSS 合計</div>
                </div>
                <button
                  className="stat-card actionable"
                  onClick={() => {
                    nav("services");
                    setFilter("long");
                  }}
                >
                  <div className="stat-top">
                    <span>長時間運行</span>
                    <span className="stat-symbol amber">
                      <Clock3 size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {long.length}
                    <span>個服務</span>
                    <ArrowUpRight size={23} className="stat-arrow" />
                  </div>
                  <div className="stat-bottom">
                    <span className="amber-dot" />
                    已運行超過 {data.preferences.longRunningHours} 小時
                  </div>
                </button>
              </section>
            </>
          )}
          {page === "services" && (
            <section className="services-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    本機服務<span>{services.length}</span>
                  </h2>
                </div>
                <div className="view-switch" aria-label="檢視方式">
                  <button
                    className="selected"
                    title="清單檢視"
                    aria-label="清單檢視"
                    aria-pressed="true"
                  >
                    <List size={17} />
                  </button>
                  <button
                    title="專案檢視"
                    aria-label="專案檢視"
                    onClick={() => nav("projects")}
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>
              </div>
              <div className="table-toolbar">
                <div className="filter-tabs" aria-label="篩選服務">
                  {[
                    ["all", "所有服務", services.length],
                    ["long", "長時間運行", long.length],
                    [
                      "protected",
                      "僅供檢視",
                      services.filter((s) => !s.canStop).length,
                    ],
                  ].map(([id, label, count]) => (
                    <button
                      key={id}
                      aria-pressed={filter === id}
                      onClick={() => setFilter(String(id))}
                      className={filter === id ? "selected" : ""}
                    >
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="search-box">
                  <Search size={15} />
                  <input
                    ref={search}
                    aria-label="搜尋服務、連接埠或 PID"
                    placeholder="搜尋服務、Port 或 PID…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <kbd>⌘ K</kbd>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="name-col">服務 / 專案</th>
                      <th>連接埠</th>
                      <th>程序 PID</th>
                      <th>
                        <button
                          onClick={() =>
                            setSort(sort === "memory" ? "port" : "memory")
                          }
                        >
                          記憶體{sort === "memory" && <ArrowDown size={12} />}
                        </button>
                      </th>
                      <th>
                        <button
                          onClick={() =>
                            setSort(sort === "uptime" ? "port" : "uptime")
                          }
                        >
                          運行時間{sort === "uptime" && <ArrowDown size={12} />}
                        </button>
                      </th>
                      <th className="actions-col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="service-name"
                            onClick={() => setSelected(s)}
                          >
                            <RuntimeIcon service={s} />
                            <span>
                              <strong>
                                {s.name}
                                {s.protected && <ShieldCheck size={13} />}
                              </strong>
                              <small>
                                {s.runtime}
                                <span className="small-dot" />
                                運行中
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <div className="ports">
                            {s.ports.map((port) => (
                              <button
                                key={port}
                                className="port"
                                title={`在瀏覽器開啟 localhost:${port}`}
                                onClick={() => void act(() => api.open(port))}
                              >
                                <span>:</span>
                                {port}
                                <ArrowUpRight size={11} />
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="mono muted">{s.pid}</td>
                        <td>
                          <span className="resource-value">
                            {memory(s.memory)}
                          </span>
                          <div className="resource-track">
                            <i
                              style={{
                                width: `${Math.min(100, Math.max(3, (s.memory / Math.max(totalMemory, 1)) * 100))}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <span
                            className={`uptime ${long.some((l) => l.id === s.id) ? "long-running" : ""}`}
                          >
                            {long.some((l) => l.id === s.id) && (
                              <Clock3 size={12} />
                            )}{" "}
                            {duration(s.uptime)}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="stop-button"
                              title={
                                s.canStop
                                  ? "確認後正常停止服務"
                                  : "此程序受保護或非開發服務"
                              }
                              disabled={!s.canStop || !!pending}
                              onClick={() => void stop(s, forceId === s.id)}
                            >
                              {pending === s.id ? (
                                <LoaderCircle size={12} className="spin" />
                              ) : s.canStop ? (
                                <Square size={10} />
                              ) : (
                                <ShieldCheck size={12} />
                              )}
                              <span>
                                {pending === s.id
                                  ? "停止中"
                                  : forceId === s.id
                                    ? "強制停止"
                                    : s.canStop
                                      ? "停止"
                                      : "保護中"}
                              </span>
                            </button>
                            <button
                              className="icon-button more"
                              aria-label={`檢視 ${s.name} 的詳細資訊`}
                              onClick={() => setSelected(s)}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!list.length && (
                <div className="empty-state">
                  <span>
                    <Server size={30} />
                  </span>
                  <h3>
                    {query
                      ? "找不到符合的服務"
                      : filter !== "all"
                        ? "沒有符合篩選的服務"
                        : "沒有運行中的服務"}
                  </h3>
                  <p>
                    {query
                      ? "試試專案名稱、連接埠或 PID。"
                      : filter !== "all"
                        ? "切換到所有服務，查看其他運行中的程序。"
                        : "啟動開發服務後會自動顯示。"}
                  </p>
                  {(query || filter !== "all") && (
                    <button
                      className="button"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      顯示所有服務
                    </button>
                  )}
                </div>
              )}
              <div className="table-footer">
                <span>
                  <span className="online-dot" />
                  顯示 {list.length} / {services.length} 個服務
                </span>
                <label>
                  排序方式
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="服務排序"
                  >
                    <option value="port">連接埠</option>
                    <option value="memory">記憶體用量</option>
                    <option value="uptime">運行時間</option>
                  </select>
                  <ChevronDown size={12} />
                </label>
              </div>
            </section>
          )}
          {page === "projects" && (
            <section>
              <div className="section-title">
                <h2>
                  專案<span>{projects.size}</span>
                </h2>
              </div>
              <div className="project-grid">
                {[...projects].map((project) => {
                  const group = services.filter(
                    (s) => (s.cwd || s.name) === project,
                  );
                  return (
                    <article className="project-card" key={project}>
                      <div className="project-top">
                        <span className="project-folder">
                          <Folder size={22} />
                        </span>
                        <span className="live-pill">
                          <span className="online-dot" />
                          {group.length} 個服務
                        </span>
                      </div>
                      <h3>{group[0].name}</h3>
                      <p title={project} className="project-path">
                        {project}
                      </p>
                      <div className="project-services">
                        {group.map((s) => (
                          <button key={s.id} onClick={() => setSelected(s)}>
                            <RuntimeIcon service={s} small />
                            <span>{s.runtime}</span>
                            <code>:{s.ports.join(", :")}</code>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </div>
                      <div className="project-bottom">
                        <span>
                          <Cpu size={13} />
                          {memory(group.reduce((a, s) => a + s.memory, 0))}
                        </span>
                        <button
                          onClick={() =>
                            void act(() => api.reveal(group[0].id))
                          }
                        >
                          開啟資料夾
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!projects.size && (
                <div className="empty-state">
                  <FolderOpen size={32} />
                  <h3>沒有運行中的專案</h3>
                  <p>啟動開發服務後會依工作目錄分組。</p>
                </div>
              )}
            </section>
          )}
          {page === "history" && (
            <section className="services-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    最近的操作<span>{data.history.length}</span>
                  </h2>
                  <p>最多保留最近 200 筆停止紀錄。</p>
                </div>
                <button
                  className="button"
                  disabled={!data.history.length}
                  onClick={() => {
                    if (window.confirm("清除本機的所有操作紀錄？"))
                      void act(() => api.clearHistory(), "操作紀錄已清除");
                  }}
                >
                  清除紀錄
                </button>
              </div>
              {data.history.length ? (
                <div className="history-list">
                  {data.history.map((h) => (
                    <div key={h.id}>
                      <span className="history-icon">
                        <CheckCheck size={18} />
                      </span>
                      <div>
                        <strong>
                          {h.name}{" "}
                          <span>
                            已{h.action === "forced" ? "強制" : "正常"}停止
                          </span>
                        </strong>
                        <p>
                          PID {h.pid} · Port {h.ports.join(", ")} ·{" "}
                          {h.action === "forced" ? "SIGKILL" : "SIGTERM"}
                        </p>
                      </div>
                      <time dateTime={h.at}>
                        {new Date(h.at).toLocaleDateString("zh-TW")}{" "}
                        {time(h.at)}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span>
                    <History size={30} />
                  </span>
                  <h3>尚無操作紀錄</h3>
                  <p>停止服務後會顯示紀錄。</p>
                </div>
              )}
            </section>
          )}
          {page === "settings" && (
            <section className="settings-panel">
              <div className="settings-section">
                <div className="settings-label">
                  <Settings2 size={20} />
                  <h2>一般設定</h2>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>登入時啟動</strong>
                  </div>
                  <button
                    role="switch"
                    aria-checked={data.preferences.launchAtLogin}
                    aria-label="登入時啟動"
                    className={`toggle ${data.preferences.launchAtLogin ? "on" : ""}`}
                    onClick={() =>
                      void preference({
                        launchAtLogin: !data.preferences.launchAtLogin,
                      })
                    }
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>更新頻率</strong>
                  </div>
                  <select
                    aria-label="更新頻率"
                    value={data.preferences.refreshSeconds}
                    onChange={(e) =>
                      void preference({ refreshSeconds: +e.target.value })
                    }
                  >
                    {[3, 5, 10, 30].map((n) => (
                      <option key={n} value={n}>
                        每 {n} 秒
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>長時間運行提醒</strong>
                    <p>僅標示時間，不會自動停止。</p>
                  </div>
                  <select
                    aria-label="長時間運行提醒"
                    value={data.preferences.longRunningHours}
                    onChange={(e) =>
                      void preference({ longRunningHours: +e.target.value })
                    }
                  >
                    {[1, 4, 8, 24].map((n) => (
                      <option key={n} value={n}>
                        {n} 小時
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>顯示其他監聽程序</strong>
                    <p>非開發程序僅供檢視。</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={data.preferences.showOther}
                    aria-label="顯示其他監聽程序"
                    className={`toggle ${data.preferences.showOther ? "on" : ""}`}
                    onClick={() =>
                      void preference({
                        showOther: !data.preferences.showOther,
                      })
                    }
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <div className="version-info">
                  <img src="./favicon.svg" alt="" />
                  <div>
                    <strong>
                      DevDock <span>0.1.0</span>
                    </strong>
                  </div>
                </div>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>
              <RefreshCw size={12} className={busy ? "spin" : ""} />{" "}
              {data.error ? "掃描失敗" : `上次掃描 ${time(data.scannedAt)}`}
              <span className="footer-dot">·</span>每{" "}
              {data.preferences.refreshSeconds} 秒更新
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={detailDialog}
        className="detail-dialog"
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <>
            <div className="dialog-header">
              <RuntimeIcon service={selected} />
              <div>
                <h2>{selected.name}</h2>
                <span>{selected.runtime} · 程序詳細資訊</span>
              </div>
              <button
                className="icon-button"
                aria-label="關閉詳細資訊"
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="detail-status">
              <span className="online-dot" />
              最近掃描時運行中<span className="mono">PID {selected.pid}</span>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>記憶體</dt>
                <dd>{memory(selected.memory)}</dd>
              </div>
              <div>
                <dt>CPU</dt>
                <dd>{selected.cpu.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>運行時間</dt>
                <dd>{duration(selected.uptime)}</dd>
              </div>
              <div>
                <dt>連接埠</dt>
                <dd className="mono">{selected.ports.join(", ")}</dd>
              </div>
            </dl>
            <div className="detail-block">
              <h3>工作目錄</h3>
              <code>{selected.cwd || "無法取得工作目錄"}</code>
              {selected.cwd && (
                <button onClick={() => void act(() => api.reveal(selected.id))}>
                  <FolderOpen size={14} />在 Finder 中開啟
                  <ArrowUpRight size={13} />
                </button>
              )}
            </div>
            <div className="detail-block">
              <h3>啟動指令</h3>
              <pre>{selected.command}</pre>
            </div>
            <div className="detail-block">
              <h3>監聽位址</h3>
              <code>{selected.addresses.join("\n")}</code>
            </div>
            {!selected.canStop && (
              <p className="protection-note">
                <ShieldCheck size={16} />
                此程序受保護或非開發服務，僅供檢視。
              </p>
            )}
            <div className="dialog-footer">
              <button
                className="button"
                onClick={() => void act(() => api.open(selected.ports[0]))}
              >
                開啟服務
                <ExternalLink size={14} />
              </button>
              <button
                className="button danger"
                disabled={!selected.canStop || !!pending}
                onClick={() => void stop(selected, forceId === selected.id)}
              >
                {pending === selected.id ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Square size={12} />
                )}{" "}
                {forceId === selected.id ? "強制停止服務" : "停止服務"}
              </button>
            </div>
          </>
        )}
      </dialog>
      <dialog
        ref={helpDialog}
        className="help-dialog"
        onCancel={() => setHelp(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelp(false);
        }}
      >
        <div className="dialog-header">
          <img src="./favicon.svg" width="42" alt="" />
          <div>
            <h2>使用說明</h2>
          </div>
          <button
            className="icon-button"
            aria-label="關閉使用說明"
            onClick={() => setHelp(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="help-body">
          {[
            [
              Search,
              "自動發現服務",
              "開啟 Vite、Next.js、Node.js 或 Python 服務，DevDock 會依 TCP 監聽程序找到它。",
            ],
            [
              Square,
              "停止服務",
              "點擊停止送出 SIGTERM；若仍未結束，可另行確認強制停止。若服務自動重啟，請從啟動它的工具關閉。",
            ],
            [
              PanelTop,
              "選單列",
              "關閉視窗後，點擊 macOS 選單列的 DevDock 圖示，即可查看服務。使用 ⌘Q 完整結束 App。",
            ],
            [
              Clock3,
              "運行時間提醒",
              "長時間運行不代表閒置，請先確認服務用途。Docker、系統及非開發程序僅供檢視。",
            ],
          ].map(([Icon, title, body], i) => {
            const I = Icon as typeof Search;
            return (
              <div key={i}>
                <span>
                  <I size={19} />
                </span>
                <div>
                  <h3>{String(title)}</h3>
                  <p>{String(body)}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="dialog-footer">
          <span className="help-shortcut">
            <kbd>⌘ K</kbd>快速搜尋服務
          </span>
          <button className="button primary" onClick={() => setHelp(false)}>
            關閉
            <ArrowRight size={14} />
          </button>
        </div>
      </dialog>
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "error" : ""}`}
        >
          <span>
            {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          </span>
          <p>{toast.message}</p>
          <button aria-label="關閉通知" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
export default App;

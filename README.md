# DevDock

一個為 macOS 打造的 Electron + React 開發服務管理工具。在視窗與選單列掌握本機服務，釋放忘記關閉的 localhost。

## 開發

需要 macOS、Node.js 22.12 以上與 npm。

```bash
npm install
npm run dev
```

`npm run dev` 啟動 Vite 與 Electron。React 介面支援即時更新；修改 `electron/` 後需重新啟動開發指令。使用中的 5173 連接埠需先釋放。

```bash
npm run dev:web  # 僅預覽介面，使用明確標示的示範資料
npm run build    # TypeScript 檢查與正式建置
npm start        # 啟動已建置的桌面版
npm test         # 解析、分類及真實 macOS TCP 掃描測試
npm run dist:dir # 產生 release/mac-arm64/DevDock.app（依架構而異）
npm run dist     # 產生 macOS DMG 與 ZIP
```

## 功能

- 每 3 / 5 / 10 / 30 秒掃描目前使用者的 TCP 監聽程序。
- 顯示服務名稱、工作目錄、runtime、連接埠、PID、CPU、RSS 記憶體與運行時間。
- 服務搜尋、連接埠／記憶體／運行時間排序、長時間運行與保護程序篩選。
- 依工作目錄分組專案；在瀏覽器開啟服務，或在 Finder 開啟目錄。
- 使用 macOS 原生確認視窗發送 SIGTERM；未結束時可另行確認發送 SIGKILL。
- 停止前重新掃描及核對 PID、啟動時間、指令與可操作狀態。
- 原生 macOS 選單列可查看與停止服務，關閉視窗後仍繼續運作；⌘Q 完整退出。
- 本機操作紀錄（最近 200 筆）、更新頻率、長時間門檻及登入啟動偏好。
- 深色介面、鍵盤操作、⌘K 搜尋、原生 dialog 焦點管理與減少動態效果。

## 程序範圍與限制

透過 macOS 內建 `lsof`、`ps` 讀取 TCP LISTEN 程序，並以 runtime 與指令辨識常見 Node.js、Vite、Next.js、Nuxt、Python、Ruby、PHP、Java 與 Go 開發服務。這是啟發式辨識，不代表能確定程序由 AI 啟動或已被遺忘。

長時間運行只代表超過設定門檻，**不代表閒置**。App 不會自動停止服務。非開發程序、其他使用者的程序、DevDock 自身、其祖先及子程序，以及此專案自身的開發服務都受保護。Docker 容器不透過停止 Docker 程序管理，目前僅供檢視。未監聽 TCP 的背景工作、UDP 及 Unix socket 不在掃描範圍。

每個 PID 顯示一筆，多個監聽 port 合併顯示。記憶體為程序 RSS，相加不等於獨佔實體記憶體；CPU 為 `ps` 提供的值。僅停止選取的程序，不遞迴殺死程序樹。由 npm、nodemon、Docker 或其他 supervisor 管理的服務可能重新啟動，需從來源工具關閉。

正式版所有字型皆隨 App 打包，不需要連網。設定與歷史儲存在 Electron `userData/state.json`（通常為 `~/Library/Application Support/DevDock/`）。開發模式使用 Electron 的開發資料目錄。登入啟動建議在打包後的 App 使用，以確保系統登錄正確的 App 路徑。

本地打包未設定 Apple Developer 簽章與 notarization；對外散佈前需另行設定。

## 設計

以全域 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 搜尋與設計建議建立。設計決策見 `design-system/devdock/MASTER.md`。

## 驗證紀錄

已通過 TypeScript、Vite 正式建置、macOS arm64 App 打包，以及 6 項 Node 測試（含真實 TCP fixture 掃描、IPv4/IPv6 合併、程序保護與 PID 身分變更拒絕）。瀏覽器已檢查搜尋、空狀態、導覽及詳細資訊。原生視窗自動化工具逾時，因此尚未完成原生停止對話框與選單列點擊的端到端驗證。

`npm audit --omit=dev` 無已知弱點；完整開發工具鏈目前有 8 個 moderate 間接依賴通報，來源為 electron-builder 的下載工具 `@electron/get` → `global-agent` → `roarr` → `sprintf-js`，不包含在正式 App 執行依賴。

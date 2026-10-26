# 開發環境

[← 回到 README](../README.md)

## 啟動

用 VS Code 開啟專案後選「Reopen in Container」。Dev Container 內有 Node 24、pnpm、Electron 執行環境與 noVNC，並把 8787（Worker）、6080（Electron 視窗）開到本機。

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # 本機密鑰，第一次需要
pnpm dev          # wrangler dev（本機 D1 + Durable Objects）：http://localhost:8787
pnpm dev:screen   # Electron 螢幕（連到 localhost:8787），視窗在 http://localhost:6080（noVNC，密碼 vscode）
```

本機頁面：

- 觀眾：<http://localhost:8787/>
- 瀏覽器螢幕：<http://localhost:8787/screen>
- 主持人：<http://localhost:8787/host/rooms>（`.dev.vars` 設 `DEV_LOGIN=true` 時可用「開發用登入」，不需要 Google client；只在 localhost 生效，正式環境不要設定）

## 檢查

```bash
pnpm test        # vitest（Worker 測試在 Workers runtime 內執行）
pnpm typecheck
pnpm lint        # eslint + prettier --check
pnpm format      # 自動修正
```

CI 在每次 push / PR 跑同樣的檢查，見 [部署、CI/CD 與發佈](deployment.md)。

## 專案結構

```
apps/
  worker/            Cloudflare Worker：src/（API、頁面、Durable Object、LINE、auth）、migrations/、client/（瀏覽器端 JS）、test/
  screen/            Electron 螢幕：src/main.ts、src/preload.ts、src/app/renderers/（控制面板與彈幕畫面）
packages/
  shared/            API 與 WebSocket 型別
  screen-core/       螢幕共用的連線、彈幕繪製、QR code、字型
docs/                文件與截圖
scripts/screenshots/ 重新產生文件截圖的腳本
```

## D1 schema 變更

在 `apps/worker/migrations/` 新增 `NNNN_描述.sql`。`pnpm dev` 會先套用到本機，部署時（CI 或 `pnpm --filter @danmu/worker run deploy`）會套用到正式環境。

## 更新文件截圖

`docs/images/` 的截圖用 `scripts/screenshots/` 的腳本在 Dev Container 內產生，資料來自本機 `wrangler dev`（示範資料，不碰正式環境）：

```bash
pnpm dev   # 另一個終端機，.dev.vars 需設 DEV_LOGIN=true
DISPLAY=:1 apps/screen/node_modules/.bin/electron scripts/screenshots/shoot.cjs docs/images "$(grep LINE_CHANNEL_SECRET apps/worker/.dev.vars | cut -d= -f2)"
```

桌面 app 控制面板的截圖：用 `--remote-debugging-port=9222` 啟動 Electron 後執行 `node scripts/screenshots/cdp-shot.mjs dashboard.html docs/images/electron-dashboard.png 1100 820`。

# danmu-classroom-screen

## 使用說明

下載與使用方式見 [彈幕教室 README](../../README.md#主持人開始上課)。

## 開發

這個 app 在 [danmu-classroom](../../README.md) monorepo 裡，用根目錄的 Dev Container 開發。

```bash
pnpm dev        # 先在另一個終端機啟動 Worker（http://localhost:8787）
pnpm dev:screen # 建置並以 development 模式啟動 Electron；視窗在 http://localhost:6080
pnpm --filter @danmu/screen electron:pack   # 打包（目前平台）
```

開發時連到 `http://localhost:8787`，可用 `DANMU_UPSTREAM` 改連其他位置。正式版連到 `https://danmu-classroom.danmu-worker.workers.dev`（`src/config/production.json`）。

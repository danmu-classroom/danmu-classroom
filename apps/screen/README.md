# danmu-classroom-screen

## 使用說明

1. 到 [Releases](https://github.com/danmu-classroom/danmu-classroom/releases?q=screen-v&expanded=true) 下載最新的 `screen-v*` 版本

   - macOS（Apple Silicon）：`danmu-classroom-screen-<版本>-mac-arm64.dmg`；Intel Mac：`…-mac-x64.dmg`
   - Windows：`danmu-classroom-screen-<版本>-win-x64.exe`（免安裝，直接執行）
   - Linux：`danmu-classroom-screen-<版本>-linux-x86_64.AppImage`

   安裝檔沒有簽章：macOS 第一次開啟若顯示「無法驗證開發者」，請到「系統設定 → 隱私權與安全性」按「強制打開」；Windows 出現 SmartScreen 時按「其他資訊 → 仍要執行」。

2. 打開 `danmu-classroom-screen`

3. 控制面板會顯示房號和兩個 QR code，觀眾任選一種方式送彈幕：
   - **網頁**：用手機掃左邊的 QR code（或打開下方網址），輸入訊息送出，不用登入
   - **LINE**：掃右邊的 QR code 加入好友，按「輸入房號」後輸入螢幕上的四位數字，之後傳的訊息都會變成彈幕

4. 想保存這間房的彈幕紀錄：按「保存到我的帳號」，在瀏覽器用 Google 登入後確認

## 開發

這個 app 在 [danmu-classroom](../../README.md) monorepo 裡，用根目錄的 Dev Container 開發。

```bash
pnpm dev        # 先在另一個終端機啟動 Worker（http://localhost:8787）
pnpm dev:screen # 建置並以 development 模式啟動 Electron；視窗在 http://localhost:6080
pnpm --filter @danmu/screen electron:pack   # 打包（目前平台）
```

開發時連到 `http://localhost:8787`，可用 `DANMU_UPSTREAM` 改連其他位置。正式版連到 `https://danmu-classroom.danmu-worker.workers.dev`（`src/config/production.json`）。

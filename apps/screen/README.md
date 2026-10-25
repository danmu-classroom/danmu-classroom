# danmu-classroom-screen

## 使用說明

1. 下載並解壓縮

   - Windows: <https://github.com/danmu-classroom/danmu-classroom-screen/releases/download/v0.4.1/danmu-classroom-screen.0.4.1.exe>
   - Mac: <https://github.com/danmu-classroom/danmu-classroom-screen/releases/download/v0.4.1/danmu-classroom-screen-0.4.1-mac.zip>
   - Linux: <https://github.com/danmu-classroom/danmu-classroom-screen/releases/download/v0.4.1/danmu-classroom-screen-0.4.1.AppImage>

2. 打開資料夾內的 `danmu-classroom-screen.exe` 或 `danmu-classroom-screen.app`

3. 掃描 QRCode 加入 Line 好友

4. 在 Line 聊天室中隨便打個字，等機器人回覆後按 `輸入房號`

5. 在 Line 聊天室輸入螢幕上的四位數字

6. 透過 Line 聊天室打字發送彈幕

## 開發

這個 app 在 [danmu-classroom](../../README.md) monorepo 裡，用根目錄的 Dev Container 開發。

```bash
pnpm dev        # 先在另一個終端機啟動 Worker（http://localhost:8787）
pnpm dev:screen # 建置並以 development 模式啟動 Electron；視窗在 http://localhost:6080
pnpm --filter @danmu/screen electron:pack   # 打包（目前平台）
```

開發時連到 `http://localhost:8787`，可用 `DANMU_UPSTREAM` 改連其他位置。正式版的網址在 `src/config/production.json`，部署 Worker（M5）後填入。

# 部署、CI/CD 與發佈

[← 回到 README](../README.md)

## 環境

正式環境：<https://danmu-classroom.danmu-worker.workers.dev>（Cloudflare Worker + D1 `danmu-classroom`，APAC）

## CI/CD（GitHub Actions）

| Workflow             | 觸發                                              | 做什麼                                                                                                                     |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | 每次 push、PR、手動                               | lint、typecheck、test；在 `main` 上通過後**自動部署 Worker**（build 瀏覽器端 JS → 套用 D1 migrations → `wrangler deploy`） |
| `release-screen.yml` | `main` 上 `apps/screen/package.json` 有變更、手動 | 版本號還沒發佈過時：測試 → 在 macOS／Windows／Linux 打包 Electron → 建立 GitHub Release 與 `screen-v<版本>` tag            |

部署需要 repo secret `CLOUDFLARE_API_TOKEN`（Cloudflare dashboard → My Profile → API Tokens，「Edit Cloudflare Workers」範本並加上 D1 Edit 權限）。

手動部署（已 `wrangler login`）：`pnpm --filter @danmu/worker run deploy`

## 發佈新版 Electron 螢幕

1. 修改 `apps/screen/package.json` 的 `version`（例如 `1.0.0` → `1.1.0`）
2. 在 `apps/screen/CHANGELOG.md` 寫下變更
3. Merge／push 到 `main`

`release-screen.yml` 會自動打包三個平台並發佈 Release；版本號沒變就不會重複發佈。安裝檔沒有程式碼簽章。

## Worker secrets

在 `apps/worker` 執行 `wrangler secret put <NAME>`：

| 名稱                                        | 來源                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_TOKEN` | [LINE Developers console](https://developers.line.biz/console/) → Messaging API channel 的 Channel secret 與 long-lived Channel access token |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`  | [Google Cloud console](https://console.cloud.google.com/auth/clients) → OAuth client（Web application）                                      |

本機開發的值放在 `apps/worker/.dev.vars`（參考 `.dev.vars.example`，不進版控）。

## 外部服務設定

- LINE Developers console → Messaging API → Webhook URL：`https://danmu-classroom.danmu-worker.workers.dev/api/line/callback`（開啟 Use webhook）
- Google OAuth client → Authorized redirect URIs：
  - `https://danmu-classroom.danmu-worker.workers.dev/auth/google/callback`
  - `http://localhost:8787/auth/google/callback`（本機）

## 歷史

這是 Cloudflare 上的重寫版本，取代已封存的 [danmu-classroom-server](https://github.com/danmu-classroom/danmu-classroom-server)（Rails / Heroku）與 [danmu-classroom-screen](https://github.com/danmu-classroom/danmu-classroom-screen)。

- M1：Worker + Room Durable Object + WebSocket、開房與房號配發、自動關房
- M2：LINE bot webhook
- M3：螢幕端（Electron 改用 WebSocket、瀏覽器版）
- M4：觀眾網頁、主持人 Google 登入與歷史紀錄
- M5：部署到 Cloudflare、CI/CD、Electron 自動發佈

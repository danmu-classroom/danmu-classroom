# 彈幕教室 Danmu Classroom

在課堂或活動上，讓觀眾透過 LINE 傳訊息，訊息會以彈幕形式飛過講者的螢幕。

這是在 Cloudflare 上的重寫版本，取代 [danmu-classroom-server](https://github.com/danmu-classroom/danmu-classroom-server)（Rails / Heroku）。

## 架構

```
LINE / 測試 client ──POST /api/rooms/:key/danmus──▶ Worker (Hono) ──RPC──▶ Room Durable Object ──WebSocket──▶ 螢幕
                                                       │                        │
                                                       └──── D1（房間、彈幕紀錄、發送者）◀── alarm 3 小時後關房
```

- **Worker**（`apps/worker`）：HTTP API，用 Hono 寫成。
- **Room Durable Object**：一間房一個。螢幕用 hibernatable WebSocket 連線，彈幕即時推送；沒有螢幕連線時先排入佇列，螢幕連上後補送。開房 3 小時後由 alarm 自動關房。
- **D1**：房間、彈幕紀錄、發送者（之後也存 LINE bot 的對話狀態）。房號只在「開放中的房間」之間唯一，由 partial unique index 保證。
- **`packages/shared`**：API 與 WebSocket 訊息的共用型別。

## API

| Method | Path                                 | 說明                                                                                                                 |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/rooms`                         | 開房，回傳房號與 `auth_token`（只回傳這一次）                                                                        |
| `GET`  | `/api/rooms`                         | 開放中的房間                                                                                                         |
| `GET`  | `/api/rooms/:key`                    | 單一房間                                                                                                             |
| `POST` | `/api/rooms/:key/danmus`             | 送彈幕 `{ "danmu": { "content": "...", "sender": { "provider": "line", "uid": "..." } } }`                           |
| `GET`  | `/api/rooms/:key/ws?auth_token=`     | 螢幕的 WebSocket，收到 `{ "type": "danmu", "danmu": {...} }` 與 `{ "type": "room_closed" }`；送 `ping` 會收到 `pong` |
| `GET`  | `/api/rooms/:key/danmus?auth_token=` | 輪詢（相容舊版螢幕），取出並清空佇列                                                                                 |

回應格式與舊版 Rails API 相同，舊版螢幕不用改就能連。

## 開發

用 VS Code 開啟後選「Reopen in Container」（Node 24、pnpm）。

```bash
pnpm dev        # wrangler dev（本機 D1 + Durable Objects），http://localhost:8787
pnpm test       # vitest，在 Workers runtime 內執行
pnpm typecheck
pnpm lint
```

## 進度

- [x] M1：Worker + Room Durable Object + WebSocket、開房與房號配發、自動關房
- [ ] M2：LINE bot webhook
- [ ] M3：螢幕端（Electron 改用 WebSocket、瀏覽器版）
- [ ] M4：網頁（介紹頁、主持人歷史紀錄）
- [ ] M5：部署（`wrangler deploy`、CI、LINE webhook 切換）

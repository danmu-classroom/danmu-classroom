import { ROOM_KEY_LENGTH, DANMU_MAX_LENGTH } from '@danmu/shared';
import { Hono } from 'hono';
import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import { findRoomByKey } from './db';

// Pages for the audience: join a room and send danmus from a phone or computer.
export const audience = new Hono<{ Bindings: Env }>();

const ROOM_KEY = new RegExp(`^\\d{${ROOM_KEY_LENGTH}}$`);

// Plain template literal (not html``) so formatters keep the CSS readable.
const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f6f6f4;
  --card: #fff;
  --text: #1f1f1d;
  --muted: #6b6a66;
  --border: #d9d8d2;
  --accent: #e8593c;
  --accent-text: #fff;
  --error: #b42318;
  --ok: #1d7a4f;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1b1a;
    --card: #262624;
    --text: #ecebe6;
    --muted: #a3a29c;
    --border: #3a3936;
    --error: #f08b80;
    --ok: #6fcf9f;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.6 system-ui, -apple-system, 'Noto Sans TC', sans-serif;
}
main { max-width: 480px; margin: 0 auto; padding: 24px 16px 40px; }
h1 { margin: 0 0 4px; font-size: 28px; }
.muted { color: var(--muted); margin: 0 0 20px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
input, button { font: inherit; font-size: 18px; border-radius: 10px; }
input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
}
button {
  width: 100%;
  margin-top: 12px;
  padding: 12px;
  border: 0;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
  cursor: pointer;
}
button:disabled { opacity: 0.5; }
.row { display: flex; justify-content: space-between; font-size: 14px; color: var(--muted); margin-top: 6px; }
.status-error { color: var(--error); }
.status-ok { color: var(--ok); }
ul { list-style: none; padding: 0; margin: 20px 0 0; }
li { padding: 8px 0; border-bottom: 1px solid var(--border); word-break: break-word; }
`;

function Layout({ title, children }: { title: string; children: Child }) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <style>{raw(STYLES)}</style>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

function JoinForm({ error }: { error?: string }) {
  return (
    <form class="card" action="/join" method="get">
      <label for="key">房號</label>
      <input
        id="key"
        name="key"
        inputmode="numeric"
        autocomplete="off"
        pattern={`\\d{${ROOM_KEY_LENGTH}}`}
        maxlength={ROOM_KEY_LENGTH}
        placeholder="螢幕上的 4 位數字"
        required
        autofocus
      />
      {error && <p class="status-error">{error}</p>}
      <button type="submit">進入房間</button>
    </form>
  );
}

audience.get('/', (c) =>
  c.html(
    <Layout title="彈幕教室">
      <h1>彈幕教室</h1>
      <p class="muted">輸入螢幕上的房號，就能把訊息變成彈幕送上螢幕。</p>
      <JoinForm />
    </Layout>,
  ),
);

audience.get('/join', (c) => {
  const key = (c.req.query('key') ?? '').trim();
  return ROOM_KEY.test(key) ? c.redirect(`/r/${key}`) : c.redirect('/');
});

audience.get('/r/:key', async (c) => {
  const key = c.req.param('key');
  if (!ROOM_KEY.test(key)) return c.redirect('/');

  const room = await findRoomByKey(c.env.DB, key);
  if (room?.online !== 1) {
    return c.html(
      <Layout title="彈幕教室">
        <h1>找不到房間 {key}</h1>
        <p class="muted">房號可能打錯了，或是這間房已經關閉。請確認螢幕上的房號。</p>
        <JoinForm />
      </Layout>,
      404,
    );
  }

  return c.html(
    <Layout title={`彈幕教室 · ${key}`}>
      <h1>房號 {key}</h1>
      <p class="muted">輸入訊息後送出，就會飛過講者的螢幕。</p>
      <form class="card" id="send-form" data-room-key={key} data-max-length={DANMU_MAX_LENGTH}>
        <input
          id="content"
          name="content"
          autocomplete="off"
          enterkeyhint="send"
          maxlength={DANMU_MAX_LENGTH}
          placeholder="想說的話…"
          required
          autofocus
        />
        <div class="row">
          <span id="status" role="status" aria-live="polite"></span>
          <span id="counter">0/{DANMU_MAX_LENGTH}</span>
        </div>
        <button type="submit" id="send">
          送出彈幕
        </button>
      </form>
      <ul id="sent" aria-label="已送出"></ul>
      <noscript>
        <p class="status-error">需要開啟 JavaScript 才能送出彈幕。</p>
      </noscript>
      <script type="module" src="/assets/send.js"></script>
    </Layout>,
  );
});

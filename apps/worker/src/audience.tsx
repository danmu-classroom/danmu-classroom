import { ROOM_KEY_LENGTH, DANMU_MAX_LENGTH } from '@danmu/shared';
import { Hono } from 'hono';
import { findRoomByKey } from './db';
import { Layout } from './layout';

// Pages for the audience: join a room and send danmus from a phone or computer.
export const audience = new Hono<{ Bindings: Env }>();

const ROOM_KEY = new RegExp(`^\\d{${ROOM_KEY_LENGTH}}$`);

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
      <p class="muted" style="margin-top: 24px">
        主持人？<a href="/host/rooms">登入看房間紀錄</a> · <a href="/screen">開一個螢幕</a>
      </p>
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

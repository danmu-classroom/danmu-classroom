import { Hono } from 'hono';
import { raw } from 'hono/html';
import { audience } from './audience';
import { Layout } from './layout';

export const pages = new Hono<{ Bindings: Env }>();

pages.route('/', audience);

// Plain template literal (not a JSX child) so formatters keep it readable.
const SCREEN_CSS = `
@font-face {
  font-family: '思源柔黑體';
  src: url('/assets/fonts/GenJyuuGothic-Bold.ttf') format('truetype');
  font-display: swap;
}
html, body { margin: 0; height: 100%; overflow: hidden; }
#danmu-canvas { position: fixed; inset: 0; }
#room {
  position: fixed;
  left: 12px;
  bottom: 8px;
  font: 600 20px '思源柔黑體', system-ui, sans-serif;
  color: #fff;
  -webkit-text-stroke: 1px #000;
}
#join {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 168px;
  padding: 10px;
  background: #fff;
  border-radius: 12px;
  text-align: center;
  font: 600 14px system-ui, sans-serif;
  color: #1f1f1d;
}
#join[hidden] { display: none; }
#join svg { display: block; width: 100%; height: auto; }
`;

// Only accept plain CSS colors for ?bg= (it is written into a <style> block).
const CSS_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

/**
 * Browser screen: opens a room and draws its danmus. The background is transparent so it can
 * be used as an OBS browser source; `?bg=green` (or `#00ff00`) sets a solid color instead.
 */
pages.get('/screen', (c) => {
  const bg = c.req.query('bg') ?? '';
  const background = CSS_COLOR.test(bg) ? bg : 'transparent';
  const showJoinQr = c.req.query('qr') !== '0';

  return c.html(
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>彈幕教室</title>
        <link
          rel="preload"
          href="/assets/fonts/GenJyuuGothic-Bold.ttf"
          as="font"
          type="font/ttf"
          crossorigin="anonymous"
        />
        <style>{raw(`${SCREEN_CSS}\nhtml, body { background: ${background}; }`)}</style>
        <script type="module" src="/assets/screen.js"></script>
      </head>
      <body>
        <canvas id="danmu-canvas"></canvas>
        <div id="room" data-testid="room">
          連線中…
        </div>
        {showJoinQr && (
          <div id="join" hidden>
            <div id="join-qr"></div>
            <div id="join-url"></div>
          </div>
        )}
      </body>
    </html>,
  );
});

const REPO_ISSUES = 'https://github.com/danmu-classroom/danmu-classroom/issues';

pages.get('/privacy', (c) =>
  c.html(
    <Layout title="隱私權政策 · 彈幕教室">
      <h1>隱私權政策</h1>
      <p class="muted">最後更新：2026-11-17</p>

      <h2>我們收集哪些資料</h2>
      <ul class="plain">
        <li>
          <strong>主持人（使用 Google 登入）</strong>：Google
          帳號的識別碼、姓名、電子郵件地址與大頭貼網址。只用來讓你登入，並把你開過的房間與彈幕紀錄歸在你的帳號下。我們不會讀取你
          Google 帳號裡的其他資料。
        </li>
        <li>
          <strong>登入狀態</strong>：登入後會在你的瀏覽器存一個 cookie，30
          天後失效；伺服器只保存它的雜湊值。
        </li>
        <li>
          <strong>房間</strong>：房號、開房時間，以及開房裝置的 IP 位址（用來防止濫用）。
        </li>
        <li>
          <strong>觀眾送出的彈幕</strong>
          ：彈幕內容與送出時間。從網頁送出時，會附上一組存在你瀏覽器裡的匿名編號；從 LINE
          送出時，會附上 LINE 提供的使用者編號。我們不會取得你的 LINE 名稱或大頭貼。
        </li>
      </ul>

      <h2>這些資料怎麼使用</h2>
      <ul class="plain">
        <li>把彈幕顯示在該房間的螢幕上，並讓房間的主持人事後查看紀錄。</li>
        <li>限制單一發送者的送出頻率，避免洗版。</li>
        <li>不會用於廣告，也不會賣給或提供給其他人。本站沒有使用流量分析或廣告追蹤工具。</li>
      </ul>

      <h2>資料存放在哪裡、保存多久</h2>
      <ul class="plain">
        <li>資料存放在 Cloudflare（Workers 與 D1 資料庫）。</li>
        <li>房間開啟 3 小時後會自動關閉；房間與彈幕紀錄目前不會自動刪除。</li>
      </ul>

      <h2>你的權利</h2>
      <p>
        你可以要求查看或刪除你的帳號、房間與彈幕紀錄，也可以隨時到 Google
        帳號的「第三方應用程式與服務」移除彈幕教室的存取權。請到 <a href={REPO_ISSUES}>GitHub</a>{' '}
        開一則 issue 聯絡我們（issue 是公開的，請不要在裡面貼個人資料）。
      </p>

      <h2>政策更新</h2>
      <p>這份政策有變動時，會更新本頁與上方的日期。</p>

      <p class="muted" style="margin-top: 24px">
        <a href="/">回首頁</a>
      </p>
    </Layout>,
  ),
);

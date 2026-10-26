import { Hono } from 'hono';
import { raw } from 'hono/html';
import { audience } from './audience';

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

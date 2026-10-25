import { Hono } from 'hono';
import { html } from 'hono/html';

export const pages = new Hono<{ Bindings: Env }>();

// Only accept plain CSS colors for ?bg= (it is written into a <style> block).
const CSS_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

/**
 * Browser screen: opens a room and draws its danmus. The background is transparent so it can
 * be used as an OBS browser source; `?bg=green` (or `#00ff00`) sets a solid color instead.
 */
pages.get('/screen', (c) => {
  const bg = c.req.query('bg') ?? '';
  const background = CSS_COLOR.test(bg) ? bg : 'transparent';

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
        <style>{html`
          @font-face { font-family: '思源柔黑體'; src: url('/assets/fonts/GenJyuuGothic-Bold.ttf')
          format('truetype'); font-display: swap; } html, body { margin: 0; height: 100%; overflow:
          hidden; background: ${background}; } #danmu-canvas { position: fixed; inset: 0; } #room {
          position: fixed; left: 12px; bottom: 8px; font: 600 20px '思源柔黑體', system-ui,
          sans-serif; color: #fff; -webkit-text-stroke: 1px #000; }
        `}</style>
        <script type="module" src="/assets/screen.js"></script>
      </head>
      <body>
        <canvas id="danmu-canvas"></canvas>
        <div id="room" data-testid="room">
          連線中…
        </div>
      </body>
    </html>,
  );
});

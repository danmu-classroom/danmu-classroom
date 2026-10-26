// Screenshot of a page in a running Electron app (started with --remote-debugging-port=9222).
// usage: node scripts/screenshots/cdp-shot.mjs <page-url-substring> <out.png> <width> <height>
import { writeFileSync } from 'node:fs';
const [page, out, width, height] = process.argv.slice(2);
const targets = await (await fetch('http://localhost:9222/json')).json();
const ws = new WebSocket(targets.find((t) => t.url.includes(page)).webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const call = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    ws.addEventListener('message', function on(e) {
      const m = JSON.parse(e.data);
      if (m.id === n) {
        ws.removeEventListener('message', on);
        resolve(m.result);
      }
    });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
await call('Emulation.setDeviceMetricsOverride', {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: false,
});
await call('Runtime.evaluate', {
  expression:
    "document.head.insertAdjacentHTML('beforeend', '<style>::-webkit-scrollbar{display:none}</style>')",
});
await new Promise((r) => setTimeout(r, 800));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
await call('Emulation.clearDeviceMetricsOverride');
console.log('saved', out);
ws.close();

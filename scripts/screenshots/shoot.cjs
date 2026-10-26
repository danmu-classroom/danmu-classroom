// Takes the step-by-step screenshots for the user guide against a local `wrangler dev`.
// Run with Electron inside the dev container, see docs/development.md:
//   DISPLAY=:1 electron scripts/screenshots/shoot.cjs <outDir> <localLineChannelSecret>
const { app, BrowserWindow } = require('electron');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://localhost:8787';
const [outDir, lineSecret] = process.argv.slice(-2);
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

app.commandLine.appendSwitch('disable-gpu');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(url, { width = 1280, height = 800, mobile = false, partition } = {}) {
  // Offscreen rendering: any size, crisp 2x output, independent of the (small) VNC display.
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: { offscreen: { deviceScaleFactor: 2 }, ...(partition ? { partition } : {}) },
  });
  if (mobile) win.webContents.setUserAgent(MOBILE_UA);
  win.webContents.on('dom-ready', () => {
    void win.webContents.insertCSS('::-webkit-scrollbar { display: none; }');
  });
  await win.loadURL(url);
  await sleep(800);
  return win;
}

const run = (win, js) => win.webContents.executeJavaScript(js, true);

async function shot(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
  console.log('saved', name, image.getSize());
}

async function postDanmu(key, content, uid) {
  const res = await fetch(`${BASE}/api/rooms/${key}/danmus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ danmu: { content, sender: { provider: 'web', uid } } }),
  });
  if (res.status !== 201) throw new Error(`danmu ${res.status}`);
}

async function lineEvent(user, event) {
  const body = JSON.stringify({
    destination: 'bot',
    events: [{ replyToken: 'r', source: { type: 'user', userId: user }, ...event }],
  });
  const signature = createHmac('sha256', lineSecret).update(body).digest('base64');
  await fetch(`${BASE}/api/line/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Line-Signature': signature },
    body,
  });
}

async function lineDanmu(user, key, text) {
  await lineEvent(user, {
    type: 'postback',
    postback: { data: 'action=ask_for_setting_room_key' },
  });
  await lineEvent(user, { type: 'message', message: { type: 'text', text: key } });
  await lineEvent(user, { type: 'message', message: { type: 'text', text } });
}

// A sample slide behind the transparent danmu canvas, to show how the screen overlays a presentation.
const SLIDE = `
  const slide = document.createElement('div');
  slide.innerHTML = '<h1>第三章\u3000光合作用</h1><ul><li>光反應：在葉綠體的類囊體進行</li><li>暗反應（卡爾文循環）：在基質進行</li><li>產物：葡萄糖與氧氣</li></ul>';
  Object.assign(slide.style, { position: 'fixed', inset: '0', padding: '72px 96px', background: '#f7f6f2', color: '#2b2b28', font: '500 30px system-ui, sans-serif', lineHeight: '2', zIndex: '-1' });
  slide.querySelector('h1').style.cssText = 'font-size: 52px; margin: 0 0 32px; color: #1d5a8a';
  document.body.prepend(slide);
  document.getElementById('room').style.color = '#2b2b28';
  document.getElementById('room').style.webkitTextStroke = '0';
`;

app.whenReady().then(async () => {
  try {
    // Host login page (signed out), as production shows it: SSO only.
    const login = await open(`${BASE}/login?next=%2Fhost%2Frooms`, {
      width: 900,
      height: 460,
      partition: 'anon',
    });
    await run(login, `document.querySelector('form[action="/auth/dev"]')?.remove()`);
    await shot(login, 'host-login');
    login.close();

    // Sign the default session in with the local dev login (stands in for Google).
    const signIn = await open(`${BASE}/login?next=%2Fhost%2Frooms`);
    await run(signIn, `document.querySelector('form[action="/auth/dev"]').submit()`);
    await sleep(1200);
    signIn.close();

    // Browser screen opened by the signed-in host, over a sample slide.
    const screen = await open(`${BASE}/screen`, { width: 1280, height: 720 });
    await run(screen, SLIDE);
    await sleep(800);
    const key = await run(screen, `document.getElementById('room').dataset.roomKey`);
    console.log('room', key);

    // Audience: join page and send page on a phone.
    const phone = await open(`${BASE}/`, {
      width: 390,
      height: 640,
      mobile: true,
      partition: 'phone',
    });
    await run(phone, `document.getElementById('key').value = '${key}'`);
    await shot(phone, 'audience-join');
    await run(phone, `document.querySelector('form').submit()`);
    await sleep(1200);
    await run(
      phone,
      `document.getElementById('content').value = '老師這題可以再講一次嗎？'; document.getElementById('content').dispatchEvent(new Event('input'))`,
    );
    await shot(phone, 'audience-send');
    await run(phone, `document.getElementById('send').click()`);
    await sleep(900);
    await run(
      phone,
      `document.getElementById('content').value = '原來如此！'; document.getElementById('send').click()`,
    );
    await sleep(900);
    await shot(phone, 'audience-sent');

    // More people (web and LINE) send danmus; capture the screen while they fly.
    await sleep(2500);
    for (const send of [
      () => postDanmu(key, '+1', 'demo-a'),
      () => lineDanmu('U-demo-line-1', key, '葉綠體好可愛 🌱'),
      () => postDanmu(key, '暗反應不需要光嗎？', 'demo-b'),
      () => lineDanmu('U-demo-line-2', key, '筆記抄完了～'),
      () => postDanmu(key, '可以給考古題嗎 XD', 'demo-c'),
    ]) {
      await send();
      await sleep(550);
    }
    await sleep(300);
    await shot(screen, 'screen-browser');

    // Host: rooms and history.
    await sleep(1500);
    const host = await open(`${BASE}/host/rooms`, { width: 1000, height: 420 });
    await run(host, `document.querySelector('header.top span').textContent = '王老師'`);
    await shot(host, 'host-rooms');
    host.setSize(1000, 820);
    await run(host, `document.querySelector('td a').click()`);
    await sleep(1200);
    await run(host, `document.querySelector('header.top span').textContent = '王老師'`);
    await shot(host, 'host-history');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  app.quit();
});

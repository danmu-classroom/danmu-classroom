import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';

// Shared page shell for the audience and host pages.

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
a { color: var(--accent); }
main.wide { max-width: 880px; }
header.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
header.top form { margin: 0; }
.button-link, button.secondary {
  display: inline-block;
  width: auto;
  margin: 0;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
}
button.provider { display: flex; align-items: center; justify-content: center; gap: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 13px; }
td.content { word-break: break-word; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 13px; border: 1px solid var(--border); }
.pill.online { color: var(--ok); border-color: var(--ok); }
.avatar { width: 28px; height: 28px; border-radius: 50%; vertical-align: middle; }
`;

export function Layout({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: Child;
}) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <style>{raw(STYLES)}</style>
      </head>
      <body>
        <main class={wide ? 'wide' : undefined}>{children}</main>
      </body>
    </html>
  );
}

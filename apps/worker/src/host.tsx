import { Hono } from 'hono';
import type { Context } from 'hono';
import { currentUser } from './auth/sessions';
import type { User } from './auth/users';
import { findUsableClaim, useClaim } from './claims';
import { Layout } from './layout';

// Pages for signed-in hosts: their rooms and the danmu history of each room.
export const host = new Hono<{ Bindings: Env; Variables: { user: User } }>();

type HostContext = Context<{ Bindings: Env; Variables: { user: User } }>;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

host.use('/host/*', async (c, next) => {
  const user = await currentUser(c as HostContext);
  if (!user) {
    const here = new URL(c.req.url);
    return c.redirect(`/login?next=${encodeURIComponent(here.pathname + here.search)}`);
  }
  c.set('user', user);
  await next();
});
host.get('/host', (c) => c.redirect('/host/rooms'));

function HostHeader({ user }: { user: User }) {
  return (
    <header class="top">
      <a href="/host/rooms">
        <strong>彈幕教室 · 主持人</strong>
      </a>
      <span>
        {user.picture && (
          <img class="avatar" src={user.picture} alt="" referrerpolicy="no-referrer" />
        )}{' '}
        {user.name ?? user.email}
      </span>
      <form method="post" action="/logout">
        <button type="submit" class="secondary">
          登出
        </button>
      </form>
    </header>
  );
}

interface RoomSummary {
  id: number;
  key: string;
  online: number;
  created_at: string;
  danmu_count: number;
}

host.get('/host/rooms', async (c) => {
  const user = c.get('user');
  const { results: rooms } = await c.env.DB.prepare(
    `SELECT rooms.id, rooms.key, rooms.online, rooms.created_at,
            (SELECT COUNT(*) FROM danmus WHERE danmus.room_id = rooms.id) AS danmu_count
     FROM rooms WHERE owner_id = ? ORDER BY rooms.id DESC`,
  )
    .bind(user.id)
    .all<RoomSummary>();

  return c.html(
    <Layout title="我的房間 · 彈幕教室" wide>
      <HostHeader user={user} />
      <h1>我的房間</h1>
      <p class="muted">
        在這個瀏覽器打開 <a href="/screen">/screen</a> 開的房間會自動保存；Electron
        螢幕請按控制面板上的「保存到我的帳號」。
      </p>
      {rooms.length === 0 ? (
        <div class="card">還沒有房間。</div>
      ) : (
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>房號</th>
                <th>建立時間</th>
                <th>彈幕</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr>
                  <td>
                    <a href={`/host/rooms/${room.id}`}>{room.key}</a>
                  </td>
                  <td>{formatTime(room.created_at)}</td>
                  <td>{room.danmu_count}</td>
                  <td>
                    {room.online === 1 ? (
                      <span class="pill online">進行中</span>
                    ) : (
                      <span class="pill">已結束</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>,
  );
});

interface DanmuRow {
  content: string;
  created_at: string;
  provider: string;
}

async function ownedRoom(c: HostContext) {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return null;
  return c.env.DB.prepare(
    'SELECT id, key, online, created_at FROM rooms WHERE id = ? AND owner_id = ?',
  )
    .bind(id, c.get('user').id)
    .first<Omit<RoomSummary, 'danmu_count'>>();
}

async function roomDanmus(db: D1Database, roomId: number) {
  const { results } = await db
    .prepare(
      `SELECT danmus.content, danmus.created_at, senders.provider
       FROM danmus JOIN senders ON senders.id = danmus.sender_id
       WHERE danmus.room_id = ? ORDER BY danmus.id`,
    )
    .bind(roomId)
    .all<DanmuRow>();
  return results;
}

const SOURCE_LABELS: Record<string, string> = { line: 'LINE', web: '網頁' };

host.get('/host/rooms/:id', async (c) => {
  const room = await ownedRoom(c);
  if (!room) return c.notFound();
  const danmus = await roomDanmus(c.env.DB, room.id);

  return c.html(
    <Layout title={`房號 ${room.key} · 彈幕教室`} wide>
      <HostHeader user={c.get('user')} />
      <p>
        <a href="/host/rooms">← 我的房間</a>
      </p>
      <h1>房號 {room.key}</h1>
      <p class="muted">
        建立於 {formatTime(room.created_at)} · {danmus.length} 則彈幕 ·{' '}
        {room.online === 1 ? '進行中' : '已結束'}
      </p>
      <p>
        <a class="button-link" href={`/host/rooms/${room.id}/danmus.csv`}>
          下載 CSV
        </a>
      </p>
      <div class="card">
        {danmus.length === 0 ? (
          <p>還沒有彈幕。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th>彈幕</th>
                <th>來源</th>
              </tr>
            </thead>
            <tbody>
              {danmus.map((danmu) => (
                <tr>
                  <td>{formatTime(danmu.created_at)}</td>
                  <td class="content">{danmu.content}</td>
                  <td>{SOURCE_LABELS[danmu.provider] ?? danmu.provider}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>,
  );
});

const csvField = (value: string) => `"${value.replaceAll('"', '""')}"`;

host.get('/host/rooms/:id/danmus.csv', async (c) => {
  const room = await ownedRoom(c);
  if (!room) return c.notFound();
  const danmus = await roomDanmus(c.env.DB, room.id);

  const lines = [
    'created_at,content,source',
    ...danmus.map((d) => [d.created_at, d.content, d.provider].map(csvField).join(',')),
  ];
  // BOM so Excel opens the UTF-8 file correctly
  return c.body(`\uFEFF${lines.join('\r\n')}\r\n`, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="danmu-${room.key}-${room.id}.csv"`,
  });
});

function ClaimMessage({ user, title, message }: { user: User; title: string; message: string }) {
  return (
    <Layout title="保存房間 · 彈幕教室">
      <HostHeader user={user} />
      <h1>{title}</h1>
      <p class="muted">{message}</p>
      <a href="/host/rooms">我的房間</a>
    </Layout>
  );
}

host.get('/host/claim', async (c) => {
  const user = c.get('user');
  const code = c.req.query('code') ?? '';
  const claim = code ? await findUsableClaim(c.env.DB, code) : null;
  if (!claim) {
    return c.html(
      <ClaimMessage
        user={user}
        title="連結已失效"
        message="這個連結過期或已經用過了，請在螢幕上重新產生。"
      />,
      404,
    );
  }
  if (claim.owner_id !== null && claim.owner_id !== user.id) {
    return c.html(
      <ClaimMessage user={user} title="無法保存" message="這間房已經屬於其他帳號。" />,
      403,
    );
  }

  return c.html(
    <Layout title="保存房間 · 彈幕教室">
      <HostHeader user={user} />
      <h1>保存房號 {claim.room_key}？</h1>
      <p class="muted">
        建立於 {formatTime(claim.room_created_at)}。保存後可以在「我的房間」看到它的彈幕紀錄。
      </p>
      <form class="card" method="post" action="/host/claim">
        <input type="hidden" name="code" value={code} />
        <button type="submit">保存到我的帳號</button>
      </form>
    </Layout>,
  );
});

host.post('/host/claim', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  const roomId =
    typeof form.code === 'string' ? await useClaim(c.env.DB, form.code, user.id) : null;
  if (roomId === null) {
    return c.html(
      <ClaimMessage
        user={user}
        title="無法保存"
        message="連結已失效，或這間房已經屬於其他帳號。"
      />,
      400,
    );
  }
  return c.redirect(`/host/rooms/${roomId}`);
});

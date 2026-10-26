import { ROOM_LIFETIME_MS } from '@danmu/shared';
import type { CreateDanmuRequest, CreatedRoom, Room, RoomList } from '@danmu/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createRoom, findRoomByKey, listOnlineRooms } from './db';
import { roomStub, sendDanmu } from './danmus';
import { handleLineEvents } from './line/bot';
import { verifyLineSignature } from './line/signature';
import type { LineWebhookBody } from './line/types';
import { pages } from './pages';
import type { RoomRow } from './db';

export { RoomObject } from './room-object';

type AppContext = Context<{ Bindings: Env }>;

const api = new Hono<{ Bindings: Env }>();

function roomUrl(c: AppContext, key: string) {
  return new URL(`/api/rooms/${key}`, c.req.url).toString();
}

function toRoom(c: AppContext, row: RoomRow): Room {
  return { id: row.id, key: row.key, online: row.online === 1, url: roomUrl(c, row.key) };
}

async function findRoom(c: AppContext) {
  return findRoomByKey(c.env.DB, c.req.param('key') ?? '');
}

const notFound = (c: AppContext) => c.json({ error: 'room not found' }, 404);
const wrongToken = (c: AppContext) => c.json({ error: 'wrong auth_token' }, 401);

api.get('/rooms', async (c) => {
  const rooms = (await listOnlineRooms(c.env.DB)).map((row) => toRoom(c, row));
  return c.json<RoomList>({
    rooms,
    room_counts: rooms.length,
    url: new URL('/api/rooms', c.req.url).toString(),
  });
});

api.post('/rooms', async (c) => {
  const row = await createRoom(c.env.DB, c.req.header('cf-connecting-ip') ?? null);
  await roomStub(c.env, row.id).open(
    { id: row.id, key: row.key, authToken: row.auth_token },
    ROOM_LIFETIME_MS,
  );
  c.header('Location', roomUrl(c, row.key));
  return c.json<CreatedRoom>(
    {
      ...toRoom(c, row),
      auth_token: row.auth_token,
      auth_token_sent_at: row.auth_token_sent_at,
    },
    201,
  );
});

api.get('/rooms/:key', async (c) => {
  const row = await findRoom(c);
  return row ? c.json<Room>(toRoom(c, row)) : notFound(c);
});

api.post('/rooms/:key/danmus', async (c) => {
  const body = await c.req
    .json<Partial<CreateDanmuRequest>>()
    .catch((): Partial<CreateDanmuRequest> => ({}));
  const result = await sendDanmu(
    c.env,
    c.req.param('key'),
    body.danmu?.sender,
    body.danmu?.content,
    { rateLimit: true },
  );
  if (!result.ok) {
    if (result.status === 404) return notFound(c);
    if (result.status === 429) c.header('Retry-After', '1');
    return c.json(result.errors, result.status);
  }

  return c.json(result.danmu, 201);
});

// Polling fallback for screens that do not use the WebSocket yet (original API).
api.get('/rooms/:key/danmus', async (c) => {
  const row = await findRoom(c);
  if (!row) return notFound(c);
  if (c.req.query('auth_token') !== row.auth_token) return wrongToken(c);

  return c.json(row.online === 1 ? await roomStub(c.env, row.id).popQueued() : []);
});

api.get('/rooms/:key/ws', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'expected a WebSocket upgrade' }, 426);
  }
  const row = await findRoom(c);
  if (!row) return notFound(c);

  return roomStub(c.env, row.id).fetch(c.req.raw);
});

// LINE Messaging API webhook (same path as the original server).
api.post('/line/callback', async (c) => {
  const body = await c.req.text();
  const valid = await verifyLineSignature(
    c.env.LINE_CHANNEL_SECRET,
    body,
    c.req.header('x-line-signature'),
  );
  if (!valid) return c.json({ error: 'signature invalid' }, 401);

  const { events = [] } = JSON.parse(body) as Partial<LineWebhookBody>;
  await handleLineEvents(c.env, events);
  return c.text('Success');
});

const app = new Hono<{ Bindings: Env }>();
app.route('/api', api);
app.route('/', pages);

export default app;

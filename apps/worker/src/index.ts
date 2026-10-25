import { DANMU_MAX_LENGTH, ROOM_LIFETIME_MS } from '@danmu/shared';
import type { CreateDanmuRequest, CreatedRoom, Room, RoomList } from '@danmu/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createRoom, findOrCreateSender, findRoomByKey, insertDanmu, listOnlineRooms } from './db';
import type { RoomRow } from './db';

export { RoomObject } from './room-object';

type AppContext = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>().basePath('/api');

function roomStub(env: Env, roomId: number) {
  return env.ROOM.get(env.ROOM.idFromName(String(roomId)));
}

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

app.get('/rooms', async (c) => {
  const rooms = (await listOnlineRooms(c.env.DB)).map((row) => toRoom(c, row));
  return c.json<RoomList>({
    rooms,
    room_counts: rooms.length,
    url: new URL('/api/rooms', c.req.url).toString(),
  });
});

app.post('/rooms', async (c) => {
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

app.get('/rooms/:key', async (c) => {
  const row = await findRoom(c);
  return row ? c.json<Room>(toRoom(c, row)) : notFound(c);
});

app.post('/rooms/:key/danmus', async (c) => {
  const row = await findRoom(c);
  if (!row) return notFound(c);

  const body = await c.req
    .json<Partial<CreateDanmuRequest>>()
    .catch((): Partial<CreateDanmuRequest> => ({}));
  const content = body.danmu?.content?.trim() ?? '';
  const sender = body.danmu?.sender;
  if (!sender?.provider || !sender.uid) return c.json({ sender: ["can't be blank"] }, 422);
  if (!content) return c.json({ content: ["can't be blank"] }, 422);
  if (content.length > DANMU_MAX_LENGTH) {
    return c.json({ content: [`is too long (maximum is ${DANMU_MAX_LENGTH} characters)`] }, 422);
  }

  const offline = () => c.json({ base: ['Room is offline, can not add new danmu.'] }, 422);
  if (row.online !== 1) return offline();

  const createdAt = new Date().toISOString();
  const result = await roomStub(c.env, row.id).deliver({ content, created_at: createdAt });
  if (result === 'offline') return offline();

  const senderId = await findOrCreateSender(c.env.DB, sender);
  const danmu = await insertDanmu(c.env.DB, row.id, senderId, content);
  return c.json(danmu, 201);
});

// Polling fallback for screens that do not use the WebSocket yet (original API).
app.get('/rooms/:key/danmus', async (c) => {
  const row = await findRoom(c);
  if (!row) return notFound(c);
  if (c.req.query('auth_token') !== row.auth_token) return wrongToken(c);

  return c.json(row.online === 1 ? await roomStub(c.env, row.id).popQueued() : []);
});

app.get('/rooms/:key/ws', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'expected a WebSocket upgrade' }, 426);
  }
  const row = await findRoom(c);
  if (!row) return notFound(c);

  return roomStub(c.env, row.id).fetch(c.req.raw);
});

export default app;

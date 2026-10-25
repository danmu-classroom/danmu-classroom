import { DANMU_MAX_LENGTH } from '@danmu/shared';
import type { DanmuSender } from '@danmu/shared';
import { findOrCreateSender, findRoomByKey, insertDanmu } from './db';

export type DanmuRecord = NonNullable<Awaited<ReturnType<typeof insertDanmu>>>;

export type SendDanmuResult =
  | { ok: true; danmu: DanmuRecord }
  | { ok: false; status: 404 | 422; errors: Record<string, string[]> };

export function roomStub(env: Env, roomId: number) {
  return env.ROOM.get(env.ROOM.idFromName(String(roomId)));
}

/**
 * Validates a danmu, delivers it to the room's screens and stores it in the history.
 * Shared by the HTTP API and the LINE bot.
 */
export async function sendDanmu(
  env: Env,
  roomKey: string,
  sender: Partial<DanmuSender> | undefined,
  rawContent: string | undefined,
): Promise<SendDanmuResult> {
  const room = await findRoomByKey(env.DB, roomKey);
  if (!room) return { ok: false, status: 404, errors: { room: ['not found'] } };

  const content = rawContent?.trim() ?? '';
  if (!sender?.provider || !sender.uid) {
    return { ok: false, status: 422, errors: { sender: ["can't be blank"] } };
  }
  if (!content) return { ok: false, status: 422, errors: { content: ["can't be blank"] } };
  if (content.length > DANMU_MAX_LENGTH) {
    return {
      ok: false,
      status: 422,
      errors: { content: [`is too long (maximum is ${DANMU_MAX_LENGTH} characters)`] },
    };
  }

  const offline: SendDanmuResult = {
    ok: false,
    status: 422,
    errors: { base: ['Room is offline, can not add new danmu.'] },
  };
  if (room.online !== 1) return offline;
  const delivered = await roomStub(env, room.id).deliver({
    content,
    created_at: new Date().toISOString(),
  });
  if (delivered === 'offline') return offline;

  const senderId = await findOrCreateSender(env.DB, { provider: sender.provider, uid: sender.uid });
  const danmu = await insertDanmu(env.DB, room.id, senderId, content);
  if (!danmu) throw new Error('could not save danmu');
  return { ok: true, danmu };
}

import { sendDanmu } from '../danmus';
import { findOrCreateSenderState, updateSenderState } from '../db';
import type { SenderState } from '../db';
import { replyMessage } from './client';
import {
  ACTION_ASK_FOR_DELETE_ROOM_KEY,
  ACTION_ASK_FOR_SETTING_ROOM_KEY,
  askForRoomKey,
  danmuResult,
  noRoomKey,
  roomKeySet,
  roomLeft,
} from './messages';
import type { LineEvent, LineMessage } from './types';

const PROVIDER = 'line';

/**
 * The LINE conversation, same as the original bot:
 * no room yet → "輸入房號" button → user types a room key → every message becomes a danmu,
 * with buttons to switch rooms or leave.
 */
export async function handleLineEvents(env: Env, events: LineEvent[]) {
  for (const event of events) {
    const uid = event.source?.userId;
    if (!uid) continue;

    const sender = await findOrCreateSenderState(env.DB, PROVIDER, uid);
    const message = await react(env, sender, event);
    if (message && event.replyToken) {
      await replyMessage(env.LINE_CHANNEL_TOKEN, event.replyToken, [message]);
    }
  }
}

async function react(env: Env, sender: SenderState, event: LineEvent): Promise<LineMessage | null> {
  if (event.type === 'message') {
    const text = event.message?.text ?? '';
    if (sender.last_action === ACTION_ASK_FOR_SETTING_ROOM_KEY) {
      await updateSenderState(env.DB, sender.id, {
        room_key: text.trim().toLowerCase(),
        last_action: 'set_room_key',
      });
      return roomKeySet(text);
    }
    if (!sender.room_key) return noRoomKey();

    const result = await sendDanmu(
      env,
      sender.room_key,
      { provider: PROVIDER, uid: sender.uid },
      text,
    );
    if (result.ok) await updateSenderState(env.DB, sender.id, { last_action: 'danmu' });
    return danmuResult(result.ok, sender.room_key);
  }

  if (event.type === 'postback') {
    const action = new URLSearchParams(event.postback?.data ?? '').get('action');
    if (action === ACTION_ASK_FOR_SETTING_ROOM_KEY) {
      await updateSenderState(env.DB, sender.id, { last_action: ACTION_ASK_FOR_SETTING_ROOM_KEY });
      return askForRoomKey();
    }
    if (action === ACTION_ASK_FOR_DELETE_ROOM_KEY) {
      await updateSenderState(env.DB, sender.id, {
        room_key: null,
        last_action: 'delete_room_key',
      });
      return roomLeft(sender.room_key);
    }
  }

  return null;
}

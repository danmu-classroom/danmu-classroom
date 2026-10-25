import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LineEvent, LineMessage } from '../src/line/types';
import { api, connectScreen, createRoom, popDanmus, waitFor } from './helpers';

interface Reply {
  url: string;
  authorization: string | null;
  replyToken: string;
  message: LineMessage;
}

// Ported from the original Rails LineCallbackTest: same conversation, same replies.
describe('LINE webhook', () => {
  let replies: Reply[];

  beforeEach(() => {
    replies = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const body = await request.json<{ replyToken: string; messages: LineMessage[] }>();
      for (const message of body.messages) {
        replies.push({
          url: request.url,
          authorization: request.headers.get('authorization'),
          replyToken: body.replyToken,
          message,
        });
      }
      return Response.json({});
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const lastReply = () => replies.at(-1)?.message;

  async function sign(body: string, secret = env.LINE_CHANNEL_SECRET) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  }

  async function lineEvent(event: LineEvent, secret?: string) {
    const body = JSON.stringify({ destination: 'bot', events: [event] });
    return api('/line/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Line-Signature': await sign(body, secret) },
      body,
    });
  }

  const source = (user: string) => ({ type: 'user', userId: user });
  const textEvent = (text: string, user = 'line-user-1'): LineEvent => ({
    type: 'message',
    replyToken: `token-${text}`,
    source: source(user),
    message: { type: 'text', text },
  });
  const postbackEvent = (data: string, user = 'line-user-1'): LineEvent => ({
    type: 'postback',
    replyToken: `token-${data}`,
    source: source(user),
    postback: { data },
  });

  it('a LINE user sets a room key and sends a danmu to the screen', async () => {
    const room = await createRoom();

    const response = await lineEvent(textEvent('hi'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Success');
    expect(lastReply()).toEqual({
      type: 'template',
      altText: 'Set the room key first',
      template: {
        type: 'buttons',
        text: '請先告訴我你要去哪間房間嗨',
        actions: [{ type: 'postback', label: '輸入房號', data: 'action=ask_for_setting_room_key' }],
      },
    });
    expect(replies[0]).toMatchObject({
      url: 'https://api.line.me/v2/bot/message/reply',
      authorization: 'Bearer test_channel_token',
      replyToken: 'token-hi',
    });

    await lineEvent(postbackEvent('action=ask_for_setting_room_key'));
    expect(lastReply()).toEqual({
      type: 'text',
      text: '輸入房間號碼，不知道房號多少的請看螢幕或是問隔壁（要不然就猜猜看？）',
    });

    await lineEvent(textEvent(room.key));
    expect(lastReply()).toEqual({ type: 'text', text: `你輸入的房號為 ${room.key}` });

    await lineEvent(textEvent('上課好無聊'));
    const text = `成功發送彈幕至 #${room.key}`;
    expect(lastReply()).toEqual({
      type: 'template',
      altText: text,
      template: {
        type: 'buttons',
        text,
        actions: [
          { type: 'postback', label: '換個房間', data: 'action=ask_for_setting_room_key' },
          { type: 'postback', label: '離開房間', data: 'action=ask_for_delete_room_key' },
        ],
      },
    });

    expect((await popDanmus(room)).map((danmu) => danmu.content)).toEqual(['上課好無聊']);
    const sender = await env.DB.prepare(
      `SELECT provider, uid FROM senders WHERE uid = 'line-user-1'`,
    ).first();
    expect(sender).toEqual({ provider: 'line', uid: 'line-user-1' });
  });

  it('delivers LINE danmus to a connected screen in real time', async () => {
    const room = await createRoom();
    const { messages } = await connectScreen(room);

    await lineEvent(postbackEvent('action=ask_for_setting_room_key'));
    await lineEvent(textEvent(` ${room.key} `));
    await lineEvent(textEvent('+1'));

    await waitFor(() => messages.length === 1);
    expect(messages[0]).toMatchObject({ type: 'danmu', danmu: { content: '+1' } });
  });

  it('sending to a wrong room key reports an error', async () => {
    await lineEvent(postbackEvent('action=ask_for_setting_room_key'));
    await lineEvent(textEvent('9999'));
    await lineEvent(textEvent('hello'));

    const reply = lastReply();
    expect(reply?.type === 'template' && reply.altText).toMatch(/^出錯啦，無法發送彈幕至 #9999/);
  });

  it('a sticker (no text) in a room is reported as not sent', async () => {
    const room = await createRoom();
    await lineEvent(postbackEvent('action=ask_for_setting_room_key'));
    await lineEvent(textEvent(room.key));

    await lineEvent({ ...textEvent('x'), message: { type: 'sticker' } });

    const reply = lastReply();
    expect(reply?.type === 'template' && reply.altText).toMatch(/^出錯啦/);
    expect(await popDanmus(room)).toEqual([]);
  });

  it('leaving a room clears the room key', async () => {
    await lineEvent(postbackEvent('action=ask_for_setting_room_key'));
    await lineEvent(textEvent('1234'));
    await lineEvent(postbackEvent('action=ask_for_delete_room_key'));

    expect(lastReply()).toEqual({ type: 'text', text: '已經離開房間#1234，人客欸下次再來喔~' });
    const sender = await env.DB.prepare(
      `SELECT room_key FROM senders WHERE uid = 'line-user-1'`,
    ).first<{ room_key: string | null }>();
    expect(sender?.room_key).toBeNull();

    await lineEvent(textEvent('still here?'));
    expect(lastReply()).toMatchObject({ altText: 'Set the room key first' });
  });

  it('keeps conversations of different LINE users apart', async () => {
    const room = await createRoom();
    await lineEvent(postbackEvent('action=ask_for_setting_room_key', 'alice'));
    await lineEvent(textEvent(room.key, 'alice'));

    await lineEvent(textEvent('hello', 'bob'));

    expect(lastReply()).toMatchObject({ altText: 'Set the room key first' });
  });

  it('does not reply to other events, but answers the webhook verification', async () => {
    const response = await lineEvent({
      type: 'follow',
      replyToken: 'token-follow',
      source: source('u'),
    });

    expect(response.status).toBe(200);
    expect(replies).toEqual([]);

    const body = JSON.stringify({ destination: 'bot', events: [] });
    const verification = await api('/line/callback', {
      method: 'POST',
      headers: { 'X-Line-Signature': await sign(body) },
      body,
    });
    expect(verification.status).toBe(200);
  });

  it('rejects requests with a missing or wrong signature', async () => {
    expect((await lineEvent(textEvent('hi'), 'not-the-secret')).status).toBe(401);
    const unsigned = await api('/line/callback', {
      method: 'POST',
      body: JSON.stringify({ events: [] }),
    });
    expect(unsigned.status).toBe(401);
    expect(replies).toEqual([]);
  });
});

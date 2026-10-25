import type { LineMessage } from './types';

const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';

export async function replyMessage(
  channelToken: string,
  replyToken: string,
  messages: LineMessage[],
) {
  const response = await fetch(REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  // Like the original bot, a failed reply is logged but does not fail the webhook
  // (LINE would otherwise redeliver the event).
  if (!response.ok) {
    console.error('line @ reply failed', response.status, await response.text());
  }
}

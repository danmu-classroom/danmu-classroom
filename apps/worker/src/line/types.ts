// The subset of the LINE Messaging API used by the bot.
// https://developers.line.biz/en/reference/messaging-api/

export interface LineWebhookBody {
  destination?: string;
  events: LineEvent[];
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
}

export interface PostbackAction {
  type: 'postback';
  label: string;
  data: string;
}

export type LineMessage =
  | { type: 'text'; text: string }
  | {
      type: 'template';
      altText: string;
      template: { type: 'buttons'; text: string; actions: PostbackAction[] };
    };

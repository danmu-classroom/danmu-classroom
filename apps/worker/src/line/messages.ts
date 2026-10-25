import type { LineMessage, PostbackAction } from './types';

// Replies are kept word for word from the original Rails LineBotService.

export const ACTION_ASK_FOR_SETTING_ROOM_KEY = 'ask_for_setting_room_key';
export const ACTION_ASK_FOR_DELETE_ROOM_KEY = 'ask_for_delete_room_key';

const postback = (label: string, action: string): PostbackAction => ({
  type: 'postback',
  label,
  data: `action=${action}`,
});

const buttons = (altText: string, text: string, actions: PostbackAction[]): LineMessage => ({
  type: 'template',
  altText,
  template: { type: 'buttons', text, actions },
});

export const roomKeySet = (key: string): LineMessage => ({
  type: 'text',
  text: `你輸入的房號為 ${key}`,
});

export const noRoomKey = (): LineMessage =>
  buttons('Set the room key first', '請先告訴我你要去哪間房間嗨', [
    postback('輸入房號', ACTION_ASK_FOR_SETTING_ROOM_KEY),
  ]);

export const danmuResult = (sent: boolean, roomKey: string): LineMessage => {
  const text = sent
    ? `成功發送彈幕至 #${roomKey}`
    : `出錯啦，無法發送彈幕至 #${roomKey}，要不是你房號打錯，就是我程式寫錯（希望是你打錯）`;
  return buttons(text, text, [
    postback('換個房間', ACTION_ASK_FOR_SETTING_ROOM_KEY),
    postback('離開房間', ACTION_ASK_FOR_DELETE_ROOM_KEY),
  ]);
};

export const askForRoomKey = (): LineMessage => ({
  type: 'text',
  text: '輸入房間號碼，不知道房號多少的請看螢幕或是問隔壁（要不然就猜猜看？）',
});

export const roomLeft = (oldKey: string | null): LineMessage => ({
  type: 'text',
  text: `已經離開房間#${oldKey ?? ''}，人客欸下次再來喔~`,
});

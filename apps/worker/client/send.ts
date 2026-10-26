// Send page (served at /r/:key): posts danmus to the room as an anonymous web sender.

const form = document.querySelector<HTMLFormElement>('#send-form');
const input = document.querySelector<HTMLInputElement>('#content');
const button = document.querySelector<HTMLButtonElement>('#send');
const statusLabel = document.querySelector<HTMLElement>('#status');
const counter = document.querySelector<HTMLElement>('#counter');
const sentList = document.querySelector<HTMLElement>('#sent');
if (!form || !input || !button || !statusLabel || !counter || !sentList) {
  throw new Error('send page markup is missing');
}

const roomKey = form.dataset.roomKey ?? '';
const maxLength = Number(form.dataset.maxLength);

/** One anonymous id per browser, so the server can tell senders apart. */
function senderUid() {
  const storageKey = 'danmu-sender-uid';
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const uid = crypto.randomUUID();
    localStorage.setItem(storageKey, uid);
    return uid;
  } catch {
    return crypto.randomUUID();
  }
}
const uid = senderUid();

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  statusLabel!.textContent = text;
  statusLabel!.className = kind ? `status-${kind}` : '';
}

function updateCounter() {
  counter!.textContent = `${input!.value.length}/${maxLength}`;
}

const ERRORS: Record<number, string> = {
  404: '找不到這間房，可能已經關閉了。',
  422: '這則訊息送不出去（房間已關閉，或內容是空的）。',
  429: '送太快了，等一下再送。',
};

async function send(content: string) {
  const response = await fetch(`/api/rooms/${roomKey}/danmus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ danmu: { content, sender: { provider: 'web', uid } } }),
  });
  if (!response.ok)
    throw new Error(ERRORS[response.status] ?? `送出失敗（HTTP ${response.status}）`);
}

input.addEventListener('input', updateCounter);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content) {
    setStatus('先輸入想說的話。', 'error');
    return;
  }

  button.disabled = true;
  setStatus('送出中…');
  send(content)
    .then(() => {
      const item = document.createElement('li');
      item.textContent = content;
      sentList.prepend(item);
      input.value = '';
      updateCounter();
      setStatus('已送上螢幕！', 'ok');
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '送出失敗，請再試一次。', 'error');
    })
    .finally(() => {
      button.disabled = false;
      input.focus();
    });
});

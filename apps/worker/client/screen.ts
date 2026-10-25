// Browser screen (served at /screen): opens a room on this server and draws its danmus.
import { DanmuCanvas, DEFAULT_DANMU_CONFIG, ScreenConnection } from '@danmu/screen-core';

const canvas = document.querySelector<HTMLCanvasElement>('#danmu-canvas');
const roomLabel = document.querySelector<HTMLElement>('#room');
if (!canvas || !roomLabel) throw new Error('screen page markup is missing');

// Canvas text does not trigger web font downloads by itself; start it right away.
void document.fonts.load(`${DEFAULT_DANMU_CONFIG.fontSize}px ${DEFAULT_DANMU_CONFIG.fontFamily}`);

const danmuCanvas = new DanmuCanvas(canvas);
const resize = () => danmuCanvas.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', resize);
resize();
danmuCanvas.start();

const connection = new ScreenConnection({
  upstream: window.location.origin,
  onRoom: (room) => {
    roomLabel.textContent = `房號 ${room.key}`;
    roomLabel.dataset.roomKey = room.key;
  },
  onDanmu: (danmu) => danmuCanvas.add(danmu.content),
  onError: (error) => console.error('screen @ connection error:', error),
});
connection.start();

// For debugging in the browser console.
Object.assign(window, { danmuScreen: { connection, danmuCanvas } });

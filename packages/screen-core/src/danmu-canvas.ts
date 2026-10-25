import { DEFAULT_DANMU_CONFIG } from './danmu-config';
import type { DanmuConfig } from './danmu-config';

interface FlyingDanmu {
  content: string;
  startedAt: number;
  width: number;
  y: number;
}

/** x of a danmu's left edge: enters at the right edge and crosses the screen in `speed` ms. */
export function danmuX(screenWidth: number, elapsedMs: number, speedMs: number) {
  return screenWidth - (screenWidth * elapsedMs) / speedMs;
}

/** Random text baseline that keeps the whole line on screen. */
export function randomBaseline(screenHeight: number, fontSize: number, random = Math.random) {
  const top = fontSize;
  const bottom = Math.max(top, screenHeight - fontSize / 4);
  return Math.floor(top + random() * (bottom - top));
}

/** Draws danmus flying right-to-left over a (usually transparent) canvas. */
export class DanmuCanvas {
  private danmus: FlyingDanmu[] = [];
  private frame: number | null = null;
  private readonly context: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private config: DanmuConfig = DEFAULT_DANMU_CONFIG,
    private readonly now: () => number = () => Date.now(),
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2d canvas is not supported');
    this.context = context;
  }

  add(content: string) {
    this.applyStyle();
    this.danmus.push({
      content,
      startedAt: this.now(),
      width: this.context.measureText(content).width,
      y: randomBaseline(this.canvas.height, this.config.fontSize),
    });
  }

  setConfig(config: DanmuConfig) {
    this.config = config;
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  start() {
    const loop = () => {
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame ??= requestAnimationFrame(loop);
  }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /** Draws one frame and forgets danmus that left the screen. */
  draw() {
    const now = this.now();
    const { width, height } = this.canvas;
    this.context.clearRect(0, 0, width, height);
    this.applyStyle();

    this.danmus = this.danmus.filter((danmu) => {
      const x = danmuX(width, now - danmu.startedAt, this.config.speed);
      if (x + danmu.width <= 0) return false;

      this.context.fillText(danmu.content, x, danmu.y);
      this.context.strokeText(danmu.content, x, danmu.y);
      return true;
    });
  }

  get count() {
    return this.danmus.length;
  }

  private applyStyle() {
    this.context.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
    this.context.fillStyle = this.config.color;
    this.context.strokeStyle = this.config.strokeColor;
    this.context.lineWidth = this.config.strokeWidth;
  }
}

export interface DanmuConfig {
  color: string;
  fontFamily: string;
  fontSize: number;
  /** Time in ms for a danmu to cross the screen. */
  speed: number;
  strokeColor: string;
  strokeWidth: number;
}

export const DEFAULT_DANMU_CONFIG: DanmuConfig = {
  color: '#fff',
  fontFamily: '思源柔黑體',
  fontSize: 60,
  speed: 5000,
  strokeColor: '#000',
  strokeWidth: 3,
};

/** `@font-face` names used by the screens; files are in `@danmu/screen-core/fonts/`. */
export const DANMU_FONTS = [
  { family: '思源柔黑體', file: 'GenJyuuGothic-Bold.ttf' },
  { family: '瀨戶字體', file: 'setofont.ttf' },
] as const;

import { describe, expect, it } from 'vitest';
import { danmuX, randomBaseline } from './danmu-canvas';

describe('danmuX', () => {
  it('enters at the right edge and reaches the left edge after `speed` ms', () => {
    expect(danmuX(1000, 0, 5000)).toBe(1000);
    expect(danmuX(1000, 2500, 5000)).toBe(500);
    expect(danmuX(1000, 5000, 5000)).toBe(0);
  });
});

describe('randomBaseline', () => {
  it('keeps the text line inside the screen', () => {
    expect(randomBaseline(720, 60, () => 0)).toBe(60);
    expect(randomBaseline(720, 60, () => 0.999999)).toBe(704);
  });

  it('falls back to the first line on tiny screens', () => {
    expect(randomBaseline(30, 60, () => 0.5)).toBe(60);
  });
});

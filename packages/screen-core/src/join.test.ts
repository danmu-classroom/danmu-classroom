import { describe, expect, it } from 'vitest';
import { displayJoinUrl, joinQrSvg, joinUrl } from './join';

describe('join links', () => {
  it('points at the send page of the room', () => {
    expect(joinUrl('https://danmu.example.workers.dev', '0427')).toBe(
      'https://danmu.example.workers.dev/r/0427',
    );
    expect(joinUrl('http://localhost:8787/', '1234')).toBe('http://localhost:8787/r/1234');
    expect(displayJoinUrl('https://danmu.example.workers.dev', '0427')).toBe(
      'danmu.example.workers.dev/r/0427',
    );
  });

  it('renders the join URL as an SVG QR code', () => {
    const svg = joinQrSvg('http://localhost:8787', '1234');

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox');
  });
});

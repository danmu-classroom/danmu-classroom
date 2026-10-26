import { describe, expect, it, vi } from 'vitest';
import { displayJoinUrl, joinQrSvg, joinUrl, requestClaimUrl } from './join';

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

describe('requestClaimUrl', () => {
  it('posts the room auth token and returns the claim link', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ url: 'http://localhost:8787/host/claim?code=abc' }, { status: 201 }),
      ),
    );

    const url = await requestClaimUrl(
      'http://localhost:8787',
      { key: '1234', auth_token: 't' },
      fetchMock,
    );

    expect(url).toBe('http://localhost:8787/host/claim?code=abc');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:8787/api/rooms/1234/claim-codes'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_token: 't' }),
      },
    );
  });

  it('fails on HTTP errors', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 401 })));

    await expect(
      requestClaimUrl('http://x', { key: '1', auth_token: 'bad' }, fetchMock),
    ).rejects.toThrow('HTTP 401');
  });
});

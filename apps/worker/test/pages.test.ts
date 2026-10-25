import { describe, expect, it } from 'vitest';
import { exports } from 'cloudflare:workers';

const get = (path: string) => exports.default.fetch(new Request(`http://danmu.test${path}`));

describe('browser screen page', () => {
  it('serves the screen with a transparent background by default', async () => {
    const response = await get('/screen');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('<script type="module" src="/assets/screen.js"></script>');
    expect(body).toContain('<canvas id="danmu-canvas"></canvas>');
    expect(body).toContain('background: transparent');
  });

  it('accepts a plain CSS color for ?bg= and ignores anything else', async () => {
    expect(await (await get('/screen?bg=green')).text()).toContain('background: green');
    expect(await (await get('/screen?bg=%2300ff00')).text()).toContain('background: #00ff00');

    const injected = await (await get('/screen?bg=red;}</style><script>alert(1)</script>')).text();
    expect(injected).toContain('background: transparent');
    expect(injected).not.toContain('alert(1)');
  });
});

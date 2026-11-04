import { expect, it } from 'vitest';
import { withCallbackServer } from './callback';

it('serves a real dynamically allocated loopback OAuth callback without echoing authorization material', async () => {
  let redirect = '';
  await withCallbackServer(async address => {
    redirect = address;
    const url = new URL(address);
    expect(url.hostname).toBe('127.0.0.1'); expect(Number(url.port)).toBeGreaterThanOrEqual(5303);
    const response = await fetch(`${address}?code=synthetic&state=test`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toMatch(/synthetic|state=test|code=/);
    expect((await fetch(address, { method: 'POST' })).status).toBe(405);
    expect((await fetch(new URL('/unrelated', address))).status).toBe(404);
  });
  await expect(fetch(redirect)).rejects.toThrow();
});
it('closes the callback listener after a partial bootstrap failure', async () => {
  let redirect = '';
  await expect(withCallbackServer(async address => { redirect = address; throw Error('synthetic bootstrap failure'); })).rejects.toThrow('synthetic bootstrap failure');
  await expect(fetch(redirect)).rejects.toThrow();
});

import { describe, expect, it } from 'vitest';
import { UNIVERSE_QUERY } from '@s2u/ui';
import { UNIVERSE_SERVICE_URL_READING, fetchUniverseService, universeServiceBase } from '../src/universeHost';

/**
 * ONL-04's page half (web research 147 §4): the universe query sent to the match server's `POST /texts/universe`
 * (SVC-05's endpoint, mounted by `MatchServer`'s `http` handlers), the base the page reaches it at, and the reply's
 * shape checked before the client's lists take it.
 */
describe('universeServiceBase (UNIVERSE_SERVICE_URL_READING)', () => {
  const page = { protocol: 'http:', host: 'localhost:5350', origin: 'http://localhost:5350' };
  it('the server named by `server=` (its WebSocket\'s origin over HTTP), else the page\'s own origin', () => {
    expect(UNIVERSE_SERVICE_URL_READING).toBeTruthy();
    expect(universeServiceBase('?devmode&menuflow', page)).toBe('http://localhost:5350');
    expect(universeServiceBase('?devmode&menuflow&server=ws://localhost:8825/ws', page)).toBe('http://localhost:8825');
    expect(universeServiceBase('?menuflow&server=wss://mp.example.com/ws', page)).toBe('https://mp.example.com');
    expect(universeServiceBase('?menuflow&server=not a url', page)).toBe('http://localhost:5350');
  });
});

describe('fetchUniverseService', () => {
  const reply = {
    universes: [{ status: 0, name: 'U', dns: '', port: 0, description: 'D', universeStatus: 1, userCount: 0, maxUsers: 256, billing: '', billingName: '', extendedInfo: '', endOfList: true }],
    news: [{ status: 0, news: 'N', endOfList: true }],
  };

  it('posts the client\'s query as JSON to /texts/universe and hands back the replies', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(reply), { status: 200 }); }) as unknown as typeof fetch;
    const r = await fetchUniverseService('http://localhost:8825', f).query({ ...UNIVERSE_QUERY });
    expect(r).toEqual(reply);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://localhost:8825/texts/universe');
    expect(calls[0]!.init.method).toBe('POST');
    // TEXTS-OMIT (MU.R6's F1): no cookie rides on the request, as the account routes' clients send (`connectHost.ts`).
    expect([calls[0]!.init.credentials, calls[0]!.init.cache]).toEqual(['omit', 'no-store']);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ infoType: 3, characterEncoding: 2, language: 1 });
    expect((calls[0]!.init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('a refusal, a server without the endpoint or a reply of another shape is a query never answered (a rejection)', async () => {
    const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(fetchUniverseService('http://x', answer(404, {})).query({ ...UNIVERSE_QUERY })).rejects.toThrow();
    await expect(fetchUniverseService('http://x', answer(200, { universes: 'no' })).query({ ...UNIVERSE_QUERY })).rejects.toThrow();
    await expect(fetchUniverseService('http://x', answer(200, { universes: [{ name: 1 }], news: [] })).query({ ...UNIVERSE_QUERY })).rejects.toThrow();
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(fetchUniverseService('http://x', down).query({ ...UNIVERSE_QUERY })).rejects.toThrow();
  });
});

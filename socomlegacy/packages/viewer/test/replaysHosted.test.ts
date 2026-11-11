// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { liveReplays } from '../src/console/adapters/replays';
import { askReplayGrant, httpReplaySource, publicReplayAddress, replayKey, replaysOf, type ReplayEntry } from '../src/modern/replays/data';
import type { ReplayStage, ReplayStageContext } from '../src/modern/replays/stage';
import { segmentFor } from '../src/modern/replays/worldStage';
import * as load from '../src/replay/load';
import { BASE, fakeSession, TICKET } from './modern/lobbies/fixtures';
import { fixtureBytes, fixtureRecords } from './replayFixture';

/**
 * SA-9b (REPLAY_DOOR_ADAPTATION; the server split, SA.R21 (d), SA.R24): the page's replays from a host. The listing's
 * hosted entries carry `host` (central's `GET /replays`, SA-9) and are keyed by `(host, id)`; Watch asks central for a
 * grant (`POST /replays/grant`, the login's bearer) and fetches the door it names with the grant, never the ticket; a
 * local entry is fetched as today with no grant asked. The refusals in the replay viewer's kinds. Hosts, ids, grants
 * and tickets invented.
 */

const ID = '00000000000000a1';
const H1 = 'A'.repeat(43);
const H2 = 'b'.repeat(42) + '_';
const PROD = `https://firehuge.play.socom2legacy.com/replays/${ID}`;
const GRANT = ['g', 'r', String(7)].join('-');

const entry = (id: string, startedAt: string, host?: string): Record<string, unknown> => ({
  id, room: 'MP2/classic', map: 'MP2', rules: 'classic', startedAt, seconds: 754, players: [{ name: 'Alpha', team: 'seals' }],
  ...(host === undefined ? {} : { host }),
});

interface Seen { url: string; method: string; auth: string | null; type: string | null; body: string | null; init: RequestInit | undefined }
/** A fetch double answering by `METHOD url`: a function per call, in order (the last repeats). */
function routes(table: Record<string, ((n: number) => Response | Promise<Response>)>): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const counts = new Map<string, number>();
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const h = new Headers(init?.headers);
    seen.push({ url, method, auth: h.get('authorization'), type: h.get('content-type'), body: typeof init?.body === 'string' ? init.body : null, init });
    const key = `${method} ${url}`;
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    const answer = table[key];
    if (!answer) throw new TypeError(`no route ${key}`);
    return answer(n);
  }) as typeof fetch;
  return { fetch: fn, seen };
}
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const GRANTED = { status: 0, url: PROD, grant: GRANT, expiresAt: 1_800_000_060_000 };
const hosted = (host = H1): ReplayEntry => replaysOf({ replays: [entry(ID, '2026-10-18T10:00:00Z', host)] })[0]!;
const ctx = (fetchFn: typeof globalThis.fetch, ticket: string | null = TICKET): ReplayStageContext => ({ base: BASE, ticket: () => ticket, name: 'Me', fetch: fetchFn, devDoors: false });

describe('SA-9b: the listing\'s host and the (host, id) key', () => {
  it('an entry\'s host is read when it is a hostId (43 base64url); a malformed one refuses the answer', () => {
    const [a, b] = replaysOf({ replays: [entry(ID, '2026-10-18T10:00:00Z', H1), entry(ID, '2026-10-18T09:00:00Z')] });
    expect(a!.host).toBe(H1);
    expect(b!.host).toBeUndefined();
    for (const bad of ['A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '=', 7, null]) {
      expect(() => replaysOf({ replays: [{ ...entry(ID, '2026-10-18T10:00:00Z'), host: bad }] }), String(bad)).toThrow();
    }
  });

  it('replayKey: a hosted entry <host>/<id>, a local one its id -- two hosts\' equal ids never one key', () => {
    const [a, b, c] = replaysOf({ replays: [entry(ID, '2026-10-18T10:00:00Z', H1), entry(ID, '2026-10-18T09:00:00Z', H2), entry(ID, '2026-10-18T08:00:00Z')] });
    expect([replayKey(a!), replayKey(b!), replayKey(c!)]).toEqual([`${H1}/${ID}`, `${H2}/${ID}`, ID]);
  });

  it('the console adapter lists two hosts\' equal ids and a local one apart, and Watch opens the row\'s own entry', async () => {
    const listing = { replays: [entry(ID, '2026-10-18T10:00:00Z', H1), entry(ID, '2026-10-18T09:00:00Z', H2), entry(ID, '2026-10-18T08:00:00Z')] };
    const r = routes({ [`GET ${BASE}/replays`]: () => json(200, listing) });
    const opened: { entry: ReplayEntry; ctx: ReplayStageContext }[] = [];
    const stage: ReplayStage = { open: (e, c) => { opened.push({ entry: e, ctx: c }); return new Promise(() => {}); } };
    const replays = liveReplays(() => {}, { source: httpReplaySource(BASE, r.fetch), session: fakeSession('signed-in'), stage, frame: () => {} });
    await replays.refresh();
    const view = replays.view();
    expect(view.kind).toBe('ok');
    const ids = view.kind === 'ok' ? view.entries.map((e) => e.id) : [];
    expect(ids).toEqual([`${H1}/${ID}`, `${H2}/${ID}`, ID]);
    const w = replays.watch(`${H2}/${ID}`, () => {});
    expect(w).not.toBeNull();
    await Promise.resolve();
    expect(opened.at(-1)?.entry.host).toBe(H2);
    expect(opened.at(-1)?.ctx.devDoors).toBe(false);        // no ?devmode here: never the loopback door
    w?.close();
  });
});

describe('SA-9b: the grant (POST <central>/replays/grant)', () => {
  it('asks with the login bearer, JSON { host, id }, no cookie, no redirect; a door answer pinned', async () => {
    const r = routes({ [`POST ${BASE}/replays/grant`]: () => json(200, GRANTED) });
    const g = await askReplayGrant(BASE, TICKET, hosted(), false, r.fetch);
    expect(g.kind).toBe('door');
    expect(g.kind === 'door' ? [g.door.url, g.grant] : null).toEqual([PROD, GRANT]);
    const s = r.seen[0]!;
    expect([s.method, s.auth, s.type]).toEqual(['POST', `Bearer ${TICKET}`, 'application/json']);
    expect(JSON.parse(s.body!)).toEqual({ host: H1, id: ID });
    expect(s.init?.credentials).toBe('omit');
    expect(s.init?.redirect).toBe('error');
  });

  it('every other answer is one of the kinds, never a throw', async () => {
    const kind = async (res: () => Response, devDoors = false): Promise<string> =>
      (await askReplayGrant(BASE, TICKET, hosted(), devDoors, routes({ [`POST ${BASE}/replays/grant`]: res }).fetch)).kind;
    expect(await kind(() => json(200, { status: 0 }))).toBe('local');
    expect(await kind(() => json(401, {}))).toBe('signed-out');
    expect(await kind(() => json(404, {}))).toBe('missing');
    expect(await kind(() => json(503, {}))).toBe('unavailable');
    expect(await kind(() => json(500, {}))).toBe('unavailable');
    expect(await kind(() => json(200, { status: 0, url: PROD, expiresAt: 1 }))).toBe('unavailable');           // url, no grant
    expect(await kind(() => json(200, { status: 0, grant: GRANT, expiresAt: 1 }))).toBe('unavailable');        // grant, no url
    expect(await kind(() => json(200, { ...GRANTED, url: 'https://elsewhere.test/replays/' + ID }))).toBe('unavailable');
    expect(await kind(() => json(200, { ...GRANTED, url: PROD.replace(ID, '00000000000000b2') }))).toBe('unavailable');   // another id
    expect(await kind(() => json(200, { ...GRANTED, url: `http://127.0.0.1:5343/replays/${ID}` }))).toBe('unavailable');  // no devmode
    expect(await kind(() => json(200, { ...GRANTED, url: `http://127.0.0.1:5343/replays/${ID}` }), true)).toBe('door');
    expect(await kind(() => json(200, { ...GRANTED, expiresAt: 'soon' }))).toBe('unavailable');
    expect(await kind(() => json(200, { ...GRANTED, status: 1 }))).toBe('unavailable');
    expect(await kind(() => new Response('not json', { status: 200 }))).toBe('unavailable');
    expect(await kind(() => { throw new TypeError('Failed to fetch'); })).toBe('unavailable');
  });

  it('signed out: nothing asked', async () => {
    const r = routes({});
    expect((await askReplayGrant(BASE, null, hosted(), false, r.fetch)).kind).toBe('signed-out');
    expect(r.seen).toHaveLength(0);
  });
});

describe('SA-9b: Watch\'s segment (worldStage segmentFor)', () => {
  it('a local entry is fetched as today, with the ticket, and no grant is asked', async () => {
    const local = replaysOf({ replays: [entry(ID, '2026-10-18T10:00:00Z')] })[0]!;
    const r = routes({ [`GET ${BASE}/replays/${ID}`]: () => new Response(fixtureBytes() as BodyInit) });
    const seg = await segmentFor(local, ctx(r.fetch), load);
    expect(seg.records).toHaveLength(fixtureRecords().length);
    expect(r.seen.map((s) => s.method)).toEqual(['GET']);
  });

  it('a hosted entry: the grant, then its door with the grant as bearer -- never the ticket at the door, the grant in no address', async () => {
    const r = routes({
      [`POST ${BASE}/replays/grant`]: () => json(200, GRANTED),
      [`GET ${PROD}`]: () => new Response(fixtureBytes() as BodyInit),
    });
    const seg = await segmentFor(hosted(), ctx(r.fetch), load);
    expect(seg.header.map).toBe('MP2');
    expect(r.seen.map((s) => `${s.method} ${s.url}`)).toEqual([`POST ${BASE}/replays/grant`, `GET ${PROD}`]);
    expect(r.seen[1]!.auth).toBe(`Bearer ${GRANT}`);
    expect(JSON.stringify(r.seen[1]!.init)).not.toContain(TICKET);
    expect(r.seen.some((s) => s.url.includes(GRANT))).toBe(false);
  });

  it('the grant\'s refusals: 404 missing, 503 unavailable, 401 unavailable in sign-in words', async () => {
    const refused = async (status: number): Promise<load.ReplayLoadError> =>
      segmentFor(hosted(), ctx(routes({ [`POST ${BASE}/replays/grant`]: () => json(status, {}) }).fetch), load).then(() => { throw new Error('loaded'); }, (e: unknown) => e as load.ReplayLoadError);
    expect((await refused(404)).kind).toBe('missing');
    expect((await refused(503)).kind).toBe('unavailable');
    const e = await refused(401);
    expect(e.kind).toBe('unavailable');
    expect(e.message).toMatch(/sign in/i);
  });

  it('a door refusal re-asks the grant exactly once and fetches once more; a second refusal ends missing, no loop', async () => {
    const r = routes({
      [`POST ${BASE}/replays/grant`]: () => json(200, GRANTED),
      [`GET ${PROD}`]: () => new Response(null, { status: 404 }),
    });
    const e = await segmentFor(hosted(), ctx(r.fetch), load).then(() => null, (x: unknown) => x as load.ReplayLoadError);
    expect(e?.kind).toBe('missing');
    expect(r.seen.map((s) => s.method)).toEqual(['POST', 'GET', 'POST', 'GET']);
  });

  it('a door refusal then a good re-fetch plays (a grant that ran out on the way)', async () => {
    const r = routes({
      [`POST ${BASE}/replays/grant`]: () => json(200, GRANTED),
      [`GET ${PROD}`]: (n) => (n === 0 ? new Response(null, { status: 404 }) : new Response(fixtureBytes() as BodyInit)),
    });
    const seg = await segmentFor(hosted(), ctx(r.fetch), load);
    expect(seg.header.map).toBe('MP2');
    expect(r.seen.map((s) => s.method)).toEqual(['POST', 'GET', 'POST', 'GET']);
  });

  it('a door\'s 503 is not re-asked: unavailable at once', async () => {
    const r = routes({
      [`POST ${BASE}/replays/grant`]: () => json(200, GRANTED),
      [`GET ${PROD}`]: () => new Response(null, { status: 503 }),
    });
    const e = await segmentFor(hosted(), ctx(r.fetch), load).then(() => null, (x: unknown) => x as load.ReplayLoadError);
    expect(e?.kind).toBe('unavailable');
    expect(r.seen.map((s) => s.method)).toEqual(['POST', 'GET']);
  });
});

describe('LCM-RP (RB-11): a signed-out hosted Watch opens (the replay page\'s visitor)', () => {
  const followed = (url: string): Response => {
    const r = new Response(fixtureBytes() as BodyInit);
    Object.defineProperty(r, 'url', { value: url });
    Object.defineProperty(r, 'redirected', { value: true });
    return r;
  };

  it('no ticket: no grant asked -- central\'s public fetch with the match named, followed to its door, plays', async () => {
    const withMatch: ReplayEntry = { ...hosted(), matchId: 'MP2/classic-3-1762652460000' };
    const asked = `${BASE}/replays/${ID}?match=${encodeURIComponent('MP2/classic-3-1762652460000')}`;
    const r = routes({ [`GET ${asked}`]: () => followed(`${PROD}?grant=${GRANT}`) });
    const seg = await segmentFor(withMatch, ctx(r.fetch, null), load);
    expect(seg.header.map).toBe('MP2');
    expect(r.seen.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${asked}`]);
    expect(r.seen[0]!.auth).toBeNull();
    expect(r.seen[0]!.init?.redirect).toBe('follow');
  });

  it('no ticket and no match named: the bare public fetch; a foreign end refuses, never a grant', async () => {
    const r = routes({ [`GET ${BASE}/replays/${ID}`]: () => followed(`https://elsewhere.test/replays/${ID}?grant=${GRANT}`) });
    const e = await segmentFor(hosted(), ctx(r.fetch, null), load).then(() => null, (x: unknown) => x as load.ReplayLoadError);
    expect(e?.kind).toBe('unavailable');
    expect(r.seen.map((s) => s.method)).toEqual(['GET']);
  });

  it('publicReplayAddress: the id checked, the match encoded, nothing else', () => {
    expect(publicReplayAddress(BASE, ID, null)).toBe(`${BASE}/replays/${ID}`);
    expect(publicReplayAddress(BASE, ID, 'a b/c')).toBe(`${BASE}/replays/${ID}?match=a%20b%2Fc`);
    expect(() => publicReplayAddress(BASE, 'nope', null)).toThrow();
  });
});

// test/replayLoadDoor.test.ts -- SA-9b: a hosted replay fetched at its host's door with a grant (REPLAY_DOOR_ADAPTATION)
import { describe, expect, it } from 'vitest';
import { encodeRecord } from '../../match/src/replay/format';
import { pinnedReplayDoor } from '../src/connectHost';
import {
  checkReplayUrl, loadPublicSegment, loadSegment, ReplayLoadError, REPLAY_DOOR_BODY_MAX_BYTES_ADAPTATION, REPLAY_DOOR_INFLATED_MAX_BYTES_ADAPTATION,
  REPLAY_DOOR_OTHER_VERSION, REPLAY_DOOR_RECORDS_MAX_ADAPTATION, REPLAY_PUBLIC_FETCH_ADAPTATION,
} from '../src/replay/load';
import { concat, fixtureBytes, fixtureRecords, gzip, header } from './replayFixture';

/**
 * SA-9b (the server split, SA.R21 (d), SA.R24; 52's F5): the third branch of `loadSegment` -- the door central's grant
 * named, pinned (`connectHost` `pinnedReplayDoor`), fetched with the grant as its bearer and never the login's ticket;
 * the door's refusals (a 404, or a throw: they carry no CORS) read `missing`, its 503 `unavailable`; its body read
 * through a bound while it streams and its gzip inflated through another, a hostile host never making the page hold
 * more; a body that does not decode `missing`, a real recording of another protocol `version`. A door-shaped address
 * without its pinned door is never fetched -- the development `?replay=` mode's rule (SA.R24). Doors, ids, grants
 * and tickets invented.
 */

const ID = '00000000000000a1';
const PROD = `https://firehuge.play.socom2legacy.com/replays/${ID}`;
const DEV = `http://127.0.0.1:5343/replays/${ID}`;
const GRANT = ['g', 'r', String(7)].join('-');
const TICKET = ['t', 'k', String(42)].join('-');
const door = (url = PROD, dev = false) => ({ door: pinnedReplayDoor(url, ID, dev)!, grant: GRANT });

interface Seen { url: string; init: RequestInit | undefined }
function spy(answer: (url: string) => Response | Promise<Response>): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    return answer(url);
  }) as typeof fetch;
  return { fetch: fn, seen };
}
const refusal = async (p: Promise<unknown>): Promise<ReplayLoadError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ReplayLoadError);
  return e as ReplayLoadError;
};

/** A stream of `chunk`-byte pieces up to `total`, counting what was pulled and whether it was cancelled. */
function counted(total: number, chunk: number, fill = 0x41): { stream: ReadableStream<Uint8Array>; pulled: () => number; cancelled: () => boolean } {
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (pulled >= total) { c.close(); return; }
      const n = Math.min(chunk, total - pulled);
      pulled += n;
      c.enqueue(new Uint8Array(n).fill(fill));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { stream, pulled: () => pulled, cancelled: () => cancelled };
}

describe('SA-9b: the door branch of loadSegment', () => {
  it('the bounds are named adaptations: 64 MiB of body, 256 MiB inflated (52\'s word)', () => {
    expect(REPLAY_DOOR_BODY_MAX_BYTES_ADAPTATION).toBe(64 * 2 ** 20);
    expect(REPLAY_DOOR_INFLATED_MAX_BYTES_ADAPTATION).toBe(256 * 2 ** 20);
  });

  it('fetches the pinned door with the grant as its bearer, never the ticket; no redirect, no cookie, no cache', async () => {
    const z = await gzip(fixtureBytes());
    const f = spy(() => new Response(z as BodyInit, { status: 200 }));
    let asked = 0;
    const seg = await loadSegment(PROD, { door: door(), fetch: f.fetch, server: 'wss://firehuge.play.socom2legacy.com', ticket: () => { asked++; return TICKET; } });
    expect(seg.records.map((r) => r.kind)).toEqual(fixtureRecords().map((r) => r.kind));
    expect(f.seen).toHaveLength(1);
    const init = f.seen[0]!.init!;
    expect(f.seen[0]!.url).toBe(PROD);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${GRANT}`);
    expect(JSON.stringify(init)).not.toContain(TICKET);
    expect(asked).toBe(0);
    expect(init.redirect).toBe('error');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
  });

  it('the devmode door, pinned with devDoors, is fetched the same way', async () => {
    const f = spy(() => new Response(fixtureBytes() as BodyInit, { status: 200 }));
    const seg = await loadSegment(DEV, { door: door(DEV, true), fetch: f.fetch });
    expect(seg.header.map).toBe('MP2');
    expect(new Headers(f.seen[0]!.init!.headers).get('authorization')).toBe(`Bearer ${GRANT}`);
  });

  it('the door\'s refusals: a 404 or a throw read missing (no CORS on a refusal), a 503 or another status unavailable', async () => {
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(null, { status: 404 })).fetch }))).kind).toBe('missing');
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => { throw new TypeError('Failed to fetch'); }).fetch }))).kind).toBe('missing');
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(null, { status: 503 })).fetch }))).kind).toBe('unavailable');
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(null, { status: 500 })).fetch }))).kind).toBe('unavailable');
  });

  it('an answer from another address (a redirect followed) is not read', async () => {
    const f = spy(() => {
      const r = new Response(fixtureBytes() as BodyInit, { status: 200 });
      Object.defineProperty(r, 'url', { value: 'https://elsewhere.test/x' });
      return r;
    });
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: f.fetch }))).kind).toBe('unavailable');
  });

  it('F5: a body that does not decode reads missing; a real recording of another protocol stays version (52\'s (a))', async () => {
    const junk = new TextEncoder().encode('this is not a replay recording at all');
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(junk as BodyInit)).fetch }))).kind).toBe('missing');
    const badGzip = new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(badGzip as BodyInit)).fetch }))).kind).toBe('missing');
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(new Uint8Array(0) as BodyInit)).fetch }))).kind).toBe('missing');
    const p999 = concat([encodeRecord({ kind: 'header', header: header({ protocol: 999 }) })]);
    expect((await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(p999 as BodyInit)).fetch }))).kind).toBe('version');
  });

  it('a body past the bound is stopped while it streams, never read whole (asserted on the bytes pulled)', async () => {
    const BOUND = 64 * 1024, CHUNK = 16 * 1024, TOTAL = 4 * 2 ** 20;
    const s = counted(TOTAL, CHUNK);
    const e = await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(s.stream)).fetch, bounds: { body: BOUND, inflated: 2 ** 30 } }));
    expect(e.kind).toBe('missing');
    expect(s.pulled()).toBeLessThanOrEqual(BOUND + 2 * CHUNK);
    expect(s.cancelled()).toBe(true);
  });

  it('a declared length past the bound is refused before the body is read', async () => {
    const s = counted(4 * 2 ** 20, 16 * 1024);
    const res = new Response(s.stream, { headers: { 'content-length': String(4 * 2 ** 20) } });
    const e = await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => res).fetch, bounds: { body: 64 * 1024, inflated: 2 ** 30 } }));
    expect(e.kind).toBe('missing');
    expect(s.pulled()).toBeLessThanOrEqual(16 * 1024);
    expect(s.cancelled()).toBe(true);
  });

  it('a gzip bomb is stopped the moment its inflation passes the bound (asserted on the bytes inflated)', async () => {
    const BOMB = 8 * 2 ** 20, BOUND = 64 * 1024;
    const z = await gzip(new Uint8Array(BOMB));
    expect(z.byteLength).toBeLessThan(BOUND);                          // the body itself passes its bound
    let most = 0;
    const e = await refusal(loadSegment(PROD, {
      door: door(), fetch: spy(() => new Response(z as BodyInit)).fetch, bounds: { body: BOUND, inflated: BOUND },
      meter: (what, total) => { if (what === 'inflated') most = Math.max(most, total); },
    }));
    expect(e.kind).toBe('missing');
    expect(most).toBeGreaterThan(BOUND);
    expect(most).toBeLessThanOrEqual(BOUND + 256 * 1024);              // one inflated chunk past, never the whole bomb
    expect(most).toBeLessThan(BOMB);
  });

  it('a door-shaped address without its pinned door is never fetched (the ticket never at a door)', async () => {
    for (const url of [PROD, DEV]) {
      const f = spy(() => new Response(fixtureBytes() as BodyInit));
      expect((await refusal(loadSegment(url, { fetch: f.fetch, ticket: () => TICKET }))).kind).toBe('unavailable');
      expect(f.seen).toHaveLength(0);
    }
    // the page's configured server set to a door's address: the own-server branch does not carry the ticket there
    const f = spy(() => new Response(fixtureBytes() as BodyInit));
    await refusal(loadSegment(DEV, { fetch: f.fetch, server: 'ws://127.0.0.1:5343', ticket: () => TICKET }));
    expect(f.seen).toHaveLength(0);
    // a pinned door for another address does not open this one
    const g = spy(() => new Response(fixtureBytes() as BodyInit));
    await refusal(loadSegment(`https://other.play.socom2legacy.com/replays/${ID}`, { door: door(), fetch: g.fetch }));
    expect(g.seen).toHaveLength(0);
  });

  it('SA.R24: the development ?replay= mode\'s address check never takes a hosted replay\'s door', () => {
    expect(() => checkReplayUrl(DEV)).toThrow(ReplayLoadError);
    expect(() => checkReplayUrl(PROD, { server: 'wss://firehuge.play.socom2legacy.com' })).toThrow(ReplayLoadError);
    expect(checkReplayUrl('http://127.0.0.1:5303/segments/0.s2r').href).toBe('http://127.0.0.1:5303/segments/0.s2r');
  });

  it('review F3: localhost and [::1] at a door\'s port are a door too -- refused by ?replay= and never fetched plain', async () => {
    for (const url of [`http://localhost:5343/replays/${ID}`, `http://[::1]:5349/replays/${ID}`]) {
      expect(() => checkReplayUrl(url), url).toThrow(ReplayLoadError);
      const f = spy(() => new Response(fixtureBytes() as BodyInit));
      await refusal(loadSegment(url, { fetch: f.fetch, ticket: () => TICKET }));
      expect(f.seen, url).toHaveLength(0);
    }
  });

  it('review F1: a door header whose format or protocol is not a whole number reads missing, its text never shown', async () => {
    const SAID = '2; your account is suspended -- re-enter your password';
    for (const over of [{ format: SAID }, { protocol: SAID }, { format: 'x'.repeat(2 ** 20) }, { format: 2.5 }]) {
      const bytes = concat([encodeRecord({ kind: 'header', header: { ...header(), ...over } as unknown as ReturnType<typeof header> })]);
      const e = await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(bytes as BodyInit)).fetch }));
      expect(e.kind, JSON.stringify(over).slice(0, 40)).toBe('missing');
      expect(e.message).not.toContain('suspended');
      expect(e.message.length).toBeLessThan(300);
    }
  });

  it('review F1: a door\'s real other version reads version in a fixed sentence, never the header\'s values', async () => {
    for (const over of [{ protocol: 999 }, { format: 77 }]) {
      const bytes = concat([encodeRecord({ kind: 'header', header: header(over) })]);
      const e = await refusal(loadSegment(PROD, { door: door(), fetch: spy(() => new Response(bytes as BodyInit)).fetch }));
      expect(e.kind).toBe('version');
      expect(e.message).toBe(REPLAY_DOOR_OTHER_VERSION);
      expect(e.message).not.toMatch(/999|77/);
    }
  });

  it('review F2: the records are bounded too -- a stream of tiny valid records stops at the bound, before decoding', async () => {
    const records = fixtureRecords();
    const end = records.at(-1)!;
    const many = [encodeRecord(records[0]!), ...Array.from({ length: 5000 }, () => encodeRecord(end))];
    const bytes = concat(many);
    let counted = 0;
    const e = await refusal(loadSegment(PROD, {
      door: door(), fetch: spy(() => new Response(bytes as BodyInit)).fetch, bounds: { body: 2 ** 30, inflated: 2 ** 30, records: 1000 },
      meter: (what, total) => { if (what === 'records') counted = Math.max(counted, total); },
    }));
    expect(e.kind).toBe('missing');
    expect(counted).toBe(1001);                                       // stopped at the first record past the bound
    // within the bound, the same records play
    const ok = await loadSegment(PROD, { door: door(), fetch: spy(() => new Response(concat(many.slice(0, 900)) as BodyInit)).fetch, bounds: { body: 2 ** 30, inflated: 2 ** 30, records: 1000 } });
    expect(ok.records).toHaveLength(900);
  });

  it('review F2: the record bound is a named adaptation, about five times an hour of a measured match', () => {
    expect(REPLAY_DOOR_RECORDS_MAX_ADAPTATION).toBe(750_000);
  });
});

/**
 * LCM-RP (the replay batch's RB-11, Q4 option (a); `REPLAY_PUBLIC_FETCH_ADAPTATION`): a signed-out page's replay --
 * central's `GET /replays/<id>[?match=]`, no bearer, no cookie, followed to the door its 302 names. The page sees only the
 * chain's end (`Response.redirected`, `Response.url`), so what it holds is that end: the door pinned for this id with
 * central's grant alone, or central's own answer at the address asked. Anything else -- another host, another id, a hop
 * that left the door's shape -- is not read. Hosts, ids and grants invented.
 */
describe('LCM-RP (RB-11): the public fetch (loadPublicSegment)', () => {
  const CENTRAL = `https://socom2legacy.com/replays/${ID}?match=m-1`;
  /** An answer as the platform hands it after following a chain to `url` (`redirected`, `url` set as fetch sets them). */
  const followed = (url: string, body: BodyInit | null = fixtureBytes() as BodyInit, status = 200): Response => {
    const r = new Response(body, { status });
    Object.defineProperty(r, 'url', { value: url });
    Object.defineProperty(r, 'redirected', { value: true });
    return r;
  };
  const asIs = (url: string, body: BodyInit | null, status = 200): Response => {
    const r = new Response(body, { status });
    Object.defineProperty(r, 'url', { value: url });
    return r;
  };

  it('is a named adaptation', () => {
    expect(REPLAY_PUBLIC_FETCH_ADAPTATION).toMatch(/grant/);
  });

  it('asks central once with no bearer, no cookie, no cache, the redirect followed; reads the door it lands on with the grant alone', async () => {
    const f = spy(() => followed(`${PROD}?grant=${GRANT}`));
    const seg = await loadPublicSegment(CENTRAL, { fetch: f.fetch });
    expect(seg.header.map).toBe('MP2');
    expect(f.seen).toHaveLength(1);
    expect(f.seen[0]!.url).toBe(CENTRAL);
    const init = f.seen[0]!.init!;
    expect(init.redirect).toBe('follow');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });

  it('central\'s own recording (no hop, the address asked) is read; its 404 reads missing, its 503 and 429 unavailable', async () => {
    expect((await loadPublicSegment(CENTRAL, { fetch: spy(() => asIs(CENTRAL, fixtureBytes() as BodyInit)).fetch })).header.map).toBe('MP2');
    expect((await loadPublicSegment(CENTRAL, { fetch: spy(() => new Response(fixtureBytes() as BodyInit)).fetch })).header.map).toBe('MP2');   // url '' (a double)
    expect((await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => asIs(CENTRAL, null, 404)).fetch }))).kind).toBe('missing');
    expect((await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => asIs(CENTRAL, null, 503)).fetch }))).kind).toBe('unavailable');
    expect((await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => asIs(CENTRAL, null, 429)).fetch }))).kind).toBe('unavailable');
    // a throw: central unreachable, or the door's refusal (no CORS on it)
    expect((await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => { throw new TypeError('Failed to fetch'); }).fetch }))).kind).toBe('missing');
  });

  it('refuses a foreign host, another id, and a hop that left the door\'s shape -- the body never read', async () => {
    for (const end of [
      `https://elsewhere.test/replays/${ID}?grant=${GRANT}`,                                  // a foreign host
      `https://firehuge.play.socom2legacy.com.evil.test/replays/${ID}?grant=${GRANT}`,        // a look-alike
      `https://firehuge.play.socom2legacy.com/replays/00000000000000b2?grant=${GRANT}`,       // another id
      `https://firehuge.play.socom2legacy.com/replays/${ID}`,                                 // no grant: not central's hop
      `https://firehuge.play.socom2legacy.com/replays/${ID}?grant=${GRANT}&next=x`,           // a second hop's mark
      `https://firehuge.play.socom2legacy.com/replays/${ID}?grant=${GRANT}#x`,
      `http://firehuge.play.socom2legacy.com/replays/${ID}?grant=${GRANT}`,                   // not https
      `http://127.0.0.1:5343/replays/${ID}?grant=${GRANT}`,                                   // the loopback door, no devDoors
      `https://socom2legacy.com/replays/${ID}?match=m-1`,                                     // central again: a loop is a hop too
    ]) {
      const s = counted(1024, 256);
      const r = followed(end, s.stream);
      const e = await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => r).fetch }));
      expect(e.kind, end).toBe('unavailable');
      expect(s.pulled(), end).toBeLessThanOrEqual(256);
    }
    // an answer from another address without the redirect flag is not read either
    const e = await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => asIs(`https://elsewhere.test/replays/${ID}`, fixtureBytes() as BodyInit)).fetch }));
    expect(e.kind).toBe('unavailable');
  });

  it('the loopback door is followed under devDoors only (a development build\'s ?devmode)', async () => {
    const local = `http://127.0.0.1:5340/replays/${ID}`;
    const seg = await loadPublicSegment(local, { devDoors: true, fetch: spy(() => followed(`${DEV}?grant=${GRANT}`)).fetch });
    expect(seg.header.map).toBe('MP2');
  });

  it('the door\'s answers after the hop: 404 missing, 503 unavailable; its body under the door\'s bounds', async () => {
    expect((await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => followed(`${PROD}?grant=${GRANT}`, null, 404)).fetch }))).kind).toBe('missing');
    expect((await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => followed(`${PROD}?grant=${GRANT}`, null, 503)).fetch }))).kind).toBe('unavailable');
    const s = counted(4 * 2 ** 20, 16 * 1024);
    const e = await refusal(loadPublicSegment(CENTRAL, { fetch: spy(() => followed(`${PROD}?grant=${GRANT}`, s.stream)).fetch, bounds: { body: 64 * 1024, inflated: 2 ** 30 } }));
    expect(e.kind).toBe('missing');
    expect(s.cancelled()).toBe(true);
  });

  it('asks only central\'s replay route: never a door first, never another path', async () => {
    for (const bad of [PROD, DEV, `https://socom2legacy.com/replays/${ID}/x`, `https://socom2legacy.com/other/${ID}`, `https://socom2legacy.com/replays/${ID}?grant=${GRANT}`, 'not a url']) {
      const f = spy(() => followed(`${PROD}?grant=${GRANT}`));
      await refusal(loadPublicSegment(bad, { fetch: f.fetch }));
      expect(f.seen, bad).toHaveLength(0);
    }
  });
});

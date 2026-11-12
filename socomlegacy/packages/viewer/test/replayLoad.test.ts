// test/replayLoad.test.ts -- PT-18: a segment read in the page (W35.R1, W35.R2; research 244 §2)
import { describe, expect, it } from 'vitest';
import { encodeRecord, REPLAY_PROTOCOLS } from '../../match/src/replay/format';
import { checkReplayUrl, loadSegment, ReplayLoadError, REPLAY_NOT_FOUND_OR_NOT_YOURS } from '../src/replay/load';
import { concat, cutBytes, fakeFetch, fixtureBytes, fixtureRecords, gzip, header } from './replayFixture';

/** The hosted fetch's failure, as the page says it (research 245 §5). */
const HOSTED_FETCH_FAILED = "The recording could not be fetched (the match server did not answer, answered with a redirect, or this page's address is not among the server's allowed origins).";

describe('loadSegment: fetch, gunzip by DecompressionStream when the bytes are gzip, then decodeRecords', () => {
  it('reads a plain segment (a live one\'s flushed prefix is plain)', async () => {
    const seg = await loadSegment('http://localhost:5303/segments/0.s2r', { fetch: fakeFetch(fixtureBytes()) });
    expect(seg.header.map).toBe('MP2');
    expect(seg.truncated).toBe(false);
    expect(seg.records.length).toBe(fixtureRecords().length);
  });
  it('reads a gzipped one (a closed segment: 1f 8b), through the platform\'s DecompressionStream', async () => {
    const z = await gzip(fixtureBytes());
    expect([z[0], z[1]]).toEqual([0x1f, 0x8b]);
    const seg = await loadSegment('http://127.0.0.1:5303/segments/0.s2r', { fetch: fakeFetch(z) });
    expect(seg.records.map((r) => r.kind)).toEqual(fixtureRecords().map((r) => r.kind));
    expect(seg.truncated).toBe(false);
  });
  it('a cut tail: every whole record, truncated -- not an error (review focus 3)', async () => {
    const records = fixtureRecords();
    const at = records.findIndex((r) => r.kind === 'snap' && r.tick === 400);
    const seg = await loadSegment('http://localhost:5303/segments/1.s2r', { fetch: fakeFetch(cutBytes(records, at)) });
    expect(seg.truncated).toBe(true);
    expect(seg.records).toHaveLength(at);
  });
  it('RE-2 (W38.R2): a format-1 recording (before the hostages record) still loads, with no roster', async () => {
    const records = fixtureRecords(header({ format: 1 }));
    const seg = await loadSegment('http://localhost:5303/segments/0.s2r', { fetch: fakeFetch(fixtureBytes(records)) });
    expect(seg.header.format).toBe(1);
    expect(seg.records).toHaveLength(records.length);
    expect(seg.records.some((r) => r.kind === 'hostages')).toBe(false);
  });
  it('a recording of protocol 999 is refused with a message in plain words, never decoded (PT.R10)', async () => {
    const bytes = concat([encodeRecord({ kind: 'header', header: header({ protocol: 999 }) })]);
    const err = await loadSegment('http://localhost:5303/segments/0.s2r', { fetch: fakeFetch(bytes) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReplayLoadError);
    expect(REPLAY_PROTOCOLS).toEqual([10, 11, 12, 13, 14, 15]);     // SEP-POP's 12, PLANT-AIM's 13, ER-2's 14 and PROTO-15's 15 beside the kept 10 and 11
    expect((err as Error).message).toBe('This recording was made with network protocol 999; this build plays protocols 10, 11, 12, 13, 14 and 15.');
  });
  it('another format, no header, an empty file, a failed fetch, a bad gzip: each a ReplayLoadError in words', async () => {
    const url = 'http://localhost:5303/segments/0.s2r';
    const fails = async (body: Uint8Array | null, status = 200): Promise<string> => {
      const e = await loadSegment(url, { fetch: fakeFetch(body, status) }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ReplayLoadError);
      return (e as Error).message;
    };
    expect(await fails(encodeRecord({ kind: 'header', header: header({ format: 4 }) }))).toBe('This recording\'s file format is version 4; this build reads versions 1, 2 and 3.');
    expect(await fails(encodeRecord({ kind: 'end', tick: 1, reason: 'x' }))).toBe('This file is not a replay recording (it has no header).');
    expect(await fails(new Uint8Array(0))).toBe('The recording is empty.');
    expect(await fails(null, 404)).toBe('The recording could not be fetched (HTTP 404).');
    expect(await fails(new Uint8Array([0x1f, 0x8b, 1, 2, 3]))).toBe('The recording is not a readable gzip file.');
  });
});

describe('the replay address (W35.R2): a URL on this computer only', () => {
  it('takes http(s) on localhost or 127.0.0.1', () => {
    for (const u of ['http://localhost:5303/segments/0.s2r', 'https://localhost/x.s2r', 'http://127.0.0.1:5303/segments/12.s2r']) {
      expect(checkReplayUrl(u).href, u).toBe(new URL(u).href);
    }
  });
  it('refuses any other host, scheme or a path', () => {
    for (const u of ['http://example.com/0.s2r', 'http://localhost.example.com/0.s2r', 'file:///C:/x.s2r', 'ftp://localhost/x', 'segments/0.s2r', '/segments/0.s2r', 'http://[::1]/x', '']) {
      expect(() => checkReplayUrl(u), u).toThrow(ReplayLoadError);
    }
  });
});

// PT-27 (W36.R5; research 245 §5): a hosted replay on the page's own configured match server, and the bearer.
describe('the replay address (W36.R5): the page\'s configured match server\'s /replays/<id> too', () => {
  const SERVER = 'wss://mp.example.test/ws';
  const ID = '0123456789abcdef';
  const HOSTED = `https://mp.example.test/replays/${ID}`;
  it('takes the configured server\'s /replays/<16 lower-case hex>, its ws(s) target read as http(s) (universeServiceBase\'s rule)', () => {
    expect(checkReplayUrl(HOSTED, { server: SERVER }).href).toBe(HOSTED);
    expect(checkReplayUrl(`http://mp.example.test:8080/replays/${ID}`, { server: 'ws://mp.example.test:8080/ws' }).href)
      .toBe(`http://mp.example.test:8080/replays/${ID}`);
  });
  it('refuses another host, a query or a hash, another path, an id of another form, another scheme or port, a user', () => {
    for (const u of [
      `https://evil.example.test/replays/${ID}`, `https://mp.example.test.evil.test/replays/${ID}`, `https://example.test/replays/${ID}`,
      `${HOSTED}?x`, `${HOSTED}?`, `${HOSTED}#t`, `${HOSTED}#`, `${HOSTED}/`, `${HOSTED}.s2r`, `${HOSTED}/x`,
      'https://mp.example.test/rooms', 'https://mp.example.test/replays', 'https://mp.example.test/replays/', `https://mp.example.test/segments/${ID}`,
      'https://mp.example.test/replays/0123456789ABCDEF', 'https://mp.example.test/replays/0123456789abcde', 'https://mp.example.test/replays/0123456789abcdef0',
      'https://mp.example.test/replays/0123456789abcdeg', `https://mp.example.test/replays?room=MP2&id=${ID}`,
      `http://mp.example.test/replays/${ID}`, `https://mp.example.test:8443/replays/${ID}`, `https://u:p@mp.example.test/replays/${ID}`,
      `wss://mp.example.test/replays/${ID}`,
    ]) {
      expect(() => checkReplayUrl(u, { server: SERVER }), u).toThrow(ReplayLoadError);
    }
    expect(() => checkReplayUrl(`https://mp.example.test:8080/replays/${ID}`, { server: 'ws://mp.example.test:8080/ws' }), 'https on a ws server')
      .toThrow(ReplayLoadError);
  });
  it('no configured server (multiplayer off, Online Off): a hosted address is refused, as before', () => {
    expect(() => checkReplayUrl(HOSTED), 'none').toThrow(ReplayLoadError);
    expect(() => checkReplayUrl(HOSTED, { server: null }), 'null').toThrow(ReplayLoadError);
    expect(() => checkReplayUrl(HOSTED, { server: 'not a url' }), 'garbage').toThrow(ReplayLoadError);
  });
  it('the localhost rule is unchanged beside a configured server', () => {
    for (const u of ['http://localhost:5303/segments/0.s2r', 'https://localhost/x.s2r', 'http://127.0.0.1:5303/segments/12.s2r']) {
      expect(checkReplayUrl(u, { server: SERVER }).href, u).toBe(new URL(u).href);
    }
    for (const u of ['http://example.com/0.s2r', 'http://[::1]/x', '/segments/0.s2r', '']) {
      expect(() => checkReplayUrl(u, { server: SERVER }), u).toThrow(ReplayLoadError);
    }
  });
});

describe('loadSegment\'s bearer (W36.R5): the login ticket to the configured server only, never across a redirect', () => {
  const SERVER = 'wss://mp.example.test/ws';
  const HOSTED = 'https://mp.example.test/replays/0123456789abcdef';
  /** A fetch that records each call's address and init, and answers `answer()`. */
  const spy = (answer: () => Response | Promise<Response> = () => new Response(fixtureBytes() as BodyInit)) => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return answer();
    }) as typeof fetch;
    return { f, calls, auth: (i = 0): string | null => new Headers(calls[i]?.init?.headers).get('authorization') };
  };
  it('sends Authorization: Bearer <ticket> to the configured server\'s /replays/<id>, refusing redirects, sending no cookie', async () => {
    const s = spy();
    const seg = await loadSegment(HOSTED, { fetch: s.f, server: SERVER, ticket: () => 'T1cket' });
    expect(seg.header.map).toBe('MP2');
    expect(s.calls).toHaveLength(1);
    expect(s.auth()).toBe('Bearer T1cket');
    expect(s.calls[0]!.init?.redirect).toBe('error');
    expect(s.calls[0]!.init?.credentials).toBe('omit');
  });
  it('no ticket held -- no ticket reader, null or empty: no header at all', async () => {
    for (const ticket of [undefined, () => null, () => '']) {
      const s = spy();
      await loadSegment(HOSTED, { fetch: s.f, server: SERVER, ...(ticket ? { ticket } : {}) });
      expect(s.auth(), String(ticket)).toBeNull();
      expect(s.calls[0]!.init?.redirect).toBe('error');
    }
  });
  it('never to localhost\'s session service, another host, another path on the server or with no server configured', async () => {
    const cases: [string, string | null][] = [
      ['http://localhost:5303/segments/0.s2r', SERVER],
      ['http://127.0.0.1:5303/segments/0.s2r', 'ws://localhost:8787/ws'],
      ['https://evil.example.test/replays/0123456789abcdef', SERVER],
      ['https://mp.example.test/rooms', SERVER],
      ['http://mp.example.test/replays/0123456789abcdef', SERVER],
      [HOSTED, null],
    ];
    for (const [url, server] of cases) {
      const s = spy();
      await loadSegment(url, { fetch: s.f, server, ticket: () => 'T1cket' }).catch(() => null);
      expect(s.auth(), `${url} on ${String(server)}`).toBeNull();
    }
    const local = spy();
    await loadSegment('http://localhost:5303/segments/0.s2r', { fetch: local.f, server: SERVER, ticket: () => 'T1cket' });
    expect(local.calls[0]!.init, 'the session service\'s fetch as before').toEqual({ cache: 'no-store' });
  });
  it('a redirect from the server is refused: the platform\'s refusal, or an answer from another address, is a ReplayLoadError', async () => {
    // the platform, with redirect: 'error', rejects a 3xx (a TypeError) and never makes the second request
    const s = spy(() => { throw new TypeError('Failed to fetch'); });
    const e1 = await loadSegment(HOSTED, { fetch: s.f, server: SERVER, ticket: () => 'T1cket' }).catch((x: unknown) => x);
    expect(e1).toBeInstanceOf(ReplayLoadError);
    expect((e1 as Error).message).toBe(HOSTED_FETCH_FAILED);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.init?.redirect).toBe('error');
    // a fetch that followed anyway: the answer's own address is not the one asked, so its bytes are not read
    const moved = (): Response => {
      const r = new Response(fixtureBytes() as BodyInit);
      Object.defineProperty(r, 'url', { value: 'https://elsewhere.example.test/x.s2r' });
      Object.defineProperty(r, 'redirected', { value: true });
      return r;
    };
    const e2 = await loadSegment(HOSTED, { fetch: spy(moved).f, server: SERVER, ticket: () => 'T1cket' }).catch((x: unknown) => x);
    expect(e2).toBeInstanceOf(ReplayLoadError);
    expect((e2 as Error).message).toBe('The match server answered with a redirect, which the replay mode does not follow.');
  });
  it("a hosted fetch the platform rejects also names a missing CORS origin (sprint 36 close, review B): the server's 403 carries no CORS header, so the page sees only a TypeError", async () => {
    const s = spy(() => { throw new TypeError('Failed to fetch'); });
    const e = await loadSegment(HOSTED, { fetch: s.f, server: SERVER, ticket: () => 'T1cket' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ReplayLoadError);
    expect((e as Error).message).toBe(HOSTED_FETCH_FAILED);
    expect((e as Error).message).toContain("or this page's address is not among the server's allowed origins");
    const local = await loadSegment('http://localhost:5303/segments/0.s2r', { fetch: spy(() => { throw new TypeError('Failed to fetch'); }).f, server: SERVER }).catch((x: unknown) => x);
    expect((local as Error).message, "the session service's as before").toBe('The recording could not be fetched (the session service did not answer).');
  });
  it('a 404 from the server says it in words, not found or not yours alike (W36.R2: a hidden replay is not told apart)', async () => {
    const e = await loadSegment(HOSTED, { fetch: fakeFetch(null, 404), server: SERVER, ticket: () => 'T1cket' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ReplayLoadError);
    expect((e as Error).message).toBe(REPLAY_NOT_FOUND_OR_NOT_YOURS);
    expect(REPLAY_NOT_FOUND_OR_NOT_YOURS).toBe('This recording was not found on the match server, or it is not yours to watch.');
    const local = await loadSegment('http://localhost:5303/segments/0.s2r', { fetch: fakeFetch(null, 404), server: SERVER }).catch((x: unknown) => x);
    expect((local as Error).message, 'the session service\'s 404 as before').toBe('The recording could not be fetched (HTTP 404).');
  });
});

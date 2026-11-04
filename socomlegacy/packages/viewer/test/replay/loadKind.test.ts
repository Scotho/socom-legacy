// test/replay/loadKind.test.ts -- MU2-14 part A: the replay refusal's kind as data (product track, OT.R53)
import { describe, expect, it } from 'vitest';
import { encodeRecord, gzipReplay } from '../../../match/src/replay/format';
import type { ServerEvent } from '../../src/net/protocol';
import { checkReplayUrl, decodeSegment, loadSegment, ReplayLoadError, REPLAY_NOT_FOUND_OR_NOT_YOURS } from '../../src/replay/load';
import { ReplayClient } from '../../src/replay/replayClient';
import { loadKindOf, REPLAY_LOAD_KINDS } from '../../src/replay/refusalKind';
import { fakeFetch, fixtureBytes, header } from '../replayFixture';

/**
 * MU2-14 (row MU2-14, part A): every `ReplayLoadError` carries its kind as data -- `version`, `corrupt`, `missing`,
 * `unavailable` -- set where `src/replay/load.ts` builds its sentence, so the viewer reads the kind without parsing words
 * (MU2-13 sorted the sentence). The sentences themselves are unchanged (`../replayLoad.test.ts`,
 * `../modern/replays/states.test.ts` keep pinning them). Each case is made by the loader from bytes or from a fetch's
 * answer, never typed here. A browser adaptation (REPLAY_ADAPTATION, MU.R1): nothing of the game.
 */

const LOCAL = 'http://localhost:5303/segments/0.s2r';
const SERVER = 'wss://mp.example.test/ws';
const HOSTED = 'https://mp.example.test/replays/0123456789abcdef';

/** The loader's refusal of `run`, as thrown. */
async function refusalOf(run: () => Promise<unknown>): Promise<ReplayLoadError> {
  const e = await run().then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ReplayLoadError);
  return e as ReplayLoadError;
}
const decoded = (bytes: Uint8Array): Promise<ReplayLoadError> => refusalOf(() => decodeSegment(bytes));
const fetched = (url: string, f: typeof fetch, server: string | null = SERVER): Promise<ReplayLoadError> =>
  refusalOf(() => loadSegment(url, { fetch: f, server, ticket: () => 'T1cket' }));

/** A format-1 file whose next record has a tag no format knows (MU2-13 review F1's bytes): the damaged-file sentence. */
const BAD_TAG = (): Uint8Array => {
  const head = encodeRecord({ kind: 'header', header: header({ format: 1 }) });
  const out = new Uint8Array(head.byteLength + 5);
  out.set(head);
  out[head.byteLength] = 99;
  return out;
};

describe('MU2-14: ReplayLoadError carries its kind, set at each throw site of load.ts', () => {
  it('refusal(): another protocol (older, newer) or another file format -> "version"', async () => {
    const older = await decoded(encodeRecord({ kind: 'header', header: header({ protocol: 1 }) }));
    expect(older.kind).toBe('version');
    expect(older.message).toMatch(/^This recording was made with network protocol 1;/);
    expect((await decoded(encodeRecord({ kind: 'header', header: header({ protocol: 999 }) }))).kind).toBe('version');
    const format = await decoded(encodeRecord({ kind: 'header', header: header({ format: 4 }) }));
    expect(format.kind).toBe('version');
    expect(format.message).toMatch(/^This recording's file format is version 4;/);
  });
  it('refusal(): a bad tag after a whole header (plain and gzip) -> "corrupt", the damaged-file sentence', async () => {
    for (const bytes of [BAD_TAG(), gzipReplay(BAD_TAG())]) {
      const e = await decoded(bytes);
      expect(e.kind).toBe('corrupt');
      expect(e.message).toMatch(/^This recording is damaged and cannot be played \(/);
    }
  });
  it('decodeSegment / gunzip: two bytes, empty, a bad gzip, no header -> "corrupt"', async () => {
    const two = await decoded(new Uint8Array([7, 1]));
    expect([two.kind, two.message]).toEqual(['corrupt', 'The recording holds no whole record yet.']);
    const empty = await decoded(new Uint8Array(0));
    expect([empty.kind, empty.message]).toEqual(['corrupt', 'The recording is empty.']);
    const gz = await decoded(new Uint8Array([0x1f, 0x8b, 1, 2, 3]));
    expect([gz.kind, gz.message]).toEqual(['corrupt', 'The recording is not a readable gzip file.']);
    const none = await decoded(encodeRecord({ kind: 'end', tick: 1, reason: 'x' }));
    expect([none.kind, none.message]).toEqual(['corrupt', 'This file is not a replay recording (it has no header).']);
  });
  it('loadSegment: the match server\'s 404 -> "missing" (its one sentence, W36.R2)', async () => {
    const e = await fetched(HOSTED, fakeFetch(null, 404));
    expect([e.kind, e.message]).toEqual(['missing', REPLAY_NOT_FOUND_OR_NOT_YOURS]);
  });
  it('loadSegment: HTTP 500, the session service\'s own 404, no answer, a redirect -> "unavailable"', async () => {
    const h500 = await fetched(HOSTED, fakeFetch(null, 500));
    expect([h500.kind, h500.message]).toEqual(['unavailable', 'The recording could not be fetched (HTTP 500).']);
    const l500 = await fetched(LOCAL, fakeFetch(null, 500));
    expect(l500.kind).toBe('unavailable');
    // The session service's 404 keeps its HTTP sentence (`../replayLoad.test.ts`), so its kind stays MU2-13's sort of it.
    const l404 = await fetched(LOCAL, fakeFetch(null, 404));
    expect([l404.kind, l404.message]).toEqual(['unavailable', 'The recording could not be fetched (HTTP 404).']);
    const rejects = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect((await fetched(HOSTED, rejects)).kind).toBe('unavailable');
    expect((await fetched(LOCAL, rejects)).kind).toBe('unavailable');
    const moved = (async () => {
      const r = new Response(fixtureBytes() as BodyInit);
      Object.defineProperty(r, 'redirected', { value: true });
      return r;
    }) as typeof fetch;
    const redirect = await fetched(HOSTED, moved);
    expect([redirect.kind, redirect.message]).toEqual(['unavailable', 'The match server answered with a redirect, which the replay mode does not follow.']);
  });
  it('checkReplayUrl: an address the page does not fetch -> "unavailable"', () => {
    let e: unknown = null;
    try { checkReplayUrl('https://evil.example.test/x.s2r'); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(ReplayLoadError);
    expect((e as ReplayLoadError).kind).toBe('unavailable');
  });
  it('a ReplayLoadError made with no kind is "unavailable" (anything else); loadKindOf reads only a ReplayLoadError\'s kind', () => {
    expect(new ReplayLoadError('x').kind).toBe('unavailable');
    expect(new ReplayLoadError('x', 'corrupt').kind).toBe('corrupt');
    expect([...REPLAY_LOAD_KINDS].sort()).toEqual(['corrupt', 'missing', 'unavailable', 'version']);
    expect(loadKindOf(new ReplayLoadError('reworded', 'corrupt'))).toBe('corrupt');
    expect(loadKindOf(new Error('This recording is damaged and cannot be played (x).'))).toBeNull();
    expect(loadKindOf(Object.assign(new Error('e'), { kind: 'corrupt' }))).toBeNull();      // not a ReplayLoadError
    expect(loadKindOf('corrupt')).toBeNull();
    expect(loadKindOf(null)).toBeNull();
  });
});

describe('MU2-14: ReplayClient keeps the refusal\'s kind beside its sentence (the `refused` event unchanged)', () => {
  it('a file the load refused: `refusedKind` is the error\'s, set before the event; the event carries the sentence only', async () => {
    const c = new ReplayClient(Promise.reject(new ReplayLoadError('Reworded: the file is broken.', 'corrupt')), { name: 'W', map: 'MP2' });
    expect(c.refusedKind).toBeNull();
    const seen: [ServerEvent, string | null][] = [];
    c.on((ev) => seen.push([ev, c.refusedKind]));
    await c.ready;
    expect(c.state).toBe('refused');
    expect(seen).toEqual([[{ type: 'refused', reason: 'Reworded: the file is broken.' }, 'corrupt']]);
  });
  it('a refusal that never came through a ReplayLoadError (a plain error, the page\'s check) has no kind: text only', async () => {
    const plain = new ReplayClient(Promise.reject(new Error('boom')), { name: 'W', map: 'MP2' });
    await plain.ready;
    expect([plain.state, plain.refusedKind]).toEqual(['refused', null]);
    const checked = new ReplayClient(Promise.resolve(await decodeSegment(fixtureBytes())), { name: 'W', map: 'MP5', check: () => 'This recording is of MP2.' });
    await checked.ready;
    expect([checked.state, checked.refusedKind]).toEqual(['refused', null]);
  });
  it('an open recording has no kind', async () => {
    const c = new ReplayClient(Promise.resolve(await decodeSegment(fixtureBytes())), { name: 'W', map: 'MP2' });
    await c.ready;
    expect([c.state, c.refusedKind]).toEqual(['open', null]);
  });
});

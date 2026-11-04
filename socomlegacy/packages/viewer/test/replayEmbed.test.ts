// @vitest-environment jsdom
// test/replayEmbed.test.ts -- PT-20: the replay embedded in the report -- the seek message from the report's origin only
// (spec 4.8; the plan's review focus 5; research 244 §4). REPLAY_ADAPTATION: no original.
import { describe, expect, it, vi } from 'vitest';
import { embedderOrigin, mountEmbed, REPLAY_LISTING_WAIT_MS_PLACEHOLDER, replaySeeker, seekAddress, seekOf, seekOnOpen, startTick } from '../src/replay/embed';
import { replayClient } from '../src/replay/mount';
import type { ReplayClient } from '../src/replay/replayClient';
import { fakeFetch, fixtureBytes } from './replayFixture';

const REPORT = 'http://127.0.0.1:5303';
const SEG0 = `${REPORT}/segments/0.s2r`;
const SEARCH = `?devmode&replay=${encodeURIComponent(SEG0)}&embedder=${encodeURIComponent(REPORT)}`;
const message = (data: unknown, origin: string): MessageEvent => new MessageEvent('message', { data, origin });

describe('the embedder (the report\'s origin, named in &embedder=)', () => {
  it('is an http(s) origin on localhost or 127.0.0.1, written as an origin exactly; else none', () => {
    for (const ok of [REPORT, 'http://localhost:5303', 'https://localhost:5303', 'http://127.0.0.1']) {
      expect(embedderOrigin(`?devmode&embedder=${encodeURIComponent(ok)}`), ok).toBe(ok);
    }
    for (const bad of ['http://example.com:5303', 'http://localhost.evil.example:5303', 'http://127.0.0.1:5303/report', 'http://127.0.0.1:5303/',
      'http://user@localhost:5303', 'javascript:alert(1)', 'ws://localhost:5303', 'null', '*', '']) {
      expect(embedderOrigin(`?devmode&embedder=${encodeURIComponent(bad)}`), bad).toBeNull();
    }
    expect(embedderOrigin('?devmode')).toBeNull();
  });
});

describe('the seek message', () => {
  it('{ type: s2u-replay-seek, segment, tick }, both non-negative whole numbers; anything else is ignored', () => {
    expect(seekOf({ type: 's2u-replay-seek', segment: 1, tick: 120 })).toEqual({ segment: 1, tick: 120 });
    expect(seekOf({ type: 's2u-replay-seek', segment: 0, tick: 0 })).toEqual({ segment: 0, tick: 0 });
    for (const bad of [
      null, 'x', { type: 'other', segment: 1, tick: 1 }, { segment: 1, tick: 1 }, { type: 's2u-replay-seek', segment: -1, tick: 1 },
      { type: 's2u-replay-seek', segment: 1.5, tick: 1 }, { type: 's2u-replay-seek', segment: '1', tick: 1 }, { type: 's2u-replay-seek', segment: 1, tick: NaN },
      { type: 's2u-replay-seek', segment: 1 }, { type: 's2u-replay-seek', segment: 1, tick: 2 ** 60 }, { type: 's2u-replay-seek', segment: 1, tick: Infinity },
    ]) expect(seekOf(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('the listener (DEV and ?devmode, like the replay mode)', () => {
  it('seeks on a good message from the embedder; ignores another origin, a malformed one, and a page with no good embedder', () => {
    const seek = vi.fn();
    const e = mountEmbed({ window, search: SEARCH, seek, dev: true })!;
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 350 }, 'http://evil.example'));
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 350 }, 'http://localhost:5303'));   // not the named origin
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 350 }, 'http://127.0.0.1:5304'));   // the test room's own
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: -3 }, REPORT));
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 'x', tick: 3 }, REPORT));
    expect(seek).not.toHaveBeenCalled();
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 350 }, REPORT));
    expect(seek).toHaveBeenCalledWith(0, 350);
    e.dispose();
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 1 }, REPORT));
    expect(seek).toHaveBeenCalledTimes(1);
    const off = `?devmode&replay=${encodeURIComponent(SEG0)}&embedder=${encodeURIComponent('http://example.com')}`;
    expect(mountEmbed({ window, search: off, seek, dev: true })).toBeNull();
    expect(mountEmbed({ window, search: SEARCH.replace('devmode&', ''), seek, dev: true })).toBeNull();
    expect(mountEmbed({ window, search: SEARCH, seek, dev: false })).toBeNull();
  });
});

describe('the seek: the segment playing, or another loaded', () => {
  const client = () => {
    const c = { state: 'open', ready: Promise.resolve(), seek: vi.fn((t: number) => t) };
    return c;
  };
  it('the segment playing: seeks in place, once it is open', async () => {
    const c = client();
    const replace = vi.fn();
    replaySeeker({ search: SEARCH, client: c, location: { pathname: '/testroom', hash: '', replace } })(0, 350);
    await Promise.resolve();
    expect(c.seek).toHaveBeenCalledWith(350);
    expect(replace).not.toHaveBeenCalled();
  });
  it('another segment: the page reopens on its address (the same service, /segments/<n>.s2r) at the tick, every other parameter kept', () => {
    const c = client();
    const replace = vi.fn();
    replaySeeker({ search: `${SEARCH}&map=MP2`, client: c, location: { pathname: '/testroom', hash: '#h', replace } })(3, 40);
    expect(c.seek).not.toHaveBeenCalled();
    const to = replace.mock.calls[0]![0] as string;
    expect(to.startsWith('/testroom?devmode&')).toBe(true);
    expect(to.endsWith('#h')).toBe(true);
    const q = new URLSearchParams(to.slice('/testroom'.length, -2));
    expect(q.get('replay')).toBe(`${REPORT}/segments/3.s2r`);
    expect(q.get('tick')).toBe('40');
    expect(q.get('embedder')).toBe(REPORT);
    expect(q.get('map')).toBe('MP2');
    expect(seekAddress('?devmode&tick=9&replay=x', 'http://localhost:5303/segments/1.s2r', 7)).toBe(`?devmode&tick=7&replay=${encodeURIComponent('http://localhost:5303/segments/1.s2r')}`);
  });
  it('RE-6 (research 249 §2): the reopen names the target segment\'s map (seekAddress\'s map, in place or appended; none given, the address\'s own kept)', () => {
    const seg1 = 'http://localhost:5303/segments/1.s2r';
    expect(seekAddress('?devmode&map=MP72&replay=x&tick=3', seg1, 608, 'MP2')).toBe(`?devmode&map=MP2&replay=${encodeURIComponent(seg1)}&tick=608`);
    expect(seekAddress('?devmode&replay=x', seg1, 608, 'mp2')).toBe(`?devmode&replay=${encodeURIComponent(seg1)}&tick=608&map=MP2`);
    expect(seekAddress('?devmode&map=MP72&replay=x', seg1, 608, null)).toBe(`?devmode&map=MP72&replay=${encodeURIComponent(seg1)}&tick=608`);
  });
  it('RE-6: another segment of another map reopens the page on that map at once (the listing\'s), so one map loads, not two', async () => {
    const c = client();
    const replace = vi.fn();
    const listing = Promise.resolve({
      segments: [{ index: 0, map: 'MP72', start: 0, end: 900 }, { index: 1, map: 'MP2', start: 0, end: 700 }, { index: 2, start: 0, end: 50 }],
      marks: [],
    });
    const seek = replaySeeker({ search: `${SEARCH}&map=MP72`, client: c, location: { pathname: '/testroom', hash: '', replace }, listing });
    seek(1, 608);
    await vi.waitFor(() => { expect(replace).toHaveBeenCalledTimes(1); });
    const q = new URLSearchParams((replace.mock.calls[0]![0] as string).slice('/testroom'.length));
    expect(q.get('replay')).toBe(`${REPORT}/segments/1.s2r`);
    expect(q.get('tick')).toBe('608');
    expect(q.get('map')).toBe('MP2');
    // a segment the listing names no map for: the address's own map kept (the mount's map rule corrects it on open)
    seek(2, 10);
    await vi.waitFor(() => { expect(replace).toHaveBeenCalledTimes(2); });
    expect(new URLSearchParams((replace.mock.calls[1]![0] as string).slice('/testroom'.length)).get('map')).toBe('MP72');
    // a listing that failed: the same
    const failed = vi.fn();
    replaySeeker({ search: `${SEARCH}&map=MP72`, client: c, location: { pathname: '/testroom', hash: '', replace: failed }, listing: Promise.reject(new Error('down')) })(1, 5);
    await vi.waitFor(() => { expect(failed).toHaveBeenCalledTimes(1); });
    expect(new URLSearchParams((failed.mock.calls[0]![0] as string).slice('/testroom'.length)).get('map')).toBe('MP72');
  });
  it('RE-6 review: a listing that never settles holds the reopen no longer than REPLAY_LISTING_WAIT_MS_PLACEHOLDER, then reopens on the address\'s own map, once', async () => {
    vi.useFakeTimers();
    try {
      const c = client();
      const replace = vi.fn();
      let settle: (l: unknown) => void = () => {};
      const listing = new Promise<never>((r) => { settle = r as (l: unknown) => void; });
      replaySeeker({ search: `${SEARCH}&map=MP72`, client: c, location: { pathname: '/testroom', hash: '', replace }, listing })(1, 608);
      await vi.advanceTimersByTimeAsync(REPLAY_LISTING_WAIT_MS_PLACEHOLDER - 1);
      expect(replace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(replace).toHaveBeenCalledTimes(1);
      const q = new URLSearchParams((replace.mock.calls[0]![0] as string).slice('/testroom'.length));
      expect([q.get('replay'), q.get('tick'), q.get('map')]).toEqual([`${REPORT}/segments/1.s2r`, '608', 'MP72']);
      settle({ segments: [{ index: 1, map: 'MP2', start: 0, end: 700 }], marks: [] });   // too late: no second reopen
      await vi.advanceTimersByTimeAsync(10);
      expect(replace).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('RE-6 review: the latest seek wins -- a seek after a cross-segment one still waiting on the listing cancels it', async () => {
    let settle: (l: unknown) => void = () => {};
    const listing = new Promise<never>((r) => { settle = r as (l: unknown) => void; });
    const segs = { segments: [{ index: 0, map: 'MP72', start: 0, end: 900 }, { index: 1, map: 'MP2', start: 0, end: 700 }, { index: 2, map: 'MP5', start: 0, end: 50 }], marks: [] };
    // into segment 1, then in the segment playing (0): the in-place seek stands, the page is not reopened on segment 1
    const c = client();
    const replace = vi.fn();
    const seek = replaySeeker({ search: `${SEARCH}&map=MP72`, client: c, location: { pathname: '/testroom', hash: '', replace }, listing });
    seek(1, 608);
    seek(0, 350);
    settle(segs);
    await listing; await Promise.resolve(); await Promise.resolve();
    expect(c.seek).toHaveBeenCalledWith(350);
    expect(replace).not.toHaveBeenCalled();
    // into segment 1, then segment 2: one reopen, on segment 2 and its map
    const replace2 = vi.fn();
    const seek2 = replaySeeker({ search: `${SEARCH}&map=MP72`, client: client(), location: { pathname: '/testroom', hash: '', replace: replace2 }, listing });
    seek2(1, 608);
    seek2(2, 10);
    await vi.waitFor(() => { expect(replace2).toHaveBeenCalled(); });
    await new Promise((r) => setTimeout(r, 0));
    expect(replace2).toHaveBeenCalledTimes(1);
    const q = new URLSearchParams((replace2.mock.calls[0]![0] as string).slice('/testroom'.length));
    expect([q.get('replay'), q.get('tick'), q.get('map')]).toEqual([`${REPORT}/segments/2.s2r`, '10', 'MP5']);
  });
  it('the file playing (segment null, the timeline off a session): seeks in place, never reopening the page', async () => {
    const c = client();
    const replace = vi.fn();
    const off = `?devmode&replay=${encodeURIComponent('http://localhost:5303/elsewhere.s2r')}`;
    replaySeeker({ search: off, client: c, location: { pathname: '/testroom', hash: '', replace } })(null, 250);
    await Promise.resolve();
    expect(c.seek).toHaveBeenCalledWith(250);
    expect(replace).not.toHaveBeenCalled();
  });
  it('&tick= seeks once the segment opens; a malformed tick is no seek', async () => {
    expect(startTick('?tick=120')).toBe(120);
    for (const bad of ['?tick=-1', '?tick=1.5', '?tick=x', '?tick=', '?tick=1e3', '']) expect(startTick(bad), bad).toBeNull();
    const c = client();
    seekOnOpen('?devmode&tick=120', c);
    await Promise.resolve();
    expect(c.seek).toHaveBeenCalledWith(120);
    const d = { ...client(), state: 'refused' };
    seekOnOpen('?devmode&tick=120', d);
    await Promise.resolve();
    expect(d.seek).not.toHaveBeenCalled();
  });
});

describe('wired in the replay mode (mount.ts)', () => {
  it('a seek from the report moves the recording; one from elsewhere does not; another segment reopens the page', async () => {
    const replace = vi.fn();
    const frames: (() => void)[] = [];
    const make = replayClient(SEARCH, { document, location: { search: SEARCH, pathname: '/testroom', hash: '', replace }, fetch: fakeFetch(fixtureBytes()), frame: (run) => { frames.push(run); } });
    const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await c.ready;
    expect(c.state).toBe('open');
    c.pause();
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 350 }, 'http://evil.example'));
    await Promise.resolve();
    expect(c.serverTick()).toBeLessThan(10);                    // where it was paused, near the start
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 0, tick: 350 }, REPORT));
    await Promise.resolve();
    expect(c.serverTick()).toBe(350);
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 2, tick: 10 }, REPORT));
    await Promise.resolve();
    expect(new URLSearchParams((replace.mock.calls[0]![0] as string).slice('/testroom'.length)).get('replay')).toBe(`${REPORT}/segments/2.s2r`);
    expect(document.querySelectorAll('[data-replay-timeline]')).toHaveLength(1);
    c.close();
    frames.shift()!();                                          // the loop sees it closed: the bar, the timeline and the listener go
    expect(document.querySelectorAll('[data-replay-timeline]')).toHaveLength(0);
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 9, tick: 1 }, REPORT));
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it('an address that names no session segment: a click on the timeline seeks in place in the file playing, never reloading', async () => {
    const search = '?devmode&replay=http://localhost:5303/elsewhere.s2r';
    const replace = vi.fn();
    const frames: (() => void)[] = [];
    const make = replayClient(search, { document, location: { search, pathname: '/testroom', hash: '', replace }, fetch: fakeFetch(fixtureBytes()), frame: (run) => { frames.push(run); } });
    const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await c.ready;
    expect(c.state).toBe('open');
    c.pause();
    frames.shift()!();                                          // a frame: the bar laid out on the file's own span (0..500)
    const bar = document.querySelector('[data-replay-timeline]') as HTMLElement;
    bar.getBoundingClientRect = () => ({ left: 100, width: 800, top: 0, height: 10, right: 900, bottom: 10, x: 100, y: 0, toJSON: () => ({}) });
    bar.dispatchEvent(new MouseEvent('click', { clientX: 100 + 400, bubbles: true }));   // the bar's middle
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
    expect(c.serverTick()).toBe(250);
    c.close();
    frames.shift()!();
    document.querySelectorAll('[data-replay-bar], [data-replay-timeline]').forEach((e) => e.remove());
  });
  it('RE-6: the report\'s seek into a segment of another map reopens the page with that map named, from the service\'s listing', async () => {
    const replace = vi.fn();
    const search = `${SEARCH}&map=MP2`;
    const listing = vi.fn(async () => ({ segments: [{ index: 0, map: 'MP2', closed: true, start: 0, end: 500 }, { index: 1, map: 'MP72', closed: false, start: 0, end: 40 }], marks: [] }));
    const make = replayClient(search, { document, location: { search, pathname: '/testroom', hash: '', replace }, fetch: fakeFetch(fixtureBytes()), listing });
    const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await c.ready;
    expect(c.state).toBe('open');
    window.dispatchEvent(message({ type: 's2u-replay-seek', segment: 1, tick: 30 }, REPORT));
    await vi.waitFor(() => { expect(replace).toHaveBeenCalledTimes(1); });
    const q = new URLSearchParams((replace.mock.calls[0]![0] as string).slice('/testroom'.length));
    expect(q.get('replay')).toBe(`${REPORT}/segments/1.s2r`);
    expect(q.get('tick')).toBe('30');
    expect(q.get('map')).toBe('MP72');
    c.close();
    document.querySelectorAll('[data-replay-bar], [data-replay-timeline]').forEach((e) => e.remove());
  });
  it('the timeline asks the service that serves the segment for its listing, and nothing for an address that is no session segment\'s', async () => {
    for (const [search, want] of [[SEARCH, [`${REPORT}/segments`]], ['?devmode&replay=http://localhost:5303/elsewhere.s2r', []]] as const) {
      const listing = vi.fn(async () => ({ segments: [], marks: [] }));
      const make = replayClient(search, { document, location: { search, pathname: '/testroom', hash: '', replace: () => {} }, fetch: fakeFetch(fixtureBytes()), listing });
      const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
      await c.ready;
      expect(listing.mock.calls.map((a) => (a as unknown[])[0])).toEqual(want);
      c.close();
    }
    document.querySelectorAll('[data-replay-bar], [data-replay-timeline]').forEach((e) => e.remove());
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';

/**
 * Lag read v4 s6 -- an operator's instrument, product track, no original (the lag batch review's controller test and its
 * N1): `NetClient`'s own `requestAnimationFrame` loop feeds its `StallMeter`, and the 2 s app ping carries the reading
 * (`pageStallMaxMs`, `pageStalls100`). Here the page clock (`performance.now`) and the frame queue are the test's: a
 * known stall is read back off the ping; a ping with nothing measured is byte for byte today's; `release` ends the loop;
 * a hidden tab's paused frames are no stall. The ping's own trigger (a command tick or a watcher's snapshot, unchanged
 * by this batch) is not driven: the private `sendPing` is called with the page clock.
 */

const IDLE: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };

let clock = 0;
let queue = new Map<number, FrameRequestCallback>();
let nextId = 1;
const raf = vi.fn((cb: FrameRequestCallback): number => { const id = nextId++; queue.set(id, cb); return id; });
const caf = vi.fn((id: number): void => { queue.delete(id); });
let visibility: DocumentVisibilityState = 'visible';

/** One page frame `gapMs` after the last: the clock moves, then every queued frame callback runs once. */
function frameAfter(gapMs: number): void {
  clock += gapMs;
  const due = [...queue.values()];
  queue = new Map();
  for (const cb of due) cb(clock);
}

function client(): { c: NetClient; sent: unknown[]; socket: WebSocketLike } {
  const sent: unknown[] = [];
  const socket: WebSocketLike = {
    binaryType: 'blob', readyState: 1, send: (d) => { sent.push(d); }, close: () => undefined,
    onopen: null, onclose: null, onmessage: null, onerror: null,
  };
  const c = new NetClient({ url: 'mem', map: 'MP1', name: 'A', socket: () => socket }, IDLE);
  socket.onopen?.({});
  sent.length = 0;                                             // the hello is not under test
  return { c, sent, socket };
}

/** The app ping as sent, its text kept: `sendPing` called with the page clock (its trigger is not this batch's). */
function ping(c: NetClient, sent: unknown[]): string {
  (c as unknown as { sendPing(now: number): void }).sendPing(clock);
  const text = sent.filter((d): d is string => typeof d === 'string' && d.includes('"ping"')).at(-1);
  expect(text, 'a ping was sent').toBeDefined();
  return text!;
}

beforeEach(() => {
  clock = 1000; queue = new Map(); nextId = 1; raf.mockClear(); caf.mockClear(); visibility = 'visible';
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (document as unknown as { visibilityState?: unknown }).visibilityState;
});

describe('NetClient: the page stall meter rides the app ping (an operator\'s instrument, no original)', () => {
  it('(a) frames at 16 ms, one 250 ms gap, then 16 ms: the next ping carries pageStallMaxMs 250 and pageStalls100 1', () => {
    const { c, sent } = client();
    expect(raf).toHaveBeenCalledTimes(1);                      // the loop started in the constructor
    frameAfter(0);                                             // the first frame: the baseline
    for (const g of [16, 16, 250, 16, 16]) frameAfter(g);
    const sentPing = JSON.parse(ping(c, sent)) as Record<string, unknown>;
    expect(sentPing).toEqual({ type: 'ping', t: clock, pageStallMaxMs: 250, pageStalls100: 1 });
  });

  it('(b) nothing measured (take() null): the ping is byte for byte today\'s, no extra or undefined keys', () => {
    const { c, sent } = client();
    expect(ping(c, sent)).toBe(`{"type":"ping","t":${clock}}`);  // no frame at all
    frameAfter(0);                                             // one frame: a baseline, no gap yet
    expect(ping(c, sent)).toBe(`{"type":"ping","t":${clock}}`);
    frameAfter(16);
    ping(c, sent);                                             // this one carries the 16 ms gap
    expect(ping(c, sent)).toBe(`{"type":"ping","t":${clock}}`);  // and the next, nothing since, is today's again
  });

  it('(c) after release() the loop is cancelled: no further requestAnimationFrame', () => {
    const { c, socket } = client();
    frameAfter(0); frameAfter(16);
    const live = [...queue.keys()];
    expect(live).toHaveLength(1);
    const before = raf.mock.calls.length;
    socket.onclose?.({ code: 1000, reason: '' });                          // every close reaches release()
    expect(caf).toHaveBeenCalledWith(live[0]);
    expect(queue.size).toBe(0);
    frameAfter(16); frameAfter(16);
    expect(raf.mock.calls.length).toBe(before);
    void c;
  });

  it('N1: a hidden tab\'s paused frames are no stall -- the first visible frame starts fresh', () => {
    const { c, sent } = client();
    frameAfter(0); frameAfter(16);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    frameAfter(30_000);                                        // a browser may still run one frame while hidden
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    frameAfter(30_000);                                        // the first frame back, 30 s later: a baseline only
    frameAfter(16);
    expect(JSON.parse(ping(c, sent))).toEqual({ type: 'ping', t: clock, pageStallMaxMs: 16, pageStalls100: 0 });
  });

  it('N1: release() removes the visibility listener', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { socket } = client();
    socket.onclose?.({ code: 1000, reason: '' });
    expect(remove.mock.calls.some(([type]) => type === 'visibilitychange')).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';

/**
 * LATER 249: the page's latency injector (`NetOptions.simulate`, `?lag=` / `?loss=` -- reachable without a dev gate) keeps
 * the outbound reliable messages first-in-first-out, as the TCP under a WebSocket does: an ask and a round sent in one
 * frame never swap under jitter. A lossy frame (the commands, the voice) is neither ordered nor held by that chain.
 * A browser adaptation (the injector has no original); the transport it models is the real one.
 */

const walk: NetWalk = { setNetTap() {}, setLocked() {}, respawn() { return true; }, nudge() {} };

/** A socket that records what the page sends, in the order it reaches the wire. */
function recordingSocket(): WebSocketLike & { sent: (string | Uint8Array)[] } {
  const s = {
    binaryType: 'arraybuffer', readyState: 1, sent: [] as (string | Uint8Array)[],
    send(data: string | Uint8Array) { s.sent.push(data); },
    close() { s.readyState = 3; },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
  };
  return s;
}

/** A seeded draw in [0, 1) (an LCG), so each run of the test sees the same jitter. */
function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}

const pings = (sent: (string | Uint8Array)[]): number[] =>
  sent.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as { type: string; t: number })
    .filter((e) => e.type === 'ping').map((e) => e.t);

describe('NetClient injector (LATER 249): outbound reliable messages keep their send order under jitter', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('eight reliable events sent in one tick reach the socket in send order, over 200 seeded draws', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const swapped: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const socket = recordingSocket();
      const client = new NetClient({
        url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
        simulate: { latencyMs: 100, jitterMs: 80, loss: 0 }, random: seeded(seed),
      }, walk);
      for (let i = 0; i < 8; i++) client.send({ type: 'ping', t: i });
      vi.advanceTimersByTime(1000);
      const order = pings(socket.sent);
      expect(order.length).toBe(8);
      if (order.join() !== '0,1,2,3,4,5,6,7') swapped.push(seed);
    }
    expect(swapped).toEqual([]);
  });

  it('with only setTimeout faked (a real performance.now, as turretHold\'s netRig runs it), every reliable message still reaches the socket, in send order (B129\'s red)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const swapped: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const socket = recordingSocket();
      const client = new NetClient({
        url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
        simulate: { latencyMs: 100, jitterMs: 80, loss: 0 }, random: seeded(seed),
      }, walk);
      for (let i = 0; i < 8; i++) client.send({ type: 'ping', t: i });
      vi.advanceTimersByTime(1000);
      const order = pings(socket.sent);
      expect(order.length, `seed ${seed}: every message sent`).toBe(8);
      if (order.join() !== '0,1,2,3,4,5,6,7') swapped.push(seed);
    }
    expect(swapped).toEqual([]);
  });

  it('a reliable message is still delayed: none reaches the socket before its own draw is due', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const socket = recordingSocket();
    const client = new NetClient({
      url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
      simulate: { latencyMs: 100, jitterMs: 0, loss: 0 }, random: () => 0.5,
    }, walk);
    client.send({ type: 'ping', t: 0 });
    vi.advanceTimersByTime(99);
    expect(pings(socket.sent)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(pings(socket.sent)).toEqual([0]);
  });

  it('a lossy frame is independent: neither held behind the reliable chain nor lengthening it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const socket = recordingSocket();
    // Draws in order: the first reliable's jitter (+80 -> 180 ms), the voice frame's (-80 -> 20 ms), the second reliable's
    // (-80 -> 20 ms, held to the first's 180 ms by the order), and a second voice frame's (+80 -> 180 ms).
    const draws = [1, 0, 0, 1];
    const client = new NetClient({
      url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
      simulate: { latencyMs: 100, jitterMs: 80, loss: 0 }, random: () => draws.shift() ?? 0.5,
    }, walk);
    const voice1 = new Uint8Array([1]), voice2 = new Uint8Array([2]);
    client.send({ type: 'ping', t: 0 });
    client.sendVoice(voice1);
    client.send({ type: 'ping', t: 1 });
    client.sendVoice(voice2);
    vi.advanceTimersByTime(20);
    expect(socket.sent).toEqual([voice1]);                          // the lossy frame went at its own 20 ms
    vi.advanceTimersByTime(160);
    expect(pings(socket.sent)).toEqual([0, 1]);                     // the second reliable waited for the first, in order
    expect(socket.sent).toContain(voice2);                          // the second voice frame kept its own 180 ms
    expect(socket.sent.length).toBe(4);
  });

  it('a zero delay with nothing queued runs at once (no timer)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const socket = recordingSocket();
    const client = new NetClient({
      url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
      simulate: { latencyMs: 0, jitterMs: 0, loss: 0 }, random: () => 0.5,
    }, walk);
    client.send({ type: 'ping', t: 0 });
    expect(pings(socket.sent)).toEqual([0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loss still drops only lossy frames: every reliable event arrives at a loss of 1', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const socket = recordingSocket();
    const client = new NetClient({
      url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
      simulate: { latencyMs: 50, jitterMs: 40, loss: 1 }, random: seeded(7),
    }, walk);
    for (let i = 0; i < 4; i++) { client.send({ type: 'ping', t: i }); client.sendVoice(new Uint8Array([i])); }
    vi.advanceTimersByTime(1000);
    expect(pings(socket.sent)).toEqual([0, 1, 2, 3]);
    expect(socket.sent.filter((d) => typeof d !== 'string')).toEqual([]);
  });
});

/**
 * A browser's clock, for the review's F1: `performance.now()` is fractional, and `setTimeout` truncates its delay to whole
 * milliseconds (`Math.trunc`) from the fractional moment it is called -- which vitest's fake timers hide (their clock
 * counts whole milliseconds, so two timers due at one fractional time tie). Timers due together run in arming order.
 */
class BrowserClock {
  now = 0;
  /** The most timers armed at once. */
  peak = 0;
  private id = 0;
  private timers: { at: number; id: number; fn: () => void }[] = [];
  readonly setTimeout = (fn: () => void, ms = 0): number => {
    this.timers.push({ at: this.now + Math.max(0, Math.trunc(ms)), id: ++this.id, fn });
    this.peak = Math.max(this.peak, this.timers.length);
    return this.id;
  };
  /** Runs every timer due by `to`, in time order, then stands at `to`. */
  advance(to: number): void {
    for (;;) {
      const due = this.timers.filter((t) => t.at <= to).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers.splice(this.timers.indexOf(due), 1);
      this.now = Math.max(this.now, due.at);
      due.fn();
    }
    this.now = to;
  }
  armed(): number { return this.timers.length; }
}

describe('NetClient injector (LATER 249, the review\'s F1): the order holds on a browser\'s whole-millisecond setTimeout', () => {
  let clock: BrowserClock;
  beforeEach(() => {
    clock = new BrowserClock();
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
    vi.stubGlobal('setTimeout', clock.setTimeout);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('reliable events sent across frames (fractional times, sub-millisecond dues) reach the socket in send order, over 200 seeded draws', () => {
    const swapped: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      clock.advance(clock.now + 1000);
      const socket = recordingSocket();
      const client = new NetClient({
        url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
        simulate: { latencyMs: 100, jitterMs: 80, loss: 0 }, random: seeded(seed),
      }, walk);
      const start = clock.now + 0.37;
      for (let f = 0; f < 12; f++) {
        clock.advance(start + f * (1000 / 144));                    // a 144 Hz page's frames
        client.send({ type: 'ping', t: f });
      }
      clock.advance(clock.now + 1000);
      const order = pings(socket.sent);
      expect(order.length).toBe(12);
      if (order.join() !== Array.from({ length: 12 }, (_, i) => i).join()) swapped.push(seed);
    }
    expect(swapped).toEqual([]);
  });

  it('re-entrance: a send whose socket sends another reliable event arms one timer at most, and the order holds', () => {
    const socket = recordingSocket();
    let client: NetClient | null = null;
    const send = socket.send.bind(socket);
    socket.send = (data: string | Uint8Array) => {
      send(data);
      // The first ping's delivery sends two more from inside the drain (re-entering the injector).
      if (typeof data === 'string' && JSON.parse(data).t === 0) { client!.send({ type: 'ping', t: 10 }); client!.send({ type: 'ping', t: 11 }); }
    };
    const draws = [0.5, 0.5, 0.5, 0.5, 0.5];
    client = new NetClient({
      url: 'mem', map: 'MP1', name: 'A', socket: () => socket,
      simulate: { latencyMs: 50, jitterMs: 10, loss: 0 }, random: () => draws.shift() ?? 0.5,
    }, walk);
    clock.advance(3.6);
    client.send({ type: 'ping', t: 0 });
    clock.advance(10.2);
    client.send({ type: 'ping', t: 1 });
    clock.advance(500);
    expect(pings(socket.sent)).toEqual([0, 1, 10, 11]);
    expect(clock.peak, 'one timer armed at most').toBe(1);
    expect(clock.armed(), 'none left').toBe(0);
  });
});

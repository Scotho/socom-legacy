import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARE_READ_SET_BYTES, liveDiscShare, type LiveShareDeps } from '../src/discShare';
import type { PeerFactory, PeerSession } from '../src/discShareRtc';
import { DiscShareError, discShareSignal, type DiscShareSignal } from '../src/discShareSignal';
import type { DiscShareAdapter, ReceiverPhase } from '../src/discShareView';
import type { DiscShareMsg, DiscShareQueued } from '../src/discShareWire';
import {
  SHARE_CONFLICT, SHARE_FORBIDDEN, SHARE_NO_SUCH_CODE, SHARE_OTHER_STOPPED, SHARE_SOURCE_GONE, SHARE_TOO_MANY, SHARE_UNAVAILABLE,
} from '../src/discShareWords';
import { SHARE_IDLE_MS_ADAPTATION } from '../src/discShareProtocol';
import { SHARE_DROPPED, SHARE_IDLE } from '../src/discShareWords';
import { files, pipes, sha, source, store, syntheticSet } from './discShareFakes';

/**
 * DSH-4: the real disc share adapter (`src/discShare.ts`) end to end -- its receiver and sender against an in-process
 * fake of central's pairing routes (DSH-3's documented semantics: a request, its claim by code, the relayed messages, a
 * `bye` that ends the pair, a routed 404 after), fake peers joined by fake pipes (jsdom has no WebRTC), a receiver's
 * store and a sender's kept extraction over synthetic bytes. And the merge controller's landing condition: pairing
 * unreachable (a static host's HTML, 404/405, no answer) is said plainly, never hangs, and leaves no timer or poll
 * running. A browser adaptation, product track.
 */

const ORIGIN = 'https://s2.example.org';

/** central's pairing in memory, for any number of clients. */
function fakeCentral(opts: { life?: number } = {}) {
  interface Side { secret: string; queue: DiscShareQueued[]; seq: number; wake: (() => void) | null }
  interface Pair { id: string; code: string; rx: Side; tx: Side | null; createdAt: number; ended: boolean; endsAt: number }
  const pairs = new Map<string, Pair>();
  let n = 0;
  const log: { op: string; msg?: string }[] = [];
  let open = 0;
  const side = (secret: string): Side => ({ secret, queue: [], seq: 0, wake: null });
  const push = (s: Side, msg: DiscShareMsg): void => { s.queue.push({ seq: ++s.seq, msg }); const w = s.wake; s.wake = null; w?.(); };
  const routed = (status: number, why: string): DiscShareError => new DiscShareError(status, why, true);
  const live = (id: string): Pair | undefined => { const p = pairs.get(id); return p && !p.ended ? p : undefined; };
  const sideOf = (p: Pair | undefined, secret: string): Side | null => (p ? (p.rx.secret === secret ? p.rx : p.tx?.secret === secret ? p.tx : null) : null);
  const client = (): DiscShareSignal => ({
    async request() {
      n++;
      const code = `QX7K4${'MNPQRSTUVW'[n % 10]}`;
      const p: Pair = { id: `id${n}`, code, rx: side(`rs${n}`), tx: null, createdAt: n, ended: false, endsAt: Infinity };
      pairs.set(p.id, p);
      log.push({ op: 'request' });
      return { id: p.id, code, secret: p.rx.secret, expiresAt: Date.now() + 600_000 };
    },
    async nearby() { log.push({ op: 'nearby' }); return [...pairs.values()].filter((p) => !p.tx && !p.ended).map((p) => ({ id: p.id, code: p.code, createdAt: p.createdAt })); },
    async claim(code) {
      log.push({ op: 'claim' });
      const p = [...pairs.values()].find((x) => x.code === code.toUpperCase() && !x.tx && !x.ended);
      if (!p) throw routed(404, 'no such request');
      p.tx = side(`ts${p.id}`);
      if (opts.life !== undefined) p.endsAt = Date.now() + opts.life;      // central ends a pair LIFE after its claim
      push(p.rx, { type: 'claimed' });
      return { id: p.id, secret: p.tx.secret };
    },
    async send(id, secret, msg) {
      log.push({ op: 'send', msg: msg.type });
      const p = live(id);
      if (!p || Date.now() >= p.endsAt) throw routed(404, 'no such request');
      const me = sideOf(p, secret);
      if (!me) throw routed(403, 'wrong secret');
      const other = me === p.rx ? p.tx : p.rx;
      if (msg.type === 'bye') { p.ended = true; if (other) push(other, msg); return; }
      if (!other) throw routed(409, 'not claimed yet');
      push(other, msg);
    },
    poll(id, secret, after, signal) {
      log.push({ op: 'poll' });
      return new Promise((ok, no) => {
        let done = false;
        let expiry: ReturnType<typeof setTimeout> | null = null;
        const finish = (f: () => void): void => { if (done) return; done = true; open--; if (expiry !== null) clearTimeout(expiry); f(); };
        open++;
        signal?.addEventListener('abort', () => { finish(() => { no(new DiscShareError(0, 'no answer')); }); }, { once: true });
        const look = (): void => {
          const p = pairs.get(id);
          const me = sideOf(p, secret);
          if (!p || !me) { finish(() => { no(routed(404, 'no such request')); }); return; }
          const ready = me.queue.filter((m) => m.seq > after);
          if (ready.length) { finish(() => { ok(ready); }); return; }
          if (p.ended || Date.now() >= p.endsAt) { finish(() => { no(routed(404, 'no such request')); }); return; }
          me.wake = look;
          if (expiry === null && Number.isFinite(p.endsAt)) expiry = setTimeout(look, p.endsAt - Date.now());
        };
        look();
      });
    },
  });
  return { client, log, pairs, polls: () => open };
}

/** Fake peers: the offer names a fresh pipe pair; the answer joins it. `refuse` makes both ends refuse the pair. */
function fakePeers(opts: { refuse?: string; hold?: boolean } = {}): PeerFactory {
  const pending = new Map<string, ReturnType<typeof pipes>>();
  let k = 0;
  return (role, send): PeerSession => {
    let ok!: (p: ReturnType<typeof pipes>['a']) => void;
    let no!: (e: Error) => void;
    const ready = new Promise<ReturnType<typeof pipes>['a']>((a, b) => { ok = a; no = b; });
    ready.catch(() => undefined);
    let key = '';
    if (role === 'offer') {
      key = `k${++k}`;
      pending.set(key, pipes(opts.hold ? { hold: true } : {}));
      queueMicrotask(() => { send({ type: 'offer', sdp: key }); send({ type: 'candidate', candidate: { candidate: 'c' } }); });
    }
    return {
      ready,
      close() { pending.get(key)?.a.close(); },
      handle(msg) {
        if (role === 'answer' && msg.type === 'offer') {
          key = String(msg['sdp']);
          send({ type: 'answer', sdp: 'a' });
          if (opts.refuse) no(new Error(opts.refuse)); else ok(pending.get(key)!.b);
        } else if (role === 'offer' && msg.type === 'answer') {
          if (opts.refuse) no(new Error(opts.refuse)); else ok(pending.get(key)!.a);
        }
      },
    };
  };
}

const settle = async (ms = 0): Promise<void> => { for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, ms)); };
async function until(f: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 2000 && !f(); i++) await new Promise((r) => setTimeout(r, 0));
  if (!f()) throw new Error(`never: ${what}`);
}

function pair(opts: { complete?: boolean; refuse?: string; hold?: boolean; life?: number; fs?: ReturnType<typeof files>; slowRead?: number } = {}) {
  const central = fakeCentral(opts.life !== undefined ? { life: opts.life } : {});
  const peer = fakePeers({ ...(opts.refuse ? { refuse: opts.refuse } : {}), ...(opts.hold ? { hold: true } : {}) });
  const fs = opts.fs ?? files(150_000, 90_000);
  const st = store();
  const received: unknown[] = [];
  const rxDeps: LiveShareDeps = { search: '', origin: ORIGIN, signal: central.client(), complete: () => false, peer, store: st, readSet: 3, isReadSet: syntheticSet, onReceived: (r) => { received.push(r); } };
  const rx = liveDiscShare(rxDeps);
  const phases: ReceiverPhase[] = [];
  rx.onChange(() => { if (phases.at(-1) !== rx.receiver().phase) phases.push(rx.receiver().phase); });
  const kept = source(fs, 3);
  const slow = opts.slowRead;
  const src = slow === undefined ? kept : { ...kept, readRange: async (p: string, o: number, l: number) => { await new Promise((r) => setTimeout(r, slow)); return kept.readRange(p, o, l); } };
  const txFor = (code: string, search = `?discshare=${code}`): DiscShareAdapter & { dispose(): void } => liveDiscShare({
    search, origin: ORIGIN, signal: central.client(), complete: () => opts.complete ?? true, peer, sendSource: async () => src, readSet: 3,
  });
  return { central, rx, phases, st, fs, received, txFor, src };
}

afterEach(() => { vi.useRealTimers(); });

describe('DSH-4: the adapter end to end (receiver and sender, fake central, fake peers)', () => {
  it('request -> waiting with the code and link -> paired -> copying -> done; the sender asked -> sending -> done', async () => {
    const t = pair();
    t.rx.request();
    expect(t.rx.receiver().phase).toBe('requesting');
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const v = t.rx.receiver();
    expect(v.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(v.link).toBe(`${ORIGIN}/?discshare=${v.code}`);
    const tx = t.txFor(v.code!);
    expect(tx.sender()).toMatchObject({ phase: 'asked', code: v.code });
    expect(t.central.log.filter((l) => l.op === 'claim')).toHaveLength(0);   // nothing claimed before Yes
    tx.approve();
    expect(tx.sender()!.phase).toBe('sending');
    await until(() => t.rx.receiver().phase === 'done' && tx.sender()!.phase === 'done', 'both done');
    expect(t.phases).toEqual(['requesting', 'waiting', 'paired', 'copying', 'done']);
    const total = t.fs.reduce((n, f) => n + f.data.length, 0);
    expect(t.rx.receiver()).toMatchObject({ bytes: total, total });
    expect(tx.sender()).toMatchObject({ bytes: total, total });
    for (const f of t.fs) expect(sha(t.st.stored.get(f.path)!)).toBe(sha(f.data));
    expect(t.st.commits).toHaveLength(1);
    expect(t.received).toEqual([t.st.commits[0]]);
    await settle();
    expect(t.central.polls()).toBe(0);
    t.rx.dispose(); tx.dispose();
  });

  it('the total before the manifest is the read set\'s (DSH.R4: 1,338,391,063 bytes)', () => {
    expect(SHARE_READ_SET_BYTES).toBe(1_338_391_063);
  });

  it('the sender\'s Yes is gated on a complete extraction: needs-extract, and approve claims nothing', async () => {
    const t = pair({ complete: false });
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const tx = t.txFor(t.rx.receiver().code!);
    expect(tx.sender()!.phase).toBe('needs-extract');
    tx.approve();
    await settle();
    expect(tx.sender()!.phase).toBe('needs-extract');
    expect(t.central.log.some((l) => l.op === 'claim')).toBe(false);
    t.rx.cancel(); tx.dispose();
  });

  it('a kept extraction gone by Yes: failed with its words, nothing claimed', async () => {
    const central = fakeCentral();
    const tx = liveDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, signal: central.client(), complete: () => true, peer: fakePeers(), sendSource: async () => null, readSet: 3 });
    tx.approve();
    await until(() => tx.sender()!.phase === 'failed', 'failed');
    expect(tx.sender()!.reason).toBe(SHARE_SOURCE_GONE);
    expect(central.log.some((l) => l.op === 'claim')).toBe(false);
    tx.dispose();
  });

  it('Stop while sending sends bye: the receiver ends failed (the other device stopped), the sender declined', async () => {
    const t = pair({ fs: files(3_000_000) });
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const tx = t.txFor(t.rx.receiver().code!);
    tx.approve();
    await until(() => t.rx.receiver().phase === 'copying', 'copying');
    tx.decline();
    expect(tx.sender()!.phase).toBe('declined');
    expect(t.central.log.some((l) => l.op === 'send' && l.msg === 'bye')).toBe(true);
    await until(() => t.rx.receiver().phase === 'failed', 'receiver failed');
    expect(t.rx.receiver().reason).toBe(SHARE_OTHER_STOPPED);
    expect(t.st.commits).toHaveLength(0);
    await settle();
    expect(t.central.polls()).toBe(0);
    t.rx.dispose(); tx.dispose();
  });

  it('the receiver\'s cancel while waiting sends bye, stops polling, and goes back to idle', async () => {
    const t = pair();
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    await settle();
    expect(t.central.polls()).toBe(1);
    t.rx.cancel();
    expect(t.rx.receiver().phase).toBe('idle');
    await settle();
    expect(t.central.polls()).toBe(0);
    expect(t.central.log.at(-1)).toEqual({ op: 'send', msg: 'bye' });
    expect([...t.central.pairs.values()].every((p) => p.ended)).toBe(true);
    t.rx.dispose();
  });

  it('a relayed pair is refused on both sides with the reason, nothing stored', async () => {
    const t = pair({ refuse: 'The devices could only reach each other through a relay server, so nothing was sent.' });
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const tx = t.txFor(t.rx.receiver().code!);
    tx.approve();
    await until(() => t.rx.receiver().phase === 'failed' && tx.sender()!.phase === 'failed', 'both failed');
    expect(t.rx.receiver().reason).toMatch(/relay/);
    expect(tx.sender()!.reason).toMatch(/relay/);
    expect(t.st.stored.size).toBe(0);
    t.rx.dispose(); tx.dispose();
  });

  it('Try again after a failure asks again: a new code', async () => {
    const t = pair({ refuse: 'refused' });
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const first = t.rx.receiver().code;
    const tx = t.txFor(first!);
    tx.approve();
    await until(() => t.rx.receiver().phase === 'failed', 'failed');
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting again');
    expect(t.rx.receiver().code).not.toBe(first);
    t.rx.dispose(); tx.dispose();
  });
});

describe('DSH-4: the sender\'s code entry', () => {
  it('openSend lists the requests on this network; a typed code is checked; choosing asks as the link would', async () => {
    const t = pair();
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const code = t.rx.receiver().code!;
    const tx = t.txFor('', '');
    expect(tx.sender()).toBeNull();
    tx.openSend();
    expect(tx.sender()).toMatchObject({ phase: 'enter', code: '' });
    await until(() => (tx.sender()!.nearby ?? []).length === 1, 'nearby listed');
    expect(tx.sender()!.nearby).toEqual([code]);
    expect(tx.choose('nope')).toBe(false);
    expect(tx.sender()!.phase).toBe('enter');
    expect(tx.choose(code.toLowerCase())).toBe(true);
    expect(tx.sender()).toMatchObject({ phase: 'asked', code });
    tx.approve();
    await until(() => tx.sender()!.phase === 'done', 'sent');
    t.rx.dispose(); tx.dispose();
  });

  it('nearby is polled only while the code entry is open', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const sig = { nearby: async () => { calls++; return []; } } as unknown as DiscShareSignal;
    const tx = liveDiscShare({ search: '', origin: ORIGIN, signal: sig, complete: () => true, peer: fakePeers(), readSet: 3 });
    expect(calls).toBe(0);
    tx.openSend();
    await vi.advanceTimersByTimeAsync(10_000);
    const open = calls;
    expect(open).toBeGreaterThan(1);
    tx.decline();
    expect(tx.sender()).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(open);
    expect(vi.getTimerCount()).toBe(0);
    tx.dispose();
  });

  it('a code no request has: failed with its words', async () => {
    const central = fakeCentral();
    const tx = liveDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, signal: central.client(), complete: () => true, peer: fakePeers(), sendSource: async () => source(files(10), 3), readSet: 3 });
    tx.approve();
    await until(() => tx.sender()!.phase === 'failed', 'failed');
    expect(tx.sender()!.reason).toBe(SHARE_NO_SUCH_CODE);
    tx.dispose();
  });
});

/** The merge controller's landing condition: pairing unreachable is said plainly, never hangs, leaves nothing running. */
describe('DSH-4: pairing unreachable on this site', () => {
  const html = (status: number): typeof fetch => (async () => new Response('<!doctype html><title>SOCOM</title>', { status, headers: { 'content-type': 'text/html' } })) as typeof fetch;
  const jsonErr = (status: number, error: string): typeof fetch => (async () => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  const never = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_ok, no) => {
    init?.signal?.addEventListener('abort', () => { no(new DOMException('aborted', 'AbortError')); });
  })) as typeof fetch;
  const rxOver = (f: typeof fetch) => liveDiscShare({ search: '', origin: ORIGIN, signal: discShareSignal(ORIGIN, f), complete: () => false, peer: fakePeers(), store: store(), readSet: 3 });
  const txOver = (f: typeof fetch, search = '?discshare=QX7K4M') => liveDiscShare({ search, origin: ORIGIN, signal: discShareSignal(ORIGIN, f), complete: () => true, peer: fakePeers(), sendSource: async () => source(files(10), 3), readSet: 3 });

  it.each([
    ['an HTML 200 (the static host\'s index.html)', html(200), SHARE_UNAVAILABLE],
    ['a 404 page', html(404), SHARE_UNAVAILABLE],
    ['a 405 page', html(405), SHARE_UNAVAILABLE],
    ['a 502', html(502), SHARE_UNAVAILABLE],
    ['a 503', jsonErr(503, 'busy'), SHARE_UNAVAILABLE],
    ['the route\'s 429', jsonErr(429, 'too many requests'), SHARE_TOO_MANY],
    ['the route\'s 403', jsonErr(403, 'another origin'), SHARE_FORBIDDEN],
    ['the route\'s 409', jsonErr(409, 'not claimed yet'), SHARE_CONFLICT],
  ])('the receiver\'s request answered by %s: failed with its words; Try again asks again', async (_what, f, words) => {
    vi.useFakeTimers();
    const rx = rxOver(f);
    rx.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(rx.receiver()).toMatchObject({ phase: 'failed', reason: words });
    expect(vi.getTimerCount()).toBe(0);
    rx.request();
    expect(rx.receiver().phase).toBe('requesting');
    await vi.advanceTimersByTimeAsync(0);
    expect(rx.receiver().phase).toBe('failed');
    rx.dispose();
  });

  it('the receiver\'s request never answered: failed at the timeout, nothing left running', async () => {
    vi.useFakeTimers();
    const rx = rxOver(never);
    rx.request();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(rx.receiver().phase).toBe('requesting');
    await vi.advanceTimersByTimeAsync(1);
    expect(rx.receiver()).toMatchObject({ phase: 'failed', reason: SHARE_UNAVAILABLE });
    expect(vi.getTimerCount()).toBe(0);
    rx.dispose();
  });

  it.each([
    ['an HTML 200', html(200)], ['a 404 page', html(404)], ['a 405 page', html(405)],
  ])('the sender\'s claim answered by %s: failed, unavailable', async (_what, f) => {
    vi.useFakeTimers();
    const tx = txOver(f);
    tx.approve();
    await vi.advanceTimersByTimeAsync(0);
    expect(tx.sender()).toMatchObject({ phase: 'failed', reason: SHARE_UNAVAILABLE });
    expect(vi.getTimerCount()).toBe(0);
    tx.dispose();
  });

  it('the sender\'s claim never answered: failed at the timeout', async () => {
    vi.useFakeTimers();
    const tx = txOver(never);
    tx.approve();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tx.sender()).toMatchObject({ phase: 'failed', reason: SHARE_UNAVAILABLE });
    expect(vi.getTimerCount()).toBe(0);
    tx.dispose();
  });

  it.each([
    ['an HTML 200', html(200)], ['a 404 page', html(404)], ['no answer', never],
  ])('the code entry\'s nearby answered by %s: failed, unavailable, polling stopped', async (_what, f) => {
    vi.useFakeTimers();
    const tx = txOver(f, '');
    tx.openSend();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tx.sender()).toMatchObject({ phase: 'failed', reason: SHARE_UNAVAILABLE });
    expect(vi.getTimerCount()).toBe(0);
    tx.dispose();
  });

  it('a poll that keeps failing fails the session after 3 in a row, never spinning; nothing left running', async () => {
    vi.useFakeTimers();
    let polls = 0;
    const sig: DiscShareSignal = {
      request: async () => ({ id: 'i', code: 'QX7K4M', secret: 's', expiresAt: Date.now() + 600_000 }),
      nearby: async () => [], claim: async () => ({ id: 'i', secret: 's' }), send: async () => undefined,
      poll: async () => { polls++; throw new DiscShareError(0, 'no answer'); },
    };
    const rx = liveDiscShare({ search: '', origin: ORIGIN, signal: sig, complete: () => false, peer: fakePeers(), store: store(), readSet: 3 });
    rx.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(rx.receiver().phase).toBe('waiting');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rx.receiver()).toMatchObject({ phase: 'failed', reason: SHARE_UNAVAILABLE });
    expect(polls).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
    rx.dispose();
  });

  it('cancel while requesting or waiting leaves no timer or poll', async () => {
    vi.useFakeTimers();
    const rx = rxOver(never);
    rx.request();
    rx.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(rx.receiver().phase).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
    rx.dispose();
  });
});

/** The review's B1 and B2 at the adapter: a stall ends failed, and once both checks pass the pairing is done. */
describe('DSH-4 review: the adapter after the pipe is up', () => {
  // A zero delay set inside a fake tick is due 1 ms later (the fake clock's rule): each step moves 1 ms.
  const step = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(1); };

  it('B1: a copy that hears nothing ends failed in its words on both sides; no timer or poll left running', async () => {
    vi.useFakeTimers();
    const t = pair({ hold: true });                               // the channel delivers nothing: hello never arrives
    t.rx.request();
    await step();
    const tx = t.txFor(t.rx.receiver().code!);
    tx.approve();
    await step();
    expect(t.rx.receiver().phase).toBe('copying');
    expect(tx.sender()!.phase).toBe('sending');
    await vi.advanceTimersByTimeAsync(SHARE_IDLE_MS_ADAPTATION);
    await step();
    expect(t.rx.receiver().phase).toBe('failed');
    expect(tx.sender()!.phase).toBe('failed');
    const reasons = [t.rx.receiver().reason, tx.sender()!.reason];
    expect(reasons).toContain(SHARE_IDLE);
    for (const r of reasons) expect([SHARE_IDLE, SHARE_DROPPED]).toContain(r);
    expect(t.central.polls()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(t.st.commits).toHaveLength(0);
    t.rx.dispose(); tx.dispose();
  });

  it('B2: once both checks pass, each side stops polling and says bye; a copy past central\'s 10 minutes completes', async () => {
    vi.useFakeTimers();
    const LIFE = 600_000;                                         // central's DISCSHARE_LIFE_MS after the claim
    // 40 one-byte files, each read in 20 s: 800 s of copy, every wait on the other side under the inactivity bound.
    const t = pair({ life: LIFE, fs: files(...new Array<number>(40).fill(1)), slowRead: 20_000 });
    t.rx.request();
    await step();
    const tx = t.txFor(t.rx.receiver().code!);
    const started = Date.now();
    tx.approve();
    await step();
    expect(t.rx.receiver().phase).toBe('copying');
    expect(t.central.polls(), 'no poll once the pipe is up and both checks passed').toBe(0);
    expect(t.central.log.filter((l) => l.op === 'send' && l.msg === 'bye'), JSON.stringify(t.central.log)).toHaveLength(2);
    const pollsSoFar = t.central.log.filter((l) => l.op === 'poll').length;
    for (let k = 0; k < 100 && t.rx.receiver().phase === 'copying'; k++) await vi.advanceTimersByTimeAsync(10_000);
    expect(Date.now() - started, 'the copy outlasted the life of the pair at central').toBeGreaterThan(LIFE);
    expect(t.rx.receiver().phase).toBe('done');
    expect(tx.sender()!.phase).toBe('done');
    expect(t.st.commits).toHaveLength(1);
    expect(t.central.log.filter((l) => l.op === 'poll').length, 'not one poll during the copy').toBe(pollsSoFar);
    await vi.advanceTimersByTimeAsync(10_000);                    // the receiver's linger
    expect(vi.getTimerCount()).toBe(0);
    t.rx.dispose(); tx.dispose();
  });
});

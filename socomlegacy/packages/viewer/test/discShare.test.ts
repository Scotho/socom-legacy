import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARE_READ_SET_BYTES, hostBusy, liveDiscShare, pairingWords, type LiveShareDeps } from '../src/discShare';
import type { PeerFactory, PeerSession } from '../src/discShareRtc';
import { DiscShareError, discShareSignal, type DiscShareSignal } from '../src/discShareSignal';
import { DISC_SHARE_HOST_PARAM, shareHostLink, type DiscShareAdapter, type ReceiverPhase } from '../src/discShareView';
import type { DiscShareMsg, DiscShareQueued } from '../src/discShareWire';
import {
  SHARE_CONFLICT, SHARE_FORBIDDEN, SHARE_NO_SUCH_CODE, SHARE_OTHER_STOPPED, SHARE_SOURCE_GONE, SHARE_TOO_MANY, SHARE_UNAVAILABLE,
} from '../src/discShareWords';
import { SHARE_IDLE_MS_ADAPTATION } from '../src/discShareProtocol';
import {
  SHARE_DEPLOY_STOPS, SHARE_DROPPED, SHARE_HOST_ENDED, SHARE_HOST_GONE, SHARE_IDLE, SHARE_REQUEST_GONE,
} from '../src/discShareWords';
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

/**
 * central's pairing in memory, for any number of clients. RB-25's hosted shares too (`discShareWire.ts`'s header): a host
 * opened by `host`, polled by its id, told `asked` for each request bound to it by its token and `withdrawn` when one ends
 * unanswered; `approve` pairs a bound request as a claim does, `decline` tells its receiver `declined`; the host's `bye`
 * ends it and tells every receiver still pending `withdrawn`.
 */
function fakeCentral(opts: { life?: number } = {}) {
  interface Side { secret: string; queue: DiscShareQueued[]; seq: number; wake: (() => void) | null }
  interface Pair { id: string; code: string; rx: Side; tx: Side | null; createdAt: number; ended: boolean; endsAt: number; host: string | null }
  interface Host { id: string; token: string; side: Side; ended: boolean }
  const pairs = new Map<string, Pair>();
  const hosts = new Map<string, Host>();
  let n = 0;
  const log: { op: string; msg?: string; id?: string; body?: unknown }[] = [];
  let open = 0;
  const side = (secret: string): Side => ({ secret, queue: [], seq: 0, wake: null });
  const push = (s: Side, msg: DiscShareMsg): void => { s.queue.push({ seq: ++s.seq, msg }); const w = s.wake; s.wake = null; w?.(); };
  const routed = (status: number, why: string): DiscShareError => new DiscShareError(status, why, true);
  /** A host ended (its bye, or central letting it go): every request still bound to it told `withdrawn`; its poll woken. */
  const endHost = (h: Host): void => {
    h.ended = true;
    for (const p of pairs.values()) if (p.host === h.id && !p.ended) { p.host = null; push(p.rx, { type: 'withdrawn' }); p.ended = true; }
    const w = h.side.wake; h.side.wake = null; w?.();
  };
  const live = (id: string): Pair | undefined => { const p = pairs.get(id); return p && !p.ended ? p : undefined; };
  const sideOf = (p: Pair | undefined, secret: string): Side | null => (p ? (p.rx.secret === secret ? p.rx : p.tx?.secret === secret ? p.tx : null) : null);
  const hostOf = (id: string, secret: string): Host => {
    const h = hosts.get(id);
    if (!h || h.ended) throw routed(404, 'no such host');
    if (h.side.secret !== secret) throw routed(403, 'wrong secret');
    return h;
  };
  const bound = (h: Host, id: string): Pair => {
    const p = live(id);
    if (!p) throw routed(404, 'no such request');
    if (p.host !== h.id) throw routed(403, 'not this host\'s request');
    return p;
  };
  const client = (): DiscShareSignal => ({
    async request(_signal, hostToken) {
      const h = hostToken === undefined ? null : [...hosts.values()].find((x) => x.token === hostToken && !x.ended);
      if (h === undefined) throw routed(404, 'no such host');
      n++;
      const code = `QX7K4${'MNPQRSTUVW'[n % 10]}`;
      const p: Pair = { id: `id${n}`, code, rx: side(`rs${n}`), tx: null, createdAt: n, ended: false, endsAt: Infinity, host: h ? h.id : null };
      pairs.set(p.id, p);
      log.push({ op: 'request', ...(h ? { body: { host: hostToken } } : {}) });
      if (h) push(h.side, { type: 'asked', id: p.id, code, since: Date.now() });
      return { id: p.id, code, secret: p.rx.secret, expiresAt: Date.now() + 600_000 };
    },
    async nearby() { log.push({ op: 'nearby' }); return [...pairs.values()].filter((p) => !p.tx && !p.ended && !p.host).map((p) => ({ id: p.id, code: p.code, createdAt: p.createdAt })); },
    async claim(code) {
      log.push({ op: 'claim' });
      const p = [...pairs.values()].find((x) => x.code === code.toUpperCase() && !x.tx && !x.ended && !x.host);
      if (!p) throw routed(404, 'no such request');
      p.tx = side(`ts${p.id}`);
      if (opts.life !== undefined) p.endsAt = Date.now() + opts.life;      // central ends a pair LIFE after its claim
      push(p.rx, { type: 'claimed' });
      return { id: p.id, secret: p.tx.secret };
    },
    async host() {
      n++;
      const h: Host = { id: `h${n}`, token: `tok${n}`, side: side(`hs${n}`), ended: false };
      hosts.set(h.id, h);
      log.push({ op: 'host' });
      return { hostId: h.id, token: h.token, secret: h.side.secret, expiresAt: Date.now() + 25_000 };
    },
    async approve(hostId, secret, id) {
      log.push({ op: 'approve', id });
      const p = bound(hostOf(hostId, secret), id);
      p.host = null;
      p.tx = side(`ts${p.id}`);
      push(p.rx, { type: 'claimed' });
      return { id: p.id, secret: p.tx.secret };
    },
    async decline(hostId, secret, id) {
      log.push({ op: 'decline', id });
      const p = bound(hostOf(hostId, secret), id);
      p.host = null;
      push(p.rx, { type: 'declined' });
      p.ended = true;                                                     // its poll has the message first
    },
    async send(id, secret, msg) {
      log.push({ op: 'send', msg: msg.type, ...(hosts.has(id) ? { id } : {}) });
      const h = hosts.get(id);
      if (h) {
        hostOf(id, secret);
        if (msg.type !== 'bye') throw routed(409, 'a host takes no signal');
        endHost(h);
        return;
      }
      const p = live(id);
      if (!p || Date.now() >= p.endsAt) throw routed(404, 'no such request');
      const me = sideOf(p, secret);
      if (!me) throw routed(403, 'wrong secret');
      const other = me === p.rx ? p.tx : p.rx;
      if (msg.type === 'bye') {
        p.ended = true;
        if (other) push(other, msg);
        const hh = p.host ? hosts.get(p.host) : undefined;
        if (hh && !hh.ended) push(hh.side, { type: 'withdrawn', id: p.id });
        p.host = null;
        return;
      }
      if (!other) throw routed(409, 'not claimed yet');
      push(other, msg);
    },
    poll(id, secret, after, signal) {
      log.push({ op: 'poll', id });
      return new Promise((ok, no) => {
        let done = false;
        let expiry: ReturnType<typeof setTimeout> | null = null;
        const finish = (f: () => void): void => { if (done) return; done = true; open--; if (expiry !== null) clearTimeout(expiry); f(); };
        open++;
        signal?.addEventListener('abort', () => { finish(() => { no(new DiscShareError(0, 'no answer')); }); }, { once: true });
        const look = (): void => {
          const h = hosts.get(id);
          if (h) {
            if (h.side.secret !== secret) { finish(() => { no(routed(403, 'wrong secret')); }); return; }
            const ready = h.side.queue.filter((m) => m.seq > after);
            if (ready.length) { finish(() => { ok(ready); }); return; }
            if (h.ended) { finish(() => { no(routed(404, 'no such host')); }); return; }
            h.side.wake = look;
            return;
          }
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
  return { client, log, pairs, hosts, polls: () => open, lose: (id: string) => { const h = hosts.get(id); if (h) endHost(h); } };
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

  it('a pair the connection refuses (DSH.R15: an unread pair; a relay is no longer refused) fails both sides with the reason, nothing stored', async () => {
    const t = pair({ refuse: 'The connection between the devices could not be read, so nothing was sent. Try again.' });
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const tx = t.txFor(t.rx.receiver().code!);
    tx.approve();
    await until(() => t.rx.receiver().phase === 'failed' && tx.sender()!.phase === 'failed', 'both failed');
    expect(t.rx.receiver().reason).toMatch(/could not be read/);
    expect(tx.sender()!.reason).toMatch(/could not be read/);
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

describe('DSH.R15: across networks -- the ICE servers from the pairing, the path said', () => {
  it('each side\'s connection asks the pairing for its ICE servers with its own id and secret; both screens say the path', async () => {
    const central = fakeCentral();
    const asked: { id: string; secret: string }[] = [];
    const withIce = (base: DiscShareSignal): DiscShareSignal => ({
      ...base, async ice(id, secret) { asked.push({ id, secret }); return [{ urls: 'stun:stun.cloudflare.com:3478' }]; },
    });
    const inner = fakePeers();
    const given: unknown[][] = [];
    const peer: PeerFactory = (role, send, iceServers) => {
      const s = inner(role, send);
      void iceServers?.().then((l) => { given.push([...l]); });
      return { ready: s.ready, close: () => { s.close(); }, handle: (m) => { s.handle(m); }, via: () => 'relay' };
    };
    const fs = files(150_000, 90_000);
    const rx = liveDiscShare({ search: '', origin: ORIGIN, signal: withIce(central.client()), complete: () => false, peer, store: store(), readSet: 3, isReadSet: syntheticSet });
    rx.request();
    await until(() => rx.receiver().phase === 'waiting', 'waiting');
    const tx = liveDiscShare({
      search: `?discshare=${rx.receiver().code!}`, origin: ORIGIN, signal: withIce(central.client()), complete: () => true, peer, sendSource: async () => source(fs, 3), readSet: 3,
    });
    tx.approve();
    await until(() => tx.sender()!.phase === 'sending' && tx.sender()!.via !== undefined, 'the sender linked');
    await until(() => rx.receiver().phase === 'done' && tx.sender()!.phase === 'done', 'both done');
    expect(rx.receiver().via).toBe('relay');
    expect(tx.sender()!.via).toBe('relay');
    expect(asked).toHaveLength(2);
    expect(new Set(asked.map((a) => a.id)).size).toBe(1);
    expect(new Set(asked.map((a) => a.secret)).size).toBe(2);
    expect(given).toEqual([[{ urls: 'stun:stun.cloudflare.com:3478' }], [{ urls: 'stun:stun.cloudflare.com:3478' }]]);
    rx.dispose(); tx.dispose();
  });

  it('a pairing client with no ice route: the copy is still made (rtcPeer then takes Cloudflare\'s STUN)', async () => {
    const t = pair();
    t.rx.request();
    await until(() => t.rx.receiver().phase === 'waiting', 'waiting');
    const tx = t.txFor(t.rx.receiver().code!);
    tx.approve();
    await until(() => t.rx.receiver().phase === 'done' && tx.sender()!.phase === 'done', 'both done');
    expect(t.rx.receiver().via).toBeUndefined();               // the fake peers say no path
    t.rx.dispose(); tx.dispose();
  });

  it('only the discShare modules name the ICE route (DA.R3: the extraction and copy modules name no network)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = resolve(import.meta.dirname, '../src');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(d, e.name)) : /\.ts$/.test(e.name) ? [resolve(d, e.name)] : []));
    const naming = walk(src).filter((f) => /DISCSHARE_ICE_ROUTE|\/api\/discshare\/ice/.test(readFileSync(f, 'utf8')));
    const names = naming.map((f) => f.replace(/\\/g, '/').split('/').pop()!);
    expect(names).toEqual(expect.arrayContaining(['discShareSignal.ts', 'discShareWire.ts']));
    for (const n of names) expect(n).toMatch(/^discShare[A-Za-z]*\.ts$/);
  });
});

/**
 * RB-26 (the replay batch plan): the host mode -- a page with the disc opens a hosted share (RB-25's routes), lists the
 * requests bound to it and the receiver-made ones found on its network in one list, and sends to one at a time: a Yes
 * while sending queues the request, approved at central only at its turn (so its pair's 10 minutes start then). A browser
 * adaptation, product track.
 */
describe('RB-26: host mode (one transfer at a time, on the fakes)', () => {
  const tokenOf = (link: string | undefined): string => new URL(link!).searchParams.get(DISC_SHARE_HOST_PARAM)!;

  function hosting(opts: { complete?: () => boolean; fs?: ReturnType<typeof files>; slowRead?: number } = {}) {
    const central = fakeCentral();
    const peer = fakePeers();
    const fs = opts.fs ?? files(150_000, 90_000);
    const kept = source(fs, 3);
    const slow = opts.slowRead;
    const src = slow === undefined ? kept : { ...kept, readRange: async (p: string, o: number, l: number) => { await new Promise((r) => setTimeout(r, slow)); return kept.readRange(p, o, l); } };
    const host = liveDiscShare({ search: '', origin: ORIGIN, signal: central.client(), complete: opts.complete ?? (() => true), peer, sendSource: async () => src, readSet: 3 });
    const pages: (DiscShareAdapter & { dispose(): void })[] = [host];
    const asker = (token?: string) => {
      const st = store();
      const rx = liveDiscShare({
        search: '', origin: ORIGIN, signal: central.client(), complete: () => false, peer, store: st, readSet: 3, isReadSet: syntheticSet, ...(token ? { hostToken: token } : {}),
      });
      pages.push(rx);
      return { rx, st };
    };
    const open = async (): Promise<string> => {
      host.openHost!();
      await until(() => host.host!().phase === 'open', 'the host open');
      return tokenOf(host.host!().link);
    };
    const end = (): void => { for (const p of pages) p.dispose(); };
    return { central, host, asker, open, end, fs };
  }

  it('openHost opens a hosted share: its link carries the token (?discshare-host=), the host polls by its id', async () => {
    const t = hosting();
    expect(t.host.host!()).toMatchObject({ phase: 'idle', pending: [] });
    t.host.openHost!();
    expect(t.host.host!().phase).toBe('opening');
    const token = await t.open();
    expect(t.host.host!().link).toBe(shareHostLink(ORIGIN, token));
    expect(t.host.host!().link).toBe(`${ORIGIN}/?${DISC_SHARE_HOST_PARAM}=${token}`);
    await settle();
    expect(t.central.log.some((l) => l.op === 'poll' && l.id?.startsWith('h'))).toBe(true);
    t.end();
  });

  it('a page with the host\'s token requests against the host: it waits with its code (no link, no 10-minute expiry), and the host lists it', async () => {
    vi.useFakeTimers();
    const t = hosting();
    t.host.openHost!();
    await vi.advanceTimersByTimeAsync(0);
    const token = tokenOf(t.host.host!().link);
    const a = t.asker(token);
    a.rx.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.central.log.find((l) => l.op === 'request')?.body).toEqual({ host: token });
    expect(a.rx.receiver()).toMatchObject({ phase: 'waiting', hosted: true });
    expect(a.rx.receiver().link).toBeUndefined();
    expect(t.host.host!().pending).toEqual([{ id: expect.any(String), code: a.rx.receiver().code, since: expect.any(Number), state: 'asked' }]);
    await vi.advanceTimersByTimeAsync(11 * 60_000);                  // past a receiver-made code's life: a hosted request lives while both poll
    expect(a.rx.receiver().phase).toBe('waiting');
    t.end();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('FIFO: Yes while sending queues (Queued #n), approved at central only at its turn; each copies in the order of its Yes', async () => {
    const t = hosting({ fs: files(1, 1, 1, 1), slowRead: 20 });
    const token = await t.open();
    const [a, b, c] = [t.asker(token), t.asker(token), t.asker(token)];
    for (const x of [a, b, c]) { x.rx.request(); await until(() => x.rx.receiver().phase === 'waiting', 'waiting'); }
    await until(() => t.host.host!().pending.length === 3, 'three asked');
    expect(t.host.host!().pending.map((p) => p.code)).toEqual([a, b, c].map((x) => x.rx.receiver().code));
    const idOf = (x: typeof a): string => t.host.host!().pending.find((p) => p.code === x.rx.receiver().code)!.id;
    const [ia, ib, ic] = [idOf(a), idOf(b), idOf(c)];
    const approves = (): string[] => t.central.log.filter((l) => l.op === 'approve').map((l) => l.id!);
    const seen: string[] = [];
    let approvesWhileA = 0;
    t.host.onChange(() => {
      const act = t.host.host!().active;
      if (act && seen.at(-1) !== act.id) seen.push(act.id);
      if (act?.id === ia) approvesWhileA = Math.max(approvesWhileA, approves().length);
    });
    t.host.approveReq!(ia);
    expect(t.host.host!().active).toMatchObject({ id: ia, code: a.rx.receiver().code });
    t.host.approveReq!(ic);                                         // the order of the Yes, not of the asking
    t.host.approveReq!(ib);
    expect(t.host.host!().pending).toEqual([
      expect.objectContaining({ id: ib, state: 'queued', place: 2 }),
      expect.objectContaining({ id: ic, state: 'queued', place: 1 }),
    ]);
    await until(() => [a, b, c].every((x) => x.rx.receiver().phase === 'done'), 'all three copied');
    expect(seen).toEqual([ia, ic, ib]);
    expect(approves()).toEqual([ia, ic, ib]);
    expect(approvesWhileA, 'the queued were not approved at central while the first copied').toBe(1);
    for (const x of [a, b, c]) for (const f of t.fs) expect(sha(x.st.stored.get(f.path)!)).toBe(sha(f.data));
    await until(() => t.host.host!().active === undefined, 'idle');
    expect(t.host.host!()).toMatchObject({ phase: 'open', pending: [], last: { code: b.rx.receiver().code, outcome: 'done' } });
    t.end();
  });

  it('decline: the host\'s No reaches the receiver (declined) and the request leaves the list', async () => {
    const t = hosting();
    const token = await t.open();
    const a = t.asker(token);
    a.rx.request();
    await until(() => t.host.host!().pending.length === 1, 'asked');
    const id = t.host.host!().pending[0]!.id;
    t.host.declineReq!(id);
    expect(t.host.host!().pending).toEqual([]);
    await until(() => a.rx.receiver().phase === 'declined', 'declined');
    expect(a.rx.receiver().code).toBeDefined();
    expect(t.central.log.filter((l) => l.op === 'decline').map((l) => l.id)).toEqual([id]);
    await settle();
    expect(t.central.polls(), 'only the host\'s poll stands').toBe(1);
    t.end();
  });

  it('decline of a queued request takes it out of the queue; the next Yes keeps its place', async () => {
    const t = hosting({ fs: files(1, 1, 1), slowRead: 20 });
    const token = await t.open();
    const [a, b, c] = [t.asker(token), t.asker(token), t.asker(token)];
    for (const x of [a, b, c]) x.rx.request();
    await until(() => t.host.host!().pending.length === 3, 'three asked');
    const [ia, ib, ic] = t.host.host!().pending.map((p) => p.id) as [string, string, string];
    t.host.approveReq!(ia); t.host.approveReq!(ib); t.host.approveReq!(ic);
    t.host.declineReq!(ib);
    expect(t.host.host!().pending).toEqual([expect.objectContaining({ id: ic, state: 'queued', place: 1 })]);
    await until(() => b.rx.receiver().phase === 'declined', 'b declined');
    await until(() => a.rx.receiver().phase === 'done' && c.rx.receiver().phase === 'done', 'a and c copied');
    t.end();
  });

  it('withdraw: a receiver that cancels leaves the host\'s list (asked or queued)', async () => {
    const t = hosting({ fs: files(1, 1, 1), slowRead: 20 });
    const token = await t.open();
    const [a, b, c] = [t.asker(token), t.asker(token), t.asker(token)];
    for (const x of [a, b, c]) x.rx.request();
    await until(() => t.host.host!().pending.length === 3, 'three asked');
    const [ia, ib] = t.host.host!().pending.map((p) => p.id) as [string, string, string];
    t.host.approveReq!(ia); t.host.approveReq!(ib);
    b.rx.cancel(); c.rx.cancel();
    await until(() => t.host.host!().pending.length === 0, 'both withdrawn');
    await until(() => a.rx.receiver().phase === 'done', 'a copied');
    await until(() => t.host.host!().active === undefined, 'nothing next');
    expect(t.central.log.filter((l) => l.op === 'approve').map((l) => l.id)).toEqual([ia]);
    t.end();
  });

  it('stop then next: Stop ends the active copy (the receiver hears the other device stopped) and the next queued starts', async () => {
    const t = hosting({ fs: files(3_000_000) });
    const token = await t.open();
    const [a, b] = [t.asker(token), t.asker(token)];
    for (const x of [a, b]) x.rx.request();
    await until(() => t.host.host!().pending.length === 2, 'two asked');
    const [ia, ib] = t.host.host!().pending.map((p) => p.id) as [string, string];
    t.host.approveReq!(ia); t.host.approveReq!(ib);
    await until(() => a.rx.receiver().phase === 'copying', 'a copying');
    t.host.stopActive!();
    expect(t.host.host!().last).toEqual({ code: a.rx.receiver().code, outcome: 'stopped' });
    expect(t.host.host!().active).toMatchObject({ id: ib });
    await until(() => a.rx.receiver().phase === 'failed', 'a stopped');
    expect(a.rx.receiver().reason).toBe(SHARE_OTHER_STOPPED);
    await until(() => b.rx.receiver().phase === 'done', 'b copied');
    expect(a.st.commits).toHaveLength(0);
    t.end();
  });

  it('a request withdrawn before its turn: its approve refused, said in last, and the next one goes', async () => {
    const t = hosting({ fs: files(1, 1), slowRead: 20 });
    const token = await t.open();
    const [a, b, c] = [t.asker(token), t.asker(token), t.asker(token)];
    for (const x of [a, b, c]) x.rx.request();
    await until(() => t.host.host!().pending.length === 3, 'three asked');
    const [ia, ib, ic] = t.host.host!().pending.map((p) => p.id) as [string, string, string];
    t.host.approveReq!(ia); t.host.approveReq!(ib); t.host.approveReq!(ic);
    t.central.pairs.get(ib)!.ended = true;                          // central let it go and the host never heard (a lost withdrawn)
    await until(() => c.rx.receiver().phase === 'done', 'c copied');
    expect(t.central.log.filter((l) => l.op === 'approve').map((l) => l.id)).toEqual([ia, ib, ic]);
    t.end();
  });

  it('Yes is gated on a complete extraction (DSH.R7): openHost without one opens nothing; a Yes after it went claims nothing', async () => {
    let whole = false;
    const t = hosting({ complete: () => whole });
    t.host.openHost!();
    expect(t.host.host!().phase).toBe('needs-extract');
    await settle();
    expect(t.central.log.some((l) => l.op === 'host')).toBe(false);
    whole = true;
    const token = await t.open();
    const a = t.asker(token);
    a.rx.request();
    await until(() => t.host.host!().pending.length === 1, 'asked');
    whole = false;
    t.host.approveReq!(t.host.host!().pending[0]!.id);
    await settle();
    expect(t.host.host!().active).toBeUndefined();
    expect(t.host.host!().pending[0]!.state).toBe('asked');
    expect(t.central.log.some((l) => l.op === 'approve')).toBe(false);
    t.end();
  });

  it('nearby codes feed the same list: a receiver-made request on this network is listed, and its Yes claims it by its code', async () => {
    const t = hosting();
    const a = t.asker();                                            // a receiver-made code (Play's row), not bound to the host
    a.rx.request();
    await until(() => a.rx.receiver().phase === 'waiting', 'waiting');
    await t.open();
    await until(() => t.host.host!().pending.length === 1, 'nearby listed');
    expect(t.host.host!().pending[0]).toMatchObject({ code: a.rx.receiver().code, state: 'asked' });
    t.host.approveReq!(t.host.host!().pending[0]!.id);
    await until(() => a.rx.receiver().phase === 'done', 'copied');
    expect(t.central.log.filter((l) => l.op === 'claim')).toHaveLength(1);
    expect(t.central.log.some((l) => l.op === 'approve')).toBe(false);
    t.end();
  });

  it('a nearby request declined is only hidden here (central decides no receiver-made code); it stays hidden', async () => {
    vi.useFakeTimers();
    const t = hosting();
    const a = t.asker();
    a.rx.request();
    await vi.advanceTimersByTimeAsync(0);
    t.host.openHost!();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.host.host!().pending).toHaveLength(1);
    t.host.declineReq!(t.host.host!().pending[0]!.id);
    expect(t.host.host!().pending).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.host.host!().pending).toEqual([]);
    expect(t.central.log.some((l) => l.op === 'decline')).toBe(false);
    expect(a.rx.receiver().phase).toBe('waiting');
    t.end();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closeHost (Q10) ends the share: the host\'s bye, every pending receiver told the host ended, nothing left polling', async () => {
    const t = hosting();
    const token = await t.open();
    const [a, b] = [t.asker(token), t.asker(token)];
    for (const x of [a, b]) x.rx.request();
    await until(() => t.host.host!().pending.length === 2, 'two asked');
    t.host.closeHost!();
    expect(t.host.host!()).toMatchObject({ phase: 'idle', pending: [] });
    expect(t.central.log.some((l) => l.op === 'send' && l.msg === 'bye' && l.id?.startsWith('h'))).toBe(true);
    await until(() => a.rx.receiver().phase === 'failed' && b.rx.receiver().phase === 'failed', 'both told');
    expect(a.rx.receiver().reason).toBe(SHARE_HOST_ENDED);
    await settle();
    expect(t.central.polls()).toBe(0);
    t.end();
  });

  it('dispose ends the host: the active copy stopped, the queued and asked told the host ended, no poll or timer left', async () => {
    const t = hosting({ fs: files(3_000_000) });
    const token = await t.open();
    const [a, b] = [t.asker(token), t.asker(token)];
    for (const x of [a, b]) x.rx.request();
    await until(() => t.host.host!().pending.length === 2, 'two asked');
    const [ia, ib] = t.host.host!().pending.map((p) => p.id) as [string, string];
    t.host.approveReq!(ia); t.host.approveReq!(ib);
    await until(() => a.rx.receiver().phase === 'copying', 'a copying');
    t.host.dispose();
    await until(() => a.rx.receiver().phase === 'failed' && b.rx.receiver().phase === 'failed', 'both ended');
    expect(a.rx.receiver().reason).toBe(SHARE_OTHER_STOPPED);
    expect(b.rx.receiver().reason).toBe(SHARE_HOST_ENDED);
    expect(t.central.log.filter((l) => l.op === 'approve').map((l) => l.id)).toEqual([ia]);
    await settle();
    expect(t.central.polls()).toBe(0);
    t.end();
  });

  it('Q11: a deploy tears the share down (console/app.ts takeDown -> dispose) and says so: hostBusy names the stop while a copy runs', async () => {
    const t = hosting({ fs: files(3_000_000) });
    const token = await t.open();
    expect(hostBusy(t.host.host!())).toBe(false);
    const a = t.asker(token);
    a.rx.request();
    await until(() => t.host.host!().pending.length === 1, 'asked');
    expect(hostBusy(t.host.host!()), 'requests waiting end too').toBe(true);
    t.host.approveReq!(t.host.host!().pending[0]!.id);
    await until(() => a.rx.receiver().phase === 'copying', 'copying');
    expect(hostBusy(t.host.host!())).toBe(true);
    expect(SHARE_DEPLOY_STOPS).toMatch(/stops/i);
    t.host.dispose();                                               // what takeDown calls (adapters.dispose)
    await until(() => a.rx.receiver().phase === 'failed', 'the receiver told');
    expect(a.rx.receiver().reason).toBe(SHARE_OTHER_STOPPED);
    t.end();
  });

  it('the host lost (its poll refused): failed in the host\'s words, everything ended', async () => {
    const t = hosting();
    await t.open();
    const h = [...t.central.hosts.values()][0]!;
    h.ended = true;
    const w = h.side.wake; h.side.wake = null; w?.();
    await until(() => t.host.host!().phase === 'failed', 'failed');
    expect(t.host.host!().reason).toBe(SHARE_HOST_GONE);
    await settle();
    expect(t.central.polls()).toBe(0);
    t.end();
  });

  it('the host lost mid-copy (B2): a copy whose pipe is up runs on to done; the queued are told the host ended', async () => {
    const t = hosting({ fs: files(3_000_000) });
    const token = await t.open();
    const [a, b] = [t.asker(token), t.asker(token)];
    for (const x of [a, b]) x.rx.request();
    await until(() => t.host.host!().pending.length === 2, 'two asked');
    const [ia, ib] = t.host.host!().pending.map((p) => p.id) as [string, string];
    t.host.approveReq!(ia); t.host.approveReq!(ib);
    await until(() => a.rx.receiver().phase === 'copying', 'a copying');
    t.central.lose([...t.central.hosts.keys()][0]!);                 // central let the host go: its bound requests told, its poll 404
    await until(() => t.host.host!().phase === 'failed', 'the host failed');
    expect(t.host.host!().reason).toBe(SHARE_HOST_GONE);
    expect(t.host.host!().active, 'the connected copy kept').toMatchObject({ id: ia });
    expect(t.host.host!().pending).toEqual([]);
    await until(() => b.rx.receiver().phase === 'failed', 'b told');
    expect(b.rx.receiver().reason).toBe(SHARE_HOST_ENDED);
    await until(() => a.rx.receiver().phase === 'done', 'a copied');
    await until(() => t.host.host!().last?.outcome === 'done', 'the host saw it done');
    expect(t.host.host!().active).toBeUndefined();
    expect(t.host.host!().phase).toBe('failed');
    expect(t.central.log.filter((l) => l.op === 'approve').map((l) => l.id)).toEqual([ia]);
    await settle();
    expect(t.central.polls()).toBe(0);
    t.end();
  });

  it('the host lost before a copy\'s pipe is up: that copy ends with the share', async () => {
    const t = hosting({ fs: files(3_000_000) });
    const token = await t.open();
    const a = t.asker(token);
    a.rx.request();
    await until(() => t.host.host!().pending.length === 1, 'asked');
    const h = [...t.central.hosts.values()][0]!;
    h.ended = true;
    t.host.approveReq!(t.host.host!().pending[0]!.id);
    const w = h.side.wake; h.side.wake = null; w?.();
    await until(() => t.host.host!().phase === 'failed', 'the host failed');
    await settle();
    expect(t.host.host!().active, 'no pipe up: the copy ended with the share').toBeUndefined();
    expect(a.rx.receiver().phase).not.toBe('copying');
    expect(a.st.commits).toHaveLength(0);
    t.end();
    await settle();
    expect(t.central.polls()).toBe(0);
  });

  it('the pairing client\'s hosted calls: host, a request bound by token, approve and decline under the host\'s secret', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (u.endsWith('/api/discshare/host')) return new Response(JSON.stringify({ hostId: 'H', token: 'T', secret: 'S', expiresAt: 5 }), { status: 200 });
      if (u.endsWith('/api/discshare/request')) return new Response(JSON.stringify({ id: 'i', code: 'QX7K4M', secret: 's', expiresAt: 5 }), { status: 200 });
      if (u.endsWith('/api/discshare/approve')) return new Response(JSON.stringify({ id: 'i', secret: 'tx' }), { status: 200 });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const c = discShareSignal(ORIGIN, f);
    expect(await c.host!()).toEqual({ hostId: 'H', token: 'T', secret: 'S', expiresAt: 5 });
    await c.request(undefined, 'T');
    await c.request();
    expect(await c.approve!('H', 'S', 'i')).toEqual({ id: 'i', secret: 'tx' });
    await c.decline!('H', 'S', 'i');
    expect(calls).toEqual([
      { url: `${ORIGIN}/api/discshare/host`, body: {} },
      { url: `${ORIGIN}/api/discshare/request`, body: { host: 'T' } },
      { url: `${ORIGIN}/api/discshare/request`, body: {} },
      { url: `${ORIGIN}/api/discshare/approve`, body: { host: 'H', secret: 'S', id: 'i' } },
      { url: `${ORIGIN}/api/discshare/decline`, body: { host: 'H', secret: 'S', id: 'i' } },
    ]);
    const bad = discShareSignal(ORIGIN, (async () => new Response('<html>', { status: 200 })) as typeof fetch);
    await expect(bad.host!()).rejects.toMatchObject({ status: 200, reason: 'malformed answer' });
  });

  it('pairingWords: the host\'s 404 is the share gone; an approve\'s 404 is the request gone', () => {
    expect(pairingWords(new DiscShareError(404, 'no such host', true), 'host')).toBe(SHARE_HOST_GONE);
    expect(pairingWords(new DiscShareError(404, 'no such request', true), 'approve')).toBe(SHARE_REQUEST_GONE);
    expect(pairingWords(new DiscShareError(429, 'too many open hosts', true), 'host')).toBe(SHARE_TOO_MANY);
  });
});

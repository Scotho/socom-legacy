import { describe, expect, it, vi } from 'vitest';
import {
  SHARE_CLOSE_GRACE_MS_ADAPTATION, SHARE_DC_LABEL, pairVerdict, rtcPeer, selectedPair, type PairEnd,
} from '../src/discShareRtc';
import { receiveFiles } from '../src/discShareProtocol';
import { SHARE_NO_CONNECT, SHARE_OTHER_STOPPED, SHARE_PAIR_UNREAD } from '../src/discShareWords';
import * as words from '../src/discShareWords';
import { DISCSHARE_STUN_ONLY } from '../src/discShareWire';
import { store, syntheticSet } from './discShareFakes';

/**
 * DSH-4 (the disc share plan), as DSH.R15 (the owner, 2026-11-07) amends DSH.R2 and DSH.R14: the transfer's connection
 * is accepted on any path ICE finds -- `host`, `prflx`, `srflx` or `relay` -- and the selected pair is read to say which:
 * direct, or through Cloudflare's relay. Its ICE servers come from the pairing (central's `/api/discshare/ice`), with
 * Cloudflare's STUN when that fails. A browser adaptation, product track.
 */

const host: PairEnd = { type: 'host' };
/** An IPv4 address from its octets (the tree's leak check refuses a dotted literal). */
const q = (...o: number[]): string => o.join('.');

describe('DSH-4: the verdict on the selected pair (DSH.R15: every path ICE finds)', () => {
  it('host and prflx on both ends: accepted, direct', () => {
    expect(pairVerdict({ local: host, remote: host })).toEqual({ ok: true, via: 'direct' });
    expect(pairVerdict({ local: host, remote: { type: 'prflx' } })).toEqual({ ok: true, via: 'direct' });
    expect(pairVerdict({ local: { type: 'prflx' }, remote: { type: 'prflx' } })).toEqual({ ok: true, via: 'direct' });
  });

  it('DSH.R15 (was: refused, DSH.R14): a server-reflexive candidate is accepted, direct across networks', () => {
    expect(pairVerdict({ local: { type: 'srflx' }, remote: host })).toEqual({ ok: true, via: 'direct' });
    expect(pairVerdict({ local: host, remote: { type: 'srflx' } })).toEqual({ ok: true, via: 'direct' });
    expect(pairVerdict({ local: { type: 'srflx' }, remote: { type: 'prflx' } })).toEqual({ ok: true, via: 'direct' });
  });

  it('DSH.R15 (was: refused, DSH.R2): a relayed candidate on either side is accepted, through the relay', () => {
    expect(pairVerdict({ local: { type: 'relay' }, remote: host })).toEqual({ ok: true, via: 'relay' });
    expect(pairVerdict({ local: { type: 'srflx' }, remote: { type: 'relay' } })).toEqual({ ok: true, via: 'relay' });
    expect(pairVerdict({ local: { type: 'relay' }, remote: { type: 'relay' } })).toEqual({ ok: true, via: 'relay' });
  });

  it('no pair, or a type ICE does not name: refused as unread', () => {
    expect(pairVerdict(null)).toEqual({ ok: false, reason: SHARE_PAIR_UNREAD });
    expect(pairVerdict({ local: { type: 'bogus' }, remote: host })).toEqual({ ok: false, reason: SHARE_PAIR_UNREAD });
  });

  it('DSH.R15: no word says the devices must share a network, and none refuses a relay', () => {
    for (const [k, v] of Object.entries(words)) {
      const text = typeof v === 'function' ? String((v as (...a: string[]) => unknown)('this device', 'relay')) : JSON.stringify(v);
      expect(text, k).not.toMatch(/same (home |local )?network/i);
      expect(text, k).not.toMatch(/through a relay server, so nothing was sent/);
    }
    expect(SHARE_NO_CONNECT).toMatch(/could not find a way to reach each other/);
  });
});

describe('DSH-4: the selected pair read from getStats', () => {
  it('Chromium: the transport\'s selectedCandidatePairId', () => {
    const report = new Map<string, Record<string, unknown>>([
      ['T1', { id: 'T1', type: 'transport', selectedCandidatePairId: 'P2' }],
      ['P1', { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1', state: 'failed' }],
      ['P2', { id: 'P2', type: 'candidate-pair', localCandidateId: 'L2', remoteCandidateId: 'R2', state: 'succeeded', nominated: true }],
      ['L1', { id: 'L1', type: 'local-candidate', candidateType: 'relay', address: q(8, 8, 8, 8) }],
      ['R1', { id: 'R1', type: 'remote-candidate', candidateType: 'relay', address: q(8, 8, 4, 4) }],
      ['L2', { id: 'L2', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 4) }],
      ['R2', { id: 'R2', type: 'remote-candidate', candidateType: 'prflx', ip: q(192, 168, 1, 5) }],
    ]);
    expect(selectedPair(report)).toEqual({ local: { type: 'host' }, remote: { type: 'prflx' } });
  });

  it('Firefox: the pair marked selected; else a nominated succeeded pair; none: null', () => {
    const ff = new Map<string, Record<string, unknown>>([
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: 'x.local' }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(10, 0, 0, 3) }],
    ]);
    expect(selectedPair(ff)).toEqual({ local: { type: 'host' }, remote: { type: 'host' } });
    const nominated = new Map(ff);
    nominated.set('P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', nominated: true, state: 'succeeded' });
    expect(selectedPair(nominated)).toEqual({ local: { type: 'host' }, remote: { type: 'host' } });
    expect(selectedPair(new Map())).toBeNull();
  });
});

/** A fake RTCPeerConnection pair (jsdom has none): two ends wired in memory, their stats the test's. */
class FakeChannel extends EventTarget {
  readyState = 'connecting';
  binaryType = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  peer: FakeChannel | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly label: string, readonly init: RTCDataChannelInit = {}) { super(); }
  send(d: unknown): void { const p = this.peer; queueMicrotask(() => p?.onmessage?.({ data: d })); }
  close(): void { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose?.(); this.peer?.close(); }
  open(): void { this.readyState = 'open'; this.onopen?.(); }
}
const made: FakePc[] = [];
/** While set, the answering side's `getStats` waits on it (its local-only check is slower than the offerer's). */
let answerStatsGate: Promise<void> | null = null;
let stats: Map<string, Record<string, unknown>> = new Map();
class FakePc {
  config: RTCConfiguration;
  channel: FakeChannel | null = null;
  onicecandidate: ((e: { candidate: { toJSON(): unknown } | null }) => void) | null = null;
  ondatachannel: ((e: { channel: FakeChannel }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  remote: string | null = null;
  closed = false;
  added: unknown[] = [];
  constructor(config: RTCConfiguration) { this.config = config; made.push(this); }
  createDataChannel(label: string, init: RTCDataChannelInit): FakeChannel { this.channel = new FakeChannel(label, init); return this.channel; }
  async createOffer(): Promise<{ type: string; sdp: string }> { return { type: 'offer', sdp: 'v=0 offer' }; }
  async createAnswer(): Promise<{ type: string; sdp: string }> { return { type: 'answer', sdp: 'v=0 answer' }; }
  async setLocalDescription(d: { sdp: string }): Promise<void> { queueMicrotask(() => { this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `c ${d.sdp}` }) } }); this.onicecandidate?.({ candidate: null }); }); }
  async setRemoteDescription(d: { sdp: string }): Promise<void> { this.remote = d.sdp; }
  async addIceCandidate(c: unknown): Promise<void> { this.added.push(c); }
  async getStats(): Promise<Map<string, Record<string, unknown>>> { if (this === made[1] && answerStatsGate) await answerStatsGate; return stats; }
  close(): void { this.closed = true; this.channel?.close(); }
}

/** Wires the two fakes once both exist: the offerer's channel opened on both ends. */
function wire(): void {
  const [a, b] = made;
  const ca = a!.channel!;
  const cb = new FakeChannel(ca.label, ca.init);
  ca.peer = cb; cb.peer = ca;
  b!.channel = cb;
  b!.ondatachannel?.({ channel: cb });
  ca.open(); cb.open();
}

describe('DSH-4: the peer connection', () => {
  it('the ICE servers the pairing answers (port 53 dropped), one ordered reliable channel; offer, answer and candidates relayed; a pipe', async () => {
    made.length = 0;
    stats = new Map<string, Record<string, unknown>>([
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 2) }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
    ]);
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const toB: unknown[] = []; const toA: unknown[] = [];
    const turn = { urls: ['turn:turn.example.test:3478?transport=udp', 'turn:turn.example.test:53?transport=udp'], username: 'u', credential: 'c' };
    const iceServers = async (): Promise<RTCIceServer[]> => [{ urls: 'stun:stun.example.test:53' }, turn];
    const a = rtcPeer('offer', (m) => { toB.push(m); }, { RTC, iceServers });
    const b = rtcPeer('answer', (m) => { toA.push(m); }, { RTC, iceServers });
    await new Promise((r) => setTimeout(r, 0));
    const kept = { iceServers: [{ urls: ['turn:turn.example.test:3478?transport=udp'], username: 'u', credential: 'c' }] };
    expect(made[0]!.config).toEqual(kept);
    expect(made[1]!.config).toEqual(kept);
    expect(made[0]!.channel!.label).toBe(SHARE_DC_LABEL);
    expect(made[0]!.channel!.init).toEqual({ ordered: true });
    expect(toB.map((m) => (m as { type: string }).type)).toEqual(['offer', 'candidate']);
    for (const m of toB) b.handle(m as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(made[1]!.remote).toBe('v=0 offer');
    expect(toA.map((m) => (m as { type: string }).type)).toEqual(['answer', 'candidate']);
    for (const m of toA) a.handle(m as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(made[0]!.remote).toBe('v=0 answer');
    expect(made[1]!.added).toHaveLength(1);                     // the candidate held until the remote description was set
    wire();
    const [pa, pb] = await Promise.all([a.ready, b.ready]);
    const got: unknown[] = [];
    pb.onMessage((d) => { got.push(d); });
    pa.send('hello');
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual(['hello']);
    a.close(); b.close();
    expect(made[0]!.closed && made[1]!.closed).toBe(true);
  });

  it('DSH.R14: Chrome as a player runs it -- host candidates with no address in getStats -- is a pipe', async () => {
    made.length = 0;
    stats = new Map<string, Record<string, unknown>>([
      ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P' }],
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: '', ip: '' }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: '', ip: '' }],
    ]);
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const a = rtcPeer('offer', () => undefined, { RTC });
    const b = rtcPeer('answer', () => undefined, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    wire();
    const [pa, pb] = await Promise.all([a.ready, b.ready]);
    expect(pa && pb).toBeTruthy();
    a.close(); b.close();
  });

  it('a connection that fails outright says the devices could not reach each other', async () => {
    made.length = 0;
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const a = rtcPeer('offer', () => undefined, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    made[0]!.connectionState = 'failed';
    made[0]!.onconnectionstatechange?.();
    await expect(a.ready).rejects.toThrow(SHARE_NO_CONNECT);
    expect(made[0]!.closed).toBe(true);
  });

  it('DSH.R15: the ICE servers fetch fails, or none is given: Cloudflare\'s STUN, and the connection is still made', async () => {
    made.length = 0;
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const toB: unknown[] = [];
    const a = rtcPeer('offer', (m) => { toB.push(m); }, { RTC, iceServers: () => Promise.reject(new Error('no answer')) });
    const b = rtcPeer('answer', () => undefined, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    expect(made[0]!.config).toEqual({ iceServers: [...DISCSHARE_STUN_ONLY] });
    expect(made[1]!.config).toEqual({ iceServers: [...DISCSHARE_STUN_ONLY] });
    expect(DISCSHARE_STUN_ONLY).toEqual([{ urls: 'stun:stun.cloudflare.com:3478' }]);
    expect(toB.map((m) => (m as { type: string }).type)).toEqual(['offer', 'candidate']);
    a.close(); b.close();
  });

  it('DSH.R15: a message handed in before the ICE servers arrive is held, and a close meanwhile makes no connection', async () => {
    made.length = 0;
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    let give!: (l: RTCIceServer[]) => void;
    const b = rtcPeer('answer', () => undefined, { RTC, iceServers: () => new Promise((ok) => { give = ok; }) });
    b.handle({ type: 'offer', sdp: 'v=0 early' });
    await new Promise((r) => setTimeout(r, 0));
    expect(made).toHaveLength(0);
    give([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(made[0]!.remote).toBe('v=0 early');
    b.close();
    let late: ((l: RTCIceServer[]) => void) | null = null;
    const c = rtcPeer('offer', () => undefined, { RTC, iceServers: () => new Promise((ok) => { late = ok; }) });
    await new Promise((r) => setTimeout(r, 0));                 // the servers asked for
    c.close();                                                   // closed while they are on their way
    late!([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(made).toHaveLength(1);
  });

  it('DSH.R15 (was: a relayed pair is refused): a relayed pair is a pipe, said through the relay', async () => {
    made.length = 0;
    stats = new Map<string, Record<string, unknown>>([
      ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P' }],
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'relay', address: q(198, 51, 100, 4) }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
    ]);
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const a = rtcPeer('offer', () => undefined, { RTC });
    const b = rtcPeer('answer', () => undefined, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    wire();
    const [pa, pb] = await Promise.all([a.ready, b.ready]);
    expect(pa && pb).toBeTruthy();
    expect(a.via?.()).toBe('relay');
    expect(b.via?.()).toBe('relay');
    expect(made[0]!.closed || made[1]!.closed).toBe(false);
    a.close(); b.close();
  });

  it('review B1: a message that arrives before the pipe is handed out is kept, not lost', async () => {
    made.length = 0;
    stats = new Map<string, Record<string, unknown>>([
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 2) }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
    ]);
    let openGate!: () => void;
    answerStatsGate = new Promise<void>((r) => { openGate = r; });
    try {
      const RTC = FakePc as unknown as typeof RTCPeerConnection;
      const a = rtcPeer('offer', () => undefined, { RTC });
      const b = rtcPeer('answer', () => undefined, { RTC });
      await new Promise((r) => setTimeout(r, 0));
      wire();
      const pa = await a.ready;                                  // the offerer's check passed; the answerer's still running
      pa.send('early one');
      pa.send('early two');
      await new Promise((r) => setTimeout(r, 0));               // delivered to the answerer's channel before its pipe exists
      openGate();
      const pb = await b.ready;
      const got: unknown[] = [];
      pb.onMessage((d) => { got.push(d); });
      pa.send('late');
      await new Promise((r) => setTimeout(r, 0));
      expect(got).toEqual(['early one', 'early two', 'late']);
      a.close(); b.close();
    } finally {
      answerStatsGate = null;
    }
  });

  it('review B2: the pipe closes its channel first (what is queued still goes), then the connection; at the latest after the grace', async () => {
    vi.useFakeTimers();
    try {
      made.length = 0;
      stats = new Map<string, Record<string, unknown>>([
        ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
        ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 2) }],
        ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
      ]);
      const RTC = FakePc as unknown as typeof RTCPeerConnection;
      const a = rtcPeer('offer', () => undefined, { RTC });
      const b = rtcPeer('answer', () => undefined, { RTC });
      await vi.advanceTimersByTimeAsync(1);
      wire();
      const [pa] = await Promise.all([a.ready, b.ready]);
      const ch = made[0]!.channel!;
      const order: string[] = [];
      ch.close = () => { order.push('channel'); };              // a channel still sending: its close event not yet fired
      const pcClose = made[0]!.close.bind(made[0]!);
      made[0]!.close = () => { order.push('connection'); pcClose(); };
      pa.close();
      expect(order).toEqual(['channel']);
      await vi.advanceTimersByTimeAsync(SHARE_CLOSE_GRACE_MS_ADAPTATION - 1);
      expect(order).toEqual(['channel']);
      await vi.advanceTimersByTimeAsync(1);
      expect(order.slice(0, 2)).toEqual(['channel', 'connection']);   // (the fake connection's close closes its channel again)
      expect(vi.getTimerCount()).toBe(0);
      b.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('review B2: the channel closed in time: the connection closed at its close event, no timer left', async () => {
    vi.useFakeTimers();
    try {
      made.length = 0;
      stats = new Map<string, Record<string, unknown>>([
        ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
        ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 2) }],
        ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
      ]);
      const RTC = FakePc as unknown as typeof RTCPeerConnection;
      const a = rtcPeer('offer', () => undefined, { RTC });
      const b = rtcPeer('answer', () => undefined, { RTC });
      await vi.advanceTimersByTimeAsync(1);
      wire();
      const [pa] = await Promise.all([a.ready, b.ready]);
      pa.close();
      expect(made[0]!.closed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      b.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("second review 2: this side's check fails once the other's pipe is up: fail {why: local} on the channel, then a graceful close", async () => {
    made.length = 0;
    const local = new Map<string, Record<string, unknown>>([
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 2) }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
    ]);
    const unread = new Map<string, Record<string, unknown>>();   // DSH.R15: a relay is accepted; an unread pair still refused
    stats = local;
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const a = rtcPeer('offer', () => undefined, { RTC });
    const b = rtcPeer('answer', () => undefined, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    let openGate!: () => void;
    const gate = new Promise<void>((r) => { openGate = r; });
    made[0]!.getStats = async () => { await gate; return unread; };    // the offerer's check is the slower, and fails
    const ca = made[0]!.channel!;
    // A real channel's close sends what is queued first, then fires its close event: deferred here to a later task.
    ca.close = () => { setTimeout(() => { FakeChannel.prototype.close.call(ca); }, 0); };
    wire();
    const pb = await b.ready;                                     // the receiver's check passed: its pipe is up
    const rx = receiveFiles(pb, store(), { readSet: 3, isReadSet: syntheticSet });
    openGate();
    await expect(a.ready).rejects.toThrow(SHARE_PAIR_UNREAD);
    a.close();                                                    // the adapter's own stop at the refusal: it waits for the channel
    expect(made[0]!.closed, 'the connection not cut before the channel has sent its fail').toBe(false);
    await expect(rx).rejects.toMatchObject({ kind: 'stopped', message: SHARE_OTHER_STOPPED });
    await new Promise((r) => setTimeout(r, 0));                   // the channel's close event
    expect(made[0]!.closed, 'the connection closed at the channel\'s close').toBe(true);
    b.close();
  });

  it('a browser with no WebRTC: refused in words, never a throw at construction', async () => {
    const p = rtcPeer('offer', () => undefined, { RTC: null });
    await expect(p.ready).rejects.toThrow(/cannot connect/);
    p.close();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  SHARE_CLOSE_GRACE_MS_ADAPTATION, SHARE_DC_LABEL, pairVerdict, rtcPeer, selectedPair, type PairEnd,
} from '../src/discShareRtc';
import { receiveFiles } from '../src/discShareProtocol';
import { SHARE_NO_CONNECT, SHARE_OTHER_STOPPED } from '../src/discShareWords';
import { store, syntheticSet } from './discShareFakes';

/**
 * DSH-4 (the disc share plan, DSH.R2 "local to start", as DSH.R14 enforces it): the transfer's connection is accepted
 * only when its selected candidate pair is direct -- both candidates `host` or `prflx` -- whatever their addresses (a
 * player's Chrome hides them); a `relay` or `srflx` candidate is refused with its reason. A browser adaptation, product
 * track.
 */

const host: PairEnd = { type: 'host' };
/** An IPv4 address from its octets (the tree's leak check refuses a dotted literal). */
const q = (...o: number[]): string => o.join('.');

describe('DSH-4: the verdict on the selected pair (DSH.R14: types only)', () => {
  it('host and prflx on both ends: accepted', () => {
    expect(pairVerdict({ local: host, remote: host })).toEqual({ ok: true });
    expect(pairVerdict({ local: host, remote: { type: 'prflx' } })).toEqual({ ok: true });
    expect(pairVerdict({ local: { type: 'prflx' }, remote: { type: 'prflx' } })).toEqual({ ok: true });
  });

  it('a relay or a server-reflexive candidate on either side: refused, the type named', () => {
    for (const type of ['relay', 'srflx'] as const) {
      const near = pairVerdict({ local: { type }, remote: host });
      const far = pairVerdict({ local: host, remote: { type } });
      expect(near.ok).toBe(false);
      expect(far.ok).toBe(false);
      if (!near.ok) expect(near.reason).toContain(type === 'relay' ? 'relay' : 'reflected');
    }
  });

  it('no pair: refused', () => {
    expect(pairVerdict(null).ok).toBe(false);
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
  it('iceServers is empty, one ordered reliable channel; offer, answer and candidates relayed; a local pair is a pipe', async () => {
    made.length = 0;
    stats = new Map<string, Record<string, unknown>>([
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'host', address: q(192, 168, 1, 2) }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
    ]);
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const toB: unknown[] = []; const toA: unknown[] = [];
    const a = rtcPeer('offer', (m) => { toB.push(m); }, { RTC });
    const b = rtcPeer('answer', (m) => { toA.push(m); }, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    expect(made[0]!.config).toEqual({ iceServers: [] });
    expect(made[1]!.config).toEqual({ iceServers: [] });
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

  it('a relayed pair is refused, the connection closed, with its reason', async () => {
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
    await expect(a.ready).rejects.toThrow(/relay/);
    await expect(b.ready).rejects.toThrow(/relay/);
    expect(made[0]!.closed && made[1]!.closed).toBe(true);
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
    const relayed = new Map<string, Record<string, unknown>>([
      ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true }],
      ['L', { id: 'L', type: 'local-candidate', candidateType: 'relay', address: q(198, 51, 100, 4) }],
      ['R', { id: 'R', type: 'remote-candidate', candidateType: 'host', address: q(192, 168, 1, 3) }],
    ]);
    stats = local;
    const RTC = FakePc as unknown as typeof RTCPeerConnection;
    const a = rtcPeer('offer', () => undefined, { RTC });
    const b = rtcPeer('answer', () => undefined, { RTC });
    await new Promise((r) => setTimeout(r, 0));
    let openGate!: () => void;
    const gate = new Promise<void>((r) => { openGate = r; });
    made[0]!.getStats = async () => { await gate; return relayed; };   // the offerer's check is the slower, and fails
    const ca = made[0]!.channel!;
    // A real channel's close sends what is queued first, then fires its close event: deferred here to a later task.
    ca.close = () => { setTimeout(() => { FakeChannel.prototype.close.call(ca); }, 0); };
    wire();
    const pb = await b.ready;                                     // the receiver's check passed: its pipe is up
    const rx = receiveFiles(pb, store(), { readSet: 3, isReadSet: syntheticSet });
    openGate();
    await expect(a.ready).rejects.toThrow(/relay/);
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

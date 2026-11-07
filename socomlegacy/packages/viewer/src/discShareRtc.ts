import { DISCSHARE_STUN_ONLY, readIceServers, type DiscShareIceServer, type DiscShareMsg } from './discShareWire';
import type { SharePipe } from './discShareProtocol';
import { SHARE_NO_CONNECT, SHARE_NO_RTC, SHARE_PAIR_UNREAD } from './discShareWords';

/**
 * **Disc share's connection** (`docs/plans/2026-10-18-disc-share.md`, DSH-4; DSH.R11, DSH.R15). **A browser adaptation,
 * product track** (OT.R53): the original had no disc share; nothing here changes what the game does.
 *
 * **Across networks** (DSH.R15, the owner, 2026-11-07: "remove the local exception ... it should work with our
 * forwarded cloudflare tunnel p2p"): one `RTCPeerConnection` whose ICE servers come from the pairing (`iceServers`, the
 * adapter's call to central's `/api/discshare/ice`): Cloudflare's STUN always, and Cloudflare Realtime TURN when central
 * holds a key. Until they arrive nothing is made, and a message handed in meanwhile waits its turn; when the call fails
 * (or none is given) the connection is made with `DISCSHARE_STUN_ONLY`, and a port-53 URL is dropped either way
 * (`readIceServers`: browsers block the port). One ordered, reliable data channel (`SHARE_DC_LABEL`). The offer and the
 * answer are sent as created -- before any candidate is gathered, so each stays far under the pairing's 4096-byte body
 * -- and each ICE candidate is its own message (`discShareWire`: `offer`, `answer`, `candidate`), trickled through
 * central's pairing routes.
 *
 * **The path, read.** When the channel opens, the selected candidate pair is read from `getStats()` (`selectedPair`)
 * and judged (`pairVerdict`) by its candidates' types: any of ICE's four -- `host`, `prflx`, `srflx`, `relay` -- is
 * accepted (DSH.R15 lifts DSH.R2's and DSH.R14's refusal of `srflx` and `relay`), and the session says the path
 * (`via`): `relay` when either end is a relayed candidate (through Cloudflare's TURN, the data encrypted end to end by
 * the channel's DTLS), else `direct`. A pair that cannot be read (none, or a type ICE does not name) still closes the
 * connection, and `ready` rejects with the reason in a player's words. DSH.R1's guard across networks is the sender's
 * approval beside the matching (or typed) code, which stops an accident; DSH.R16 (the owner, 2026-11-07) opens the
 * share to another player's device on purpose. A connection that fails outright (ICE found no path) is
 * `SHARE_NO_CONNECT`.
 *
 * **A refusal is said on the channel** (the second disc share review's finding 2): the other side's check may already
 * have passed and its pipe be up -- from then on its page no longer reads the pairing's `bye` (B2) -- so a side whose own
 * check fails sends `fail { why: 'local' }` on the channel (`./discShareProtocol`: the other side's `SHARE_OTHER_STOPPED`)
 * and closes it gracefully, the connection after the channel's close or `SHARE_CLOSE_GRACE_MS_ADAPTATION`; a `close()`
 * from the page meanwhile does not cut that short.
 */

/** The data channel's label. */
export const SHARE_DC_LABEL = 's2u.discshare';

/** One candidate of the pair: its ICE type. */
export interface PairEnd { type: string }
export interface SelectedPair { local: PairEnd; remote: PairEnd }
/** DSH.R15: the path the data takes -- directly between the devices, or through Cloudflare's TURN relay. */
export type SharePath = 'direct' | 'relay';
export type PairVerdict = { ok: true; via: SharePath } | { ok: false; reason: string };

/** ICE's candidate types (RTCIceCandidateType). */
const ICE_TYPES: readonly string[] = ['host', 'prflx', 'srflx', 'relay'];

/** The pair's verdict (the module's header, DSH.R15): any of ICE's types accepted, the path said; an unread pair refused. */
export function pairVerdict(pair: SelectedPair | null): PairVerdict {
  if (!pair || !ICE_TYPES.includes(pair.local.type) || !ICE_TYPES.includes(pair.remote.type)) return { ok: false, reason: SHARE_PAIR_UNREAD };
  return { ok: true, via: pair.local.type === 'relay' || pair.remote.type === 'relay' ? 'relay' : 'direct' };
}

type Stat = Record<string, unknown>;
/** What `getStats()` answers, as read here (an `RTCStatsReport` is a Map of id to stat). */
export interface StatsLike { forEach(fn: (value: unknown, key: string) => void): void; get(id: string): unknown }

/**
 * The selected candidate pair: the transport's `selectedCandidatePairId` (Chromium, WebKit), else the pair marked
 * `selected` (Firefox), else a nominated succeeded pair; its two candidates' types. Null when there is none.
 */
export function selectedPair(report: StatsLike): SelectedPair | null {
  const all: Stat[] = [];
  report.forEach((v) => { if (typeof v === 'object' && v !== null) all.push(v as Stat); });
  const byId = (id: unknown): Stat | undefined => (typeof id === 'string' ? (report.get(id) as Stat | undefined) : undefined);
  let pair: Stat | undefined;
  for (const t of all) if (t['type'] === 'transport' && typeof t['selectedCandidatePairId'] === 'string') pair = byId(t['selectedCandidatePairId']);
  pair ??= all.find((p) => p['type'] === 'candidate-pair' && p['selected'] === true);
  pair ??= all.find((p) => p['type'] === 'candidate-pair' && p['nominated'] === true && p['state'] === 'succeeded');
  if (!pair) return null;
  const end = (s: Stat | undefined): PairEnd | null => {
    return s && typeof s['candidateType'] === 'string' ? { type: s['candidateType'] } : null;
  };
  const local = end(byId(pair['localCandidateId']));
  const remote = end(byId(pair['remoteCandidateId']));
  return local && remote ? { local, remote } : null;
}

/** A refusal of the connection, its message in a player's words. */
export class ShareConnectError extends Error {
  override readonly name = 'ShareConnectError';
}

/** One side's connection: the pairing's messages handed in (`handle`), the pipe once open and read, and its close. */
export interface PeerSession {
  handle(msg: DiscShareMsg): void;
  readonly ready: Promise<SharePipe>;
  close(): void;
  /** DSH.R15: the path once `ready` resolved (`pairVerdict`), else null. Optional: a test's fake may say none. */
  via?(): SharePath | null;
}
/** Where a side's ICE servers come from (DSH.R15: the pairing's `/api/discshare/ice`). */
export type IceServersSource = () => Promise<readonly DiscShareIceServer[]>;
/**
 * Makes a side's connection: `send` posts a message to the other side through the pairing; `iceServers` (DSH.R15)
 * answers its ICE servers.
 */
export type PeerFactory = (role: 'offer' | 'answer', send: (msg: DiscShareMsg & { type: 'offer' | 'answer' | 'candidate' }) => void, iceServers?: IceServersSource) => PeerSession;

/** The pacing's two marks (`./discShareProtocol` reads them through the pipe). Adaptations, ours: chosen, not measured. */
export const SHARE_BUFFER_HIGH_ADAPTATION = 1024 * 1024;
export const SHARE_BUFFER_LOW_ADAPTATION = 256 * 1024;
/**
 * How long a pipe's close waits for its channel to close -- sending what is queued first, an `RTCDataChannel`'s close --
 * before it closes the connection anyway (the disc share review's B2: a `fail` or a `done` sent just before the close
 * reaches the other side, now that the channel alone carries the end). An adaptation, ours: chosen, not measured.
 */
export const SHARE_CLOSE_GRACE_MS_ADAPTATION = 2_000;

export interface RtcDeps {
  /** The constructor (a test's fake); null: none. Absent, the browser's. */
  RTC?: typeof RTCPeerConnection | null;
  /** DSH.R15: the ICE servers (the module's header). Absent, or failing, `DISCSHARE_STUN_ONLY`. */
  iceServers?: IceServersSource;
}

/** The servers a connection is made with (the module's header): the source's, port 53 dropped; STUN only on a failure. */
async function serversOf(source: IceServersSource | undefined): Promise<RTCIceServer[]> {
  let got: DiscShareIceServer[] | null = null;
  if (source) {
    try { got = readIceServers(await source()); } catch { got = null; }
  }
  return (got ?? [...DISCSHARE_STUN_ONLY]).map((x) => ({ ...x }));
}

/**
 * The data channel as the protocol's pipe: binary as `ArrayBuffer`, `drained` on `bufferedamountlow` (or its close). Its
 * `onmessage` is attached here, at once, and what arrives before the protocol's `onMessage` is kept in order and handed
 * over when it attaches (the disc share review's B1: made when the channel is taken, before this side's connection check,
 * so nothing the other side sends once its own check passed is lost).
 */
export function channelPipe(dc: RTCDataChannel, close: () => void): SharePipe {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = SHARE_BUFFER_LOW_ADAPTATION;
  const early: (string | ArrayBuffer)[] = [];
  let reader: ((d: string | ArrayBuffer) => void) | null = null;
  dc.onmessage = (e: MessageEvent) => { const d = e.data as string | ArrayBuffer; if (reader) reader(d); else early.push(d); };
  const closers = new Set<() => void>();
  let closed = false;
  const onClose = (): void => { if (closed) return; closed = true; for (const f of [...closers]) f(); };
  dc.onclose = onClose;
  dc.onerror = onClose;
  return {
    send(d) { if (typeof d === 'string') dc.send(d); else dc.send(d as Uint8Array<ArrayBuffer>); },
    buffered: () => dc.bufferedAmount,
    high: SHARE_BUFFER_HIGH_ADAPTATION,
    drained: () => new Promise<void>((resolve) => {
      if (closed || dc.bufferedAmount <= dc.bufferedAmountLowThreshold) { resolve(); return; }
      const done = (): void => { dc.removeEventListener('bufferedamountlow', done); closers.delete(done); resolve(); };
      dc.addEventListener('bufferedamountlow', done);
      closers.add(done);
    }),
    onMessage(fn) { reader = fn; for (const d of early.splice(0)) fn(d); },
    onClose(fn) { if (closed) fn(); else closers.add(fn); },
    close,
  };
}

/** One side's connection over the browser's WebRTC (the module's header). */
export function rtcPeer(role: 'offer' | 'answer', send: Parameters<PeerFactory>[1], deps: RtcDeps = {}): PeerSession {
  const Ctor = deps.RTC === undefined ? (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection ?? null : deps.RTC;
  let resolve!: (p: SharePipe) => void;
  let reject!: (e: Error) => void;
  const ready = new Promise<SharePipe>((ok, no) => { resolve = ok; reject = no; });
  ready.catch(() => undefined);
  if (!Ctor) {
    reject(new ShareConnectError(SHARE_NO_RTC));
    return { handle: () => undefined, ready, close: () => undefined, via: () => null };
  }
  // DSH.R15: made once its ICE servers are known (the module's header); every step below runs after that, in order.
  let pc!: RTCPeerConnection;
  let made = false;
  let via: SharePath | null = null;
  let ended = false;
  let grace: ReturnType<typeof setTimeout> | null = null;
  const close = (): void => {
    if (grace !== null) { clearTimeout(grace); grace = null; }
    if (ended) return;
    ended = true;
    if (!made) return;
    try { pc.close(); } catch { /* closed already */ }
  };
  const fail = (e: unknown): void => {
    close();
    reject(e instanceof ShareConnectError ? e : new ShareConnectError(e instanceof Error ? e.message : String(e)));
  };
  // This side's candidates go after its offer or answer (one gathered first is held until it is sent).
  let described = false;
  const outbox: RTCIceCandidateInit[] = [];
  const sendHeld = (): void => { described = true; for (const c of outbox.splice(0)) send({ type: 'candidate', candidate: c }); };
  const take = (dc: RTCDataChannel): void => {
    // B2: the pipe's close closes the channel first (what is queued still goes), then the connection at the channel's
    // close event, or after `SHARE_CLOSE_GRACE_MS_ADAPTATION`.
    const closeGracefully = (): void => {
      if (ended || grace !== null) return;
      if (dc.readyState !== 'open') { close(); return; }
      grace = setTimeout(close, SHARE_CLOSE_GRACE_MS_ADAPTATION);
      pipe.onClose(close);
      try { dc.close(); } catch { close(); }
    };
    const pipe = channelPipe(dc, closeGracefully);        // B1: its messages kept from now, while the check runs
    // The second review's finding 2 (the module's header): the refusal said on the channel, then a graceful close.
    const refuse = (e: unknown): void => {
      if (!ended && dc.readyState === 'open') {
        try { dc.send(JSON.stringify({ t: 'fail', why: 'local' })); } catch { /* closing: the other side hears the close */ }
      }
      closeGracefully();
      reject(e instanceof ShareConnectError ? e : new ShareConnectError(e instanceof Error ? e.message : String(e)));
    };
    const opened = async (): Promise<void> => {
      try {
        const verdict = pairVerdict(selectedPair(await pc.getStats() as unknown as StatsLike));
        if (!verdict.ok) { refuse(new ShareConnectError(verdict.reason)); return; }
        via = verdict.via;
        resolve(pipe);
      } catch (e) { refuse(e); }
    };
    if (dc.readyState === 'open') void opened(); else dc.onopen = () => { void opened(); };
  };
  let remoteSet = false;
  const held: RTCIceCandidateInit[] = [];
  let chain: Promise<void> = Promise.resolve();
  /** A step after the connection is made; skipped once the session has ended. */
  const step = (f: () => Promise<void>): void => { chain = chain.then(() => (ended ? undefined : f())).catch(fail); };
  const remote = async (d: RTCSessionDescriptionInit): Promise<void> => {
    await pc.setRemoteDescription(d);
    remoteSet = true;
    for (const c of held.splice(0)) await pc.addIceCandidate(c);
  };
  step(async () => {
    const iceServers = await serversOf(deps.iceServers);
    if (ended) return;
    pc = new Ctor({ iceServers });
    made = true;
    pc.onicecandidate = (e) => {
      if (!e.candidate || ended) return;
      const c = e.candidate.toJSON();
      if (described) send({ type: 'candidate', candidate: c }); else outbox.push(c);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') fail(new ShareConnectError(SHARE_NO_CONNECT));
    };
    if (role === 'offer') {
      take(pc.createDataChannel(SHARE_DC_LABEL, { ordered: true }));
      const o = await pc.createOffer();
      await pc.setLocalDescription(o);
      send({ type: 'offer', sdp: o.sdp ?? '' });
      sendHeld();
    } else {
      pc.ondatachannel = (e) => { if (e.channel.label === SHARE_DC_LABEL) take(e.channel); };
    }
  });
  return {
    ready,
    via: () => via,
    close: () => { if (grace === null) close(); },        // a graceful close under way ends itself (the module's header)
    handle(msg) {
      if (ended) return;
      if (msg.type === 'offer' && role === 'answer' && typeof msg['sdp'] === 'string') {
        const sdp = msg['sdp'];
        step(async () => {
          await remote({ type: 'offer', sdp });
          const a = await pc.createAnswer();
          await pc.setLocalDescription(a);
          send({ type: 'answer', sdp: a.sdp ?? '' });
          sendHeld();
        });
      } else if (msg.type === 'answer' && role === 'offer' && typeof msg['sdp'] === 'string') {
        const sdp = msg['sdp'];
        step(() => remote({ type: 'answer', sdp }));
      } else if (msg.type === 'candidate' && typeof msg['candidate'] === 'object' && msg['candidate'] !== null) {
        const c = msg['candidate'] as RTCIceCandidateInit;
        step(async () => { if (remoteSet) await pc.addIceCandidate(c); else held.push(c); });
      }
    },
  };
}

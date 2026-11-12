import { READ_SET_VERSION } from '@s2u/archive';
import type { DiscExtractRecord, ExtractEnv } from './discExtract';
import {
  ShareProtocolError, manifestOf, manifestTotal, receiveFiles, sendFiles, type ReceiveStore, type SendSource, type SharePipe,
} from './discShareProtocol';
import { rtcPeer, type IceServersSource, type PeerFactory, type PeerSession, type SharePath } from './discShareRtc';
import { DiscShareError, type DiscShareSignal } from './discShareSignal';
import {
  readShareCode, shareHostLink, shareLink, type DiscShareAdapter, type HostRequest, type HostView, type ReceiverView, type SenderView,
} from './discShareView';
import { normaliseDiscShareCode, type DiscShareMsg, type DiscSharePageType } from './discShareWire';
import {
  SHARE_CONFLICT, SHARE_ENDED, SHARE_EXPIRED, SHARE_FORBIDDEN, SHARE_HOST_ENDED, SHARE_HOST_GONE, SHARE_NO_CONNECT, SHARE_NO_SUCH_CODE,
  SHARE_OTHER_STOPPED, SHARE_REQUEST_GONE, SHARE_SOURCE_GONE, SHARE_TOO_MANY, SHARE_UNAVAILABLE, shareRefused,
} from './discShareWords';

/**
 * **Disc share, the real adapter** (`docs/plans/2026-10-18-disc-share.md`, DSH-4; DSH.R1-R13): the `DiscShareAdapter`
 * the launcher's screens read (`./discShareView`; DSH-5's row, area and dialog), over the pairing client
 * (`./discShareSignal`, central's `/api/discshare/*`, signalling only), the connection (`./discShareRtc`) and the
 * transfer protocol (`./discShareProtocol`). **A browser adaptation, product track** (OT.R53): the original had no
 * disc share; nothing here changes what the game does. The files go to the device that made the code, once the sender
 * says Yes beside it (DSH.R11; DSH.R16, the owner, 2026-11-07: between players too, DSH.R1 overruled), on one network or
 * across networks (DSH.R15, the owner, 2026-11-07): directly, or through Cloudflare's TURN
 * relay, encrypted end to end; none of our servers ever carries disc data. Each side's connection takes its ICE
 * servers from the pairing (`DiscShareSignal.ice`, its own id and secret), and its view says the path (`via`).
 *
 * **The receiver** (Play's "Request Game Files (XBOX)" row): `request()` asks central for a code (`requesting`), shows it
 * and the pairing link `${origin}/?discshare=<code>` (`waiting`, until the code's expiry), and long-polls the pair:
 * `claimed` (`paired`), the sender's offer and candidates answered (`./discShareRtc` `rtcPeer`, the pair read),
 * then the copy (`copying`: bytes stored over the manifest's total -- `SHARE_READ_SET_BYTES` until it arrives) into the
 * extraction's own store (`pageReceiveStore`: DSH-2's streamed write; the record written only once every file matches),
 * then `done`, and `onReceived` hands the record to the launcher's disc (the path a finished extraction takes).
 *
 * **The sender** (the page the link opens, or Settings' "Send game files to another device", its code entry): asked
 * by the code (`asked`; `needs-extract` without a complete extraction, DSH.R7: Yes is gated on it); Yes opens its kept
 * extraction (`sendSource`), claims the code -- only then, so a page opened and left, or one extracting first, spends
 * nothing of the code's 10 minutes -- makes the offer, and sends (`sending`, then `done`). The code entry (`openSend`)
 * lists the requests central finds on this network (`nearby`, polled every `SHARE_NEARBY_EVERY_MS_ADAPTATION` only
 * while it is open, DSH.R9) and takes a typed one (`choose`).
 *
 * **Ending**: a cancel, a Stop (`decline` while sending) and a failure send `bye` and stop every poll, timer and
 * connection; the other side then fails with `SHARE_OTHER_STOPPED`. **Once both sides' checks passed** (each its
 * connection's path read, `./discShareRtc` `pairVerdict`; the protocol's `onLinked`: the sender heard `hello`, the
 * receiver the manifest) the pairing has done its work: that side
 * stops polling and sends `bye` at once (the disc share review's B2), so central's end of the pair -- `DISCSHARE_LIFE_MS`
 * after the claim -- never cuts a long copy; from the pipe's opening a `bye` or an ended pair heard on the poll is no
 * longer a failure, and the channel's own `fail` and close (and the protocol's inactivity bound) carry the end from then
 * on. **Never hanging** (the merge controller's landing
 * condition): every pairing call has its timeout (`./discShareSignal`); a failure is said in the words of
 * `pairingWords` -- pairing unreachable on this site (a static host's page, no answer, 502/503) plainly so; a poll that
 * fails `SHARE_POLL_FAILURES_ADAPTATION` times in a row ends the session, waiting `SHARE_POLL_RETRY_MS_ADAPTATION`
 * between tries; the devices not connected within `SHARE_CONNECT_TIMEOUT_MS_ADAPTATION` of the offer end it too.
 *
 * **The host** (RB-26, the replay batch plan, over RB-25's routes; DSH.R16 with its Q9-Q11 defaults): `openHost()` --
 * only with a complete extraction (DSH.R7) -- opens a hosted share at central, whose link (`?discshare-host=<token>`)
 * other players' pages request against (`LiveShareDeps.hostToken`: the receiver's request bound to the host, its code
 * shown for the host to match). The host's poll hears each request (`asked`) and its end unanswered (`withdrawn`); the
 * receiver-made codes found on this network (the code entry's nearby poll) join the same list. **One copy at a time**
 * (DSH.R1's "one transfer at a time", Q9): a Yes (`approveReq`) copies at once, or, while another copies, queues --
 * approved at central (or, for a nearby code, claimed) only when its turn comes, so its pair's `DISCSHARE_LIFE_MS` starts
 * then (DSH-4's economy: nothing of a code's time is spent before its copy can start). A copy's end (done, failed or
 * `stopActive`) starts the next in the order of the Yes. `declineReq` says No (a nearby code is only hidden here: central
 * takes no host's No for a code not bound to it). `closeHost()` (Q10) and `dispose()` -- a deploy takes the launcher
 * down through it (`console/app.ts` `takeDown`), Q11 -- end the share: the copy under way stopped (its receiver hears
 * the other device stopped), the host's `bye` (central tells every request still pending that the host ended). **The
 * share lost** (its poll failed `SHARE_POLL_FAILURES_ADAPTATION` times, or its host gone at central) ends it the same
 * way, but a copy whose pipe is already up runs on to its end (DSH-4's B2: a connected copy is its channel's, not the
 * pairing's); one not yet connected ends with the share.
 */

/** The read set's bytes (DSH.R4: 95 files, 1,338,391,063 bytes): the total said before the manifest arrives. */
export const SHARE_READ_SET_BYTES = 1_338_391_063;
/** The code entry's nearby poll. An adaptation, ours: chosen, not measured. */
export const SHARE_NEARBY_EVERY_MS_ADAPTATION = 3_000;
/** Polls failed in a row that end a session. An adaptation. */
export const SHARE_POLL_FAILURES_ADAPTATION = 3;
/** The wait after a failed poll, and the least time between two empty answers. An adaptation. */
export const SHARE_POLL_RETRY_MS_ADAPTATION = 2_000;
/** From the claim (receiver) or the offer (sender) to a connected, local channel. An adaptation. */
export const SHARE_CONNECT_TIMEOUT_MS_ADAPTATION = 60_000;
/** How long the receiver keeps its channel open after `done` for the sender to hear it and close first. An adaptation. */
export const SHARE_LINGER_MS_ADAPTATION = 5_000;
/** The least time between two progress redraws (the bytes move every 64 KiB). An adaptation. */
export const SHARE_PROGRESS_MS_ADAPTATION = 250;

/** A pairing call's failure in a player's words (the module's header). `op`: which call. */
export function pairingWords(e: unknown, op: 'request' | 'nearby' | 'claim' | 'poll' | 'send' | 'host' | 'approve' | 'decline'): string {
  if (!(e instanceof DiscShareError)) return SHARE_UNAVAILABLE;
  const s = e.status;
  if (s === 0 || s === 200 || s === 502 || s === 503 || s === 504 || !e.routed) return SHARE_UNAVAILABLE;
  if (s === 429) return SHARE_TOO_MANY;
  if (s === 403) return SHARE_FORBIDDEN;
  if (s === 409) return SHARE_CONFLICT;
  if (s === 404) return op === 'claim' ? SHARE_NO_SUCH_CODE : op === 'host' ? SHARE_HOST_GONE : op === 'approve' || op === 'decline' ? SHARE_REQUEST_GONE : SHARE_ENDED;
  if (s === 400 && op === 'claim') return SHARE_NO_SUCH_CODE;
  return shareRefused(s);
}

export interface LiveShareDeps {
  /** This page's address query (`?discshare=<code>` when the link opened it). */
  search: string;
  /** This page's origin (the link's, DSH.R10). */
  origin: string;
  /** The pairing client. */
  signal: DiscShareSignal;
  /** Whether this page holds a complete extraction (DSH.R7). */
  complete(): boolean;
  /** The connection; absent, `rtcPeer` (the browser's WebRTC). */
  peer?: PeerFactory;
  /** The sender's kept extraction, or null when it is not whole; absent, the page's (`pageSendSource`). */
  sendSource?: () => Promise<SendSource | null>;
  /** The receiver's store; absent, the page's (`pageReceiveStore`). */
  store?: ReceiveStore;
  /** This page's read set's version; absent, `READ_SET_VERSION`. */
  readSet?: number;
  /** The receiver's check of the manifest's paths; absent, the read set's (`fitsReadSet`). A test seam (`ReceiveOptions`). */
  isReadSet?: (paths: readonly string[]) => boolean;
  /** A copy received whole: its record (the launcher's disc takes it as a finished extraction). */
  onReceived?: (record: DiscExtractRecord) => void;
  /** The extraction's environment for the page's sources (a test's). */
  env?: ExtractEnv;
  /**
   * RB-26: a host's link token when this page was opened by one (`?discshare-host=<token>`): the receiver's request is
   * made against that host. Absent, a receiver-made code (Play's row).
   */
  hostToken?: string;
}

/** RB-26, Q11: `hostBusy` (DSH-10 moved it beside `HostView`, `./discShareView`, for the console). */
export { hostBusy } from './discShareView';

/** The sender's kept extraction when it is whole, else null (DSH.R7: the kept extraction only, never the image). */
export async function pageSendSource(env: ExtractEnv = {}): Promise<SendSource | null> {
  const { extractionState, openExtractedSource } = await import('./discExtractRecord');
  if ((await extractionState(env)) !== 'whole') return null;
  return openExtractedSource(env);
}

/**
 * The receiver's store over the page's extraction (DSH.R4: the same store and record as a local extraction): an
 * extraction of another disc or read set removed first (one extraction is kept, as `extractDisc` keeps one); each file
 * through DSH-2's `openStreamedFile`; a damaged file emptied; the record written in `./discExtractRecord`'s form.
 */
export function pageReceiveStore(env: ExtractEnv = {}): ReceiveStore {
  return {
    async prepare(identity, readSet) {
      const [{ storedExtraction }, { copyDirName }, { pageRecords }] = await Promise.all([import('./discExtractRecord'), import('./discCopy'), import('./pageStore')]);
      const kept = await storedExtraction(env.records ?? pageRecords());
      if (kept && (kept.dir !== copyDirName(identity) || kept.readSet !== readSet)) {
        const { deleteExtraction } = await import('./discExtract');
        await deleteExtraction(env);
      }
    },
    async open(identity, path, size, backend) {
      const { openStreamedFile } = await import('./discStreamWrite');
      return openStreamedFile(identity, path, size, backend ? Object.assign({}, env, { backend }) : env);
    },
    async discard(identity, path, backend) {
      const [{ openStore }, { copyDirName }] = await Promise.all([import('./discExtractRecord'), import('./discCopy')]);
      await openStore(backend, copyDirName(identity), env).write(path, new Blob([]));
    },
    async commit(r) {
      const [{ storageOf }, { copyDirName }, { DISC_EXTRACT_SLOT, pageRecords }] = await Promise.all([import('./discExtractRecord'), import('./discCopy'), import('./pageStore')]);
      let persisted = false;
      try { const s = storageOf(env); persisted = !!s && typeof s.persist === 'function' && (await s.persist()) === true; } catch { persisted = false; }
      const now = Date.now();
      const record: DiscExtractRecord = {
        v: 1, readSet: r.readSet, identity: { ...r.identity }, backend: r.backend, dir: copyDirName(r.identity), files: [...r.files],
        total: r.total, persisted, started: now, when: now,
      };
      await (env.records ?? pageRecords()).put(DISC_EXTRACT_SLOT, record);
      return record;
    },
  };
}

/** A failure that ends a session, its words. */
class Ended extends Error {}

/**
 * One side's run: its abort (every call and the copy), its timers, its pairing's poll, its connection. `stop()` ends
 * them all; a run stopped is stale, and whatever it was awaiting is dropped when it lands.
 */
class Run {
  readonly ac = new AbortController();
  /** The pairing's poll alone: aborted when the run stops, or once both checks passed (`unpair`, B2). */
  readonly polling = new AbortController();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private sleepers = new Set<() => void>();
  peer: PeerSession | null = null;
  pipe: SharePipe | null = null;
  pair: { id: string; secret: string } | null = null;
  get stopped(): boolean { return this.ac.signal.aborted; }
  timer(ms: number, f: () => void): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.stopped) f(); }, ms);
    this.timers.add(t);
    return t;
  }
  clear(t: ReturnType<typeof setTimeout> | null): void { if (t !== null) { clearTimeout(t); this.timers.delete(t); } }
  sleep(ms: number): Promise<void> {
    return new Promise((r) => {
      const wake = (): void => { this.sleepers.delete(wake); r(); };
      this.sleepers.add(wake);
      this.timer(ms, wake);
    });
  }
  /** Ends the polls and timers now, the channel when the other side closes it or after `ms` (its last message heard). */
  linger(ms: number): void {
    const pipe = this.pipe;
    const peer = this.peer;
    this.pipe = null;
    this.peer = null;
    this.stop();
    const end = (): void => { try { pipe?.close(); } catch { /* closed */ } peer?.close(); };
    if (!pipe) { end(); return; }
    const t = setTimeout(end, ms);
    pipe.onClose(() => { clearTimeout(t); peer?.close(); });
  }
  stop(): void {
    if (!this.stopped) this.ac.abort();
    if (!this.polling.signal.aborted) this.polling.abort();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const w of [...this.sleepers]) w();
    // B2: a pipe up closes its channel first, so the protocol's last word (`fail`, `done`) reaches the other side; the
    // pipe's close then closes the connection (`./discShareRtc`). With no pipe, the connection now.
    if (this.pipe) { try { this.pipe.close(); } catch { this.peer?.close(); } } else this.peer?.close();
  }
}

/** The real adapter: every RB-26 host member present, and `dispose()`. */
export type LiveDiscShare = DiscShareAdapter & Required<Pick<DiscShareAdapter, 'host' | 'openHost' | 'closeHost' | 'approveReq' | 'declineReq' | 'stopActive' | 'hostLinked' | 'complete'>> & { dispose(): void };

/** The real adapter (the module's header). `dispose()` ends both sides and the host. */
export function liveDiscShare(deps: LiveShareDeps): LiveDiscShare {
  const sig = deps.signal;
  const peerOf: PeerFactory = deps.peer ?? ((role, send, iceServers) => rtcPeer(role, send, iceServers ? { iceServers } : {}));
  /** DSH.R15: the run's ICE servers from the pairing (its own id and secret); absent, the connection's default. */
  const iceOf = (run: Run): IceServersSource | undefined => {
    const p = run.pair;
    const ice = sig.ice?.bind(sig);
    return p && ice ? () => ice(p.id, p.secret, run.ac.signal) : undefined;
  };
  const readSet = deps.readSet ?? READ_SET_VERSION;
  const store = (): ReceiveStore => deps.store ?? pageReceiveStore(deps.env);
  const sendSource = deps.sendSource ?? (() => pageSendSource(deps.env));
  const subs = new Set<() => void>();
  const changed = (): void => { for (const f of [...subs]) f(); };
  let lastDraw = 0;
  const progressed = (): void => {
    const t = Date.now();
    if (t - lastDraw >= SHARE_PROGRESS_MS_ADAPTATION) { lastDraw = t; changed(); }
  };

  /** Posts `msg` on the run's pair; a failure ends the run through `fail`. */
  const post = (run: Run, msg: DiscShareMsg & { type: DiscSharePageType }, fail: (words: string) => void): void => {
    const p = run.pair;
    if (!p || run.stopped) return;
    sig.send(p.id, p.secret, msg, run.ac.signal).catch((e: unknown) => { if (!run.stopped) fail(pairingWords(e, 'send')); });
  };
  /** The bye, after the run is stopped: best effort, its own short call (the run's signal is aborted). */
  const bye = (run: Run): void => {
    const p = run.pair;
    if (!p) return;
    run.pair = null;
    sig.send(p.id, p.secret, { type: 'bye' }).catch(() => undefined);
  };
  /**
   * The review's B2: both checks passed, the pairing is done -- its poll stopped and `bye` sent now (central ends the
   * pair; the other side, linked too, no longer listens). The channel carries the end from here.
   */
  const unpair = (run: Run): void => {
    if (run.stopped) return;
    run.polling.abort();
    bye(run);
  };
  /** Whether the run still listens to its pairing: not stopped, not unpaired, and its pipe not yet up. */
  const listening = (run: Run): boolean => !run.stopped && !run.polling.signal.aborted && !!run.pair && !run.pipe;
  /**
   * The pair's long-poll: each message handed to `on`; a failure (3 in a row, or the pair ended) ends the run -- until
   * the pipe is up: from then on it only ends the poll (B2).
   */
  const pollLoop = async (run: Run, on: (m: DiscShareMsg) => void, fail: (words: string) => void, op: 'poll' | 'host' = 'poll'): Promise<void> => {
    let after = 0;
    let fails = 0;
    while (!run.stopped && !run.polling.signal.aborted && run.pair) {
      const t0 = Date.now();
      try {
        const got = await sig.poll(run.pair.id, run.pair.secret, after, run.polling.signal);
        if (run.stopped || run.polling.signal.aborted) return;
        fails = 0;
        for (const q of got) {
          after = Math.max(after, q.seq);
          on(q.msg);
          if (run.stopped) return;
        }
        if (!got.length && Date.now() - t0 < SHARE_POLL_RETRY_MS_ADAPTATION) await run.sleep(SHARE_POLL_RETRY_MS_ADAPTATION);
      } catch (e) {
        if (run.stopped || run.polling.signal.aborted || run.pipe) return;
        const routedEnd = e instanceof DiscShareError && e.routed && (e.status === 404 || e.status === 403);
        if (routedEnd || ++fails >= SHARE_POLL_FAILURES_ADAPTATION) { fail(pairingWords(e, op)); return; }
        await run.sleep(SHARE_POLL_RETRY_MS_ADAPTATION);
      }
    }
  };

  // ---- the receiver ----
  let rx: ReceiverView = { phase: 'idle' };
  let rxRun: Run | null = null;
  const rxEnd = (sendBye: boolean): void => {
    const run = rxRun;
    rxRun = null;
    if (!run) return;
    run.stop();
    if (sendBye) bye(run);
  };
  const rxFail = (run: Run, reason: string): void => {
    if (rxRun !== run) return;
    rxEnd(true);
    rx = { phase: 'failed', reason };
    changed();
  };
  const rxCopy = async (run: Run, pipe: SharePipe): Promise<void> => {
    run.pipe = pipe;
    pipe.onClose(() => undefined);
    rx = { ...rx, phase: 'copying', bytes: 0, total: SHARE_READ_SET_BYTES };
    changed();
    try {
      const record = await receiveFiles(pipe, store(), {
        readSet, signal: run.ac.signal, ...(deps.isReadSet ? { isReadSet: deps.isReadSet } : {}),
        onLinked: () => { if (rxRun === run) unpair(run); },
        onManifest: (m) => { if (rxRun === run) rx = { ...rx, total: manifestTotal(m) }; },
        onProgress: (bytes, total) => { if (rxRun === run) { rx = { ...rx, bytes, total }; progressed(); } },
      });
      if (rxRun !== run) return;
      rxRun = null;
      run.linger(SHARE_LINGER_MS_ADAPTATION);              // the sender hears done and closes (the pair ended at the link, B2)
      rx = { ...rx, phase: 'done', bytes: record.total, total: record.total };
      changed();
      deps.onReceived?.(record);
    } catch (e) {
      rxFail(run, e instanceof Error ? e.message : String(e));
    }
  };
  const request = (): void => {
    rxEnd(true);
    const run = new Run();
    rxRun = run;
    rx = { phase: 'requesting' };
    changed();
    const fail = (words: string): void => { rxFail(run, words); };
    const hosted = deps.hostToken ?? null;
    sig.request(run.ac.signal, ...(hosted !== null ? [hosted] : [])).then((a) => {
      if (rxRun !== run) { if (!run.pair) { run.pair = { id: a.id, secret: a.secret }; bye(run); } return; }
      run.pair = { id: a.id, secret: a.secret };
      // RB-26: a request against a host shows its code for the host to match -- no link of its own, and no expiry: it
      // lives while both pages poll (RB-25; its `expiresAt` is only the idle bound). A receiver-made code expires.
      rx = hosted !== null ? { phase: 'waiting', code: a.code, hosted: true } : { phase: 'waiting', code: a.code, link: shareLink(deps.origin, a.code), expiresAt: a.expiresAt };
      changed();
      const expiry = hosted !== null ? null : run.timer(Math.max(0, a.expiresAt - Date.now()), () => { if (rx.phase === 'waiting' || rx.phase === 'paired') fail(SHARE_EXPIRED); });
      let connect: ReturnType<typeof setTimeout> | null = null;
      void pollLoop(run, (m) => {
        if (m.type === 'claimed') {
          rx = { ...rx, phase: 'paired' };
          changed();
          connect = run.timer(SHARE_CONNECT_TIMEOUT_MS_ADAPTATION, () => { if (!run.pipe) fail(SHARE_NO_CONNECT); });
        } else if (m.type === 'bye') {
          if (listening(run)) fail(SHARE_OTHER_STOPPED);      // B2: once the pipe is up, the channel says it
        } else if (m.type === 'declined' && hosted !== null && rx.phase === 'waiting') {
          rxEnd(false);                                       // RB-26: the host's No; central ends the request itself
          rx = { phase: 'declined', code: a.code, hosted: true };
          changed();
        } else if (m.type === 'withdrawn' && hosted !== null && listening(run)) {
          fail(SHARE_HOST_ENDED);                             // RB-26: the host ended before its answer
        } else if (m.type === 'offer' || m.type === 'candidate') {
          if (!run.peer) {
            const peer = peerOf('answer', (out) => { post(run, out, fail); }, iceOf(run));
            run.peer = peer;
            peer.ready.then((pipe) => {
              if (rxRun !== run) { pipe.close(); return; }
              run.clear(expiry); run.clear(connect);
              const via = peer.via?.() ?? null;
              if (via) rx = { ...rx, via };
              void rxCopy(run, pipe);
            }, (e: unknown) => { fail(e instanceof Error ? e.message : String(e)); });
          }
          run.peer.handle(m);
        }
      }, fail);
    }, (e: unknown) => {
      if (rxRun !== run) return;
      // RB-26: a host's link whose share is gone (the route's 404 for its token) says the host stopped sharing.
      const hostGone = hosted !== null && e instanceof DiscShareError && e.routed && e.status === 404;
      fail(hostGone ? SHARE_HOST_ENDED : pairingWords(e, 'request'));
    });
  };

  // ---- the sender ----
  type Tx = { phase: 'open' } | { phase: 'sending' | 'done'; bytes: number; total: number } | { phase: 'failed'; reason: string } | { phase: 'declined' };
  let mode: 'none' | 'link' | 'enter' = 'none';
  let code = readShareCode(deps.search) ?? '';
  if (code) mode = 'link';
  let tx: Tx = { phase: 'open' };
  let txRun: Run | null = null;
  /** DSH.R15: the sending connection's path, once linked. */
  let txVia: SharePath | null = null;
  let nearby: string[] = [];
  let nearbyRun: Run | null = null;
  const txEnd = (sendBye: boolean): void => {
    const run = txRun;
    txRun = null;
    if (!run) return;
    run.stop();
    if (sendBye) bye(run);
  };
  const nearbyEnd = (): void => { nearbyRun?.stop(); nearbyRun = null; };
  const txFail = (run: Run, reason: string): void => {
    if (txRun !== run) return;
    txEnd(true);
    tx = { phase: 'failed', reason };
    changed();
  };
  const startNearby = (): void => {
    nearbyEnd();
    const run = new Run();
    nearbyRun = run;
    void (async () => {
      while (!run.stopped) {
        try {
          const found = await sig.nearby(run.ac.signal);
          if (run.stopped) return;
          const codes = found.map((r) => r.code);
          if (codes.join() !== nearby.join()) { nearby = codes; changed(); }
        } catch (e) {
          if (run.stopped) return;
          nearbyEnd();
          tx = { phase: 'failed', reason: pairingWords(e, 'nearby') };
          changed();
          return;
        }
        await run.sleep(SHARE_NEARBY_EVERY_MS_ADAPTATION);
      }
    })();
  };
  /** What one sending run tells its owner (the link's sender, or the host's copy under way). */
  interface SendHooks {
    /** Whether the run is still its owner's current one (a stale run's results are dropped). */
    current(): boolean;
    fail(words: string): void;
    /** The manifest's total, once the kept extraction is read. */
    sized(total: number): void;
    /** The channel is up: the connection's path (DSH.R15), when read. */
    linked(via: SharePath | null): void;
    progress(bytes: number, total: number): void;
    done(total: number): void;
  }
  /**
   * One send (DSH-4's sender; RB-26's host reuses it): the kept extraction opened -- before the pair is made, so a page
   * without a whole one spends nothing of the code's time -- then the pair (`pairing`: a claim by code, or the host's Yes),
   * the offer, and the copy.
   */
  const sendOver = (run: Run, pairing: () => Promise<{ id: string; secret: string }>, op: 'claim' | 'approve', h: SendHooks): void => {
    void (async () => {
      let src: SendSource | null;
      try { src = await sendSource(); } catch { src = null; }
      if (!h.current()) return;
      let total: number;
      try { if (!src) throw new Ended(SHARE_SOURCE_GONE); total = manifestTotal(manifestOf(src.record)); } catch { h.fail(SHARE_SOURCE_GONE); return; }
      h.sized(total);
      try {
        const a = await pairing();
        if (!h.current()) { run.pair = { id: a.id, secret: a.secret }; bye(run); return; }
        run.pair = { id: a.id, secret: a.secret };
      } catch (e) { if (h.current()) h.fail(pairingWords(e, op)); return; }
      const fail = (words: string): void => { h.fail(words); };
      const peer = peerOf('offer', (out) => { post(run, out, fail); }, iceOf(run));
      run.peer = peer;
      void pollLoop(run, (m) => {
        if (m.type === 'bye') { if (listening(run)) fail(SHARE_OTHER_STOPPED); }   // B2: once the pipe is up, the channel says it
        else if (m.type === 'answer' || m.type === 'candidate') peer.handle(m);
      }, fail);
      const connect = run.timer(SHARE_CONNECT_TIMEOUT_MS_ADAPTATION, () => { if (!run.pipe) fail(SHARE_NO_CONNECT); });
      let pipe: SharePipe;
      try { pipe = await peer.ready; } catch (e) { fail(e instanceof Error ? e.message : String(e)); return; }
      if (!h.current()) { pipe.close(); return; }
      run.clear(connect);
      run.pipe = pipe;
      h.linked(peer.via?.() ?? null);
      try {
        await sendFiles(pipe, src, {
          signal: run.ac.signal,
          onLinked: () => { if (h.current()) unpair(run); },
          onProgress: (bytes, t) => { if (h.current()) h.progress(bytes, t); },
        });
      } catch (e) {
        fail(e instanceof ShareProtocolError || e instanceof Error ? e.message : String(e));
        return;
      }
      if (!h.current()) return;
      h.done(total);
    })();
  };

  const approve = (): void => {
    if (mode !== 'link' || tx.phase !== 'open' || !deps.complete()) return;
    txVia = null;
    const run = new Run();
    txRun = run;
    tx = { phase: 'sending', bytes: 0, total: SHARE_READ_SET_BYTES };
    changed();
    sendOver(run, () => sig.claim(code, run.ac.signal), 'claim', {
      current: () => txRun === run,
      fail: (words) => { txFail(run, words); },
      sized: (total) => { tx = { phase: 'sending', bytes: 0, total }; changed(); },
      linked: (via) => { txVia = via; changed(); },
      progress: (bytes, total) => { tx = { phase: 'sending', bytes, total }; progressed(); },
      done: (total) => {
        txEnd(true);                                      // done (the pair ended at central at the link, B2)
        tx = { phase: 'done', bytes: total, total };
        changed();
      },
    });
  };

  // ---- the host (RB-26; the module's header) ----
  /** A request in the host's list: bound to the host (`host`), or a receiver-made code found on this network (`nearby`). */
  interface Entry { id: string; code: string; since: number; from: 'host' | 'nearby' }
  /** The copy under way: its run, its request, its progress. */
  interface Active { run: Run; entry: Entry; bytes: number; total: number; via: SharePath | null }
  let hostState: { phase: HostView['phase']; link?: string; reason?: string } = { phase: 'idle' };
  /** The host's own run: its pair is the host's id and secret (its poll; its `bye` ends it at central). */
  let hostRun: Run | null = null;
  let hostNearby: Run | null = null;
  /** The requests in the order they arrived (the active one taken out). */
  let pending: Entry[] = [];
  /** The ids said Yes while another copies, in the order of the Yes (Q9: one at a time). */
  let queue: string[] = [];
  /** Nearby codes the host said No to: hidden here (central takes no host's No for them). */
  const hidden = new Set<string>();
  let active: Active | null = null;
  let last: HostView['last'];

  const hostView = (): HostView => {
    const list: HostRequest[] = pending.map((e) => {
      const at = queue.indexOf(e.id);
      return at < 0 ? { id: e.id, code: e.code, since: e.since, state: 'asked' } : { id: e.id, code: e.code, since: e.since, state: 'queued', place: at + 1 };
    });
    return {
      phase: hostState.phase, pending: list,
      ...(hostState.link !== undefined ? { link: hostState.link } : {}),
      ...(hostState.reason !== undefined ? { reason: hostState.reason } : {}),
      ...(active ? { active: { id: active.entry.id, code: active.entry.code, bytes: active.bytes, total: active.total, ...(active.via ? { via: active.via } : {}) } } : {}),
      ...(last ? { last } : {}),
    };
  };
  /** The copy under way ended: its run stopped (and its `bye` sent, unless the pairing already ended at the link). */
  const finish = (a: Active, outcome: 'done' | 'failed' | 'stopped', reason?: string): void => {
    if (active !== a) return;
    active = null;
    a.run.stop();
    bye(a.run);
    last = { code: a.entry.code, outcome, ...(reason !== undefined ? { reason } : {}) };
    changed();
    next();
  };
  /** The next queued request's turn: approved at central (or its code claimed) only now. */
  const next = (): void => {
    if (active || !hostRun || hostState.phase !== 'open') return;
    for (;;) {
      const id = queue.shift();
      if (id === undefined) return;
      const at = pending.findIndex((e) => e.id === id);
      if (at < 0) continue;
      const entry = pending.splice(at, 1)[0]!;
      start(entry);
      return;
    }
  };
  const start = (entry: Entry): void => {
    const host = hostRun?.pair;
    if (!host) return;
    const run = new Run();
    const a: Active = { run, entry, bytes: 0, total: SHARE_READ_SET_BYTES, via: null };
    active = a;
    changed();
    const approveAt = sig.approve?.bind(sig);
    const pairing = entry.from === 'host'
      ? () => (approveAt ? approveAt(host.id, host.secret, entry.id, run.ac.signal) : Promise.reject(new DiscShareError(0, 'no host route')))
      : () => sig.claim(entry.code, run.ac.signal);
    sendOver(run, pairing, entry.from === 'host' ? 'approve' : 'claim', {
      current: () => active === a,
      fail: (words) => { finish(a, 'failed', words); },
      sized: (total) => { a.total = total; changed(); },
      linked: (via) => { a.via = via; changed(); },
      progress: (bytes, total) => { a.bytes = bytes; a.total = total; progressed(); },
      done: (total) => { a.bytes = total; a.total = total; finish(a, 'done'); },
    });
  };
  /**
   * Ends the share: the copy stopped, the list emptied, the polls ended; `sendBye`, the host's `bye` (best effort).
   * `keepLinked` (the share lost, not closed): a copy whose pipe is up runs on to its end over its own channel -- DSH-4's
   * B2, a connected copy is no longer the pairing's to cut; one not yet connected ends with the share.
   */
  const hostEnd = (sendBye: boolean, keepLinked = false): void => {
    const run = hostRun;
    hostRun = null;
    hostNearby?.stop();
    hostNearby = null;
    const a = active;
    if (a && !(keepLinked && a.run.pipe && !a.run.stopped)) { active = null; a.run.stop(); bye(a.run); }
    pending = [];
    queue = [];
    hidden.clear();
    if (!run) return;
    run.stop();
    if (sendBye) bye(run);
  };
  const hostFail = (run: Run, reason: string): void => {
    if (hostRun !== run) return;
    hostEnd(true, true);                                  // B2: a connected copy runs on (the host shows it till done)
    hostState = { phase: 'failed', reason };
    changed();
  };
  const onHostMsg = (m: DiscShareMsg): void => {
    if (m.type === 'asked') {
      const { id, code: c, since } = m as { id?: unknown; code?: unknown; since?: unknown };
      if (typeof id !== 'string' || typeof c !== 'string' || pending.some((e) => e.id === id) || active?.entry.id === id) return;
      pending.push({ id, code: c, since: typeof since === 'number' ? since : Date.now(), from: 'host' });
      changed();
    } else if (m.type === 'withdrawn') {
      const id = (m as { id?: unknown }).id;
      if (typeof id !== 'string' || !pending.some((e) => e.id === id)) return;
      pending = pending.filter((e) => e.id !== id);
      queue = queue.filter((q) => q !== id);
      changed();
    }
  };
  /**
   * The receiver-made codes found on this network join the list (the code entry's nearby poll, while the share is open);
   * one no longer listed leaves it unless said Yes (its claim then says whether it still stands). A failed nearby poll
   * ends only this poll: the hosted requests go on.
   */
  const startHostNearby = (): void => {
    const run = new Run();
    hostNearby = run;
    void (async () => {
      while (!run.stopped) {
        let found: { id: string; code: string; createdAt: number }[];
        try { found = await sig.nearby(run.ac.signal); } catch { if (hostNearby === run) { hostNearby = null; run.stop(); } return; }
        if (run.stopped) return;
        const ids = new Set(found.map((r) => r.id));
        const before = pending.length;
        pending = pending.filter((e) => e.from !== 'nearby' || ids.has(e.id) || queue.includes(e.id));
        let grew = false;
        for (const r of found) {
          if (hidden.has(r.id) || active?.entry.id === r.id || pending.some((e) => e.id === r.id)) continue;
          pending.push({ id: r.id, code: r.code, since: Date.now(), from: 'nearby' });
          grew = true;
        }
        if (grew || pending.length !== before) changed();
        await run.sleep(SHARE_NEARBY_EVERY_MS_ADAPTATION);
      }
    })();
  };
  const openHost = (): void => {
    if (hostRun) return;
    last = undefined;
    if (!deps.complete()) { hostState = { phase: 'needs-extract' }; changed(); return; }
    const opener = sig.host?.bind(sig);
    if (!opener) { hostState = { phase: 'failed', reason: SHARE_UNAVAILABLE }; changed(); return; }
    const run = new Run();
    hostRun = run;
    hostState = { phase: 'opening' };
    changed();
    opener(run.ac.signal).then((a) => {
      if (hostRun !== run) { if (!run.pair) { run.pair = { id: a.hostId, secret: a.secret }; bye(run); } return; }
      run.pair = { id: a.hostId, secret: a.secret };
      hostState = { phase: 'open', link: shareHostLink(deps.origin, a.token) };
      changed();
      void pollLoop(run, onHostMsg, (words) => { hostFail(run, words); }, 'host');
      startHostNearby();
    }, (e: unknown) => { hostFail(run, pairingWords(e, 'host')); });
  };
  const closeHost = (): void => {
    if (!hostRun && hostState.phase === 'idle') return;
    hostEnd(true);
    hostState = { phase: 'idle' };
    last = undefined;
    changed();
  };
  const approveReq = (id: string): void => {
    if (!hostRun || hostState.phase !== 'open' || !deps.complete()) return;
    if (!pending.some((e) => e.id === id) || queue.includes(id)) return;
    queue.push(id);
    changed();
    next();
  };
  const declineReq = (id: string): void => {
    const entry = pending.find((e) => e.id === id);
    if (!entry) return;
    pending = pending.filter((e) => e.id !== id);
    queue = queue.filter((q) => q !== id);
    const host = hostRun?.pair;
    if (entry.from === 'nearby') hidden.add(id);
    else if (host && sig.decline) sig.decline(host.id, host.secret, id).catch(() => undefined);   // best effort: the host's end withdraws it anyway
    changed();
  };
  const stopActive = (): void => { if (active) finish(active, 'stopped'); };

  const senderView = (): SenderView | null => {
    if (mode === 'none') return null;
    if (mode === 'enter') {
      return tx.phase === 'failed' ? { phase: 'failed', code: '', reason: tx.reason } : { phase: 'enter', code: '', nearby: [...nearby] };
    }
    switch (tx.phase) {
      case 'open': return { phase: deps.complete() ? 'asked' : 'needs-extract', code };
      case 'sending': case 'done': return { phase: tx.phase, code, bytes: tx.bytes, total: tx.total, ...(txVia ? { via: txVia } : {}) };
      case 'failed': return { phase: 'failed', code, reason: tx.reason };
      default: return { phase: 'declined', code };
    }
  };

  return {
    receiver: () => rx,
    request,
    cancel(): void {
      if (rx.phase === 'idle') return;
      rxEnd(rx.phase !== 'done' && rx.phase !== 'failed');
      rx = { phase: 'idle' };
      changed();
    },
    sender: senderView,
    approve,
    decline(): void {
      if (mode === 'enter') { nearbyEnd(); mode = 'none'; tx = { phase: 'open' }; changed(); return; }
      if (mode !== 'link') return;
      txEnd(tx.phase === 'sending');
      tx = { phase: 'declined' };
      changed();
    },
    openSend(): void {
      txEnd(tx.phase === 'sending');
      mode = 'enter';
      code = '';
      tx = { phase: 'open' };
      nearby = [];
      startNearby();
      changed();
    },
    choose(typed: string): boolean {
      const c = normaliseDiscShareCode(typed);
      if (c === null || mode === 'none' || tx.phase === 'sending') return false;
      nearbyEnd();
      mode = 'link';
      code = c;
      tx = { phase: 'open' };
      changed();
      return true;
    },
    onChange(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    host: hostView,
    openHost,
    closeHost,
    approveReq,
    declineReq,
    stopActive,
    hostLinked: () => deps.hostToken !== undefined,
    complete: () => deps.complete(),                      // DSH-10 (DSH.R17): the send row's and SEND DISC's rule
    dispose(): void {
      rxEnd(rx.phase !== 'idle' && rx.phase !== 'done' && rx.phase !== 'failed' && rx.phase !== 'declined');
      txEnd(tx.phase === 'sending');
      nearbyEnd();
      hostEnd(true);                                      // RB-26 (Q11): a deploy's takeDown ends the share
      subs.clear();
    },
  };
}

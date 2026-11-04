import { addressOnline } from './addressOnline';
import { devSwitches } from './source';
import type { ViewerHook } from './hook';
import { REPLAY_FORMAT_VERSION, type ReplayHeader } from '../../match/src/replay/format';
import { FileRecorder, type RoomRecorder } from '../../match/src/replay/recorder';
import { setLoopbackDefaults } from './net/loopback';
import { offeredRules, PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ } from './net/protocol';
import { makeCanvasRecorder, VideoRing, type RecorderLike } from './playtestVideo';

/**
 * The playtest room's instruments (web sprint 33 PT-05; spec 2026-10-06-playtest-and-replay-design 4.3; research 241).
 * **PLAYTEST_INSTRUMENT_ADAPTATION -- a browser adaptation with no original**: the build-context badge, "Mark this
 * moment" (the key, the on-screen button and the pad chord), the frame grab and the telemetry bundle sent to the
 * session service. Mounted only from `./playtestReport`'s overlay (`?devmode` on a development build) when the address
 * also carries `playtest=<session socket url>` (W33.R2); without it nothing is mounted. It changes no game value and no
 * game behaviour (PT.R3): it reads the hook and the canvas, and the pad chord is read here from the two stick buttons,
 * not taken from the round's input.
 *
 * The module assigns `playtest()` on the live hook object (`host.hook()`) at mount, so `main.ts` is not edited (PT.R5).
 * The socket's wrapper (`wsSocket`) lives here, not in the overlay module, which calls no network API. The video ring
 * (PT-06, `./playtestVideo`) starts at mount where the browser records a canvas; a mark pins it and sends the clip.
 *
 * The inactivity clock (spec 4.3 and 4.4; research 241 §3, 242 §3) is the service's: the page tells it of human input
 * -- a key, a pointer press or move, a pad button or a stick past `PAD_STICK_INPUT` -- with `{ type: 'input' }`, at
 * most once every `INPUT_HEARTBEAT_S`; the service's `{ type: 'inactivity', closesInMinutes }` (its grace warning)
 * shows a line under the badge until the next human input, which is sent at once, the throttle bypassed.
 *
 * PT-22 (web sprint 35; spec 4.8, W35.R7; research 243 §7), the focused retest, PLAYTEST_INSTRUMENT_ADAPTATION: a mark's
 * telemetry also carries `kit` -- the loadout on the body (`hook.loadout().loadout`, five item ids, the form the page's
 * own `&kit=` takes, `./loadout` `kitParam`) or null -- and `feet` -- `{ at: hook.feet(), yaw: hook.pose().yaw }` (the
 * walk's feet and the look's yaw in degrees, the yaw the devmode teleport takes when given none) or null in fly mode.
 * With `&retest-at=<x,y,z[,yaw]>` in the address, on the offline path (no `server`, `mp` or `online` other than `off`)
 * and with `?devmode` on a development build, the existing devmode teleport (`hook.teleport`, `main.ts`; present with
 * `?devmode` alone) stands the player there after the spawn of the first round (the review's F1): only once the page's
 * room has started a round -- its own `roundStart` event, seen through the recorder seam these instruments already put
 * on the page's `LoopbackMatch` (PT-03; the offline solo room never sets `net().waiting`, and starts its first round,
 * which respawns everyone at a start, on the tick after the join) -- and the walk has feet and the teleport accepts it.
 * `RETEST_PLACE_PLACEHOLDER.verifyFrames` frames later the feet are checked against the target (horizontally, within
 * `reach`; the teleport picks the floor's height itself): off it, the player is placed again, at most `tries` times in
 * all. The hook's `playtest()` says `retest: 'waiting'` (no round yet, or placed and being checked), `'placed'` (the check
 * held) or `'failed'` (the tries ran out, or there is no recording to see a round by: a socket with no binary channel);
 * with no `&retest-at=` nothing here changes anything, and online it is never placed (the retest starts at the spawn).
 * A change of the recording's context (the map, the mode or online: a new segment) before the placement held makes it
 * `'failed'`: `retest-at` carries no map, so it is never placed on another one. A later round's respawn is the game's own and is not undone; a reload of the page (F5) keeps the address, so it places
 * again.
 *
 * PTT-2 (web sprint 37, W37.R3; research 243 §9), PLAYTEST_INSTRUMENT_ADAPTATION: the input heartbeat names the page's
 * effective server -- `./online` `resolveOnline`'s URL as `main.ts` holds it (`NET.url`, read through the hook's
 * `online()`; `null` offline) -- with the page's segment and map; a hook with no `online()` sends the heartbeat as before.
 * The service answers a server other than the session's own with `{ type: 'recording', segment, recording: 'none
 * (another server)', server }`, and the badge adds ANOTHER_SERVER_WORDS while the page is in that segment and still on
 * that server. Warned, never refused: nothing here changes the server the page joins.
 */

export const PLAYTEST_INSTRUMENT_ADAPTATION = 'the playtest room\'s mark, badge and telemetry: a browser adaptation with no original; ?devmode&playtest= only' as const;
/** The pad chord that marks: L3 and R3 held together this long. An owner call (HUMAN_TASKS); every pad button has a meaning in the round. */
export const MARK_PAD_CHORD_PLACEHOLDER = { buttons: [10, 11] as const, holdSeconds: 0.5 };
export const MARK_KEY = 'F8';
/** PTT-2 (W37.R3): the badge's words for a segment the session does not record; the report says the same. */
export const ANOTHER_SERVER_WORDS = 'not recorded: this page plays on another server';
/** How long the badge says "marked" after a mark (ms): a playtest instrument's confirmation with no original; the brief's two seconds. */
const MARKED_SHOWN_MS_PLACEHOLDER = 2000;
/**
 * The input heartbeat's throttle (s): at most one `input` message this often while the tester plays. A chosen value
 * with no original (the W33 close review's): far under the inactivity clock's 45 minutes, and few messages. Listed in
 * note 241 §3.
 */
export const INPUT_HEARTBEAT_S = 5;
/**
 * The retest's placement check (PT-22, the review's F1): how far (world units, horizontally) the feet may be from the
 * target and still count as placed, how many frames after a teleport they are checked, and how many teleports in all.
 * Chosen values with no original (a playtest instrument's): half a metre at `MetersPerUnit` 0.1, the review's "a frame
 * or two", and "a few tries". Listed in research 243 §3 and research 101's exclusions.
 */
export const RETEST_PLACE_PLACEHOLDER = { reach: 5, verifyFrames: 2, tries: 3 };
/** A stick counts as human input past this deflection: the close review's 0.2, a chosen value (note 241 §3), so a resting pad's drift is not input. */
const PAD_STICK_INPUT = 0.2;

export interface BuildContext { branch: string | null; created: string | null; commit: string; dirty: boolean }
export interface MarkBundle {
  observation: string;                       // assigned by the service's `mark-id` reply, else a client-side `local-<n>` the service renames
  at: string; segment: number; tick: number | null;
  frame: Blob | null;                        // PNG of the canvas, grabbed inside the frame callback
  telemetry: Record<string, unknown>;        // stats(), net(), camera(), the effective search, the badge
}
/**
 * What became of a mark's clip, in its telemetry: `pinned` (the ring pinned it; it follows the mark), `unsupported` (no
 * ring: no MediaRecorder or captureStream), `unsent` (the socket has no binary channel, so neither the `clip` message nor
 * its bytes go out: a message without its frame would pair with the wrong bytes), `stopped` (the mount was disposed
 * before the mark went out: nothing is sent).
 */
export type ClipState = 'pinned' | 'unsupported' | 'unsent' | 'stopped';
export interface PlaytestHookStats {
  session: string; segment: number; tick: number | null; marks: number; ringSeconds: number; badge: BuildContext;
  /** PT-22: present only with `&retest-at=` on the offline path -- the placement to happen or being checked, held, or given up. */
  retest?: 'waiting' | 'placed' | 'failed';
}
/** A mark's telemetry `feet` (PT-22): the walk's feet and the look's yaw (degrees), or null in fly mode. */
export interface MarkFeet { at: [number, number, number]; yaw: number | null }

/**
 * The focused retest's placement from the address (PT-22, W35.R7): `retest-at=<x,y,z>` or `<x,y,z,yaw>`, finite numbers;
 * null when absent or malformed (a malformed one warns once at the mount). Offline only: the caller checks.
 */
export function retestAtParam(search: string): { x: number; y: number; z: number; yaw?: number } | null {
  let raw: string | null;
  try { raw = new URLSearchParams(search).get('retest-at'); } catch { return null; }
  if (raw === null) return null;
  const n = raw.split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
  if ((n.length !== 3 && n.length !== 4) || !n.every(Number.isFinite)) return null;
  return { x: n[0]!, y: n[1]!, z: n[2]!, ...(n.length === 4 ? { yaw: n[3]! } : {}) };
}

export interface SessionSocket {
  send(msg: object): void;
  /** One binary frame (a clip's bytes, right after its `clip` message); a socket without it sends no bytes. */
  sendBinary?(data: Blob | Uint8Array): void;
  onMessage(fn: (msg: { type: string; [k: string]: unknown }) => void): void }

/**
 * The page's socket to the session service: JSON both ways, sends queued until the socket opens. A `playtest=` value
 * the browser refuses as a socket URL (`new WebSocket` throws) gives a socket that drops every send and never hears a
 * message, and one warning: the overlay that mounted it must not die of a mistyped address.
 */
export function wsSocket(url: string): SessionSocket {
  let ws: WebSocket;
  try { ws = new WebSocket(url); } catch (e) {
    console.warn(`playtest: ${JSON.stringify(url)} is not a session socket URL; the room's marks go nowhere`, e);
    return { send() {}, sendBinary() {}, onMessage() {} };
  }
  const queued: (string | Blob | Uint8Array)[] = [];         // text and binary frames in one queue: their order kept
  const put = (frame: string | Blob | Uint8Array): void => { if (ws.readyState === WebSocket.OPEN) ws.send(frame); else queued.push(frame); };
  ws.addEventListener('open', () => { for (const q of queued.splice(0)) ws.send(q); });
  return {
    send(msg) { put(JSON.stringify(msg)); },
    sendBinary(data) { put(data); },
    onMessage(fn) {
      ws.addEventListener('message', (e) => { try { fn(JSON.parse(String(e.data))); } catch { /* not JSON: not the service's */ } });
    },
  };
}

/** A data URL's bytes as a Blob (the `toDataURL` fallback), or null when it is not a base64 data URL. */
function dataUrlBlob(url: string | null | undefined): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url ?? '');
  if (!m) return null;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/** A Blob's bytes, through `arrayBuffer()` where the Blob has it, else a `FileReader`. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** The frame as the bundle sends it: `data:image/png;base64,...`. */
async function pngDataUrl(blob: Blob): Promise<string> {
  const bytes = await blobBytes(blob);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

const NO_BADGE: BuildContext = { branch: null, created: null, commit: '', dirty: false };

export function mountPlaytestSession(host: {
  document: Document; search: string; now(): number;
  canvas(): HTMLCanvasElement | null; hook(): ViewerHook;
  socket(url: string): SessionSocket;          // a WebSocket wrapper; tests pass a fake
  frame(cb: () => void): void;                 // runs `cb` inside the next animation frame (requestAnimationFrame)
  pads(): (Gamepad | null)[];                  // navigator.getGamepads()
  liveSearch?(): string;                       // PT-03: the address's search now (tests); absent, the page's location
}): { mark(source: 'key' | 'button' | 'pad'): Promise<MarkBundle>; dispose(): void } {
  const url = new URLSearchParams(host.search).get('playtest');
  if (!url) return { mark: () => Promise.reject(new Error('no playtest session in the address')), dispose() {} };

  const doc = host.document;
  let session = '', segment = 0, marks = 0, local = 0, disposed = false;
  let badge: BuildContext = { ...NO_BADGE };
  let markedUntil = 0, markedTimer: ReturnType<typeof setTimeout> | null = null;
  let tick: number | null = null;               // the replay tick: the last snapshot the page's room recorded (PT-03)
  const renamed = new Map<string, string>();    // local-<n> -> the service's observation id
  /** PTT-2: the service's warning -- the segment it marked and the server the page named -- or none. */
  let warned: { segment: number; server: string } | null = null;
  /** PTT-2: the page's effective server (the hook's `online().url`: `NET.url`), null offline; undefined when the hook has no `online()`. */
  const effectiveServer = (): string | null | undefined => {
    try {
      const o = host.hook()?.online?.();
      if (!o) return undefined;
      return typeof o.url === 'string' ? o.url : o.url === null ? null : undefined;
    } catch { return undefined; }
  };
  /** PTT-2: whether the badge shows the warning -- the page still in the segment warned of, on the server warned of. */
  const warning = (): boolean => warned !== null && warned.segment === segment && effectiveServer() === warned.server;
  let warningShown = false;

  // The video ring (PT-06, research 241 §4): only where the browser records a canvas (none in jsdom; headless chromium
  // has MediaRecorder but no test here runs it). Its clock is seconds on the host's clock (ms).
  const clock = (): number => host.now() / 1000;
  let ring: VideoRing | null = null, recorder: RecorderLike | null = null;
  const canvas0 = host.canvas();
  if (canvas0 && typeof (globalThis as { MediaRecorder?: unknown }).MediaRecorder === 'function'
    && typeof (canvas0 as { captureStream?: unknown }).captureStream === 'function') {
    try {
      ring = new VideoRing(() => (recorder = makeCanvasRecorder(canvas0, null, clock)), clock);
      ring.start();
    } catch (e) {
      console.warn('playtest: the video ring did not start; marks carry no clip', e);
      ring = null;
    }
  }

  // PT-22: the retest's placement, asked by the address -- dev and `?devmode` only, offline only; placed once.
  const retestAt = (() => {
    const q = new URLSearchParams(host.search);
    if (!q.has('retest-at')) return null;
    const devBuild = import.meta.env.DEV === true;
    if (!devBuild || !devSwitches(host.search, devBuild).tools || addressOnline(host.search)) return null;
    const at = retestAtParam(host.search);
    if (at === null) console.warn(`playtest: retest-at=${JSON.stringify(q.get('retest-at'))} is not x,y,z or x,y,z,yaw; the retest starts at the spawn`);
    return at;
  })();
  /** The placement's state (F1): before a teleport, a teleport being checked, held, or given up; the teleports made. */
  let placing: 'waiting' | 'checking' | 'placed' | 'failed' = 'waiting';
  let teleports = 0, checkIn = 0;
  /** PT-22's diagnostics: what each failed check saw (the failure's line names them). */
  const misses: unknown[] = [];
  /**
   * The page's room's rounds started, as its own `roundStart` events reach the recorder seam (F1) -- the room's now
   * building: a room made again (`main.ts` `connectNet`, e.g. the play clips answered after the room was made) starts
   * at none, so the retest is placed after that room's own first round, never before its round start's spawn.
   */
  let roundsStarted = 0;
  /** A `LoopbackMatch` constructed (the recorder's provider): its rounds counted afresh; a placement not yet held waits for them. */
  const roomBuilt = (): void => {
    roundsStarted = 0;
    if (placing === 'checking') placing = 'waiting';
    teleports = 0;                                               // the old room's teleports are not this room's tries
  };
  const stats = (): PlaytestHookStats => ({
    session, segment, tick, marks, ringSeconds: ring?.held() ?? 0, badge: { ...badge },
    ...(retestAt !== null ? { retest: placing === 'checking' ? 'waiting' as const : placing } : {}),
  });
  const assignHook = (): void => {
    try { const h = host.hook(); if (h && h.playtest !== stats) h.playtest = stats; } catch { /* no hook yet */ }
  };
  assignHook();

  // The badge: top-left, from the session message; the page never invents a creation time.
  const badgeEl = doc.createElement('div');
  badgeEl.id = 'playtest-badge';
  badgeEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:10001;background:#101923cc;color:#eff8ff;'
    + 'border:1px solid #607486;border-radius:6px;padding:3px 8px;font:11px/1.4 monospace;pointer-events:none';
  const drawBadge = (): void => {
    const created = badge.created ? new Date(badge.created).toLocaleString() : 'unknown';
    const marked = host.now() < markedUntil ? ' · marked' : '';
    warningShown = warning();
    const elsewhere = warningShown ? ` · ${ANOTHER_SERVER_WORDS}` : '';
    badgeEl.textContent = `${badge.branch ?? 'no branch'} · Created: ${created} · ${badge.commit.slice(0, 7)}${badge.dirty ? '*' : ''}${marked}${elsewhere}`;
  };

  const button = doc.createElement('button');
  button.type = 'button';
  button.id = 'playtest-mark';
  button.textContent = 'Mark this moment';
  button.style.cssText = 'position:fixed;left:8px;top:34px;z-index:10001;font:11px monospace';

  /**
   * PT-22 (the re-review's nit): the retest's place belongs to the context it launched in -- `retest-at` carries no map --
   * so a context change (the map, the mode or online: a new segment) before it is placed gives it up, never placing on
   * another context. A placement already held is left as it is.
   */
  const abandonRetest = (): void => {
    if (retestAt === null || placing === 'placed' || placing === 'failed') return;
    placing = 'failed';
    console.warn('playtest: the map or the mode changed before the retest was placed; it is not placed on another map');
  };

  const socket = host.socket(url);

  // ---- PT-03: the recording (research 240 §5; REPLAY_ADAPTATION and PLAYTEST_INSTRUMENT_ADAPTATION, no original) ----
  // The page's room is built in `main.ts`, never edited by the playtest lane (PT.R5): the recorder reaches it through
  // `setLoopbackDefaults`, whose provider is read when each `LoopbackMatch` is constructed. Each flush (~1 s, 30
  // snapshots) is one binary frame over the session socket's `sendBinary` (none: no recording, `recording: 'unsent'`).
  // The rotation is the page's own: a new segment opens when the map (the address's `map=<stem>`, which `main.ts` writes
  // when a load starts; the hook's `stats().map` only without it), the address's `mode` or online/offline (`server`,
  // `mp`, `online=shared|local`; `online=off` is offline) changes: `segmentEnd` for the old, then `segment` with the new header before its first frame; the
  // video ring restarts at every boundary. The context is checked at every frame AND when a room is constructed, so a
  // room built in the same tick its map changed still takes the new segment's recorder. A mode change without a rebuild
  // leaves the running room on the closed recorder, and the new segment records from the next room. Online the page
  // records nothing (no `LoopbackMatch` is built; the match server records the match): such a segment takes its index
  // and opens no file, no `segment` message is sent, and the telemetry says `recording: 'server'`.
  const recording = (() => {
    const sendBinary = socket.sendBinary?.bind(socket);
    /** What a room records into: one per segment; `target` moves only when the service refuses the segment's index. */
    type Target = RoomRecorder & { target: FileRecorder };
    let file: FileRecorder | null = null, room: Target | null = null, context = '', started = false;
    const search = (): string => { try { return host.liveSearch?.() ?? doc.defaultView?.location?.search ?? host.search; } catch { return host.search; } };
    const statsMap = (): string => { try { const m = (host.hook()?.stats?.() as { map?: unknown } | undefined)?.map; return typeof m === 'string' ? m : ''; } catch { return ''; } };
    const map = (): string => new URLSearchParams(search()).get('map') ?? statsMap();
    // Online as the page reads its address (`./addressOnline`, the one rule; ADDR-ONLINE): `server=` or `mp` join a
    // server, and `online=` only when it names one (`shared`, `local`, any case). The page writes its Online setting into
    // the address, so an offline page's address carries `online=off`: that is offline, and the page records (the e2e's
    // red after the close round).
    const online = (): boolean => addressOnline(search());
    const contextNow = (): string => JSON.stringify([map(), new URLSearchParams(search()).get('mode'), online()]);
    const newFile = (): FileRecorder => {
      const header: ReplayHeader = {
        format: REPLAY_FORMAT_VERSION, protocol: PROTOCOL_VERSION,
        build: { commit: badge.commit, dirty: badge.dirty, branch: badge.branch, branchCreated: badge.created },
        // The map's stem from the address (else the hook's name); the rules the page's room is offered with none asked
        // (`offeredRules`: classic when none is asked, the original's default); the game type is not on the hook.
        map: map(), rules: offeredRules(null), gameType: null, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, kind: 'solo',
        serverName: null, startedAt: new Date().toISOString(), session: { id: session, segment },
      };
      socket.send({ type: 'segment', header });
      return new FileRecorder(header, (bytes) => sendBinary!(bytes), undefined /* flushEvery: the recorder's ~1 s */, (e) => console.warn('playtest: the recording stopped', e));
    };
    /** Opens the segment's page-side recorder -- offline only; online the server records and nothing opens here. */
    const open = (): void => {
      if (online()) { file = null; room = null; return; }
      const rec = newFile();
      file = rec;
      const w: Target = {
        target: rec,
        snapshot: (t, bodies, doors, env) => { if (file === w.target) tick = t; w.target.snapshot(t, bodies, doors, env); },
        event: (t, ev) => { if ((ev as { type?: unknown }).type === 'roundStart') roundsStarted++; w.target.event(t, ev); },
        players: (t, list) => w.target.players(t, list),
        command: (t, id, cmd) => w.target.command(t, id, cmd), close: (reason) => w.target.close(reason),
        hostages: (t, list) => w.target.hostages(t, list),   // RE-2 (W38.R2): the roster, at each file's open and on a change
      };
      room = w;
    };
    const rotate = (reason: string): void => {
      if (file) { file.close(reason); socket.send({ type: 'segmentEnd', segment, reason }); }
      segment += 1;
      open();
    };
    /** The context checked: a change rotates the segment and restarts the video ring, so a clip never spans two. */
    const check = (): void => {
      if (!started) return;
      const now = contextNow();
      if (now !== context) { context = now; rotate('context changed'); ring?.restart(); abandonRetest(); }
    };
    return {
      start(): void {
        if (started || !sendBinary) return;
        started = true;
        context = contextNow(); open();
        // Read at each `LoopbackMatch` construction: the context first, so a room built as its map changes takes the new segment.
        setLoopbackDefaults(() => { try { check(); } catch { /* the room is built regardless */ } roomBuilt(); return room ? { recorder: room } : {}; });
      },
      frame: check,
      message(msg: { type: string; [k: string]: unknown }): void {
        // The service refused this segment's index (another page kept it): the same segment, renumbered; the rooms
        // already built follow it (their recorder's target moves), the refused recorder's bytes are abandoned.
        if (msg.type === 'segmentRefused' && msg.index === segment && Number.isInteger(msg.next) && room) {
          segment = msg.next as number;
          const rec = newFile();
          file = rec;
          room.target = rec;
        }
      },
      mark(t: number | null, observation: string, at: string): void { file?.mark(t ?? 0, observation, at); },
      /** PTT-2: the map the segment plays (the heartbeat names it). */
      map,
      state(): 'off' | 'unsent' | 'server' | 'streaming' | 'failed' {
        return !sendBinary ? 'unsent' : !started ? 'off' : online() ? 'server' : !file ? 'off' : file.failed ? 'failed' : 'streaming';
      },
      /**
       * PT-23b: the service's `closing` -- the segment's recorder closed (its buffered records and the `end` flushed;
       * `FileRecorder` sends only every `flushEvery` snapshots) and `segmentEnd` sent, so the service closes the segment
       * on it; nothing is recorded after. The seam is left as it is: the rooms built keep a closed recorder.
       */
      end(reason: string): void {
        if (file) { file.close(reason); socket.send({ type: 'segmentEnd', segment, reason }); }
        file = null; room = null; started = false;
      },
      dispose(): void {
        if (file) { file.close('disposed'); socket.send({ type: 'segmentEnd', segment, reason: 'disposed' }); file = null; room = null; }
        started = false;
        setLoopbackDefaults({});
      },
    };
  })();

  // ---- the inactivity clock's two page-side halves (spec 4.3, 4.4): the input heartbeat and the grace line ----
  let lastInputAt: number | null = null;
  const graceEl = doc.createElement('div');
  graceEl.id = 'playtest-inactivity';
  graceEl.style.cssText = 'position:fixed;left:8px;top:60px;z-index:10001;background:#101923cc;color:#ffd27a;'
    + 'border:1px solid #607486;border-radius:6px;padding:3px 8px;font:11px/1.4 monospace;pointer-events:none';
  const showGrace = (minutes: number): void => {
    const n = Number.isFinite(minutes) && minutes > 0 ? minutes : 2;
    graceEl.textContent = `No input for a while: this playtest closes in ${n} minute${n === 1 ? '' : 's'} unless you move or press a key`;
    if (!graceEl.isConnected) doc.body.append(graceEl);
  };
  /** Human input seen: `input` to the service at most once every INPUT_HEARTBEAT_S -- at once while the grace line shows, which it clears. */
  const humanInput = (): void => {
    if (disposed) return;
    const now = host.now();
    const grace = graceEl.isConnected;
    if (grace) graceEl.remove();
    if (!grace && lastInputAt !== null && now - lastInputAt < INPUT_HEARTBEAT_S * 1000) return;
    lastInputAt = now;
    // PTT-2 (W37.R3): the page's effective server, its segment and map; an older hook (no `online()`) sends as before
    const server = effectiveServer();
    socket.send(server === undefined ? { type: 'input' } : { type: 'input', server, segment, map: recording.map() });
  };
  const onInput = (): void => { humanInput(); };
  doc.addEventListener('keydown', onInput);
  doc.addEventListener('pointerdown', onInput);
  doc.addEventListener('pointermove', onInput);     // throttled by humanInput: one message per INPUT_HEARTBEAT_S at most
  const padInput = (pads: (Gamepad | null)[]): boolean => pads.some((p) => !!p
    && (Array.from(p.buttons ?? []).some((b) => !!b?.pressed) || Array.from(p.axes ?? []).some((a) => Math.abs(a) > PAD_STICK_INPUT)));

  // PT-13 (research 242 §6): the clips still to go out -- a mark's pin until its clip is sent (or has no bytes).
  const pendingClips = new Set<Promise<unknown>>();
  /**
   * The service's `closing` (its closeout): the video ring stops, so an open pin resolves `cut` with what was recorded
   * and its clip is sent; once every clip in flight is out, `{ type: 'flushed' }`. Answered after a dispose too (the
   * socket outlives the mount, and a sent mark's clip is still sent). PT-23b: first the recording is closed -- its
   * unflushed tail (up to `flushEvery` snapshots, a mark made in it) and its `end` record sent, then `segmentEnd` --
   * so the segment the service closes is whole, before any wait on a clip.
   */
  const flush = async (): Promise<void> => {
    ring?.stop();
    recording.end('closed');
    while (pendingClips.size > 0) await Promise.allSettled([...pendingClips]);
    socket.send({ type: 'flushed' });
  };

  socket.onMessage((msg) => {
    if (msg.type === 'closing') { void flush(); return; }
    if (disposed) return;
    recording.message(msg);
    if (msg.type === 'session') {
      session = String(msg.id ?? '');
      segment = Number(msg.segment ?? 0);
      const b = (msg.badge ?? {}) as Partial<BuildContext>;
      badge = { branch: b.branch ?? null, created: b.created ?? null, commit: String(b.commit ?? ''), dirty: !!b.dirty };
      drawBadge();
      if (!badgeEl.isConnected) doc.body.append(badgeEl, button);
      recording.start();
    } else if (msg.type === 'recording' && Number.isInteger(msg.segment) && typeof msg.server === 'string') {
      warned = { segment: msg.segment as number, server: msg.server };       // PTT-2: the service marked a segment
      if (badgeEl.isConnected) drawBadge();
    } else if (msg.type === 'inactivity') {
      showGrace(Number(msg.closesInMinutes));
    } else if (msg.type === 'marked' && typeof msg.local === 'string' && typeof msg.observation === 'string') {
      renamed.set(msg.local, msg.observation);
    }
  });

  /** PT-22: the kit on the body, as `&kit=` takes it (five item ids 0-255), or null. */
  const readKit = (): number[] | null => {
    try {
      const ids = (host.hook() as unknown as { loadout?: () => { loadout?: unknown } }).loadout?.()?.loadout;
      return Array.isArray(ids) && ids.length === 5 && ids.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ? [...ids] as number[] : null;
    } catch { return null; }
  };
  /** PT-22: the walk's feet and the look's yaw (degrees), or null in fly mode (or a hook without them). */
  const readFeet = (): MarkFeet | null => {
    try {
      const h = host.hook() as unknown as { feet?: () => unknown; pose?: () => { yaw?: unknown } };
      const f = h.feet?.();
      if (!Array.isArray(f) || f.length !== 3 || !f.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
      let yaw: number | null = null;
      try { const y = h.pose?.()?.yaw; yaw = typeof y === 'number' && Number.isFinite(y) ? y : null; } catch { yaw = null; }
      return { at: [f[0], f[1], f[2]] as [number, number, number], yaw };
    } catch { return null; }
  };
  /**
   * PT-22: the retest's placement (the review's F1). Waiting: once the page's room has started a round (its `roundStart`
   * through the recorder seam), the walk has feet, no round is waiting and the teleport accepts, the player is stood at
   * the mark's feet (a refusal -- the room has no body yet -- is tried again on the next frame and is not a try).
   * Checking: `verifyFrames` frames later, the feet within `reach` of the target (horizontally) hold it as placed; off it
   * (the round's respawn came after the teleport), it is placed again, up to `tries` teleports, then failed. With no
   * recording (a socket without a binary channel) no round can be seen: failed at once, the retest starts at the spawn.
   */
  const place = (): void => {
    if (retestAt === null || placing === 'placed' || placing === 'failed') return;
    if (!socket.sendBinary) {
      placing = 'failed';
      console.warn('playtest: no recording, so no round start to place the retest after; the retest starts at the spawn');
      return;
    }
    try {
      const h = host.hook() as unknown as {
        feet?: () => unknown; net?: () => { waiting?: unknown } | null; teleport?: (x: number, y: number, z: number, yaw?: number) => boolean;
        pad?: () => { input?: unknown } | null; mover?: () => unknown; loading?: () => { blocked?: unknown } | null;
      };
      const feet = h.feet?.();
      if (placing === 'checking') {
        checkIn -= 1;
        if (checkIn > 0) return;
        const f = Array.isArray(feet) ? feet as number[] : null;
        if (f !== null && Math.hypot(f[0]! - retestAt.x, f[2]! - retestAt.z) <= RETEST_PLACE_PLACEHOLDER.reach) { placing = 'placed'; return; }
        // What the check saw, for the failure's line (a playtest instrument's diagnostics): the feet, the pad's input fed
        // to the walk this frame, the mover's state (`hook.pad`, `hook.mover`), each read on its own.
        const seen = (fn: () => unknown): unknown => { try { return fn() ?? null; } catch { return null; } };
        misses.push({ try: teleports, feet: f, input: seen(() => h.pad?.()?.input), mover: seen(() => h.mover?.()) });
        if (teleports >= RETEST_PLACE_PLACEHOLDER.tries) {
          placing = 'failed';
          console.warn(`playtest: the retest's placement did not hold after ${teleports} tries; the player is where the game put him (feet ${JSON.stringify(f)}, rounds ${roundsStarted}; the checks ${JSON.stringify(misses)})`);
          return;
        }
        placing = 'waiting';                                   // placed again below, this frame
      }
      if (roundsStarted === 0 || typeof h.teleport !== 'function' || feet == null) return;
      if (h.net?.()?.waiting === true) return;
      // Not under the loading screen's hold (`./loadingJoin`): it waits for the play clips, and `main.ts` makes the offline
      // room again when they come (`connectNet`, `solo.clips`) -- a placement before then is undone by that room's spawn.
      if (h.loading?.()?.blocked === true) return;
      if (h.teleport(retestAt.x, retestAt.y, retestAt.z, retestAt.yaw) === true) {
        teleports += 1;
        placing = 'checking';
        checkIn = RETEST_PLACE_PLACEHOLDER.verifyFrames;
      }
    } catch { /* the hook is not ready: tried again on the next frame */ }
  };

  /** Each hook member read in its own `try`: an older hook without it, or one that throws, is null. */
  const read = (name: 'stats' | 'net' | 'camera'): unknown => {
    try { const h = host.hook() as unknown as Record<string, unknown>; const fn = h?.[name]; return typeof fn === 'function' ? (fn as () => unknown).call(h) ?? null : null; } catch { return null; }
  };

  /** The canvas as a PNG, grabbed inside the frame callback: `toBlob`, else `toDataURL`. */
  const grab = (): Promise<Blob | null> => new Promise((resolve) => {
    host.frame(() => {
      const canvas = host.canvas();
      if (!canvas) { resolve(null); return; }
      try {
        if (typeof canvas.toBlob === 'function') canvas.toBlob((b) => resolve(b), 'image/png');
        else resolve(dataUrlBlob(canvas.toDataURL('image/png')));
      } catch { resolve(null); }
    });
  });

  const mark = async (source: 'key' | 'button' | 'pad'): Promise<MarkBundle> => {
    // 1. the tick is bookmarked (the bundle carries it; the `mark` record is PT-03's recorder's)
    const id = `local-${++local}`, at = new Date().toISOString(), seg = segment, t = tick, markedAt = clock();
    recording.mark(t, id, at);                   // PT-03: the `mark` record in the open segment (the service renames `local-<n>`)
    marks++;
    markedUntil = host.now() + MARKED_SHOWN_MS_PLACEHOLDER;
    if (badgeEl.isConnected) drawBadge();
    if (markedTimer) clearTimeout(markedTimer);
    markedTimer = setTimeout(() => { markedTimer = null; if (!disposed && badgeEl.isConnected) drawBadge(); }, MARKED_SHOWN_MS_PLACEHOLDER);
    // 2. the frame
    const frame = await grab();
    // 3. the video ring's pin, at the bookmark's moment: it resolves once the after-window is recorded (or cut by a
    //    segment's restart or the dispose); its clip goes out after the mark's message (step 5). Only where a clip can
    //    go out whole: a socket without a binary channel gets none.
    const clip: ClipState = disposed ? 'stopped' : !ring ? 'unsupported' : !socket.sendBinary ? 'unsent' : 'pinned';
    const pinned = clip === 'pinned' ? ring!.pin(markedAt) : null;
    // 4. the telemetry
    const telemetry: Record<string, unknown> = {
      stats: read('stats'), net: read('net'), camera: read('camera'), search: host.search, badge: { ...badge }, source, tick: t, clip,
      kit: readKit(), feet: readFeet(),
    };
    telemetry['recording'] = recording.state();
    const bundle: MarkBundle = { observation: id, at, segment: seg, tick: t, frame, telemetry };
    // 5. the bundle sent, the frame as a base64 PNG
    let png: string | null = null;
    try { png = frame ? await pngDataUrl(frame) : null; } catch { png = null; }
    // A dispose during the frame grab or the PNG's encoding sends nothing: neither the mark nor a clip under an id the
    // service never received.
    if (disposed) { telemetry.clip = 'stopped'; return bundle; }
    socket.send({ type: 'mark', bundle: { ...bundle, frame: png } });
    // ... then the clip: a `clip` message and its bytes -- the ring's playable file, the stream's init segment and whole
    // clusters (research 241 §4) -- as one binary frame. A clip of a sent mark cut later by the dispose is still sent:
    // the socket outlives the mount, and a cut clip says so (`cut`). A clip with no bytes (no Cluster seen yet) sends
    // nothing: the service pairs a `clip` message with the socket's next binary frame, which would be another's.
    if (pinned) {
      const mime = recorder?.mime ?? 'video/webm';
      const sent = pinned.then(({ from, to, cut, bytes, why }) => {
        if (!bytes) { console.warn(`playtest: no clip for ${renamed.get(id) ?? id}: ${why ?? 'no bytes'}`); return; }
        socket.send({ type: 'clip', observation: renamed.get(id) ?? id, from, to, mime, cut });
        socket.sendBinary!(bytes);
      });
      pendingClips.add(sent);                     // PT-13: `closing` waits for it before `flushed`
      const done = (): void => { pendingClips.delete(sent); };
      sent.then(done, done);
    }
    const named = renamed.get(id);
    if (named) bundle.observation = named;
    return bundle;
  };

  const onKey = (e: KeyboardEvent): void => { if (e.key === MARK_KEY && !e.repeat) void mark('key'); };
  doc.addEventListener('keydown', onKey);
  const onButton = (): void => { void mark('button'); };
  button.addEventListener('click', onButton);

  // The pad chord: L3 and R3 (standard mapping 10 and 11) held together holdSeconds; once per hold.
  let holdStart: number | null = null, holdFired = false;
  const poll = (): void => {
    if (disposed) return;
    assignHook();
    recording.frame();
    if (badgeEl.isConnected && warning() !== warningShown) drawBadge();    // PTT-2: the page left (or came to) the warned server
    place();
    let pads: (Gamepad | null)[] = [];
    try { pads = Array.from(host.pads() ?? []); } catch { pads = []; }
    if (padInput(pads)) humanInput();
    const held = pads.some((p) => !!p && MARK_PAD_CHORD_PLACEHOLDER.buttons.every((i) => p.buttons?.[i]?.pressed));
    if (!held) { holdStart = null; holdFired = false; return; }
    const now = host.now();
    if (holdStart === null) holdStart = now;
    if (!holdFired && now - holdStart >= MARK_PAD_CHORD_PLACEHOLDER.holdSeconds * 1000) { holdFired = true; void mark('pad'); }
  };
  // Driven by the page's animation frames; a host whose `frame` calls back at once (a test) drives `poll()` itself.
  const schedule = (): void => {
    let sync = true;
    host.frame(() => { if (sync || disposed) return; poll(); schedule(); });
    sync = false;
  };
  schedule();

  const dispose = (): void => {
    disposed = true;
    recording.dispose();
    ring?.stop();
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('keydown', onInput);
    doc.removeEventListener('pointerdown', onInput);
    doc.removeEventListener('pointermove', onInput);
    graceEl.remove();
    button.removeEventListener('click', onButton);
    if (markedTimer) clearTimeout(markedTimer);
    badgeEl.remove();
    button.remove();
    try { const h = host.hook(); if (h && h.playtest === stats) delete h.playtest; } catch { /* gone */ }
  };

  return Object.assign({ mark, dispose }, { poll });
}

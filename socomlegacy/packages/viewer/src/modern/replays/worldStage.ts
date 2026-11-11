import { replayDiscRequest } from '../../discPrompt';
import type { HandedDiscRequest } from '../../discSource';
import type { ServerEvent } from '../../net/protocol';
import type { LoadedSegment, ReplayClient, ReplaySeek } from '../../replay/replayClient';
import { loadKindOf, replayMapRefusal, type ReplayLoadKind } from '../../replay/refusalKind';
import { keepCameraChoice, readCameraChoice, type CameraChoiceStore } from './cameraChoice';
import { askReplayGrant, publicReplayAddress, replayAddress, type ReplayEntry } from './data';
import type { ReplayStage, ReplayStageContext, SpectatorControls, SpectatorMode } from './stage';
import type { TransportClient } from './transport';
import { installReplayWorld, REPLAY_WORLD_PARAM, uninstallReplayWorld, type ReplayWorldHost, type ReplayWorldPage } from './worldHost';

/**
 * The stage that draws the match's world (MU-11 of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R9: the replay
 * viewer "polish and release ready"). A browser adaptation (MU.R1, REPLAY_ADAPTATION): SOCOM II plays no recording back.
 *
 * **Where the world comes from.** The game page -- `../../main.ts`, the test room -- draws the world, for one map on one
 * canvas, and the shell lives on the setup page, which never imports it (`../../pageEntry`); lifting a builder out of
 * `main.ts`'s module state is not a contained change. So the viewer frames the test room in its own page:
 * `<base>testroom?replayview&map=<the recording's map>`, a same-origin frame in the viewer's world place, and hangs the
 * host on the frame element (`./worldHost`) -- the test room builds the watcher's `NetPage` the replay mode builds
 * (PT-18), with this page's client. The map is the recording's header's (as `../../replay/mount`'s map rule), read
 * before the frame is made, so a refused fetch makes no frame at all.
 *
 * **What travels, and how.** The hosted replay is fetched here (CX-13 removed `./stage`'s world-less `engineStage`): the existing
 * `loadSegment` (`../../replay/load`) on `GET <base>/replays/<id>`, the session's ticket its bearer -- the ticket stays in
 * this page's memory, and neither it nor the segment's address is in the frame's address. The frame's page gets, in
 * memory through the host: the client factory (the existing `ReplayClient` on the segment loaded here, no second
 * decoder), and the disc the setup page opened, as its request (`../../discPrompt` `replayDiscRequest`: an image or,
 * DA-4, a folder -- or, LATER 322, the copy kept in this browser the launcher started from, `{ kind: 'stored' }`; none,
 * and the test room's own disc page asks for it).
 *
 * SA-9b (`../../connectHost` `REPLAY_DOOR_ADAPTATION`): a replay a host keeps (`entry.host`) is not at
 * `<base>/replays/<id>` -- `segmentFor` asks central for a grant at Watch (`./data` `askReplayGrant`) and fetches the
 * door it names with the grant as bearer (`loadSegment`'s door), the grant in this function's memory only -- never
 * in storage, an address, or the frame's. A door's refusal (`REPLAY_DOOR_REFUSED`: its 404 or a throw, a grant that
 * may have run out on the way) is re-asked exactly once -- one more grant, one more fetch -- then stands; no clock is
 * compared (central's `expiresAt` and this page's clock are two clocks). LCM-RP (RB-11, `../../replay/load`
 * `REPLAY_PUBLIC_FETCH_ADAPTATION`): a page with no ticket asks no grant -- central's public fetch, followed to its door.
 *
 * **The transport drives the page's client.** The handle's `client` is this page's view of the client the test room
 * holds now (`WorldClient`): each call goes to it, its events reach the viewer. The test room makes its room again on
 * some changes (`connectNet` closes the old client first); a fresh `ReplayClient` is made for it on the same segment
 * and put at the place the old one stood -- the tick, the speed, paused or playing. The client's seeks (`onSeek`, RV-2,
 * research 276 §1) are followed across the swap, the old client's let go; the seek that puts the fresh one at the old
 * place is the stage's, not the watcher's, and is not told.
 *
 * **The camera.** The spectator's modes -- `../../spectatorView`'s three, the camera's byte at +0xf4 of
 * `FUN_00295260` (D:L139463-139590): follow, free, the map's scenic views -- are offered once the page is built, each
 * button pressing the original's own control on the page's spectator view (`cameraPresses`): X, the next player, the
 * next scenic view. What the view's own keys change inside the frame, the buttons follow (`current`).
 *
 * **The camera at open** (RV2-06, RV2.R1: the owner's word "make the default camera type be player"; a browser
 * adaptation -- the live spectator's start, `SPECTATOR_START_READING` free / free, `FUN_00295260`, is the original's and
 * stands). The viewer chooses: the kept choice (`./cameraChoice`, `s2u.replay.camera.v1`), else follow -- PLAYER -- and
 * the stage presses it on the page's spectator view (`cameraPresses` from where the view stands) at `attached`; a camera
 * button's press is the new choice, kept. A press lands only where the original's control can act: Right binds a player
 * only with someone alive in the client's bodies (`SpectatorView`'s `next`), which a client not yet open, or a classic
 * recording's launch span, may not have. So the choice waits until it lands -- pressed again at each read of `current`,
 * which the viewer makes once a frame (`./view` `syncCameras`), and the strip shows the choice meanwhile, before the
 * page exists included. A round's turnover is one more such wait: the page sets a spectator back to free at `roundStart`
 * (SPECTATOR_TURNOVER_EVENT_READING, the original's reset, untouched), and the stage, told the same `roundStart` by the
 * client, presses the choice again after it, as the watcher would. A seek's welcome is no turnover (REPLAY-SEEK-KEEP).
 *
 * **The world's ready** (RV2-03, RV2.R2: no tick advances while the world's loading screen shows). Each client the test
 * room takes is made held (`ReplayClientOptions.autoplay` false: paused at its start, seeks still landing) and the stage
 * releases it when the test room says its loading screen has gone (`ReplayWorldHost.ready`: `main.ts` at `loadingJoin`'s
 * release or failure); it then plays, once. The rebuild rule: a client the test room takes once the stage is released --
 * a room made again after the hide -- is released at its take (`WorldClient.take` then puts it at the old place, paused
 * if the watcher had paused); a room made again during the hold stays held until the ready.
 *
 * **A world that does not open** says so: the test room's own failure in its words (`failed`: the disc refused, a decode
 * failed, no renderer), and a world not ready within `MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION` with a sentence -- the
 * client refused, which the transport shows. Both refuse while the recording is held (RV2-03), as before the room was
 * built; once it plays, the page's later word leaves it as it is.
 *
 * The ISO lock stays the viewer's (`./view`: Watch locked until the disc is in; a disc taken out disposes the stage).
 * Dispose closes the client and takes the frame away -- its page, its world and its workers with it.
 */

/** The camera's modes, in the button order: the spectator camera's own (`../../spectatorView` `SpectatorMode`). */
export const CAMERA_MODES: readonly SpectatorMode[] = Object.freeze([
  { id: 'follow', label: 'Follow a player', icon: 'user' },
  { id: 'free', label: 'Free camera', icon: 'eye' },
  { id: 'scenic', label: 'Scenic views', icon: 'display' },
]);

/**
 * The original's controls that take the spectator camera from `mode` (its remembered mode `remembered`) to `want`, as
 * key codes of `../../spectatorView`'s keys: X (`KeyX`, `spectatorToggle`) goes free from follow or scenic, and from
 * free back to the remembered mode; else the next player (`ArrowRight`) enters follow, the next scenic view (`ArrowUp`)
 * the scenic views. Nothing for the mode it is in, or an unknown one.
 */
export function cameraPresses(mode: string, remembered: string, want: string): string[] {
  if (want === mode || !CAMERA_MODES.some((m) => m.id === want)) return [];
  if (want === 'free' || (mode === 'free' && remembered === want)) return ['KeyX'];
  return [want === 'follow' ? 'ArrowRight' : 'ArrowUp'];
}

/**
 * MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION: how long the viewer waits, from the frame's making, for the test room to build
 * its room (index the disc image, load the map, take the client) and -- RV2-03 -- hide its loading screen
 * (`ReplayWorldHost.ready`) before it says the world did not open; the wait starts again at the room's first take (the
 * RV2 batch review's F6), so the warm-up and the world's load each have it. A browser adaptation (MU.R1): the game plays no
 * recording back, so there is nothing of it to read; a disc index and a map's first load run some seconds to some tens
 * of seconds, and this is well past them. The test room's own failures are said at once (`ReplayWorldHost.failed`); this
 * catches the silent one.
 */
export const MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION = 120_000;

/** The test room's address for `map` under the page's base (Vite's `base`). */
export function worldAddress(map: string, base: string = import.meta.env.BASE_URL ?? '/'): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}testroom?${REPLAY_WORLD_PARAM}&map=${encodeURIComponent(map)}`;
}

export interface WorldStageOptions {
  /** Where the frame is made; absent, the page's. */
  document?: Document;
  /** The test room's address for a map; absent, `worldAddress`. */
  address?: (map: string) => string;
  /** The disc, image, folder or (LATER 322) the kept copy, as its request; absent, the page's (`replayDiscRequest`). */
  disc?: () => HandedDiscRequest | null;
  /** The replay clock's wall clock (tests); absent, the client's own. */
  now?: () => number;
  /** A one-shot timer answering its cancel (tests); absent, `setTimeout`. */
  timer?: (run: () => void, ms: number) => () => void;
  /** RV2-06: where the camera choice is kept (tests); absent, the page's settings (`./cameraChoice`). */
  cameras?: CameraChoiceStore;
}

type Listener = (ev: ServerEvent) => void;
type SeekListener = (seek: ReplaySeek) => void;

/**
 * The client the viewer's transport drives: the `ReplayClient` the test room holds now, or, before it takes one, a
 * client still connecting (or refused, when the fetch was). Every member `TransportClient` reads, forwarded. RV2-02
 * (RV2.R2; W39.R2, additive): with the engine's hold (`held`), and exported for its tests.
 */
export class WorldClient implements TransportClient {
  readonly ready: Promise<void>;
  private settle!: () => void;
  private now: ReplayClient | null = null;
  private off: (() => void) | null = null;
  private fault: string | null = null;
  private faultKind: ReplayLoadKind | null = null;
  private closed = false;
  private readonly listeners = new Set<Listener>();
  /** RV-2: the transport's seek listeners, and the subscription on the client now. */
  private readonly seekers = new Set<SeekListener>();
  private offSeek: (() => void) | null = null;
  /** RV-2: the fresh client being put at the old one's place (`take`): its seek is not the watcher's, so not told. */
  private restoring = false;

  constructor() {
    this.ready = new Promise((res) => { this.settle = res; });
  }

  get state(): ReplayClient['state'] {
    if (this.closed) return 'closed';
    if (this.fault !== null) return 'refused';
    return this.now?.state ?? 'connecting';
  }
  get segment(): LoadedSegment | null { return this.now?.segment ?? null; }
  /**
   * MU2-14: the refusal's kind beside its sentence -- the fetch's (`fail`'s `kind`), else the client's now
   * (`ReplayClient.refusedKind`); null for a text-only reason (the test room's failure, the timeout, another map).
   */
  get refusedKind(): ReplayLoadKind | null {
    if (this.fault !== null) return this.faultKind;
    return this.now?.refusedKind ?? null;
  }

  /**
   * The fetch failed, or the world never opened: refused with its sentence, no client to come. MU2-14: `kind` is the
   * loader's (`loadKindOf` of the fetch's error), null for a reason that never came through it. RV2-03: a client taken
   * but still held (`ReplayClient.held`: the world's loading screen not yet gone) is no world yet, so it refuses too; a
   * client released and playing is left as it is, and one that refused itself (another map) keeps its own sentence.
   */
  fail(reason: string, kind: ReplayLoadKind | null = null): void {
    const now = this.now;
    if (this.closed || (now && (!now.held() || now.state === 'refused'))) return;
    this.fault = reason;
    this.faultKind = kind;
    this.emit({ type: 'refused', reason });
    this.settle();
  }

  /** Where an open client stands -- kept as it closes, for the client made after it. */
  private place: { tick: number; rate: number; playing: boolean } | null = null;
  private hold(c: ReplayClient): void {
    if (c.state === 'open') this.place = { tick: c.serverTick(), rate: c.rate(), playing: c.playing() };
  }

  /**
   * The test room took `c` (its first, or a fresh one for a room made again): the viewer follows it, at the place the
   * one before stood. The page closes its old client before it makes the next (`NetPage.close`, `connectNet`), and a
   * close pauses the clock, so each client's own close keeps its place first. RV2-02: a held client is never playing
   * (`ReplayClient.held`: its clock stays paused until `release`), so a place kept under the hold is a paused one and
   * the fresh client is put there paused -- a rebuild never resumes under the hold; a fresh client made held stays held.
   */
  take(c: ReplayClient): void {
    const was = this.now;
    if (was) { this.hold(was); was.close(); }
    this.off?.();
    this.offSeek?.();
    this.offSeek = null;
    const place = this.place;
    this.place = null;
    const shut = c.close.bind(c);
    c.close = (): void => { this.hold(c); shut(); };
    this.now = c;
    this.off = c.on((ev) => { this.emit(ev); });
    if (this.closed) { c.close(); return; }
    this.offSeek = c.onSeek((s) => { if (!this.restoring) for (const l of [...this.seekers]) l(s); });
    void c.ready.then(() => {
      if (place && c.state === 'open') {
        c.speed(place.rate);
        this.restoring = true;
        try { c.seek(place.tick); } finally { this.restoring = false; }
        if (!place.playing) c.pause();
      }
      this.settle();
    });
  }

  private emit(ev: ServerEvent): void { for (const l of [...this.listeners]) l(ev); }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    // MU2-13: a fetch refused before the viewer listened (its subscription follows `open`'s answer) is told to the late
    // listener at once, so the refusal's sentence -- an older protocol's, a damaged file's -- is never lost to that race.
    if (this.fault !== null && !this.closed) listener({ type: 'refused', reason: this.fault });
    return () => { this.listeners.delete(listener); };
  }

  /** RV-2: each seek of the client the test room holds now (`ReplayClient.onSeek`'s), across its rebuilds. */
  onSeek(listener: SeekListener): () => void {
    this.seekers.add(listener);
    return () => { this.seekers.delete(listener); };
  }

  toggle(): boolean { return this.now?.toggle() ?? false; }
  step(dir: 1 | -1): number { return this.now?.step(dir) ?? 0; }
  slower(): number { return this.now?.slower() ?? 1; }
  faster(): number { return this.now?.faster() ?? 1; }
  seek(tick: number): number { return this.now?.seek(tick) ?? 0; }
  seekStart(): number { return this.now?.seekStart() ?? 0; }
  seekEnd(): number { return this.now?.seekEnd() ?? 0; }
  playing(): boolean { return this.now?.playing() ?? false; }
  /** RV2-02: the client now is held (`ReplayClient.held`); false with none. */
  held(): boolean { return this.now?.held() ?? false; }
  rate(): number { return this.now?.rate() ?? 1; }
  serverTick(now?: number): number { return this.now?.serverTick(now) ?? 0; }
  span(): { start: number; end: number } { return this.now?.span() ?? { start: 0, end: 0 }; }
  partial(): boolean { return this.now?.partial() ?? false; }
  ended(): boolean { return this.now?.ended() ?? false; }
  advance(now?: number): void { this.now?.advance(now); }
  roster(): ReturnType<ReplayClient['roster']> { return this.now?.roster() ?? []; }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.off?.();
    this.off = null;
    this.offSeek?.();
    this.offSeek = null;
    this.now?.close();
    this.settle();
  }
}

type LoadModule = Pick<typeof import('../../replay/load'), 'loadSegment' | 'loadPublicSegment' | 'ReplayLoadError' | 'REPLAY_DOOR_REFUSED'>;

/**
 * SA-9b: Watch's segment -- central's own at `<base>/replays/<id>`, or a host's at its door with a grant (the module's doc).
 * LCM-RP (RB-11): with no ticket -- the replay page's visitor -- no grant is asked: central's public fetch, the entry's match
 * named, followed to the door it names (`loadPublicSegment`).
 */
export async function segmentFor(entry: ReplayEntry, ctx: ReplayStageContext, mod: LoadModule): Promise<LoadedSegment> {
  const fetchDep = ctx.fetch ? { fetch: ctx.fetch } : {};
  if (!ctx.ticket()) return mod.loadPublicSegment(publicReplayAddress(ctx.base, entry.id, entry.matchId ?? null), { devDoors: ctx.devDoors === true, ...fetchDep });
  const local = (): Promise<LoadedSegment> => mod.loadSegment(replayAddress(ctx.base, entry.id), { server: ctx.base, ticket: ctx.ticket, ...fetchDep });
  if (entry.host === undefined) return local();
  const fromDoor = async (): Promise<LoadedSegment> => {
    const g = await askReplayGrant(ctx.base, ctx.ticket(), entry, ctx.devDoors === true, ctx.fetch);
    switch (g.kind) {
      case 'local': return local();
      case 'door': return mod.loadSegment(g.door.url, { door: { door: g.door, grant: g.grant }, ...fetchDep });
      case 'signed-out': throw new mod.ReplayLoadError('Your sign-in has ended; sign in again to watch this recording.', 'unavailable');
      case 'missing': throw new mod.ReplayLoadError('This recording is no longer listed for you, or the server that kept it has left.', 'missing');
      default: throw new mod.ReplayLoadError('The replay service could not open this recording right now; try again in a moment.', 'unavailable');
    }
  };
  try {
    return await fromDoor();
  } catch (e) {
    if (!(e instanceof mod.ReplayLoadError) || e.message !== mod.REPLAY_DOOR_REFUSED) throw e;
    return fromDoor();                                                                   // exactly one re-ask
  }
}

/** The world stage: the test room framed in the viewer, on the recording this page fetched (the module's doc). */
export function worldStage(o: WorldStageOptions = {}): ReplayStage {
  return {
    async open(entry, ctx) {
      const doc = o.document ?? document;
      const address = o.address ?? ((map: string) => worldAddress(map));
      const disc = o.disc ?? replayDiscRequest;
      const timer = o.timer ?? ((run: () => void, ms: number): (() => void) => { const t = setTimeout(run, ms); return () => { clearTimeout(t); }; });
      let cancelWait: (() => void) | null = null;
      const [{ ReplayClient, asNetClient }, load] = await Promise.all([import('../../replay/replayClient'), import('../../replay/load')]);
      const segment = segmentFor(entry, ctx, load);
      const client = new WorldClient();
      const view = doc.createElement('div');
      view.className = 'mur__frame-host';
      let frame: HTMLIFrameElement | null = null;
      let page: ReplayWorldPage | null = null;
      let disposed = false;
      /**
       * RV2-06: the camera chosen (kept, else follow), and whether it still waits to land on the page's spectator view --
       * at the open, after a button's press, after a round's turnover (the module's doc).
       */
      const cameras = o.cameras;
      let chosen: string = readCameraChoice(cameras);
      let waiting = true;
      const press = (): void => {
        const s = page?.spectator;
        if (!s || !waiting) return;
        for (const code of cameraPresses(s.mode, s.remembered, chosen)) s.key({ type: 'keyup', code, repeat: false, preventDefault: () => {} });
        if (s.mode === chosen) waiting = false;
      };
      // the page resets a spectator to free at `roundStart` (it hears the event after this listener): the choice waits again
      client.on((ev) => { if (ev.type === 'roundStart') waiting = true; });
      /** RV2-03: the test room's loading screen has gone (`ready`), and the client it took last, to release. */
      let released = false;
      let current: InstanceType<typeof ReplayClient> | null = null;
      /**
       * RV2-03: the world is open -- a client taken and the loading screen gone, in either order: the wait is over, and the
       * client plays (`release`: once; one already released is left as it is).
       */
      const opened = (): void => {
        cancelWait?.();
        cancelWait = null;
        current?.release();
      };
      /**
       * The refusal's window (MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION), armed at the frame's making and -- the RV2 batch
       * review's F6, a browser adaptation -- armed again at the test room's first take, so the loading screen's warm-up
       * (up to the take) and the world's own load (the take to `ready`) each get the whole window. A window already over
       * (released, refused, disposed) is not armed again; a rebuild's later take is part of the same load.
       */
      let taken = false;
      const arm = (): void => {
        cancelWait?.();
        cancelWait = timer(() => {
          cancelWait = null;
          if (!disposed) client.fail(`The match's world did not open within ${MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION / 1000} seconds. Go back and watch it again.`);
        }, MU_REPLAY_WORLD_TIMEOUT_MS_ADAPTATION);
      };

      segment.then((seg) => {
        if (disposed) return;
        const host: ReplayWorldHost = {
          disc: () => (disposed ? null : disc()),
          client: (opts, _walk, hooks) => {
            const shown = opts.map.toUpperCase();
            const c = new ReplayClient(Promise.resolve(seg), {
              // RV2-03 (RV2.R2): held at its start until the world's loading screen has gone (`ready`)
              autoplay: false,
              name: ctx.name, map: opts.map, ...(opts.world ? { world: opts.world } : {}), ...(o.now ? { now: o.now } : {}),
              // RV-7c-2: the test room's thrower's records and hull (`replayWorldDeps`), read at each fold; absent, as before
              ...(hooks?.throwable ? { throwable: (kind: string) => hooks.throwable!(kind) } : {}),
              ...(hooks?.hull ? { hull: () => hooks.hull!() } : {}),
              // `../../replay/mount`'s map rule, without its reload: the frame was opened on the header's map, so a page
              // showing another could not open it (`replayMapAddress`'s sentence).
              check: (s) => (s.header.map.toUpperCase() === shown ? null : replayMapRefusal(s.header.map)),   // MN-1 (OT.R113): the map named
            });
            client.take(c);
            current = c;
            if (!taken && cancelWait) arm();                    // F6: the world's own load gets the whole window
            taken = true;
            if (released) opened();                             // RV2-03's rebuild rule: made again after the hide, it plays
            return asNetClient(c);
          },
          attached: (p) => { if (!disposed) { page = p; press(); } },   // RV2-06: the chosen camera, pressed at once
          ready: () => {
            if (disposed || client.state === 'refused') return;   // a world already refused (its failure, the timeout) stays so
            released = true;
            if (current) opened();
          },
          failed: (reason) => {
            if (disposed) return;
            cancelWait?.();
            cancelWait = null;
            client.fail(`The match's world could not open: ${reason}`);
          },
        };
        frame = doc.createElement('iframe');
        frame.className = 'mur__frame';
        frame.title = 'The match\'s world';
        installReplayWorld(frame, host);
        frame.src = address(seg.header.map);
        view.append(frame);
        arm();
      }, (e: unknown) => {
        if (!disposed) client.fail(e instanceof Error ? e.message : String(e), loadKindOf(e));
      });

      const spectator: SpectatorControls = {
        modes: CAMERA_MODES,
        // RV2-06: read once a frame by the viewer -- a choice still waiting is pressed again, and shown until it lands
        current: () => {
          press();
          return waiting ? chosen : (page?.spectator.mode ?? chosen);
        },
        set: (id) => {
          if (!CAMERA_MODES.some((m) => m.id === id)) return;
          chosen = id;
          waiting = true;
          keepCameraChoice(id, cameras);
          press();
        },
      };

      return {
        client, world: 'drawn', view, spectator,
        dispose: () => {
          disposed = true;
          page = null;
          cancelWait?.();
          cancelWait = null;
          client.close();
          if (frame) { uninstallReplayWorld(frame); frame.remove(); }
          view.remove();
        },
      };
    },
  };
}

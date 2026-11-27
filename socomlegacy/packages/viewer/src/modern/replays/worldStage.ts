import { replayDiscRequest } from '../../discPrompt';
import type { HandedDiscRequest } from '../../discSource';
import { VIEW_SINCE_PROTOCOL, type ServerEvent } from '../../net/protocol';
import type { LoadedSegment, ReplayClient, ReplaySeek } from '../../replay/replayClient';
import { loadKindOf, replayMapRefusal, type ReplayLoadKind } from '../../replay/refusalKind';
import { keepCameraChoice, readCameraChoice, type CameraChoiceStore, type ReplayCamera } from './cameraChoice';
import { askReplayGrant, publicReplayAddress, replayAddress, type ReplayEntry } from './data';
import type { ReplayStage, ReplayStageContext, SpectatorControls, SpectatorMode, SpectatorPress } from './stage';
import type { TransportClient } from './transport';
import { installReplayWorld, REPLAY_WORLD_PARAM, replaySteerLane, uninstallReplayWorld, type ReplayWorldHost, type ReplayWorldPage, type ReplayWorldSpectator } from './worldHost';

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
 * **The player's view** (PV-8 of the player's-view lane, PV.R6; a browser adaptation with no original, research 402): a
 * fourth camera after PLAYER that is no spectator mode -- the follow with `SpectatorView`'s PV-6a sub-mode on. Wanting it
 * is the follow's presses (`cameraPresses`, taught no key), then `setPov(true)` once the view follows, asked again at each
 * read until it holds; PLAYER from it is `setPov(false)`; free and scenic press as before. `current` reads `'pov'` while
 * the view follows with it on, so a hold of Cross in the world moves the lit mark too. A recording below
 * `VIEW_SINCE_PROTOCOL` refuses it from the fetch's answer on (`refused`, REPLAY_POV_REFUSED_ADAPTATION) and turns off a
 * view the world turned on over it, once a frame; a page spectator without `setPov` refuses it too
 * (REPLAY_POV_ABSENT_ADAPTATION). A kept `'pov'` is shown as PLAYER for that watch, the kept value untouched; one chosen
 * before both are known is saved only once they carry it. A seek keeps it (REPLAY-SEEK-KEEP); the rig and the lens reset on the clock's
 * epoch and the view falls back to the follow until they are warm (`fallback`: the strip's half-strength mark).
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
 * **A name** (RVK-A, LATER 966, V21.R7; the owner, 2026-11-12: "Clicking a name in the replays should allow you to jump
 * to that characters view"; a browser adaptation). `follow(id)` is the roster's name pressed: the page's spectator view
 * follows that body as its own cycle would land there (`SpectatorView.followBody`, called from here alone), and the
 * strip's camera is PLAYER, kept as a press of PLAYER keeps it. A body the view will not follow (dead, gone) changes
 * nothing. `followed()` is the body the page follows now (its `target` in follow, else null) and `canFollow(id)` reads
 * the page's own bodies -- the client's `bodies()`, what the view gathers from -- at the playhead. Nothing clicked is
 * remembered: after a turnover the choice is pressed again as above and the page's own rules pick the body, so the
 * roster shows what is followed, never what was clicked. RVK-B's fold of the RVK-A review: a name pressed before the
 * page is attached (the world still loading; `canFollow` says 'wait' then, F3) is kept -- PLAYER chosen as a press of
 * PLAYER is -- and tried once, at the first read once the page is attached and the recording open (whichever comes last),
 * then dropped, followed or not; a camera chosen or a spectator's control pressed meanwhile, or a round's turnover, drops it. `canFollow` reads the
 * client's bodies once a tick (F4: one interpolated copy for the whole roster, not one a row).
 *
 * **A name in the player's view** (PV-RVK, the merge of RVK with the player's-view lane; the controller's ruling 1,
 * 2026-11-12; a browser adaptation). A name pressed while the strip is on the player's view (`inPov`: the camera shown is
 * `'pov'`, or the choice a kept `'pov'` refused here) stays in it, on that body: `followBody` moves the body and leaves the
 * sub-mode, which `SpectatorView` keeps through its cycle (PV-6a), so the strip's choice stays `'pov'` (`aimAt`). Where the
 * view is refused or absent the rule above decides exactly as for a camera choice: PLAYER shown for this watch, the kept
 * choice untouched. From PLAYER, FREE and SCENIC a name is RVK-A's, unchanged: PLAYER on that body. **The order** at each
 * read (`press`): a pending `'pov'` settled first (`settle`: saved once the recording and the page carry it, or refused and
 * PLAYER), then the camera's presses (the follow's key, then `setPov(true)` -- or `setPov(false)` for PLAYER), then a kept
 * name tried once (`followBody`, the recording open). `setPov` changes only the sub-mode and `followBody` only the body
 * followed, each asked of the view as the one before left it, and the wait is decided after both (`standing` against
 * `aimed`) -- so a click kept before the page (RVK-A's F3) and a `'pov'` pending until the page is known (PV-8's F2, F3)
 * cannot fight: neither undoes the other, and the view lands on the clicked body.
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
 * **The viewer's keyboard and mouse** (RVK-B, LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully
 * navigable with keyboard and mouse. Every view."; a browser adaptation). The frame stays deaf -- no key or pointer gate of
 * the test room changes -- and the viewer, in this page, hands the world what a pad would: `press(action)` is the
 * spectator's own control pressed, its key's release (`SPECTATOR_PRESS_CODES`, the codes `cameraPresses` already sends),
 * and a press that moves the camera keeps the strip's choice as a press of its button would (so a turnover presses the
 * same camera again); `steer`, `look` and `notch` write the steer lane hung on the host (`./worldHost` `ReplaySteerLane`),
 * which the test room reads once a frame where its pad input is built (`./worldSteer`). Dispose lets the lane go.
 *
 * The ISO lock stays the viewer's (`./view`: Watch locked until the disc is in; a disc taken out disposes the stage).
 * Dispose closes the client and takes the frame away -- its page, its world and its workers with it.
 */

/**
 * The camera's modes, in the button order: the spectator camera's own (`../../spectatorView` `SpectatorMode`) and, PV-8,
 * after PLAYER, the player's view (`'pov'`: the follow with PV-6a's sub-mode on -- a camera of the strip, no spectator
 * mode; its mark the console's reticle, `armory`, the sight a player looks through, already in both icon sets).
 */
export const CAMERA_MODES: readonly (SpectatorMode & { id: ReplayCamera })[] = Object.freeze([
  { id: 'follow', label: 'Follow a player', icon: 'user' },
  { id: 'pov', label: "Follow a player in the player's view", icon: 'armory' },
  { id: 'free', label: 'Free camera', icon: 'eye' },
  { id: 'scenic', label: 'Scenic views', icon: 'display' },
]);

/** The spectator camera's own three modes (`../../spectatorView` `SpectatorMode`): what `cameraPresses` reaches. */
const SPECTATOR_MODES: readonly string[] = ['follow', 'free', 'scenic'];

/**
 * REPLAY_POV_REFUSED_ADAPTATION (PV-8; PV.R6: "A recording of protocol 15 or under does not offer the view, and the strip
 * says why"): the strip's sentence on the player's view for a recording made before it (below `VIEW_SINCE_PROTOCOL`).
 * The viewer's own words, a browser adaptation with no original.
 */
export const REPLAY_POV_REFUSED_ADAPTATION = "This recording was made before the Player's View.";

/**
 * REPLAY_POV_ABSENT_ADAPTATION (PV-8, the review's F3): the strip's sentence on the player's view where the page's
 * spectator cannot take it (no `setPov` on the seam, `./worldHost` `ReplayWorldSpectator`). The viewer's own words, a
 * browser adaptation with no original.
 */
export const REPLAY_POV_ABSENT_ADAPTATION = "The Player's View is not available on this page.";

/**
 * The original's controls that take the spectator camera from `mode` (its remembered mode `remembered`) to `want`, as
 * key codes of `../../spectatorView`'s keys: X (`KeyX`, `spectatorToggle`) goes free from follow or scenic, and from
 * free back to the remembered mode; else the next player (`ArrowRight`) enters follow, the next scenic view (`ArrowUp`)
 * the scenic views. Nothing for the mode it is in, or an unknown one -- PV-8: `'pov'` included, no spectator mode.
 */
export function cameraPresses(mode: string, remembered: string, want: string): string[] {
  if (want === mode || !SPECTATOR_MODES.includes(want)) return [];
  if (want === 'free' || (mode === 'free' && remembered === want)) return ['KeyX'];
  return [want === 'follow' ? 'ArrowRight' : 'ArrowUp'];
}

/**
 * RVK-B: each of the spectator's own controls the viewer presses, as the key code its view's keys read
 * (`../../spectatorView` `SPECTATOR_KEYS`: the arrows the d-pad, X the toggle, C the player in view).
 */
export const SPECTATOR_PRESS_CODES: Readonly<Record<SpectatorPress, string>> = Object.freeze({
  next: 'ArrowRight', previous: 'ArrowLeft', scenicNext: 'ArrowUp', scenicPrevious: 'ArrowDown', toggle: 'KeyX', jump: 'KeyC',
});

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
   * PV-8: the client now's recording carries the player's view (`ReplayClient.viewCarried`); null while none is open
   * (not taken yet, connecting, refused, closed) -- not known, so not refused.
   */
  get viewCarried(): boolean | null {
    const c = this.now;
    return !this.closed && this.fault === null && c?.state === 'open' ? c.viewCarried : null;
  }
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
      // RVK-A: the body's Alive bit (`canFollow`), from the protocol the lazy client's chunk already holds
      const [{ ReplayClient, asNetClient }, load, { BodyFlag }] = await Promise.all([import('../../replay/replayClient'), import('../../replay/load'), import('../../net/protocol')]);
      const segment = segmentFor(entry, ctx, load);
      const client = new WorldClient();
      const lane = replaySteerLane();                          // RVK-B: the viewer's keyboard and mouse, read by the frame
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
      let chosen: ReplayCamera = readCameraChoice(cameras);
      let waiting = true;
      /**
       * PV-8 (the review's F2): the fetched header carries the player's view -- its protocol at or over `VIEW_SINCE_PROTOCOL`,
       * known from the fetch's answer (`segment` below), before the test room takes a client; null until then. Once a client
       * is open its own reader (`WorldClient.viewCarried`) is the same segment's.
       */
      let headerCarries: boolean | null = null;
      const carries = (): boolean | null => headerCarries ?? client.viewCarried;
      /**
       * PV-8 (the review's F3): the page's spectator can take the view (`setPov`); null until the page is attached.
       */
      const takes = (): boolean | null => (page ? typeof page.spectator.setPov === 'function' : null);
      /**
       * PV-8 (PV.R6; the review's F2, F3): the sentence why the player's view cannot be chosen -- a recording made before it
       * (REPLAY_POV_REFUSED_ADAPTATION), or a page spectator without it (REPLAY_POV_ABSENT_ADAPTATION) -- or null, also while
       * either is not known yet. A segment here is the one `.s2r` this stage fetched (`segmentFor`): each client the test
       * room takes is made on it, so the segment under the playhead is always the fetched one.
       */
      const refused = (id: string): string | null => {
        if (id !== 'pov') return null;
        if (carries() === false) return REPLAY_POV_REFUSED_ADAPTATION;
        return takes() === false ? REPLAY_POV_ABSENT_ADAPTATION : null;
      };
      /**
       * PV-8 (the review's F2, F3): a `'pov'` chosen while the recording or the page was not known yet -- shown and pressed as
       * the choice, but saved only once both are known to carry the view; refused then, it is PLAYER for this watch and the
       * saved value stays as it was before the click.
       */
      let pending = false;
      const settle = (): void => {
        if (!pending) return;
        if (refused('pov') !== null) { pending = false; chosen = 'follow'; waiting = true; }
        else if (carries() === true && takes() === true) { pending = false; keepCameraChoice('pov', cameras); }
      };
      /**
       * PV-8 (PV.R6): the camera aimed at now -- the choice, but PLAYER where the view is refused (a kept `'pov'` shown as
       * the follow for this watch, the kept value untouched). Not known yet: the choice.
       */
      const aimed = (): ReplayCamera => (chosen === 'pov' && refused('pov') !== null ? 'follow' : chosen);
      /**
       * PV-8: where the page's view stands, as a camera of the strip: `'pov'` while it follows with the player's view on --
       * never where the view is refused (the review's F1, F3).
       */
      const standing = (s: ReplayWorldSpectator): ReplayCamera => (s.mode === 'follow' && s.pov === true && refused('pov') === null ? 'pov' : s.mode);
      /**
       * RVK-B (F3; the review's finding 2): a name pressed before the page was attached, kept and tried ONCE -- at the first
       * read once the page is attached and the recording is open, whichever comes last -- then dropped, followed or not.
       */
      let pendingFollow: number | null = null;
      /**
       * PV-RVK (the controller's ruling 1): the strip is on the player's view now -- the camera it shows (`current`'s answer,
       * without its press) is `'pov'`, or the choice is a kept `'pov'` the recording or the page refuses (PLAYER shown for this
       * watch, PV.R6).
       */
      const inPov = (): boolean => {
        const s = page?.spectator;
        const shown = waiting || !s ? aimed() : standing(s);
        return shown === 'pov' || (chosen === 'pov' && refused('pov') !== null);
      };
      /**
       * PV-RVK (ruling 1): a name's camera. From the player's view it stays the choice -- made the choice if the view stood
       * there by a hold in the world, kept as `set` keeps it (pending until the recording and the page are known to carry it);
       * a `'pov'` already the choice is left exactly as it is (kept, pending, or refused here: PLAYER for this watch, the kept
       * value untouched). Otherwise RVK-A's: PLAYER, kept as a press of PLAYER keeps it (a pending view replaced).
       */
      const aimAt = (pov: boolean): void => {
        if (!pov) { chosen = 'follow'; pending = false; keepCameraChoice('follow', cameras); return; }
        if (chosen === 'pov') return;
        chosen = 'pov';
        pending = !(carries() === true && takes() === true);
        if (!pending) keepCameraChoice('pov', cameras);
      };
      const press = (): void => {
        settle();
        const s = page?.spectator;
        if (!s) return;
        if (waiting) {
          const want = aimed();
          // PV-8: the player's view is the follow's presses, then `setPov(true)` once the view follows -- asked each read until
          // it holds (`setPov` does nothing until a body is followed); PLAYER from it is `setPov(false)`, no key
          for (const code of cameraPresses(s.mode, s.remembered, want === 'pov' ? 'follow' : want)) s.key({ type: 'keyup', code, repeat: false, preventDefault: () => {} });
          if (want === 'pov' && s.mode === 'follow' && s.pov !== true && carries() === true) s.setPov?.(true);
          else if (want === 'follow' && s.mode === 'follow' && s.pov === true) s.setPov?.(false);
          if (standing(s) === want) waiting = false;
        }
        if (pendingFollow !== null && current?.state === 'open') {
          const id = pendingFollow;
          pendingFollow = null;                                 // one try: never a jump long after the click
          // the merge (PV-RVK): the camera aimed at decides the wait, as the strip's own presses do (`standing`, `aimed`)
          if (s.followBody?.(id) === true) waiting = standing(s) !== aimed();
        }
      };
      /**
       * PV-8 (PV.R6; the review's F1): over a recording that carries no view, whatever turned it on (a hold of Cross in the
       * world, the developers' key), the view is turned off -- once a frame (the viewer reads `current` once a frame) until
       * it is; so it never stands and the refused button is never lit.
       */
      const forbid = (): void => {
        const s = page?.spectator;
        if (s && carries() === false && s.pov === true) s.setPov?.(false);
      };
      // the page resets a spectator to free at `roundStart` (it hears the event after this listener): the choice waits again
      client.on((ev) => { if (ev.type === 'roundStart') { waiting = true; pendingFollow = null; } });   // RVK-B (F3): a turnover drops a kept name
      /** RV2-03: the test room's loading screen has gone (`ready`), and the client it took last, to release. */
      let released = false;
      let current: InstanceType<typeof ReplayClient> | null = null;
      /** RVK-B (F4): the client's bodies, read once a tick for the roster's whole sync (`canFollow`). */
      // the review's finding 5: keyed on the client's state too -- a client not open yet answers no bodies at tick 0, which must
      // not stand once it opens at that same tick (a recording starting at 0, held paused)
      let bodiesOf: { client: InstanceType<typeof ReplayClient>; state: string; tick: number; list: ReturnType<InstanceType<typeof ReplayClient>['bodies']> } | null = null;
      const bodiesNow = (): ReturnType<InstanceType<typeof ReplayClient>['bodies']> => {
        const c = current;
        if (!c) return [];
        const tick = Math.floor(c.serverTick());
        if (!bodiesOf || bodiesOf.client !== c || bodiesOf.state !== c.state || bodiesOf.tick !== tick) bodiesOf = { client: c, state: c.state, tick, list: c.bodies() };
        return bodiesOf.list;
      };
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
        headerCarries = seg.header.protocol >= VIEW_SINCE_PROTOCOL;     // PV-8 (the review's F2): known from the fetch on
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
          steer: lane,                                          // RVK-B (the module's doc)
          // E17 (B-83): the entry's named match, for the room's GAME DETAILS (`ReplayWorldHost.details`)
          details: () => ({ region: entry.region ?? null, lobbyName: entry.lobbyName ?? null }),
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
          forbid();
          press();
          const s = page?.spectator;
          return waiting || !s ? aimed() : standing(s);
        },
        set: (id) => {
          const m = CAMERA_MODES.find((x) => x.id === id);
          if (!m || refused(m.id) !== null) return;      // PV-8: a refused camera presses nothing and keeps nothing
          chosen = m.id;
          waiting = true;
          pendingFollow = null;                                 // RVK-B (F3): a camera pressed drops a kept name
          // PV-8 (the review's F2, F3): the player's view is saved only once the recording and the page are known to carry it
          pending = m.id === 'pov' && !(carries() === true && takes() === true);
          if (!pending) keepCameraChoice(m.id, cameras);
          press();
        },
        refused: (id) => refused(id),
        fallback: (id) => {
          const s = page?.spectator;
          return id === 'pov' && !!s && refused('pov') === null && s.mode === 'follow' && s.pov === true && s.povShown !== true;
        },
        // RVK-A (the module's doc, "A name"): the roster's name -- PLAYER as its button's press, and the page on that body;
        // PV-RVK (ruling 1): from the player's view, the player's view on that body
        follow: (id) => {
          const s = page?.spectator;
          const pov = inPov();
          if (!s) {                                             // RVK-B (F3): no page yet -- kept, the camera chosen, replayed at attach
            if (disposed) return false;
            pendingFollow = id;
            aimAt(pov);
            waiting = true;
            return true;
          }
          if (!s.followBody || !s.followBody(id)) return false;
          pendingFollow = null;
          aimAt(pov);
          waiting = standing(s) !== aimed();                    // PLAYER over a view still on: `press` turns it off
          return true;
        },
        followed: () => {
          const s = page?.spectator;
          return s && s.mode === 'follow' ? s.target ?? null : null;
        },
        canFollow: (id) => {
          if (!page) return 'wait';                             // RVK-B (F3): the page not attached yet
          const body = bodiesNow().find((b) => b.id === id);    // RVK-B (F4): one read a tick
          return !body ? 'absent' : (body.flags & BodyFlag.Alive) !== 0 ? 'yes' : 'dead';
        },
        // RVK-B (the module's doc, "The viewer's keyboard and mouse"): the spectator's own control, its key's release
        press: (action) => {
          const s = page?.spectator;
          const code = SPECTATOR_PRESS_CODES[action];
          if (!s || !code || !s.key({ type: 'keyup', code, repeat: false, preventDefault: () => {} })) return;
          pendingFollow = null;
          // the merge (PV-RVK): where the view stands, as a camera of the strip (`standing`: the player's view kept through
          // the cycle and X's round trip, PV-6a), against the camera aimed at (`aimed`: a kept view refused here is PLAYER
          // for this watch, its kept value untouched) -- kept, as a press of its button keeps it, only where it moved
          const at = standing(s);
          // PV-RVK's review, F1: the player's view chosen and still landing (`waiting`: `setPov(true)` not yet held -- over a
          // dead body, say) and the press reaching a follow -- still landing: the choice and its kept value untouched, the wait
          // kept, so the next read (`press`) asks the view again of the player reached, and goes on waiting if that one cannot
          // take it either. (Not by asking `setPov` here: over a dead player reached it would fail and drop the choice.) A view
          // that had landed and was turned off in the world (`waiting` false) is RVK-B's as before: PLAYER, kept.
          if (waiting && aimed() === 'pov' && at === 'follow') return;
          if (at !== aimed()) {
            chosen = at;
            pending = at === 'pov' && !(carries() === true && takes() === true);
            if (!pending) keepCameraChoice(at, cameras);
          }
          waiting = false;                                      // the camera is where the press put it
        },
        steer: (held) => { if (!disposed) lane.set(held); },
        look: (dx, dy) => { if (!disposed) lane.look(dx, dy); },
        notch: (n) => { if (!disposed) lane.notch(n); },
      };

      return {
        client, world: 'drawn', view, spectator,
        dispose: () => {
          disposed = true;
          page = null;
          lane.zero();                                          // RVK-B: nothing held past the viewer
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

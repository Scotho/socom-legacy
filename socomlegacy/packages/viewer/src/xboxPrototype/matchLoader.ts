import { lightweightMatchChosen } from '../lightweightMatchOptIn';
import { pageDeviceClass, type DeviceClass } from '../deviceClass';
import { readGraphicsBackend } from '../graphicsBackend';
import type { ServerEvent } from '../net/protocol';
import type { NetClient } from '../net/client';
import { missionMapPath } from '../lobbyMatch';
import type { MatchLoader, MatchMountOptions, MountedMatch } from '../matchMount';
import type { SceneRenderer } from './sceneFrame';
import type { walkingRuntime } from './walkingRuntime';
import type { WalkingSound } from './sound';
import { typedModels, walkingAssets } from './runtimeAssets';
import { MATCH_ABORT_DIALOG_ID } from '../matchAbort';
import { PROTOTYPE_BONE_LIMIT_ADAPTATION } from './model';
import { frameCapGate } from '../frameCap';

/**
 * The lightweight match behind the real front end (a browser adaptation for the Xbox class, opt-in; no original).
 *
 * The real menus, lobby, launch, return and map change stay the real client's (`../frontEnd`, `../lobbyMatch`): this
 * wraps the page's own `MatchLoader` and replaces only what a mount builds. Loading -- the worker, the decode, what is
 * kept and let go -- is the inner loader's, untouched. A mount takes the mission's decoded assets from it and stands
 * the experiment's numeric runtime and raw WebGL2 renderer on them (`./walkingRuntime`, `./raw`) instead of the
 * production scene graph and renderer, with the lobby's own client adopted (`PrototypeOnline.adopt`) and handed back at
 * the match's end. The game's rules, movement, firearms and wire are the shared modules the production match uses.
 *
 * What the lightweight match does not draw or mount yet is the experiment's own list (`./model` PROTOTYPE_OMISSIONS).
 * Nothing here is reached unless the page's engine is the lightweight one (`lightweightMatchWanted`, the front end's one
 * decision: `../lightweightMatchOptIn` `pageLightweightMatch`).
 */

/** The engine's key: '1' the lightweight match, '0' the standard engine, else the class's default (`../lightweightMatchOptIn`). */
export { LIGHTWEIGHT_MATCH_KEY } from '../lightweightMatchOptIn';

/**
 * Whether this page's engine is the lightweight match: the front end's decision (`../lightweightMatchOptIn`
 * `lightweightMatchChosen`) -- on the Xbox class or pick, `?lightweightmatch=1` / `=0`, else the saved choice (`read`, the
 * page's storage door), else the class's default. `on` names the class and pick; absent, the page's.
 */
export function lightweightMatchWanted(win: { location?: { search: string } } | undefined, read?: (key: string) => string | null, on?: { deviceClass: DeviceClass; pick: boolean }): boolean {
  const pick = (): boolean => { try { return readGraphicsBackend() === 'xbox'; } catch { return false; } };
  return lightweightMatchChosen({ search: win?.location?.search, ...(read ? { read } : {}), ...(on ?? { deviceClass: pageDeviceClass, pick: pick() }) });
}

/**
 * The lightweight match's frame rate: the original's 30 a second (research 179 §2, R116.14: the game frame cap
 * `DAT_003e1400` = 30, `FUN_003aff30`). Not a preference here: on the console (Developer Mode, 2026-11-19) the same room
 * held about 590 MiB at 30 a second and its GPU process grew past the app's limit uncapped. A divergence from the
 * production frame cap (VS-4, `../frameCap`, which steps the game on a skipped draw): this loop steps the game and polls
 * the pad on its drawn frames only, about 30 a second -- production's envelope on a 30 Hz display (XBOX-INTEGRATE's review F4).
 */
const LIGHTWEIGHT_FRAME_CAP = 30;

/** An instrument's allocation refusal threshold for the raw renderer's payload, as the experiment page's; not a console limit. */
const PAYLOAD_LIMIT_BYTES = 96 * 1024 * 1024;
/** The lobby's events kept while the mount builds (the production mount's own bound, `LOBBY_MATCH_EVENTS_ADAPTATION`'s order of size). */
const PENDING_EVENTS = 4096;

/** The renderer's CPU clocks and counts for an instrument (`./raw` stats), when it carries them. */
function renderCost(renderer: { stats: object } | null): Record<string, number> | null {
  const s = renderer?.stats as Record<string, unknown> | undefined; if (!s) return null;
  const out: Record<string, number> = {};
  for (const key of ['cpuSetupMs', 'cpuWorldMs', 'cpuEffectsMs', 'cpuHudMs', 'cpuErrorCheckMs', 'heldFrames', 'drawCalls', 'batches', 'triangles', 'particles']) if (typeof s[key] === 'number') out[key] = s[key] as number;
  return out;
}

/** A test's and an instrument's read of the mounted lightweight match; never the game's state. */
export interface LightweightMatchReport { stage: string; error: string; frames: number; players: number; map: string; /** Particles the effects have emitted so far; null with no effect data. */ emitted: number | null; /** The throwables' counts (`./walkingGrenades` `report`); null before the runtime. */ grenades: { thrown: number; launched: number; explosions: number; held: string | null; left: number; blinds: number; arcSegments: number } | null; /** The menus over the game (`./walkingMenus` `report`); null before the runtime or without a HUD. */ menus: { start: boolean; inventory: boolean; aborting: boolean; gate: { walking: boolean; alive: boolean; canChange: boolean; current: number; count: number } } | null; /** The Chat menu and the voice (`./walkingTalk` `report`). */ talk: { menu: boolean; voice: { channel: number | null; holder: number | null; talking: boolean } | null; heard: number } | null; cost: { frames: number; step: number; laps: Record<string, number>; render: Record<string, number> | null } | null }
type Reported = { __lightweightMatch?: () => LightweightMatchReport; /** A development build's instrument: the flashbang's blind started as the room's blast starts it. */ __lightweightBlind?: (level: 1 | 2 | 3) => void; /** A development build's instrument: ABORT confirmed, as the START menu's row. */ __lightweightAbort?: () => void };

export function lightweightMatchLoader(inner: MatchLoader, doc: Document = document): MatchLoader {
  return {
    load: (mission, variant) => inner.load(mission, variant),   // DAY-8: the told variant passed through
    // The production prepare builds the production world and renderer ahead of the launch; the lightweight mount uses
    // neither, so a prepare is the mission's decode alone (the inner loader keeps it for the mount).
    prepare: (mission, variant) => inner.load(mission, variant).then(() => undefined, () => undefined),
    holds: () => null,
    dropPrepared: () => { inner.dropPrepared(); },
    reseat: () => { inner.reseat(); },
    dispose: () => { inner.dispose(); },
    mount: (target, o) => mountLightweight(inner, target, o, doc),
  };
}

function mountLightweight(inner: MatchLoader, target: HTMLElement, o: Omit<MatchMountOptions, 'assets'>, doc: Document): MountedMatch {
  const win = doc.defaultView ?? window;
  const canvas = doc.createElement('canvas');
  canvas.width = 640; canvas.height = 448;                 // the PS2 frame, as the experiment page's
  canvas.className = 's2u-lightweight-match';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', objectFit: 'contain', background: '#000', outline: 'none' });
  target.append(canvas);

  const path = missionMapPath(o.handOff.mission) ?? '';
  const stem = /([^/]+)\.ZDB$/i.exec(path)?.[1] ?? '';
  let runtime: ReturnType<typeof walkingRuntime> | null = null, renderer: (SceneRenderer & { dispose(): unknown }) | null = null;
  let sound: WalkingSound | null = null, raf = 0, gone = false, frames = 0, stage = 'loading', error = '', loadOver = false;
  // The room's events between this mount and the runtime's adoption, after the lobby's own (`o.events`).
  const pending: ServerEvent[] = [];
  let hear: (() => void) | null = o.client.on((event) => { if (pending.length < PENDING_EVENTS) pending.push(event); });
  const fail = (reason: unknown): void => {
    if (gone || error) return;
    error = reason instanceof Error ? reason.message : String(reason); stage = 'failed';
    win.cancelAnimationFrame(raf);
    console.error('lightweight match:', error);
  };
  (win as unknown as Reported).__lightweightMatch = () => ({ stage, error, frames, players: runtime ? 1 + runtime.frame.others.length : 0, map: stem, emitted: runtime?.effectsEmitted() ?? null,
    grenades: runtime ? (({ thrown, launched, explosions, held, left, blinds, arcSegments }) => ({ thrown, launched, explosions, held, left, blinds, arcSegments }))(runtime.grenadeStats()) : null,
    menus: runtime ? (m => m ? { start: m.start, inventory: m.inventory, aborting: m.aborting, gate: m.gate } : null)(runtime.menuStats()) : null, talk: runtime?.talkStats() ?? null,
    cost: runtime ? { ...runtime.costStats(), render: renderCost(renderer) } : null });
  if (import.meta.env.DEV) (win as unknown as Reported).__lightweightBlind = (level) => { runtime?.blindNow(level); };
  if (import.meta.env.DEV) (win as unknown as Reported).__lightweightAbort = () => { runtime?.abortNow(); };

  void (async () => {
    const assets = await inner.load(o.handOff.mission, o.handOff.welcome?.variant);   // DAY-8: the welcome's variant
    if (gone) return;
    if (!assets?.map.body || !assets.clips?.clips.length) throw new Error('The mission did not decode a map, a body and its motions');
    const map = assets.map, typed = typedModels(map, PROTOTYPE_BONE_LIMIT_ADAPTATION), models = typed.models;
    stage = 'building renderer';
    const built = await (await import('./raw')).rawPrototype(canvas, map, models, PAYLOAD_LIMIT_BYTES, Object.keys(map.weapons ?? {}), true);
    if (gone) { await built.dispose(); return; }
    renderer = built as SceneRenderer & { dispose(): unknown };
    const [{ walkingRuntime: mountWalking }, { walkingSound }] = await Promise.all([import('./walkingRuntime'), import('./sound')]);
    if (gone) return;
    const rig = walkingAssets(map, models, typed.types);
    stage = 'mounting';
    hear?.(); hear = null;
    runtime = mountWalking(canvas, rig.map, assets.clips, rig.models,
      { url: o.client.url, map: stem, name: '', adopt: { client: o.client, events: [...o.events, ...pending] } }, built.hud, assets.effects ?? null,
      { startMenuOptions: o.startMenuOptions, captions: () => assets.sound?.data?.taunts?.captions ?? null, title: map.name ?? null,
        taunts: o.taunts, messages: o.messages, talk: o.handOff.talk, soundData: () => assets.sound?.data ?? null, gameVars: o.gameVars });
    pending.length = 0;
    if (o.audio) {
      // The match's own audio on the menus' context (`../frontEndMatchSound`), fed as the experiment page feeds its own.
      sound = walkingSound(o.audio.game, runtime.walk, runtime.fly);
      runtime.setSound(sound);
      sound.setData(assets.sound?.data ?? null);
      if (assets.sound) sound.setLoops(assets.sound.loops);
    }
    canvas.focus();
    let last = win.performance.now();
    const gate = frameCapGate(LIGHTWEIGHT_FRAME_CAP);
    const frame = (stamp: number): void => {
      if (gone || error) return;
      // A frame not due is not stepped either: the next one takes the whole interval (the experiment page's cap, as run).
      if (!gate.shouldDraw(stamp) || built.ready() === false) { raf = win.requestAnimationFrame(frame); return; }
      try {
        const now = win.performance.now(), real = (now - last) / 1000, dt = Math.min(real, 0.1); last = now;
        const current = runtime!.step(dt, now, real);
        current.realDeltaSeconds = frames === 0 ? 0 : real;
        built.render(current);
        frames++;
        if (!loadOver) { loadOver = true; stage = 'rendering'; runtime!.loaded(); o.audio?.game.endLoad(); o.firstFrame?.(); }
        raf = win.requestAnimationFrame(frame);
      } catch (reason) { fail(reason); }
    };
    raf = win.requestAnimationFrame(frame);
  })().catch(fail);

  const teardown = (): void => {
    gone = true; win.cancelAnimationFrame(raf);
    hear?.(); hear = null;
    // Each part on its own: one that throws must not keep the next (the sound's worker, the context, the canvas).
    const part = (run: () => void): void => { try { run(); } catch (reason) { console.error('lightweight match teardown:', reason); } };
    part(() => { runtime?.setSound(null); });
    part(() => { sound?.dispose(); }); sound = null;
    part(() => { runtime?.dispose(); }); runtime = null;
    part(() => { o.audio?.release(); });
    const owned = renderer; renderer = null;
    part(() => { void Promise.resolve(owned?.dispose()).catch(() => undefined); });
    canvas.remove();
    if ((win as unknown as Reported).__lightweightMatch) delete (win as unknown as Reported).__lightweightMatch;
    delete (win as unknown as Reported).__lightweightBlind; delete (win as unknown as Reported).__lightweightAbort;
  };
  return {
    canvas,
    net: () => null,
    // The START menu's ABORT, run out: the page ends the match back to the game's lobby (`LobbyMatch` polls it).
    // A match that failed (a lost context, a thrown frame) draws nothing more: it ends as an abort does, back to the
    // game's lobby; a closed connection ends it as the production page's does (#365).
    ended: () => runtime?.aborted() ?? (error ? MATCH_ABORT_DIALOG_ID : o.client.state === 'closed' ? 365 : null),
    lobbyLine: () => { /* the round's queue lines are not drawn by the lightweight HUD yet */ },
    /** The match's end: the client back to the game's lobby, open (`LobbyMatch.matchOver`); null when there is none. */
    release: (): NetClient | null => {
      if (gone) return null;
      const client = runtime ? runtime.release() : o.client.state === 'open' ? o.client : (o.client.close(), null);
      teardown();
      return client;
    },
    close: (): void => {
      if (gone) return;
      const mounted = runtime !== null;
      teardown();                                           // a mounted runtime's dispose closes its client
      if (!mounted) o.client.close();
    },
  };
}

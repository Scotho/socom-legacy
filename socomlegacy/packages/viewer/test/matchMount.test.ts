// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, type Object3D, type Scene } from 'three';
import { arsenalOf, CLAYMORE, CLAYMORE_RULES, DEFAULT_GRID_PARAMS, HELD_RIFLE, HELD_SIDEARM, type Loadout } from '@s2u/scene';
import type { RdrNode } from '@s2u/archive';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { FlyCamera } from '../src/camera';
import { Hud, MESSAGE_SCALE } from '../src/hud';
import { HUD_LIBRARIES } from '../src/hudAssets';
import { StartMenu } from '../src/startMenu';
import { PlayerLoadout } from '../src/loadout';
import { Effects } from '../src/effects';
import { Fire } from '../src/fire';
import { Kit } from '../src/kit';
import { Reticle } from '../src/reticle';
import { packGround, WalkMode } from '../src/walk';
import { Zoom } from '../src/zoom';
import { GrenadeThrower } from '../src/grenade';
import { WhiteOut } from '../src/flash';
import { RocketLauncher } from '../src/rocket';
import { INVENTORY_IDLE_CLOSE, InventoryMenu } from '../src/inventoryMenu';
import type { WorldPoly } from '@s2u/scene';
import { deferredMatch, LobbyMatch, MATCH_END_RETURN_READING, type LobbyMatchReturn, type MatchHandle } from '../src/lobbyMatch';
import { MATCH_MOUNT_PARTS_PLACEHOLDER, MATCH_WINDOW_HOOK, matchLighting, matchLoader, mountMatch, type MatchAssets, type MatchMountOptions, type MatchWorker, type MatchRenderer, type MatchWindow, type MatchWindowHook } from '../src/matchMount';
import { FRONT_END_CAPABILITIES, type MatchCapabilities } from '../src/matchCore';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { WebSocketLike } from '../src/net/client';
import { Button, Frame, TICK_HZ, type Command, type ServerEvent } from '../src/net/protocol';
import { fireInterval } from '../src/accuracy';
import { LOWER_DELAY, WeaponRaise } from '../src/weaponRaise';
import { GAME_ENDED_DIALOG_READING, NetPage, type NetPageDeps } from '../src/netPage';
import { RemotePlayers } from '../src/remotePlayers';
import { HostagePage } from '../src/hostagePage';
import { GameAudio } from '../src/audio';
import { silentOut, type MatchAudio } from '../src/matchSound';
import type { SoundData } from '../src/soundData';
import type { ViewerRequest, ViewerResponse } from '../src/worker';
import { WorldState } from '../src/worldState';
import { decodeCommands, encodeSnapshot, frameKind } from '../src/net/codec';
import { ActionWiring, RoomEvents } from '../src/actionWiring';
import { ActionLifecycle } from '../src/actionContext';
import { BombPage, DEFUSE_PROMPT_ICON_READING } from '../src/bombPage';
import { Traversal } from '../src/traversal';
import { DoorPage } from '../src/doorPage';
import { DoorSet, type DoorSpec } from '../src/doors';
import type { MapAction } from '../src/mapActions';
import type { BombWire } from '../src/net/objective';
import { Play } from '../src/play';
import { TraversalPage } from '../src/traversalPage';
import { PICKUP_PROMPT_COOLDOWN_READING } from '../src/net/pickupRules';
import { STANCE_HOLD_S_PLACEHOLDER } from '../src/stanceButton';
import { TurretPage } from '../src/turretPage';
import { ADAPTIVE_V2_ADAPTATION, AdaptiveRatio, PIXEL_RATIO_FLOOR_ADAPTATION } from '../src/matchViewport';
import { AUTO_FLOOR_SHARE_ADAPTATION, FirstMatchProbe, VIDEO_AUTO_KEY } from '../src/autoQuality';
import { pageRendererProbe } from '../src/deviceClass';
import { beaconPerfPending, resetPageClientErrorBeaconForTest, type PerfReport } from '../src/clientErrorBeacon';
import { resetPageFrameSamplerForTest } from '../src/frameSampler';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';
import { renderCapFor, VIDEO_SETTINGS_DEFAULTS, videoSettingsKeeper, videoSettingsKeeperV2, type FrameCap } from '../src/videoSettings';
import { worldAnisotropyOn } from '../src/experimentalWorldSampling';
import { CharacterShadow } from '../src/charShadow';
import { wantsTouchControls } from '../src/touch';
import { ROUND_SCREEN_BITMAPS } from '../src/roundScreens';
import { WorldDrops } from '../src/drops';
import { WeaponExchange } from '../src/weaponExchange';
import { drawnTurretParts, placementView } from '../src/turretHook';
import { TURRET_HOLD_CLIP, TURRET_MOUNT_CLIPS } from '../src/net/emplacement';
import type { TraversalPose } from '../src/animator';
import type { TurretPlacement } from '@s2u/scene';
import { NAME_TAGS_KEY } from '../src/nameTags';

/**
 * ONL-18c (web research 166 §8): the match's world in the front end's page. `mountMatch` builds the match from
 * parameters -- the lobby's open client, its events, the hand-off, the page's hold -- into an element the caller gives,
 * reading none of `/testroom`'s markup, and lets it all go again: `release` hands the client back open (the match's
 * end), `close` closes it (the page's own close). `NetPage.release` is the seam under it. A real `GameSocketHost` over a
 * fake socket makes the hand-off (research 165 §4); the renderer and the window's frame clock are fakes. No server is
 * contacted (R293), no browser is run.
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** LATER 456: the drawn scene's children, by name, of a match on `synthetic()` with no `extraWorld` (before the option, as now). */
const PLAIN_MATCH_SCENE_CHILDREN: readonly string[] = ['', '', 'effects', 'MP2 worldmodel'];
const welcome = {
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [{ id: 3, name: 'kilo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
} as unknown as ServerEvent;

/** The lobby's game socket, seated and handed on (`GAME_LOBBY_MATCH_START`). */
function handOff(team: 'seal' | 'terrorist' = 'seal', lobbySide?: 'seal' | 'terrorist', first: ServerEvent = welcome) {
  const socks: Sock[] = [];
  const hands: GameLobbyHandOff[] = [];
  const lobbyHolds: boolean[] = [];
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: (h) => { lobbyHolds.push(h); }, matchStart: (h) => { hands.push(h); },
    socket: () => {
      const sent: string[] = [], closed: number[] = [];
      const s = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
      socks.push(s);
      return s;
    },
  });
  host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
  host.open(7);
  socks[0]!.onopen?.({});
  const say = (ev: ServerEvent): void => { socks[0]!.onmessage?.({ data: JSON.stringify(ev) }); };
  say(first === welcome ? { ...welcome, team } as unknown as ServerEvent : first);
  // MENU-SIDE: SWITCH TEAMS after the welcome -- the bridge's view names the seat's new side (`Room.switchTeam` tells the
  // switcher nothing else: `left` and `joined` go to the others).
  if (lobbySide) say({ type: 'gameLobby', seats: [{ id: 2, name: 'socomc', team: lobbySide, ready: false, host: true, readyIn: 0 }], countdown: null, launched: false });
  host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });
  return { host, h: hands[0]!, socks, say, lobbyHolds };
}

/** The window's frame clock and its listeners, counted. */
function fakeWindow() {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  const live = new Set<string>();
  const heard = new Map<string, Set<EventListener>>();
  const win: MatchWindow = {
    requestAnimationFrame: (cb) => { frames.set(++id, cb); return id; },
    cancelAnimationFrame: (i) => { frames.delete(i); },
    addEventListener: (type: string, fn: EventListener) => { live.add(type); (heard.get(type) ?? heard.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener: (type: string, fn: EventListener) => { live.delete(type); heard.get(type)?.delete(fn); },
    navigator: { getGamepads: () => [] },
  };
  /** A key at the window: every listener the match added for it. */
  const key = (code: string): void => {
    const e = new KeyboardEvent('keydown', { code });
    for (const fn of [...(heard.get('keydown') ?? [])]) fn(e);
  };
  let now = 0;
  /** `n` frames, each `ms` after the last (PAR-24: a chosen frame period; 16 ms by default). */
  const step = (n = 1, ms = 16): void => {
    for (let i = 0; i < n; i++) { const due = [...frames.values()]; frames.clear(); now += ms; for (const f of due) f(now); }
  };
  return { win, frames, live, step, key };
}

/** The renderer: draws counted; the HUD's pass a buffer of a fixed size. */
function fakeRenderer() {
  const drawn: number[] = [];
  let disposed = 0;
  let scene: Scene | null = null;
  const r: MatchRenderer = {
    render: (s) => { drawn.push(1); scene = s as Scene; }, resize: () => {}, setClearColor: () => {}, backend: 'webgl2',
    renderer: { autoClear: true, getDrawingBufferSize: (v: { x: number; y: number }) => { v.x = 640; v.y = 448; return v; }, render: () => {}, dispose: () => { disposed++; } } as unknown as MatchRenderer['renderer'],
  };
  return { r, drawn, disposed: () => disposed, scene: () => scene };
}

/** Every listener the code under test adds to the page's window, and whether each is taken off again. */
function windowListeners() {
  const added: [string, unknown][] = [];
  const removed: [string, unknown][] = [];
  const add = globalThis.addEventListener.bind(globalThis), remove = globalThis.removeEventListener.bind(globalThis);
  vi.spyOn(globalThis, 'addEventListener').mockImplementation(((t: string, f: EventListener, o?: unknown) => { added.push([t, f]); add(t, f, o as AddEventListenerOptions); }) as typeof globalThis.addEventListener);
  vi.spyOn(globalThis, 'removeEventListener').mockImplementation(((t: string, f: EventListener, o?: unknown) => { removed.push([t, f]); remove(t, f, o as EventListenerOptions); }) as typeof globalThis.removeEventListener);
  return { left: () => added.filter(([t, f]) => !removed.some(([u, g]) => u === t && g === f)).map(([t]) => t) };
}

/** A map of two triangles and one prop (`test/worldDispose.test.ts`'s shape): enough for `buildWorld`. */
const part = (texture = 'wall.tif'): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: texture, fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
const synthetic = (): LoadedMap => ({
  archive: 'MP2', camera: null, path: 'RUN/MP2.ZDB', name: 'synthetic', lines: null,
  world: [part('ground.tif'), part('wall.tif')],
  props: [{ modelName: 'crate', parts: [part()], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]), order: 0, alternate: false, facade: 0, lod: null }],
  textures: {
    'ground.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 },
    'wall.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 },
  },
  textureFlags: {
    'ground.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
    'wall.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
  },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);
const meshes = (root: Object3D | null): number => { let n = 0; root?.traverse((o) => { if (o instanceof Mesh) n++; }); return n; };

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function options(x: ReturnType<typeof handOff>, extra: Partial<MatchMountOptions> = {}) {
  const holds: boolean[] = [];
  const w = fakeWindow(), r = fakeRenderer();
  const o: MatchMountOptions = {
    client: x.h.client, events: [welcome], handOff: x.h, holds: (h) => { holds.push(h); },
    assets: Promise.resolve(null), renderer: () => Promise.resolve(r.r), win: w.win, ...extra,
  };
  return { o, holds, w, r };
}

describe('NetPage.release: the client handed back open, unheard, the hold passing with it', () => {
  function page(x: ReturnType<typeof handOff>) {
    const holds: boolean[] = [];
    const teams: string[] = [];
    const hud = new Hud();
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
    } as unknown as WalkMode;
    const remote = { setTeam: (id: number, t: string) => { teams.push(`${id} ${t}`); }, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [] } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: (h) => { holds.push(h); }, adopt: { client: x.h.client, events: [welcome] } },
    };
    return { net: new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic'), holds, teams };
  }

  it('an open client: answered, not closed, no longer heard by the page, the session not let go', () => {
    const x = handOff();
    const p = page(x);
    expect(p.net.release()).toBe(x.h.client);
    expect(x.socks[0]!.closed).toEqual([]);
    expect(p.holds).toEqual([]);
    x.say({ type: 'joined', id: 4, name: 'lima', team: 'seal' });
    expect(p.teams).not.toContain('4 seal');
    expect(x.socks).toHaveLength(1);
  });

  it('a client already closed: none answered, the hold let go', () => {
    const x = handOff();
    const p = page(x);
    x.socks[0]!.onclose?.({ code: 1006, reason: '' });
    expect(p.net.release()).toBeNull();
    expect(p.holds).toEqual([false]);
  });
});

/**
 * FG-24 (the forge's day/night slider, FG.R18; an adaptation, no original): `MatchMountOptions.brighten` is the one way
 * a caller moves the match's brighten. Unset -- every caller but the forge's Play, and every standard match -- the match
 * lights as it always has: `DEFAULT_LIGHTING`, field for field.
 */
describe('matchLighting: the match\'s lighting from the mount\'s options', () => {
  it('is DEFAULT_LIGHTING without the option, a fresh copy each time', () => {
    expect(matchLighting(undefined)).toEqual(DEFAULT_LIGHTING);
    expect(matchLighting(undefined)).not.toBe(DEFAULT_LIGHTING);
  });
  it('carries the option\'s brighten and nothing else', () => {
    expect(matchLighting(-64)).toEqual({ ...DEFAULT_LIGHTING, brighten: -64 });
  });
  it('FG-39: the match\'s world takes the brighten after its build, only when a caller named one (the browser run: Play stayed lit)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');
    expect(src).toMatch(/const built = (?:prepared \?\? )?buildWorld\(m\);\s*\n\s*if \(o\.brighten !== undefined\) built\.setLighting\(lighting\);/);   // IP3: or the prepared world (`MatchLoader.prepare`), lit the same
  });
});

describe('mountMatch: the match built from parameters, with no /testroom markup in the document', () => {
  it('builds into the given element on the lobby\'s client and draws on the window\'s frames; reads no page markup', async () => {
    const x = handOff();
    const byId = vi.spyOn(document, 'getElementById'), bySel = vi.spyOn(document, 'querySelector');
    expect(document.body.children).toHaveLength(0);                                      // no #view, #mode, #loading, #mp-name, #tw-weapons
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    expect(document.body.querySelectorAll('canvas')).toHaveLength(1);
    expect(m.canvas.isConnected).toBe(true);
    await flush();
    expect(m.net()?.client).toBe(x.h.client);                                           // no second socket, no second hello
    expect(x.socks).toHaveLength(1);
    expect(x.socks[0]!.sent.filter((s) => s.includes('"hello"'))).toHaveLength(1);
    t.w.step(3);
    expect(t.r.drawn.length).toBeGreaterThan(0);
    expect(m.ended()).toBeNull();
    expect(byId).not.toHaveBeenCalled();
    expect(bySel).not.toHaveBeenCalled();
    m.close();
  });

  it('BLACK-GAP (a browser adaptation): firstFrame told once, after the first frame drawn with the world in -- never before the renderer or the assets', async () => {
    const x = handOff();
    let assetsIn!: (a: MatchAssets | null) => void;
    let rendererIn!: (r: MatchRenderer) => void;
    const seen: number[] = [];
    const t = options(x, {
      assets: new Promise((res) => { assetsIn = res; }), renderer: () => new Promise((res) => { rendererIn = res; }),
      firstFrame: () => { seen.push(t.r.drawn.length); },
    } as Partial<MatchMountOptions>);
    const m = mountMatch(document.body, t.o);
    t.w.step(2);
    expect(seen).toEqual([]);                                                            // no renderer yet
    rendererIn(t.r.r); await flush();
    t.w.step(2);
    expect(t.r.drawn).toHaveLength(2);
    expect(seen).toEqual([]);                                                            // drawn, but no world in yet
    assetsIn({ map: synthetic(), clips: null }); await flush();
    expect(seen).toEqual([]);
    t.w.step(1);
    expect(seen).toEqual([]);                                                            // the world's first render: not yet presented
    t.w.step(1);
    expect(seen).toEqual([4]);                                                           // the next frame: the world drawn
    t.w.step(3);
    expect(seen).toHaveLength(1);                                                        // once
    m.close();
  });

  it("BLACK-GAP: firstFrame waits for the scene's warm (the renderer's compile jobs) to settle, then a frame drawn after it", async () => {
    const texture = { rgba: { data: new Uint8ClampedArray(16).fill(200), width: 2, height: 2 }, gs: null };
    const effects = {
      archive: 'SYN', programs: [], absent: [], ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
      textures: [['bullet_mark_stone.tif', texture]], materials: ['UNKNOWN', 'STONE'], defaultMaterial: 1,
      marks: [{ set: 'BULLET', material: 'STONE', texture: 'bullet_mark_stone.tif', minSize: 1, maxSize: 2 }], footprints: [],
    } as unknown as NonNullable<MatchAssets['effects']>;
    const r = fakeRenderer();
    let compiled!: () => void;
    let warms = 0;
    const warm = (): Promise<void> => { warms++; return new Promise<void>((res) => { compiled = res; }); };
    const seen: number[] = [];
    const t = options(handOff('seal'), {
      assets: Promise.resolve({ map: grounded(), clips: null, effects }), renderer: () => Promise.resolve({ ...r.r, warm } as unknown as MatchRenderer),
      firstFrame: () => { seen.push(r.drawn.length); },
    } as Partial<MatchMountOptions>);
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(warms).toBe(1);
    t.w.step(5);
    expect(r.drawn).toHaveLength(5);
    expect(seen).toEqual([]);                                                            // drawn, the compile jobs still running
    compiled(); await flush();
    t.w.step(1);
    expect(seen).toEqual([]);
    t.w.step(1);
    expect(seen).toEqual([7]);
    m.close();
  });

  it('the mission world built into the drawn scene, and let go with the match', async () => {
    const x = handOff();
    const t = options(x, { assets: Promise.resolve({ map: synthetic(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    expect(meshes(t.r.scene())).toBeGreaterThanOrEqual(3);                              // the world's two and the prop
    expect(m.net()?.client).toBe(x.h.client);
    expect(m.release()).toBe(x.h.client);
    expect(meshes(t.r.scene())).toBe(0);
  });

  /**
   * LATER 456 (a forge adaptation, no original -- the original has no content props; H336): `extraWorld` is the one way a
   * caller (the Forge's Play, with FORGE_PLAY_CONTENT_PROPS_ADAPTATION on) puts its own objects in the match's scene: on
   * the scene after the world, off it with the match. Unset -- every match but the Forge's Play -- the scene is as before.
   */
  it('LATER 456: extraWorld on the drawn scene after the world, let go with the match; unset, the scene\'s children as before', async () => {
    const drawnNames = async (extra: Partial<MatchMountOptions>) => {
      const t = options(handOff(), { assets: Promise.resolve({ map: synthetic(), clips: null }), ...extra });
      const m = mountMatch(document.body, t.o);
      await flush();
      t.w.step(2);
      return { t, m, names: t.r.scene()!.children.map((c) => c.name) };
    };
    const plain = await drawnNames({});
    expect(plain.names).toEqual(PLAIN_MATCH_SCENE_CHILDREN);                         // unset: the scene's children as before
    plain.m.close();
    document.body.replaceChildren();
    const props = new Group();
    props.name = 'forge play content props';
    props.add(new Mesh());
    const withProps = await drawnNames({ extraWorld: props });
    const scene = withProps.t.r.scene()!;
    expect(props.parent).toBe(scene);                                                   // on the drawn scene
    expect(withProps.names.filter((n) => n !== props.name)).toEqual(PLAIN_MATCH_SCENE_CHILDREN);   // nothing else changed
    expect(withProps.names.indexOf(props.name)).toBe(withProps.names.indexOf('MP2 worldmodel') + 1);   // right after the world
    expect(withProps.m.release()).not.toBeNull();
    expect(props.parent).toBeNull();                                                    // off the scene with the match
    expect(scene.children).not.toContain(props);
  });

  it('release: the client back open, everything else let go -- the canvas, the frames, the listeners, the renderer', async () => {
    const x = handOff();
    const listeners = windowListeners();
    const lost: string[] = [];
    pageRendererProbe();                                                                // VS-7 review F4: the page's probe (its throwaway context) made before the mock, whatever the order
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) => (kind === 'webgl2'
      ? { getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: () => { lost.push(kind); } } : null) } : null)) as never);
    const hudGone = vi.spyOn(Hud.prototype, 'dispose');
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    expect(t.w.live.size).toBeGreaterThan(0);
    expect(lost).toEqual([]);
    expect(m.release()).toBe(x.h.client);
    expect(x.socks[0]!.closed).toEqual([]);
    expect(t.holds).toEqual([]);                                                         // the hold passes back with the client
    expect(m.canvas.isConnected).toBe(false);
    expect(t.w.frames.size).toBe(0);
    expect(t.w.live.size).toBe(0);
    expect(listeners.left()).toEqual([]);
    expect(t.r.disposed()).toBe(1);
    expect(lost).toEqual(['webgl2']);                                                    // the context let go at once, not at the collector's leisure
    expect(hudGone).toHaveBeenCalledTimes(1);                                            // the HUD's textures and materials freed
    expect(m.release()).toBeNull();                                                      // once
  });

  it('close: the client closed and the hold let go, the canvas gone', async () => {
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    m.close();
    expect(x.socks[0]!.closed).toEqual([1000]);
    expect(t.holds).toEqual([false]);
    expect(m.canvas.isConnected).toBe(false);
  });

  it('closed before its assets came: the client closed, nothing built after', async () => {
    const x = handOff();
    const t = options(x, { assets: new Promise(() => {}) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(m.net()).toBeNull();
    m.close();
    expect(x.socks[0]!.closed).toEqual([1000]);
    await flush();
    expect(m.net()).toBeNull();
    expect(document.body.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('the events heard between the mount and the match are not lost', async () => {
    const x = handOff();
    let land: (v: null) => void = () => {};
    const t = options(x, { assets: new Promise((r) => { land = r; }) });
    const m = mountMatch(document.body, t.o);
    x.say({ type: 'joined', id: 4, name: 'lima', team: 'seal' });
    land(null);
    await flush();
    expect([...(m.net() as unknown as { names: Map<number, string> }).names.keys()]).toContain(4);   // replayed after the welcome
    m.close();
  });

  it('a Terrorist seat replayed at the mount is spawned and bodied as a Terrorist (the client team before the NetPage is set)', async () => {
    const x = handOff('terrorist');
    expect(x.h.client.team).toBe('terrorist');
    const spawn = vi.spyOn(PlayerLoadout.prototype, 'spawn');
    const bodyType = vi.spyOn(PlayerLoadout.prototype, 'bodyType');
    const events = [{ ...welcome, team: 'terrorist' } as unknown as ServerEvent, { type: 'spawn', id: 2, at: [1, 2, 3], yaw: 0, after: 0 } as unknown as ServerEvent];
    const t = options(x, { events, assets: Promise.resolve({ map: synthetic(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(m.net()).not.toBeNull();
    expect(spawn.mock.calls.at(-1)?.[0]).toBe('terrorist');                              // the replayed spawn's kit: the seat's side
    expect(bodyType.mock.calls.at(-1)?.[0]).toBe('terrorist');                           // and its body
    m.close();
  });

  it('MENU-SIDE: a seat switched to the Terrorists in the game lobby is placed, spawned and bodied a Terrorist -- never the SEAL its welcome named', async () => {
    // The owner's playtest of main 50a98582c: "the terrorist player spawned as a SEAL with SEAL weapons".
    const x = handOff('seal', 'terrorist');
    expect(x.h.client.team).toBe('terrorist');
    const spawn = vi.spyOn(PlayerLoadout.prototype, 'spawn');
    const bodyType = vi.spyOn(PlayerLoadout.prototype, 'bodyType');
    const t = options(x, { events: [x.h.welcome!], assets: Promise.resolve({ map: synthetic(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(m.net()).not.toBeNull();
    // The world's placing (before the room's spawn) and the replayed welcome: the seat's side only.
    expect(spawn.mock.calls.map((c) => c[0])).not.toContain('seal');
    expect(spawn.mock.calls.length).toBeGreaterThan(0);
    expect(bodyType.mock.calls.map((c) => c[0])).not.toContain('seal');
    x.say({ type: 'spawn', id: 2, at: [1, 2, 3], yaw: 0, after: 0, kit: [1, 2, 3, 4, 5], char: 0 } as unknown as ServerEvent);   // round 1
    expect(spawn.mock.calls.at(-1)?.[0]).toBe('terrorist');
    expect(bodyType.mock.calls.at(-1)?.[0]).toBe('terrorist');
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    expect([hook.team(), hook.side(), hook.kit()]).toEqual(['terrorist', 'terrorist', [1, 2, 3, 4, 5]]);
    m.close();
  });

  // PRE-SPAWN-SIDE (PRE_SPAWN_STAND_SIDE_READING, research 222 s12): before the room's spawn the walk and the camera stand at
  // the seat's own start -- B for a Terrorist (research 75 s0) -- not at the SEALs' A. Frostfire's measured rows
  // (`spawns.ts`): A [796, 100, 614], B [536, 143, 1254]; the synthetic map has no hull, so the feet are the row's own y.
  for (const team of ['terrorist', 'seal'] as const) {
    it(`PRE-SPAWN-SIDE: a ${team === 'terrorist' ? 'Terrorist' : 'SEAL'} seat's walk and camera stand at its own start (${team === 'terrorist' ? 'B' : 'A'}) before the spawn`, async () => {
      const x = handOff(team);
      const ground = vi.spyOn(WalkMode.prototype, 'setGround');
      const look = vi.spyOn(FlyCamera.prototype, 'lookFrom');
      const t = options(x, { events: [{ ...welcome, team } as unknown as ServerEvent], assets: Promise.resolve({ map: { ...synthetic(), name: 'Frostfire' } as LoadedMap, clips: null }) });
      const m = mountMatch(document.body, t.o);
      await flush();
      const [own, other] = team === 'terrorist' ? [[536, 143, 1254], [796, 100, 614]] : [[796, 100, 614], [536, 143, 1254]];
      expect(ground.mock.calls.at(-1)?.[1]).toEqual(own);
      expect(look.mock.calls.at(-1)).toEqual([[own[0], own[1]! + 20, own[2]], other]);
      m.close();
    });
  }

  it('held (LobbyMatch.blocked): the camera takes no input and the pad is flushed each frame; released, the stick is live at once', async () => {
    const x = handOff();
    const pads = [{
      id: 'pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0.9, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    }];
    let blocked = true;
    const suspended = vi.spyOn(FlyCamera.prototype, 'setInputSuspended');
    const stick = vi.spyOn(FlyCamera.prototype, 'setStick');
    const t = options(x, { blocked: () => blocked });
    t.o.win = { ...t.o.win!, navigator: { getGamepads: () => pads as never } };
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(3);
    expect(suspended.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(suspended.mock.calls.every(([on]) => on === true)).toBe(true);
    expect(stick).not.toHaveBeenCalled();
    blocked = false;
    t.w.step(1);
    expect(suspended.mock.calls.at(-1)?.[0]).toBe(false);
    expect(stick.mock.calls.some(([sx, sy]) => sx !== 0 || sy !== 0)).toBe(true);        // flushed against the pad as it is: held, live
    m.close();
  });

  it('ended: the seat\'s end for good, with its dialog (NetPageDeps.game.ended)', async () => {
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    x.socks[0]!.onclose?.({ code: 4007, reason: '' });
    t.w.step(1);
    expect(m.ended()).toBe(GAME_ENDED_DIALOG_READING);
    m.close();
  });
});

/**
 * KEYBOARD-WHISPER (OT.R48; web research 266 §3.9): the online round's USB-keyboard text line in the front end's match
 * (`./roundTextLine`), drawn on the match's HUD and whispered through the lobby's path its option gives (the front end's
 * `BriefingRoomChat.mediusChat`); online as the option's `online()` reads the session's `ComeFromLan`.
 */
describe('KEYBOARD-WHISPER: the online round text line in the front end match', () => {
  const typeKeys = (w: ReturnType<typeof fakeWindow>, codes: string[]): void => { for (const c of codes) w.key(c); };
  const W_KILO_HI = ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI'];
  const shown = (t: ReturnType<typeof options>): string[] => {
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    return hook.hud().model.banner.flatMap((b) => b.lines.map((l) => l.text));
  };
  it('online: the line on the HUD; `/w kilo hi` with kilo an enemy row refused in colour 2; a name no row bears whispered and echoed', async () => {
    const x = handOff();
    const sent: [string, string][] = [];
    const t = options(x, { textLine: { online: () => true, whisper: (msg, name) => { sent.push([msg, name]); } } });
    const m = mountMatch(document.body, t.o);
    await flush();
    x.say({ type: 'score', rows: [
      { id: 2, name: 'socomc', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
      { id: 3, name: 'kilo', team: 'terrorist', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
    ], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } } as unknown as ServerEvent);
    t.w.key('Enter');                                                     // a development build: ENTER opens the line (ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION)
    typeKeys(t.w, W_KILO_HI);
    t.w.step(2);
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    expect(hook.hud().model.textLine?.text).toBe('/w kilo hi');
    t.w.key('Enter');
    t.w.step(1);
    expect(sent).toEqual([]);
    expect(shown(t)).toContain(':: Player "kilo" is unavailable');
    typeKeys(t.w, ['Enter', 'Slash', 'KeyW', 'Space', 'KeyL', 'KeyI', 'KeyM', 'KeyA', 'Space', 'KeyY', 'KeyO', 'Enter']);
    t.w.step(1);
    expect(sent).toEqual([['yo', 'lima']]);
    expect(shown(t)).toContain('yo');
    expect(hook.hud().model.textLine?.text ?? '').toBe('');                    // cleared (and fading out, or faded)
    m.release();
    t.w.key('KeyQ');
    expect(sent).toHaveLength(1);
  });
  it('not online (ComeFromLan set), or no line given: nothing typed', async () => {
    for (const extra of [{ textLine: { online: () => false, whisper: () => { throw new Error('sent'); } } }, {}] as Partial<MatchMountOptions>[]) {
      const x = handOff();
      const t = options(x, extra);
      const m = mountMatch(document.body, t.o);
      await flush();
      typeKeys(t.w, ['Enter', ...W_KILO_HI, 'Enter']);
      t.w.step(2);
      const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
      expect(hook.hud().model.textLine ?? null).toBeNull();
      m.close();
    }
  });
});

/**
 * SVC-25 (OT.R43; research 101 §7): SVC-19's round drain of the lobby server's lines (`./roundChat`, research 266 §3.3) is
 * the front end's match's -- the front end hands each line the lobby's chat gives a round to the mounted match's
 * `lobbyLine` (`frontEnd.ts`'s `roundLine`), and the match posts it on its own HUD's message window by EXTERNAL WHISPERS
 * and the round's actors. `/testroom` has no lobby session (no queue to drain), so `main.ts` mounts none.
 */
describe('SVC-19 in the front end match: the round drains the lobby\'s lines onto its HUD (lobbyLine)', () => {
  const shown = (t: ReturnType<typeof options>): string[] => {
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    return hook.hud().model.banner.flatMap((b) => b.lines.map((l) => l.text));
  };
  it('a whisper and a universe line posted; EXTERNAL WHISPERS off drops a whisper from outside the round, keeps one from a row\'s name', async () => {
    const x = handOff();
    let external: number | undefined;                                     // unset: the option's initial 1
    const t = options(x, { externalWhispers: () => external });
    const m = mountMatch(document.body, t.o);
    await flush();
    x.say({ type: 'score', rows: [
      { id: 2, name: 'socomc', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
      { id: 3, name: 'kilo', team: 'terrorist', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
    ], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } } as unknown as ServerEvent);
    m.lobbyLine({ text: 'carol: psst', name: 'carol', kind: 5 });
    t.w.step(1);
    expect(shown(t)).toContain('carol: psst');
    external = 0;
    m.lobbyLine({ text: 'dave: over here', name: 'dave', kind: 5 });      // no row bears dave: dropped
    m.lobbyLine({ text: 'Kilo: behind you', name: 'Kilo', kind: 5 });     // kilo's row, case-blind: kept
    m.lobbyLine({ text: 'ops: restart soon', name: 'ops', kind: 1 });     // a universe line, whatever the option
    t.w.step(1);
    expect(shown(t)).not.toContain('dave: over here');
    expect(shown(t)).toEqual(expect.arrayContaining(['carol: psst', 'Kilo: behind you', 'ops: restart soon']));
    m.close();
  });
});

describe('LobbyMatch over the mounted match (the front end\'s `start` port)', () => {
  it('its begin mounts the match; the match\'s end releases it and gives the lobby its client back', async () => {
    const x = handOff();
    const w = fakeWindow(), r = fakeRenderer();
    const backs: LobbyMatchReturn[] = [];
    let t = 0;
    let handle: MatchHandle | null = null;
    let held: (() => boolean) | null = null;
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => {}, hide: () => {} }, load: () => Promise.resolve(), holds: () => {},
      start: (s) => (held = s.blocked, handle = deferredMatch(s.client, Promise.resolve().then(() => mountMatch(document.body, {
        ...s, holds: s.holds, assets: Promise.resolve(null), renderer: () => Promise.resolve(r.r), win: w.win,
      })))),
      back: (b) => { backs.push(b); },
    });
    match.start(x.h);
    await flush();
    for (let i = 0; i < 60 && match.phase === 'loading'; i++) { t += 34; match.frame(); }
    // Was (before LOAD-HOLD): released with no round -- `expect(match.phase).toBe('match')`, then `held()` true ("no round yet: the mount holds its input").
    expect(match.phase).toBe('loading');                                                                             // LOAD-HOLD: no round yet, the screen holds (research 322 B1)
    x.say({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    for (let i = 0; i < 60 && match.phase === 'loading'; i++) { t += 34; match.frame(); }
    expect(match.phase).toBe('match');
    expect(handle).not.toBeNull();
    expect((held as (() => boolean) | null)?.()).toBe(false);                                                        // mounted with the round running: no hold left
    await flush();
    expect(document.body.querySelectorAll('canvas')).toHaveLength(1);
    w.step(2);
    match.frame();
    expect(match.phase).toBe('match');
    match.matchOver();
    expect(backs.map((b) => [b.why, b.dialog])).toEqual([['match-over', MATCH_END_RETURN_READING]]);
    expect(backs[0]!.client).toBe(x.h.client);
    expect(x.socks[0]!.closed).toEqual([]);
    expect(document.body.querySelectorAll('canvas')).toHaveLength(0);
    x.host.adopt(backs[0]!.client!);                                                     // the same game's lobby listens again
    expect(x.socks).toHaveLength(1);
  });

  it('VOICE-MATCH-RED (LATER 60): the round\'s voiceFloor heard on the loading screen (LOAD-HOLD) is the match voice\'s channel after the mount', async () => {
    // The room's launch (server `room.ts` `startRound(true)`): `roundStart`, then `voiceRoundStart`'s `voiceFloor` to
    // each member (TEAM 0, `VOICE_CHANNEL_MAP_READING.team`) -- both heard while the page still holds its loading screen
    // (LOAD-HOLD), so both reach the match only through `LobbyMatch`'s kept events, replayed by the `NetPage`'s constructor.
    const x = handOff();
    const w = fakeWindow(), r = fakeRenderer();
    let t = 0;
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => {}, hide: () => {} }, load: () => Promise.resolve(), holds: () => {},
      start: (s) => deferredMatch(s.client, Promise.resolve().then(() => mountMatch(document.body, {
        ...s, holds: s.holds, assets: Promise.resolve(null), renderer: () => Promise.resolve(r.r), win: w.win,
      }))),
      back: () => {},
    });
    match.start(x.h);
    await flush();
    for (let i = 0; i < 60 && match.phase === 'loading'; i++) { t += 34; match.frame(); }
    expect(match.phase).toBe('loading');
    x.say({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    x.say({ type: 'voiceFloor', channel: 0, holder: null });
    for (let i = 0; i < 60 && match.phase === 'loading'; i++) { t += 34; match.frame(); }
    expect(match.phase).toBe('match');
    await flush();
    w.step(3);                                                                           // the match's frames: the voice's `pad` each frame
    const hook = (w.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    expect(hook.voice().channel).toBe(0);                                                // voiceMatch.spec step 4's first read
    match.stop();
  });

  it('a match released before its module came: the client still answered, the mount let go when it lands', async () => {
    const x = handOff();
    let land: (h: ReturnType<typeof mountMatch>) => void = () => {};
    const d = deferredMatch(x.h.client, new Promise((r) => { land = r; }));
    expect(d.ended?.()).toBeNull();
    expect(d.release()).toBe(x.h.client);
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    land(m);
    await flush();
    expect(m.canvas.isConnected).toBe(false);
    expect(x.socks[0]!.closed).toEqual([]);
  });
});

describe('the front end bundle stays free of the match and of ./main (OT.R12)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('frontEnd.ts loads ./matchMount only by import() (a type import aside); matchMount.ts never names ./main', () => {
    const fe = src('frontEnd.ts');
    expect(fe).toMatch(/import\('\.\/matchMount'\)/);
    expect(fe.match(/^import (?!type ).*from '\.\/matchMount';$/m)).toBeNull();
    expect(fe).not.toMatch(/from '\.\/main'|import\('\.\/main'\)/);
    expect(src('matchMount.ts')).not.toMatch(/from '\.\/main'|import\('\.\/main'\)/);
  });
  // ONE-WIRE (research 222): the shared parts both pages mount stay free of `./main` and of `/testroom`'s markup -- the
  // whole static import graph from `./matchMount` is walked, so a part that pulls `./main` in by a side door turns red.
  it('the shared match parts read no page markup and never name ./main; nothing ./matchMount imports reaches main.ts', () => {
    for (const f of ['matchCore.ts', 'matchNet.ts', 'matchLanes.ts', 'matchFirearm.ts', 'matchActions.ts', 'matchSound.ts']) {
      expect(src(f), f).not.toMatch(/from '\.\/main'|import\('\.\/main'\)/);
      expect(src(f), f).not.toMatch(/document\.(getElementById|querySelector)/);
    }
    const seen = new Set<string>();
    const walk = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const m of src(f).matchAll(/(?:^import|^export)[^;]*? from '\.\/([^']+)';/gm)) {
        const next = `${m[1]!}.ts`;
        if (/^[\w/]+\.ts$/.test(next)) { try { src(next); walk(next); } catch { /* a directory index or a non-ts asset */ } }
      }
    };
    walk('matchMount.ts');
    expect(seen.size).toBeGreaterThan(30);
    expect(seen.has('matchFirearm.ts')).toBe(true);
    expect(seen.has('matchCore.ts')).toBe(true);
    expect(seen.has('main.ts')).toBe(false);
  });
});

describe('MATCH_MOUNT_PARTS_PLACEHOLDER names the parts the front end switch has off (ONE-WIRE)', () => {
  const words: Record<keyof MatchCapabilities, string> = {
    voice: 'voice client',
    firearm: 'firearm', throwables: 'throwables', launcher: 'launcher', worldDrops: 'world drops', armory: 'armory', exchange: 'exchange',
    inventory: 'R2 inventory', doors: 'doors', actions: 'actions', traversal: 'traversal', sound: 'sound', touch: 'touch',
    tacMap: 'tactical map', shadow: 'shadow', hostages: 'hostages', taunts: 'taunts', chat: 'tactical orders', replay: 'replay',
  };
  it('each part on is in the mounted half, each part off in the "not yet" half', () => {
    const [mounted, notYet] = MATCH_MOUNT_PARTS_PLACEHOLDER.split(';') as [string, string];
    expect(notYet).toMatch(/not yet$/);
    for (const [part, on] of Object.entries(FRONT_END_CAPABILITIES) as [keyof MatchCapabilities, boolean][]) {
      // PT-18 (W35.R5; spec 4.8): the replay mode is a devmode instrument the front end's match never mounts -- no part of
      // the original's match "not yet" mounted, so it is in neither half.
      if (part === 'replay') { expect(on).toBe(false); expect(MATCH_MOUNT_PARTS_PLACEHOLDER).not.toContain('replay'); continue; }
      expect(on ? mounted : notYet, part).toContain(words[part]);
    }
  });
});

describe('sprint 28 wave 4: one Fire source for both pages (PF-17, PF-18, PF-19; ONE-WIRE, research 222)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  // Without these the room drops the round ('nofire') or the reload ('flinch', 'proneCover') before its magazine moves,
  // and the page's does not -- the menu-launched match desynced when they were wired into main.ts alone. Since the one
  // wiring the Fire source is written once, in `./matchFirearm`, and both pages mount it (test/matchFirearm.test.ts
  // drives each hook); neither page writes a Fire source of its own, so there is no copy to drift.
  const hooks: [string, RegExp][] = [
    ['PF-17: NoFire refuses the round', /fireRefused: \(\): boolean => fireRefused\(zoom\.state\(\)\) \|\| !walk\.fireAllowed\(\),/],
    ['PF-18/19: no reload in the own flinch nor in Prone cover', /flinching: \(\): boolean => walk\.flinching\(\) \|\| walk\.knockCovered\(\),/],
    ['PF-18: the reload lock ends at the clip\'s cut', /reloadCut: \(\) => play\.takeReloadCut\(\),/],
    ['NU-1b B5: no reload begins under a climb', /climbHolds: \(\): boolean => walk\.climbHolds\(\),/],
    ['NU-1b B1: the climb\'s offer asks the firearm\'s reload lock', /walk\.setReloadLock\(\(cmd\) => fire\.reloadLocked\(cmd\)\);/],
    ['AD-1: the aim\'s cap is the map camera\'s MID with the view\'s extension', /aimCap: \(\) => cameraAimCap\(d\.map\(\)\?\.camera\?\.mid, zoom\.renderView\(\)\.farExtra\),/],
  ];
  for (const [what, line] of hooks) {
    it(`${what}: once, in matchFirearm.ts; in neither page`, () => {
      expect(src('matchFirearm.ts')).toMatch(line);
      for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).not.toMatch(line);
    });
  }
  it('PF-18: the own flinch undoes a reload the room dropped: once, in the shared NetPage deps (matchNet.ts); in neither page', () => {
    expect(src('matchNet.ts')).toMatch(/undoReload: \(\) => \{ firearm\.fire\.undoReload\(\); \}/);
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).not.toMatch(/undoReload: \(/);
  });
  it('the reload\'s gate (`ready`) stays free of NoFire (9185839b), in the one source and in neither page', () => {
    for (const f of ['matchFirearm.ts', 'main.ts', 'matchMount.ts']) expect(src(f), f).not.toMatch(/ready: .*fireAllowed/);
  });
});

describe('sprint 29: the pair the front end match does not mirror (PF-28, research 231 s4.3)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  // The join envelope's projectiles reach the page through `NetPageDeps.remoteGrenade`: /testroom forwards them to its
  // grenade page; the front end mounts no throwables, so its hook stands empty and a late joiner's corpses and round
  // screens reach it through NetPage alone. Asymmetric by design: since the one wiring the asymmetry is the capabilities
  // switch's (`FRONT_END_CAPABILITIES.throwables` false), its hooks the shared builder's (test/matchNet.test.ts drives them).
  it('PF-28: the projectile hooks are the throwables part\'s (./matchThrow), which both pages mount since MATCH-THROW: no page writes its own', () => {
    expect(src('matchMount.ts')).toMatch(/caps: FRONT_END_CAPABILITIES,/);
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).not.toMatch(/remoteGrenade: \(|ownProjectiles: \(/);
    expect(src('matchThrow.ts')).toMatch(/remoteGrenade: \([^)]*\) => grenade\.launchRemote\(/);
    expect(src('matchThrow.ts')).toMatch(/ownProjectiles: \(\) => grenade\.ownLive\(\),/);
  });
});

describe('sprint 30 wave 4: the parts the front end switch has off carry their hooks once (PF-34, PF-36, PF-37; ONE-WIRE, no twins)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  // Research 234 s6, 235 s5 and 236 s4 owed each line twice -- `main.ts` and a `matchMount.ts` twin (empty stand-ins,
  // `drops: null`, a mirrored `kitChanged`). Since the one wiring a part the front end does not mount is its switch's:
  // the hooks are listed once in `PART_DEPS` (test/matchNet.test.ts drives them), `/testroom` hands them, the front
  // end hands none and writes no stand-in; the kit's take is the one firearm's (`MatchFirearm.takeKit`). Since PAR-4 the
  // world drops are on the front end's switch too: both pages hand the two hooks, the same lines.
  it('PF-34 / PF-36: the charge hooks are the throwables part\'s (both pages, MATCH-THROW); since PAR-4 the front end mounts the world drops and hands their two hooks as main.ts does', () => {
    expect(FRONT_END_CAPABILITIES.throwables).toBe(true);
    expect(FRONT_END_CAPABILITIES.worldDrops).toBe(true);                               // PAR-4 (H120)
    expect(src('matchMount.ts')).not.toMatch(/tagOwnProjectile|detonateProjectile/);
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/new WorldDrops\(dropModels\(scene, \(\) => loadouts\.tables\(\), \(m\) => view\?\.held\(m\)\?\.clone\(\) \?\? null, \(\) => pickupKitOf\(loadouts\.loadout\(\), loadouts\.tables\(\), \(s\) => firearm\.heldRounds\(\)\[s\]\?\.rounds \?\? 0, ((?:throws\.)?grenade)\.stats\(\)\.leftByItem, \1\.stats\(\)\.equipmentSlots\), \(item\) => \{ const h = heldOfItem\(item\); if \(h\) play\.dropHeld\(h\); \}\)\);/);   // MLS-EQ: the same thrower's aggregate and exact slot rings in both mounts; OBF-15: the own death's drop off the own body
      expect(src(f), f).toMatch(/^\s+drops,\s/m);
      expect(src(f), f).toMatch(/drops: \{ ahead: \(\) => drops\.promptAt\(walk\.feet\(\), walk\.snapshot\(\)\?\.yaw \?\? 0\), candidates: /);   // PAR-34 group 7: the count beside it
      expect(src(f), f).toMatch(/kitChanged: \(l, s, r, f, k\) => \{ firearm\.takeKit\(l, s, r, f, k\); \},/);   // OT.R59: a resume's pouch (`k`) too
    }
    expect(src('matchThrow.ts')).toMatch(/tagOwnProjectile: \([^)]*\) => grenade\.tagOwn\(/);
    expect(src('matchThrow.ts')).toMatch(/detonateProjectile: \([^)]*\) => grenade\.detonateRemote\(/);
    expect(src('main.ts')).toMatch(/kitChanged: \([^)]*\) => \{ firearm\.takeKit\(/);
    expect(src('matchFirearm.ts')).toMatch(/takeKit: \(l, s, r, f, resumed\) => \{\s+fireModes\[kitItem\] = fireMode; takeRoomKit\(kitTaker, l, s, r, f\);/);
  });
  it('PF-37: the R2 inventory\'s launcher reads the wading depth (matchThrow.ts inventoryKit, the same depth selectSlot reads): once, for both pages', () => {
    expect(src('matchThrow.ts')).toMatch(/if \(equipmentKind\(id\) === 'launcher'\) return slotSelectable\(id, \{ claymoresDown: 0, roundsFor: \(l\) => rocket\.roundsFor\(l\), wadingDepth: \(\) => rocket\.wadingDepth\(\) \}\);/);
    expect(FRONT_END_CAPABILITIES.launcher).toBe(true);
    expect(FRONT_END_CAPABILITIES.inventory).toBe(true);
    for (const f of ['main.ts', 'matchMount.ts', 'matchFirearm.ts']) expect(src(f), f).not.toMatch(/wadingDepth/);
  });
});

describe('ACT-5: the hostages part on both pages (HX-4a, HX-5; ruling HX.R8 closed)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  // The orders (`./hostagePage`), their NetPage hook (`PART_DEPS.hostages`), the action's `escortee` and the compass
  // marks: main.ts's lines (research 239 s7.1, s7.2), and since ACT-5 (ACT.R5; research 250 s6) the front end's switch has
  // the part on and matchMount.ts copies them -- the map `map` where main.ts reads `loaded`. Unreachable from the lobby
  // until Desert Glory is listed (ACT.R6): these headless runs are the front end's proof; /testroom's specs the part's.
  it("the front end hands the hostages as main.ts does: the HostagePage after the others' bodies with the eight shared deps, handed to the actions, offered each frame, reset at the teardown; hostageState in the rest; the marks fed before the render", () => {
    expect(FRONT_END_CAPABILITIES.hostages).toBe(true);
    const mm = src('matchMount.ts');
    const built = mm.indexOf('const hostages = new HostagePage({');
    expect(built).toBeGreaterThan(mm.indexOf('const remote = new RemotePlayers('));
    // The nine deps, main.ts's lines with the mount's `map` for `loaded`.
    const deps: RegExp[] = [
      /self: \(\) => \{\n\s+const c = net\?\.client, feet = walk\.feet\(\);\n\s+return c && feet \? \{ id: c\.id, alive: walk\.mode\(\) === 'walk' && !walk\.isDead\(\), spectator: c\.role !== 'player', side: c\.team \?\? 'seal', feet \} : null;\n\s+\},/,
      /hostages: \(\) => net\?\.hostages\(\)\.values\(\) \?\? \[\],/,
      /feet: \(id\) => remote\.feet\(id\),/,
      /aim: \(\) => walk\.fireAim\(\),/,
      /bodies: \(eye, dir, reach\) => remote\.aimBodies\(eye, dir, reach\),/,
      /surfaces: \(eye, far\) => \{ const g = walk\.grid\(\); return g \? pickSurfaces\(g, eye, far, map\?\.grenade\?\.defaultMaterial \?\? ''\) : \[\]; \},/,
      /cellOf: \(feet\) => orderCellOf\(map\?\.ai, feet\),/,                // DF-7: the located cell (ORDER_CELL_FIELD_READING)
      /order: \(id, cmd\) => net\?\.hostageOrder\(id, cmd\) \?\? false,/,
    ];
    for (const d of deps) expect(mm.slice(built), String(d)).toMatch(d);
    // Handed to the actions: landed by the controller's rebase at ACT-1's merge (ACT-5's base had no `mountActions` call; once it
    // has one, the call carries `hostages,` as main.ts's does (the 3-line rebase the merge controller makes).
    expect(/mountActions\(\{[^]*?\n\s+hostages,[^\n]*\n\s*\}\);/.test(mm)).toBe(true);   // the controller's rebase at ACT-1's merge: the call's last line (bombView's braces sit before it)
    // PAR-94 B2: the HUD's line gated on the seat's spawn too (was: `hud\.setVisible\(walking\);`).
    expect(mm).toMatch(/hud\.setVisible\(walking && spawned\);[^]*?\n\s+hostages\.frame\(\);[^\n]*\n[^]*?firearm\.feedHud\(walking/);
    expect(mm).toMatch(/const teardown = \(\): void => \{[^]*?\n\s+hostages\.reset\(\);/);
    expect(mm).toMatch(/roundClear: \(\) => \{[^\n]*hostages\.reset\(\);[^\n]*\},/);
    expect(mm).toMatch(/\.\.\.sound\.netDeps\(\),[^\n]*\n\s+hostageState: \(ev\) => hostages\.state\(ev\),/);
    // A Forge layout's escort zones' marks beside them (`./forge/playObjectives` `FORGE_ESCORT_ZONE_MARK_ADAPTATION`):
    // only a Forge map carries `forgeZoneMarks`; any other passes undefined, `main.ts`'s line exactly. FP-1b (REVIEW-C 21):
    // the forge marks' argument is required, not an optional group that passes either form.
    expect(mm).toMatch(/hud\.setHostageMarks\(net\?\.hostageMarks\(map\?\.ai, map\?\.forgeZoneMarks\) \?\? \[\]\);[^\n]*\n\s+(?:if \(drawFrame\) )?hud\.render\(/);   // VS-4: the render behind the frame cap's gate
  });
  it("the lobby's client in an EXTRACTION welcome: the hostages' states reach the page's HostagePage (state hook), and an escortee under the crosshair alive and in range is offered FOLLOW! (the escortee context; the fire sends hostageOrder)", async () => {
    const frame = vi.spyOn(HostagePage.prototype, 'frame'), state = vi.spyOn(HostagePage.prototype, 'state');
    const reset = vi.spyOn(HostagePage.prototype, 'reset'), marks = vi.spyOn(Hud.prototype, 'setHostageMarks');
    // The ray's geometry only (the capsules are `test/hitVolumes`', the pick `test/hostagePage`'s): the hostage's body
    // drawn 50 u ahead of the seat on its line of fire; every other read is the mount's own.
    const feet = RemotePlayers.prototype.feet, aimBodies = RemotePlayers.prototype.aimBodies;
    vi.spyOn(RemotePlayers.prototype, 'feet').mockImplementation(function (this: RemotePlayers, id: number) { return id === 240 ? [0, 0, -50] : feet.call(this, id); });
    vi.spyOn(RemotePlayers.prototype, 'aimBodies').mockImplementation(function (this: RemotePlayers, eye, dir, reach) {
      return [{ id: 240, distance: 50 }, ...aimBodies.call(this, eye, dir, reach)];
    });
    const hostage = { id: 240, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 0x11, name: 'Hostage', character: 'mp_fem1', at: [0, 0, -50], yaw: 0 };
    const extraction = { ...welcome, hostages: [hostage] } as unknown as ServerEvent;
    // Sub-map 0 over the floor, 10 u cells, every cell stored walkable (the order's cell is the located one, DF-7's
    // `orderCellOf`): the seat and the hostage 5 cells apart (under ORDER_RANGE_CELLS_READING's 20).
    const ai = { version: 2, maps: [{ index: 0, name: 'sub0', id: 0, flags: 0, min: [-200, 0, -200], max: [200, 0, 200], cellsX: 40, cellsZ: 40, cellSize: [10, 10], zones: [],
      rows: Array.from({ length: 40 }, (_, z) => ({ x0: 0, x1: 40, first: z * 40 })), cells: new Uint32Array(40 * 40).fill(0x80000001) }], links: { words: 0, records: 0 }, spawns: [] };
    const a = await armed({}, { events: [extraction], assets: Promise.resolve({ map: { ...grounded(), ai } as unknown as LoadedMap, clips: null }) });
    a.t.w.step(2);
    const page = frame.mock.contexts.at(-1) as HostagePage;
    expect(page).toBeInstanceOf(HostagePage);
    expect(a.m.net()?.hostages().get(240)).toMatchObject({ id: 240, unit: 0x11 });
    const told = { type: 'hostageState', id: 240, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 0x11 } as unknown as ServerEvent;
    a.x.say(told);
    expect(state).toHaveBeenCalledWith(told);
    expect(state.mock.contexts.at(-1)).toBe(page);
    expect(marks).toHaveBeenCalled();
    a.t.w.step(1);
    expect(page.offer()).toMatchObject({ hostage: 240, cmd: 4, text: 'FOLLOW!', prompt: 'escortee' });
    expect(page.fire()).toBe(true);
    const sent = a.x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.startsWith('{')).map((d) => JSON.parse(d) as { type: string; hostage?: number; cmd?: number });
    expect(sent.filter((e) => e.type === 'hostageOrder')).toEqual([expect.objectContaining({ hostage: 240, cmd: 4 })]);
    a.m.release();
    expect(reset.mock.contexts).toContain(page);
  });
  it("main.ts: the HostagePage built after the others' bodies, handed to the actions, offered each frame, reset with the drops; its state hook and the marks fed before the render", () => {
    const main = src('main.ts');
    const built = main.indexOf('const hostages = new HostagePage({');
    expect(built).toBeGreaterThan(main.indexOf('const remote = new RemotePlayers('));
    expect(main).toMatch(/cellOf: \(feet\) => orderCellOf\(loaded\?\.ai, feet\),/);   // DF-7: the located cell (ORDER_CELL_FIELD_READING)
    expect(main).toMatch(/order: \(id, cmd\) => net\?\.hostageOrder\(id, cmd\) \?\? false,/);
    expect(main).toMatch(/^\s+hostages,\s+\/\/ HX-4a/m);
    expect(main).toMatch(/acts\.bomb\.hudFrame\(\);[^\n]*\n\s+hostages\.frame\(\);/);
    expect(main).toMatch(/drops\.reset\(\);[^\n]*\n\s+hostages\.reset\(\);/);
    expect(main).toMatch(/\.\.\.sound\.netDeps\(\),[^\n]*\n\s+hostageState: \(ev\) => hostages\.state\(ev\),/);
    expect(main).toMatch(/hud\.setHostageMarks\(net\?\.hostageMarks\(loaded\?\.ai\) \?\? \[\]\);[^\n]*\n\s+hud\.render\(/);
  });
});

describe('sprint 29 wave 4: the front end match mirrors main.ts\'s view and spectator lines (PF-29, PF-31; ruling PF.R53)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  // Each frame line as main.ts has it, and matchMount.ts's: both pages' frames still call them (the frame itself is each
  // page's, research 222). PF-29 (research 232 s7): the zoom's render view reaches the world each frame. PF-31 (research
  // 232 s5.7): the pad reaches the spectator once a frame; the map's scenic views reach the page -- the shared deps' own
  // line since the one wiring (matchNet.ts), in neither page.
  const pairs: [string, RegExp, RegExp][] = [
    ['PF-29: the world frame takes the zoom\'s render view (WorldView.frame\'s third argument)',
      /view\?\.frame\(fly\.camera, dt, zoom\.renderView\(\)\);/, /view\?\.frame\(fly\.camera, dt, firearm\.zoom\.renderView\(\)\);/],
    ['PF-31: the pad reaches the spectator once a frame (NetPage.spectatorPad)',
      /net\?\.spectatorPad\(padMerged\);/, /net\?\.spectatorPad\(padMerged\);/],
  ];
  for (const [what, inMain, inCopy] of pairs) {
    it(`${what}: main.ts has it and matchMount.ts copies it`, () => {
      expect(src('main.ts')).toMatch(inMain);
      expect(src('matchMount.ts')).toMatch(inCopy);
    });
  }
  it("LATER 671 (the v0.4.11 review's F3; SS-2): the test room's tags take the browser's name-tag look as matchMount.ts does", () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/hud\.setTeamTags\(page \? teamTags\(\{ \.\.\.teamTagInput\([^\n]*\), original: hud\.teammateNamesOriginal\(\) \}\) : null\);/);
      expect(src(f), f).toMatch(/hud\.setTeammateNames\(teamNames !== 0, readNameTags\(\) === 'original'\);/);   // SS-2: the card 0 / 1 on or off, the browser key the look
      expect(src(f), f).not.toMatch(/TEAMMATE_NAMES_ORIGINAL_VALUE/);
    }
  });
  it('PF-31: the map\'s scenic views reach the page (NetPageDeps.scenicViews): once, in matchNet.ts', () => {
    expect(src('matchNet.ts')).toMatch(/scenicViews: \(\) => scenicViews\(p\.map\(\) \?\? \{\}\),/);
    expect(src('matchNet.ts')).toMatch(/import \{ scenicViews \} from '\.\/spectatorView';/);
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).not.toMatch(/scenicViews/);
  });
  // The PF-31 review's gate: Triangle (`input.stance`) is the spectator's jump to the visible player and the fly camera's
  // "down"; while the page is a spectator or benched (`NetPage.spectatorCamera`) the lift leaves it out, else Triangle in
  // the free camera sinks the fly camera and its release snaps to follow.
  // ONE-WIRE (research 222): the lift is written once, in `./matchCore` `feedCamera` (its behaviour: test/matchCore.test.ts),
  // and both pages feed the camera through it with the NetPage's gate -- neither sets the lift itself.
  it('PF-31 review: the fly camera\'s lift leaves Triangle out while the page is a spectator or benched (NetPage.spectatorCamera): one feedCamera, both pages through it', () => {
    expect(src('matchCore.ts')).toMatch(/fly\.setLift\(\(input\.jump \? 1 : 0\) - \(input\.crouch \|\| \(input\.stance && !spectator\(\)\) \? 1 : 0\)\);/);
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f)).toMatch(/feedCamera\(fly, input, \(\) => !!net\?\.spectatorCamera\(\)\);/);
      expect(src(f)).not.toMatch(/fly\.setLift\(/);
    }
  });
});

/** A floor under the whole synthetic map: the walk stands on it, the fire has its hull and its aim (`test/fire.test.ts`'s). */
const floorQuad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
const grounded = (): LoadedMap => {
  const polys = [floorQuad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200])];
  const ground = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((q, i) => ({ modelName: q.modelName, path: `${q.path}${i}`, first: i, count: 1 })),
  );
  return { ...synthetic(), ground } as LoadedMap;
};
const button = () => ({ pressed: false, touched: false, value: 0 });

/** The front end's match on a floor, a pad to press, the room's sends read off the socket. */
async function armed(o: { team?: 'seal' | 'terrorist'; blocked?: () => boolean } = {}, extra: Partial<MatchMountOptions> = {}) {
  const x = handOff(o.team ?? 'seal');
  x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);   // the room stood the seat
  const pad = { id: 'pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, button) };
  const t = options(x, { assets: Promise.resolve({ map: grounded(), clips: null }), ...(o.blocked ? { blocked: o.blocked } : {}), ...extra });
  t.o.win = { ...t.o.win!, navigator: { getGamepads: () => [pad] as never } };
  const m = mountMatch(document.body, t.o);
  await flush();
  const press = (b: number, down: boolean): void => { pad.buttons[b] = { pressed: down, touched: down, value: down ? 1 : 0 }; pad.timestamp++; };
  const fires = (): unknown[] => x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.startsWith('{')).map((d) => JSON.parse(d) as { type: string }).filter((e) => e.type === 'fire');
  return { x, m, t, press, fires };
}

/**
 * LATER 180 (research 215 s8.3, s8.4): from a spawn the rifle is lowered, and the page refuses the trigger's round until
 * its raise reads 1 (`FireSource.raiseRefused`, `FUN_005c0ae0` D:L476423-476438). The frame reads the pad's press (the
 * pull, refused), then ticks the raise (`play.frame`), then the held trigger's `fireFrame`. LATER 185: the raise steps
 * once a game frame and reads 1 at the end of the press's game frame + `RAISE_REFUSAL_FRAMES` -- three game frames,
 * 0.1001 s, which seven page frames of 16 ms (0.112 s) always hold wherever the press falls (was: seven page ticks of
 * 0.1 s in doubles) -- and the round leaves there. A test about what a round does, not about the raise, steps this many
 * frames after its press.
 */
const RAISE_STEPS = 7;

describe('ONL-18d: the firearm in the front end match (main.ts gunplay, copied)', () => {
  it('R1 fires through NetPage and its socket only: each round the room is sent is a NetPage.fireEvent', async () => {
    const sent = vi.spyOn(NetPage.prototype, 'fireEvent');
    const a = await armed();
    a.t.w.step(2);
    expect(a.m.net()?.client.state).toBe('open');
    a.press(5, true);                                                                    // R1
    a.t.w.step(RAISE_STEPS);                                                             // LATER 180: up from the spawn's lowered rifle
    const rounds = sent.mock.calls.filter(([e]) => e.type === 'round');
    expect(rounds.length).toBeGreaterThan(0);
    expect(a.fires().length).toBe(rounds.length);                                        // no round reaches the room another way
    expect(a.x.socks).toHaveLength(1);
    a.m.close();
  });

  it('no round while held, nor for an R1 held through the hold at its release; a fresh press fires', async () => {
    let blocked = true;
    const a = await armed({ blocked: () => blocked });
    a.press(5, true);
    a.t.w.step(3);
    expect(a.fires()).toEqual([]);
    blocked = false;
    a.t.w.step(3);
    expect(a.fires()).toEqual([]);                                                       // held, not pressed (the flush)
    a.press(5, false);
    a.t.w.step(1);
    a.press(5, true);
    a.t.w.step(RAISE_STEPS);                                                             // LATER 180: the first pull raises the rifle
    expect(a.fires().length).toBeGreaterThan(0);
    a.m.close();
  });

  it('a respawn gives the seat its side kit: the loadout spawned for the side, the fire, bloom and view reset to it', async () => {
    const a = await armed({ team: 'terrorist' });
    const spawn = vi.spyOn(PlayerLoadout.prototype, 'spawn');
    const weapon = vi.spyOn(Fire.prototype, 'setWeapon'), refill = vi.spyOn(Fire.prototype, 'refill'), respawn = vi.spyOn(Zoom.prototype, 'respawn');
    a.x.say({ type: 'spawn', id: 2, at: [5, 0, 5], yaw: 0, after: 0 } as unknown as ServerEvent);
    expect(spawn.mock.calls.at(-1)?.[0]).toBe('terrorist');
    const records = (spawn.mock.contexts.at(-1) as PlayerLoadout).records();
    expect(weapon.mock.calls.at(-1)?.[0]).toBe(records[0]);                              // the primary in the hand
    expect(refill).toHaveBeenCalled();
    expect(respawn).toHaveBeenCalledWith(records[0]);
    a.m.close();
  });

  it('held (LobbyMatch.blocked), R takes no reload and sends none; released, it reloads (main.ts swallows every key while held)', async () => {
    let blocked = true;
    const reload = vi.spyOn(Fire.prototype, 'reload');
    const a = await armed({ blocked: () => blocked });
    a.t.w.step(2);
    a.t.w.key('KeyR');
    expect(reload).not.toHaveBeenCalled();
    const reloads = (): number => a.x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.includes('"reload"')).length;
    expect(reloads()).toBe(0);
    blocked = false;
    a.t.w.step(1);
    a.t.w.key('KeyR');
    expect(reload).toHaveBeenCalled();
    a.m.close();
  });

  it('the pad lanes: L2 and L1 swap, R3 reloads, d-pad Up zooms', async () => {
    const reload = vi.spyOn(Fire.prototype, 'reload'), select = vi.spyOn(Kit.prototype, 'select'), zoomIn = vi.spyOn(Zoom.prototype, 'zoomIn');
    const a = await armed();
    a.t.w.step(2);
    const tap = (b: number): void => { a.press(b, true); a.t.w.step(1); a.press(b, false); a.t.w.step(1); };
    tap(6);                                                                              // L2
    expect(select).toHaveBeenLastCalledWith('pistol');
    a.t.w.step(120);                                                                     // the swap's clip played out
    tap(4);                                                                              // L1
    expect(select).toHaveBeenLastCalledWith('rifle');
    a.t.w.step(120);
    tap(11);                                                                             // R3
    expect(reload).toHaveBeenCalled();
    tap(12);                                                                             // Up
    expect(zoomIn).toHaveBeenCalled();
    a.m.close();
  });

  it('sprint 25 kept: L1 / L2 gated whole first (WalkMode.swapGate), the swap start moves the zoom to the new slot (Zoom.switchWeapon), R2 opens the R2 menu (MATCH-THROW), the fire-mode row shown', async () => {
    const select = vi.spyOn(Kit.prototype, 'select'), switchWeapon = vi.spyOn(Zoom.prototype, 'switchWeapon');
    const row = vi.spyOn(Hud.prototype, 'setFireModeRow');
    const a = await armed();
    a.t.w.step(2);
    expect(row).toHaveBeenLastCalledWith(true);                                          // no throwable up: the row (FUN_005bc300)
    const tap = (b: number): void => { a.press(b, true); a.t.w.step(1); a.press(b, false); a.t.w.step(1); };
    const gate = vi.spyOn(WalkMode.prototype, 'swapGate').mockReturnValue(false);
    tap(6);                                                                              // L2 refused whole: nothing taken
    expect(select).not.toHaveBeenCalled();
    gate.mockRestore();
    tap(6);
    expect(select).toHaveBeenLastCalledWith('pistol');
    a.t.w.step(2);
    expect(switchWeapon).toHaveBeenCalled();                                             // FUN_005c4b10: +0x824 the new slot at once
    select.mockClear();
    const opened = vi.spyOn(InventoryMenu.prototype, 'press');
    a.t.w.step(120);                                                                     // the swap played out (the kit's gate)
    tap(7);                                                                              // R2: the R2 menu's (MATCH-THROW: mounted)
    expect(select).not.toHaveBeenCalled();                                               // it opens the menu; nothing is taken
    expect(opened.mock.contexts.some((m) => (m as InventoryMenu).isOpen())).toBe(true);
    a.m.close();
  });

  it('the browser spec hook (a development build): what the match sees, facing another, gone at the teardown', async () => {
    const a = await armed();
    a.t.w.step(2);
    const hook = (a.t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK];
    expect(hook).toBeDefined();
    expect(hook!.team()).toBe('seal');
    expect(hook!.id()).toBe(2);
    a.x.say({ type: 'joined', id: 4, name: 'lima', team: 'terrorist' } as unknown as ServerEvent);
    expect(hook!.heard()['joined']).toBe(1);
    expect(hook!.aimAt(99, 40)).toBe(false);                                            // no such body: nothing turned
    a.m.release();
    expect((a.t.o.win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK]).toBeUndefined();
  });

  it('teardown frees the firearm: the fire, its effects and the reticle let go', async () => {
    const fireGone = vi.spyOn(Fire.prototype, 'dispose'), effectsGone = vi.spyOn(Effects.prototype, 'reset'), reticle = vi.spyOn(Reticle.prototype, 'setBitmaps');
    const a = await armed();
    a.t.w.step(2);
    expect(a.m.release()).toBe(a.x.h.client);
    expect(fireGone).toHaveBeenCalledTimes(1);
    expect(effectsGone).toHaveBeenCalled();
    expect(reticle).toHaveBeenLastCalledWith(null);
    expect(meshes(a.t.r.scene())).toBe(0);
  });
});


describe('PAR-1: WEAPON EXCHANGE and the dead\'s prompt in the front end match (./matchExchange, research 253)', () => {
  it("dead on the lobby's client: the dead's prompt on the hook's weaponSelect, the gate NetPage's; the spawn takes it away; the blur listener let go at the teardown", async () => {
    const a = await armed();
    a.t.w.step(2);
    const hook = (a.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    expect(hook.weaponSelect()).toMatchObject({ screen: 'closed', prompt: null, gate: { inMatch: true, alive: true } });
    a.x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(hook.weaponSelect().gate).toEqual({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
    expect(hook.weaponSelect().prompt?.length).toBeGreaterThan(0);
    a.x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(hook.weaponSelect()).toMatchObject({ screen: 'closed', prompt: null });
    a.m.close();
    expect(a.t.w.live.has('blur')).toBe(false);
  });

  // Research 253 s5's owed case: the mounted match with a map arsenal (`exchangeArsenal`: pkmArsenal's pattern, a rifle
  // added), so R2 opens the menu on the front end itself -- the open, the confirm's loadout request and the room's answer.
  it("dead with a map arsenal: R2 opens WEAPON EXCHANGE, Cross's pick of the other rifle sends the side's list as the loadout request, the room's answer is the menu's kit; the spawn closes it", async () => {
    const map = grounded();
    (map as unknown as { arsenal: unknown }).arsenal = exchangeArsenal;
    const a = await armed({}, { assets: Promise.resolve({ map, clips: null }) });
    a.t.w.step(2);
    const hook = (a.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    const tap = (b: number): void => { a.press(b, true); a.t.w.step(1); a.press(b, false); a.t.w.step(1); };
    const loadoutsSent = (): { picks: { slot: number; id: number }[] }[] => a.x.socks[0]!.sent
      .filter((d) => typeof d === 'string' && d.startsWith('{')).map((d) => JSON.parse(d) as { type: string; picks: { slot: number; id: number }[] })
      .filter((e) => e.type === 'loadout' && e.picks.length > 0);
    a.x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(hook.weaponSelect().gate).toEqual({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
    tap(7);                                                                              // R2: the menu opens
    a.t.w.step(60);
    expect(hook.weaponSelect().screen).not.toBe('closed');
    expect(hook.weaponSelect().loadout).toEqual([...EXCHANGE_SEAL_KIT]);                 // on the side's kit
    for (const b of [0, 13, 0]) { tap(b); a.t.w.step(30); }                              // Cross (the primary's picker), Down, Cross
    expect(loadoutsSent().at(-1)?.picks).toEqual([{ slot: 0, id: 62 }]);                 // the M4A1 SD in the primary's slot
    a.x.say({ type: 'loadout', kit: [62, 15, 122, 151, 194], refused: null } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(hook.weaponSelect().loadout).toEqual([62, 15, 122, 151, 194]);               // the room's answer on the rows
    a.x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0, kit: [62, 15, 122, 151, 194] } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(hook.weaponSelect().screen).toBe('closed');                                   // the round's reset closed it
    a.m.close();
  });
});

// PAR-5 (PARITY-2; research 253 §4, research 222 §11): WEAPON EXCHANGE's touch half, owed by PAR-1 -- the touch layer
// (`./matchTouch`, `/testroom`'s part) mounted on the menu match, so a real touch device START let in (OT.R29) can open
// the dead's menu: the prompt names INV, INV shows with it and opens the menu, and a touch on the open menu is its tap.
describe('PAR-5: the dead exchange on coarse input in the front end match (./matchTouch, research 253 §4)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("a touch screen, no pad: the layer built over the match's canvas; dead, the prompt names [INV] and INV shows; its press opens WEAPON EXCHANGE, a touch on the open menu is its tap (a mouse click is not, OT.R38); the close takes the layer and its listeners away", async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', addEventListener: () => {}, removeEventListener: () => {} }));
    const listeners = windowListeners();
    const tap = vi.spyOn(WeaponExchange.prototype, 'tap');
    const map = grounded();
    (map as unknown as { arsenal: unknown }).arsenal = exchangeArsenal;
    const x = handOff();
    x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);
    const t = options(x, { assets: Promise.resolve({ map, clips: null }) });           // the fake window's navigator: no pad
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    const inv = document.body.querySelector<HTMLElement>('#tw-weapons');
    expect(inv).not.toBeNull();
    expect(document.body.classList.contains('touch')).toBe(true);
    expect(inv!.closest('#touch')!.parentElement!.style.zIndex).toBe('1001');          // over the match's canvas (1000)
    expect(inv!.hidden).toBe(true);                                                    // alive: no prompt, no INV
    x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    t.w.step(1);
    expect(hook.weaponSelect().prompt?.[0]).toContain('[INV]');                        // WEAPON_SELECT_TOUCH_READING, not the pad's glyph
    expect(inv!.hidden).toBe(false);
    inv!.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true }));
    t.w.step(60);
    expect(hook.weaponSelect().screen).not.toBe('closed');
    vi.spyOn(m.canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 640, height: 448, right: 640, bottom: 448, x: 0, y: 0, toJSON: () => ({}) });
    const at = (pointerType: string): void => { m.canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, pointerType, clientX: 320, clientY: 224, bubbles: true, cancelable: true })); };
    at('mouse');
    expect(tap).not.toHaveBeenCalled();
    at('touch');
    expect(tap).toHaveBeenCalledTimes(1);
    m.close();
    expect(document.body.querySelector('#touch')).toBeNull();
    expect(document.body.classList.contains('touch')).toBe(false);
    expect(listeners.left()).toEqual([]);
    expect(t.w.live.size).toBe(0);
  });
});

// ---- PAR-1's map arsenal (research 253 s5): pkmArsenal's shape with the SEALs' two rifles, matchExchange.test.ts's ids ----
const exRec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const exItem = (name: string, id: number): RdrNode[] => exRec(['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['AMMO_TYPES', []], ['IconTextureName', `${name}_icon.tif`]);
const EXCHANGE_SEAL_KIT = [54, 15, 121, 151, 194] as unknown as Loadout;
const exchangeArsenal = {
  table: {
    arsenal: arsenalOf(['ZAMMO', [], 'ZWEAPON', [
      exItem('Mark 23', 15), exItem('M4A1', 54), exItem('M4A1 SD', 62), exItem('M67', 121), exItem('AN-M8', 122), exItem('HE', 126),
      exItem('C4', 151), exItem('Double Ammo Load', 194),
    ]] as RdrNode),
    records: new Map([[54, { ...HELD_RIFLE, id: 54 }], [62, { ...HELD_RIFLE, id: 62 }], [15, HELD_SIDEARM]]), rounds: new Map(), turretRecords: new Map(),
  },
  map: {
    valves: new Map([['Enable_Mark23', 1], ['Enable_m4Acarbine', 1], ['Enable_M4A1_SD', 1], ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_c4', 17], ['Enable_2xammo', 9]]),
    selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'Seal1', character: 'mp2_seal1', loadout: EXCHANGE_SEAL_KIT }], terrorist: [] },
  },
};

describe('MATCH-THROW: the throwables, the launcher and the R2 inventory in the front end match (./matchThrow, research 222 §8)', () => {
  /** R2 opens the inventory; two d-pad Ups step to slot 2 (the M67 of the baked kit); Cross takes it up. */
  const takeM67 = (a: Awaited<ReturnType<typeof armed>>): void => {
    const tap = (b: number): void => { a.press(b, true); a.t.w.step(1); a.press(b, false); a.t.w.step(1); };
    tap(7);                                                                              // R2: the menu opens
    a.t.w.step(60);                                                                      // its open plays out (state 3 reads)
    tap(12); a.t.w.step(30);                                                             // Up: slot 1
    tap(12); a.t.w.step(30);                                                             // Up: slot 2
    tap(0); a.t.w.step(2);                                                               // Cross: taken up
  };
  const throws = (a: Awaited<ReturnType<typeof armed>>) => a.x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.startsWith('{'))
    .map((d) => JSON.parse(d) as { type: string; kind?: string; seq?: number; slot?: number }).filter((e) => e.type === 'throw');

  it('the R2 inventory takes a throwable up and R1 throws it -- to the room through NetPage.throwEvent only', async () => {
    const sent = vi.spyOn(NetPage.prototype, 'throwEvent');
    const equipped = vi.spyOn(GrenadeThrower.prototype, 'selectEquipment');
    const a = await armed();
    a.t.w.step(2);
    takeM67(a);
    expect(equipped).toHaveBeenCalledWith(1);                                            // the kit's equipment slot 1: the M67
    const g = equipped.mock.contexts.at(-1) as GrenadeThrower;
    expect(g.equipped()).toBe(true);
    a.press(5, true); a.t.w.step(20);                                                    // R1 held: the pin pulled, the power
    a.press(5, false); a.t.w.step(120);                                                  // let go: the throw's clip, the release
    expect(sent.mock.calls.map(([k]) => k)).toContain('M67');
    expect(throws(a).length).toBe(sent.mock.calls.length);                               // no throw reaches the room another way
    expect(throws(a).at(-1)?.kind).toBe('M67');
    a.m.close();
  });

  it('a throw the room refuses stale gives its exact kit slot back once (NET-FIX2, LOW-2: staleThrow; MLS-EQ)', async () => {
    const giveBack = vi.spyOn(GrenadeThrower.prototype, 'giveBack');
    const a = await armed();
    a.t.w.step(2);
    takeM67(a);
    a.press(5, true); a.t.w.step(20);
    a.press(5, false); a.t.w.step(120);
    const seq = throws(a).at(-1)?.seq;
    expect(seq).toBeTypeOf('number');
    expect(throws(a).at(-1)?.slot).toBe(2);
    a.x.say({ type: 'stale', request: 'throw', seq } as unknown as ServerEvent);
    a.x.say({ type: 'stale', request: 'throw', seq } as unknown as ServerEvent);
    expect(giveBack.mock.calls).toEqual([['M67', 2]]);
    const g = giveBack.mock.contexts[0] as GrenadeThrower;
    expect(g.magazineOf(2)).toMatchObject({ rounds: 3, capacity: 3 });
    a.m.close();
  });

  it('another player\'s grenade is flown and drawn on the page (remoteGrenade)', async () => {
    const launch = vi.spyOn(GrenadeThrower.prototype, 'launchRemote');
    const a = await armed();
    a.t.w.step(2);
    a.x.say({ type: 'grenade', id: 3, kind: 'M67', from: [10, 5, 10], velocity: [0, 50, 0], pid: 9 } as unknown as ServerEvent);
    expect(launch).toHaveBeenCalledWith('M67', [10, 5, 10], [0, 50, 0], 3, { pid: 9 }, undefined);   // LATER 643: no age told
    const g = launch.mock.contexts.at(-1) as GrenadeThrower;
    expect(g.stats().live.some((l) => l.pid === 9)).toBe(true);
    expect(g.object.parent).toBe(a.t.r.scene());                                         // on the drawn scene
    a.m.close();
  });

  it('the review\'s finding 1: a round\'s start clears the air, the scorches and the wash -- without the ARMORY (its glue is /testroom\'s)', async () => {
    const launch = vi.spyOn(GrenadeThrower.prototype, 'launchRemote');
    const scorches = vi.spyOn(GrenadeThrower.prototype, 'clearScorches'), marks = vi.spyOn(Fire.prototype, 'clearMarks');
    const a = await armed();
    a.t.w.step(2);
    a.x.say({ type: 'grenade', id: 3, kind: 'Mark141', from: [10, 5, 10], velocity: [0, 50, 0], pid: 9 } as unknown as ServerEvent);
    const g = launch.mock.contexts.at(-1) as GrenadeThrower;
    expect(g.stats().live).toHaveLength(1);                                              // airborne at the round's end
    const wash = vi.spyOn(WhiteOut.prototype, 'stop');
    a.x.say({ type: 'roundStart', round: 2, seconds: 300, epoch: 2 } as unknown as ServerEvent);
    expect(g.stats().live).toHaveLength(0);                                              // gone with the room's air
    expect(wash).toHaveBeenCalled();                                                     // the wash neutral: no blind after the respawn
    expect(scorches).toHaveBeenCalled();                                                 // both decal pools (CMPExitState L76084)
    expect(marks).toHaveBeenCalled();
    a.m.close();
  });

  it('the review\'s finding 2: the throw\'s arc and the scorches warmed once the map and the renderer are in, as /testroom\'s warmWalk', async () => {
    const prepared: string[][] = [];
    const x = handOff('seal');
    const r = fakeRenderer();
    const prepare = (objects: readonly { name: string }[]): Promise<void> => { prepared.push(objects.map((o) => o.name)); return Promise.resolve(); };
    const t = options(x, { assets: Promise.resolve({ map: grounded(), clips: null }), renderer: () => Promise.resolve({ ...r.r, prepare } as unknown as MatchRenderer) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toEqual(expect.arrayContaining(['scorch (warm-up)', 'scorch clipped (warm-up)']));
    m.close();
  });

  // LATER 253 (the owner's report: "the first grenade, the first bullet, they still lag the client"): on the front end's
  // match the first shot linked 9 programs in its frame and the first explosion 14 (a rendered trace, 617 ms and 817 ms
  // frames), where `/testroom` warms them (`./main` `warmEffects`). The match page now warms the map's effects, and the
  // scene with them, once the map and the renderer are in: the renderer's whole-scene `warm` with the effects' warm-up
  // group in the scene, the group gone after (`../src/matchWarm`).
  it('LATER 253: the map\'s effects warmed with the scene once the map and the renderer are in; the warm-up group gone after', async () => {
    const texture = { rgba: { data: new Uint8ClampedArray(16).fill(200), width: 2, height: 2 }, gs: null };
    const effects = {
      archive: 'SYN', programs: [], absent: [], ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
      textures: [['bullet_mark_stone.tif', texture]], materials: ['UNKNOWN', 'STONE'], defaultMaterial: 1,
      marks: [{ set: 'BULLET', material: 'STONE', texture: 'bullet_mark_stone.tif', minSize: 1, maxSize: 2 }], footprints: [],
    } as unknown as NonNullable<MatchAssets['effects']>;
    const warmed: string[][] = [];
    let scene: Scene | null = null;
    const r = fakeRenderer();
    const warm = (s: Scene): Promise<void> => {
      scene = s;
      const names: string[] = [];
      s.traverse((o) => { names.push(o.name); });
      warmed.push(names);
      return Promise.resolve();
    };
    const x = handOff('seal');
    const t = options(x, { assets: Promise.resolve({ map: grounded(), clips: null, effects }), renderer: () => Promise.resolve({ ...r.r, warm } as unknown as MatchRenderer) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(warmed, 'the scene compiled once, the map and the renderer in').toHaveLength(1);
    expect(warmed[0]).toContain('effects warm-up');
    const after: string[] = [];
    scene!.traverse((o) => { after.push(o.name); });
    expect(after, 'the warm-up group out of the drawn scene after').not.toContain('effects warm-up');
    m.close();
  });

  // The review's F3: the other order -- the renderer in first, the map after -- warms once too, and the warm is done
  // (`Effects.warmDone`, which ends the light passes' warm-up) when the compile settles.
  it('LATER 253: the renderer first, the map after: warmed once, and done', async () => {
    const texture = { rgba: { data: new Uint8ClampedArray(16).fill(200), width: 2, height: 2 }, gs: null };
    const effects = {
      archive: 'SYN', programs: [], absent: [], ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
      textures: [['bullet_mark_stone.tif', texture]], materials: ['UNKNOWN', 'STONE'], defaultMaterial: 1,
      marks: [{ set: 'BULLET', material: 'STONE', texture: 'bullet_mark_stone.tif', minSize: 1, maxSize: 2 }], footprints: [],
    } as unknown as NonNullable<MatchAssets['effects']>;
    const done = vi.spyOn(Effects.prototype, 'warmDone');
    let warms = 0;
    const r = fakeRenderer();
    let give!: (a: MatchAssets) => void;
    const assets = new Promise<MatchAssets>((res) => { give = res; });
    const x = handOff('seal');
    const t = options(x, { assets, renderer: () => Promise.resolve({ ...r.r, warm: () => { warms++; return Promise.resolve(); } } as unknown as MatchRenderer) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(warms, 'no map yet: nothing warmed').toBe(0);
    give({ map: grounded(), clips: null, effects } as unknown as MatchAssets);
    await flush();
    expect(warms).toBe(1);
    expect(done).toHaveBeenCalledTimes(1);
    done.mockRestore();
    m.close();
  });

  it('teardown frees the throwables: off the scene, the flash\'s wash stopped, the menu closed, the map\'s assets let go', async () => {
    const stop = vi.spyOn(WhiteOut.prototype, 'stop'), setMap = vi.spyOn(GrenadeThrower.prototype, 'setMap');
    const close = vi.spyOn(InventoryMenu.prototype, 'close');
    const a = await armed();
    a.t.w.step(2);
    const g = setMap.mock.contexts.at(-1) as GrenadeThrower;
    expect(a.m.release()).toBe(a.x.h.client);
    expect(g.object.parent).toBeNull();
    expect(setMap).toHaveBeenLastCalledWith(null, null);
    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(meshes(a.t.r.scene())).toBe(0);
  });
});

/** The match's own audio (MATCH-SOUND): a `GameAudio` on an output that plays nothing, its release counted. */
function matchAudio() {
  const game = new GameAudio(silentOut(), () => 0.5, { inline: false });
  let released = 0;
  const audio: MatchAudio = { game, release: () => { released++; } };
  return { audio, game, released: () => released };
}
const soundData = (): SoundData => ({ archive: 'MP2', banks: [], missing: [] } as unknown as SoundData);

describe("MATCH-SOUND: the sound in the front end match (one wiring with /testroom: ./matchSound, research 222 §7)", () => {
  it("the map's sound data and loops from the assets onto the match's own GameAudio; the camera its listener each frame", async () => {
    const a = matchAudio();
    const set = vi.spyOn(a.game, 'setData'), loops = vi.spyOn(a.game, 'setLoops'), listen = vi.spyOn(a.game, 'setListener');
    const data = soundData(), rendered = [{ name: 'BED', sound: {} as never }];
    const x = handOff();
    const t = options(x, { audio: a.audio, assets: Promise.resolve({ map: synthetic(), clips: null, sound: { data, loops: rendered } }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(set).toHaveBeenCalledWith(data);
    expect(loops).toHaveBeenCalledWith(rendered);
    t.w.step(2);
    expect(listen).toHaveBeenCalled();
    m.close();
  });

  it("R1's rounds sound on the match's GameAudio (WalkSounds.fireEvent -> onFire), as /testroom's", async () => {
    const a = matchAudio();
    const fire = vi.spyOn(a.game, 'onFire');
    const m = await armed({}, { audio: a.audio });
    m.t.w.step(2);
    m.press(5, true);                                                                    // R1
    m.t.w.step(RAISE_STEPS);                                                             // LATER 180: up from the spawn's lowered rifle
    expect(fire).toHaveBeenCalled();
    m.m.close();
  });

  it("release and close free the match's audio: the banks let go and the output given back, once", async () => {
    for (const end of ['release', 'close'] as const) {
      const a = matchAudio();
      const set = vi.spyOn(a.game, 'setData');
      const x = handOff();
      const t = options(x, { audio: a.audio });
      const m = mountMatch(document.body, t.o);
      await flush();
      if (end === 'release') m.release(); else m.close();
      expect(set, end).toHaveBeenLastCalledWith(null);
      expect(a.released(), end).toBe(1);
      if (end === 'release') m.release(); else m.close();
      expect(a.released(), end).toBe(1);
    }
  });

  /**
   * NU-7 W1 (research 325 §2.1, §4 W1; `GRENADE_WARNING_LINE_READING`): the room's accepted throw of a teammate's M67
   * through the real page -- `NetPage`'s `grenade`, `./matchThrow`'s `remoteRelease`, the page's `warning`, the mounted
   * sound's `grenadeWarning` -- posts the row's text with the thrower's name (`NetPage.nameOf`) on the match's HUD.
   */
  it("NU-7 W1: a teammate's grenade posts the warning's line on the match's HUD, the thrower's name in it", async () => {
    const a = matchAudio();
    const data = { ...soundData(), reverb: { indoor: [], outdoor: [] }, taunts: { vocals: { seal: [], terrorist: [] }, grenadeWarnings: { seal: [], terrorist: [[{ sound: '^PT_0450', text: '%s : FIRE IN THE HOLE!', character: 'c' }]] } } } as unknown as SoundData;
    const m = await armed({ team: 'terrorist' }, { audio: a.audio, assets: Promise.resolve({ map: grounded(), clips: null, sound: { data, loops: [] } }) });
    m.t.w.step(2);
    const shown = (): string[] => (m.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!.hud().model.banner.flatMap((b) => b.lines.map((l) => l.text));
    m.x.say({ type: 'grenade', id: 3, kind: 'M67', from: [10, 5, 10], velocity: [0, 50, 0], pid: 9 } as unknown as ServerEvent);   // kilo, a teammate
    m.t.w.step(1);
    expect(shown()).toContain('kilo : FIRE IN THE HOLE!');
    m.m.close();
  });

  it("no audio given: the match mounts all the same, silent (its sound hooks owed and handed)", async () => {
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(m.net()).not.toBeNull();
    m.close();
  });
});

describe("MATCH-SOUND: matchLoader asks the map's sound of the worker, as /testroom's askSound", () => {
  it("kind sound on the map's path and archive once the map is in; the data and its loops in the assets", async () => {
    const asked: ViewerRequest[] = [];
    let hear: ((e: MessageEvent<ViewerResponse>) => void) | null = null;
    const say = (m: unknown): void => { hear!({ data: m } as MessageEvent<ViewerResponse>); };
    const worker: MatchWorker = {
      postMessage: (r) => { asked.push(r); },
      addEventListener: ((type: string, fn: (e: MessageEvent<ViewerResponse>) => void) => { if (type === 'message') hear = fn; }) as MatchWorker['addEventListener'],
      terminate: () => {},
    };
    const loader = matchLoader({ kind: 'http', baseUrl: '/maps' } as never, () => worker);
    const assets = loader.load('mp2');
    const map = synthetic();
    say({ kind: 'map', id: asked[0]!.id, map });
    say({ kind: 'play', id: asked[1]!.id, data: null });
    await flush();
    const sound = asked.find((r) => r.kind === 'sound');
    expect(sound).toMatchObject({ kind: 'sound', path: map.path, archive: map.archive });
    const effects = asked.find((r) => r.kind === 'effects')!;
    say({ kind: 'effects', id: effects.id, data: null });
    const data = soundData(), loops = [{ name: 'BED', sound: {} }];
    say({ kind: 'sound', id: sound!.id, data });
    say({ kind: 'soundLoops', id: sound!.id, loops });
    const a = await assets;
    expect(a?.sound).toEqual({ data, loops });
    loader.dispose();
  });
});

describe('TAUNTS in the front end match (one wiring with /testroom: ./matchTaunts, research 301)', () => {
  const tauntData = { defaults: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'], captions: {}, vocals: { seal: [], terrorist: [] } };
  const withTaunts = (): Partial<MatchMountOptions> => ({
    assets: Promise.resolve({ map: grounded(), clips: null, sound: { data: { ...soundData(), beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, taunts: tauntData } as unknown as SoundData, loops: [] } }),
    taunts: () => [null, null, 'CUSTOM TAUNT 03', null, null],
  });
  const hook = (a: Awaited<ReturnType<typeof armed>>): MatchWindowHook => (a.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;

  it('a Circle tap opens the Chat menu on the session\'s five; R1 held into it fires no more, held through its close neither; a fresh pull fires', async () => {
    const a = await armed({}, withTaunts());
    a.t.w.step(2);
    expect(hook(a).taunts().custom).toEqual(['ONE', 'TWO', 'CUSTOM TAUNT 03', 'FOUR', 'FIVE']);
    a.press(5, true);                                                                    // R1 held: the rifle fires
    a.t.w.step(RAISE_STEPS);                                                             // LATER 180: up from the spawn's lowered rifle
    expect(a.fires().length).toBeGreaterThan(0);
    a.press(1, true); a.t.w.step(1); a.press(1, false); a.t.w.step(1);                   // Circle tapped
    expect(hook(a).taunts().open).toBe(true);
    // Open, the camera takes no input and the walk holds for the menu, as /testroom's `menu` does (the review's finding 3).
    const suspended = vi.spyOn(FlyCamera.prototype, 'setInputSuspended'), hold = vi.spyOn(WalkMode.prototype, 'holdForMenu');
    a.t.w.step(1);
    expect([suspended.mock.calls.at(-1)?.[0], hold.mock.calls.at(-1)?.[0]]).toEqual([true, true]);
    const held = a.fires().length;
    a.t.w.step(10);
    expect(a.fires().length).toBe(held);                                                 // the trigger let go at the open
    a.press(3, true); a.t.w.step(1); a.press(3, false); a.t.w.step(1);                   // Triangle let go at the root: closed
    expect(hook(a).taunts().open).toBe(false);
    a.t.w.step(10);
    expect(a.fires().length).toBe(held);                                                 // R1 still the menu's until let go
    a.press(5, false); a.t.w.step(1); a.press(5, true); a.t.w.step(3);
    expect(a.fires().length).toBeGreaterThan(held);
    a.m.close();
  });

  it('the open asks the throwables to cancel an uncommitted held grenade (GrenadeThrower.cancelMenuHold, held by test/grenade.test.ts) and sends no throw', async () => {
    const cancel = vi.spyOn(GrenadeThrower.prototype, 'cancelMenuHold');
    const a = await armed({}, withTaunts());
    a.t.w.step(2);
    a.press(1, true); a.t.w.step(1); a.press(1, false); a.t.w.step(1);
    expect(hook(a).taunts().open).toBe(true);
    expect(cancel).toHaveBeenCalled();
    const throws = a.x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.includes('"throw"'));
    expect(throws).toEqual([]);
    a.m.close();
  });
});

describe('MATCH-01: the in-round START menu in the front end match (./startMenu, research 266 §8)', () => {
  /** Past the round start's 2 s lockout (`DAT_003dc420`): 25 frames of 0.1 s. */
  const settle = (a: Awaited<ReturnType<typeof armed>>): void => { a.t.w.step(2); a.t.w.step(25, 100); };
  const tap = (a: Awaited<ReturnType<typeof armed>>, b: number): void => { a.press(b, true); a.t.w.step(1); a.press(b, false); a.t.w.step(1); };

  it('START (button 9) opens the menu in the round: the HUD hides under it (Hud.setStartMenu), START again closes it', async () => {
    const shown = vi.spyOn(Hud.prototype, 'setStartMenu');
    const a = await armed();
    settle(a);
    expect(shown).not.toHaveBeenCalled();
    tap(a, 9);
    expect(shown.mock.calls.at(-1)?.[0]).toBe(true);
    tap(a, 9);
    a.t.w.step(1);
    expect(shown.mock.calls.at(-1)?.[0]).toBe(false);
    a.m.close();
  });

  it('while it is open the game\'s lanes take nothing: R1 held fires no round, the camera and the walk held for the menu', async () => {
    const a = await armed();
    settle(a);
    tap(a, 9);                                                                           // open
    const suspended = vi.spyOn(FlyCamera.prototype, 'setInputSuspended'), hold = vi.spyOn(WalkMode.prototype, 'holdForMenu');
    a.press(5, true); a.t.w.step(5);                                                     // R1 held under the menu
    expect(a.fires()).toEqual([]);
    expect([suspended.mock.calls.at(-1)?.[0], hold.mock.calls.at(-1)?.[0]]).toEqual([true, true]);
    tap(a, 9);                                                                           // closed; R1 still the menu's until let go
    a.t.w.step(3);
    expect(a.fires()).toEqual([]);
    a.press(5, false); a.t.w.step(1); a.press(5, true); a.t.w.step(RAISE_STEPS);        // LATER 180: the first pull raises the rifle
    expect(a.fires().length).toBeGreaterThan(0);                                         // a fresh pull fires
    a.m.close();
  });

  it('the match\'s dispose tears the menu down (StartMenu.dispose)', async () => {
    const disposed = vi.spyOn(StartMenu.prototype, 'dispose');
    const a = await armed();
    settle(a); tap(a, 9);
    a.m.close();
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe('OT.R29 (controller only): a release build hands no key to the match\'s padFrame', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('vi.stubEnv DEV false: the match adds no key listener, and keys pressed reach no lane -- no round, no reload, no step', async () => {
    vi.stubEnv('DEV', false);
    const reload = vi.spyOn(Fire.prototype, 'reload'), pull = vi.spyOn(Fire.prototype, 'pull');
    const a = await armed();
    a.t.w.step(2);
    expect(a.t.w.live.has('keydown')).toBe(false);
    expect(a.t.w.live.has('keyup')).toBe(false);
    const before = a.x.socks[0]!.sent.length;
    for (const code of ['KeyR', 'KeyW', 'Space', 'KeyI', 'Digit3', 'KeyB', 'Tab', 'ArrowUp', 'KeyC']) { a.t.w.key(code); a.t.w.step(2); }
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
    a.t.w.step(2);
    expect(reload).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
    const sent = a.x.socks[0]!.sent.slice(before).filter((d) => typeof d === 'string' && /"type":"(fire|reload|throw|loadout|taunt)"/.test(d));
    expect(sent).toEqual([]);
    a.m.close();
  });
});

/** A barrier across x 130 on the floor, a destructible taking C4's 18 (shield 17): `test/equipmentPage.test.ts`'s shape. */
const BARRIER = 'worldmodel/access1=access1/good_parts/di_good';
const barrierMap = (): LoadedMap => {
  const polys = [
    floorQuad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
    { ...floorQuad([130, 0, 150, 130, 0, 250, 130, 60, 250, 130, 60, 150]), path: BARRIER, ditype: 2, material: 7 },
  ];
  const ground = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((q, i) => ({ modelName: q.modelName, path: q.path, first: i, count: 1 })),
  );
  const instances = polys.map((q, id) => ({ id, path: q.path, node: q.path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: q.path }));
  const meta = {
    stem: 'MP2', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    // The barrier's state saved at the opening (a bit-28 reference, as Frostfire's panes: `test/panes.test.ts`), so a
    // round's reset gives it back (WORLD_RESET_SAVED_READING).
    initial: [{ path: BARRIER, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }],
    scene: { programs: [], destructibles: [{
      id: 0, key: `access1#0@${BARRIER}`, anim: 'access1', instance: 1, targetPath: BARRIER, root: BARRIER,
      health: 1, armor: 0, shield: 17, program: { name: 'access1', root: 1, flags: 0x20, nodes: ['NA', BARRIER], sequences: [] }, nodes: [null, BARRIER],
    }] },
  };
  return { ...synthetic(), ground, meta } as unknown as LoadedMap;
};

describe('MATCH-GAPS: the claymore\'s message line and C4\'s world in the front end match (research 222 §4 rows 14-15, §9)', () => {
  /** The match on the barrier's map, the room's spawn 20 units short of it (inside C4's 32: `C4_REACH_READING`). */
  async function atBarrier() {
    const x = handOff('seal');
    x.say({ type: 'spawn', id: 2, at: [110, 0, 200], yaw: 0, after: 0 } as unknown as ServerEvent);
    const t = options(x, { assets: Promise.resolve({ map: barrierMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    return { x, t, m };
  }

  it('the claymore\'s refusal is posted on the HUD\'s message window as the original\'s (0x65f880, colour 2, the main window)', async () => {
    const post = vi.spyOn(Hud.prototype, 'postMessage'), setMap = vi.spyOn(GrenadeThrower.prototype, 'setMap');
    const a = await armed();
    a.t.w.step(2);
    const g = setMap.mock.contexts.at(-1) as GrenadeThrower;
    post.mockClear();
    // The claymore's fire with four down (`FUN_005be9a0` D:L475330-475331): the thrower's own `refuse`.
    (g as unknown as { emit(k: 'refuse', i: { item: string; text: string; seconds: number }): void })
      .emit('refuse', { item: 'Claymore', text: CLAYMORE_RULES.maxPlacedMessage, seconds: CLAYMORE_RULES.refuseSeconds });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith([{ text: 'Unable To Deploy: Max Equipment Items Placed (4)', scale: MESSAGE_SCALE, rgb: [0.5, 0.5, 0.75] }]);
    const hud = post.mock.contexts[0] as Hud;
    a.t.w.step(20);
    // TAUNT-WRAP (research 87 §14.1): posted at the window's own 0.9 (CLAYMORE_REFUSAL_SCALE_READING) the refusal measures
    // over 297, so FUN_002b6530 (D:L158010-158055) puts it on two lines of the window, broken at a space.
    const refusal = hud.state().model.banner.find((m) => m.lines.map((l) => l.text).join(' ') === CLAYMORE_RULES.maxPlacedMessage);
    expect(refusal?.lines.map((l) => l.text)).toEqual(['Unable To Deploy: Max Equipment Items', 'Placed (4)']);
    a.m.close();
  });

  it('C4 finds the map\'s destructible on the front end: the thrower\'s world the page\'s WorldState, the barrier settled under the reticle and the charge planted on it', async () => {
    const setWorld = vi.spyOn(GrenadeThrower.prototype, 'setWorld');
    const step = vi.spyOn(WorldState.prototype, 'step');
    const a = await atBarrier();
    const g = setWorld.mock.contexts.at(-1) as GrenadeThrower;
    const world = setWorld.mock.calls.at(-1)![0]() as WorldState | null;
    expect(world).toBeInstanceOf(WorldState);
    expect(world!.health.c4TargetAt(BARRIER, 18)).toBe(0);
    expect(step).toHaveBeenCalled();                                                      // its programs run each frame (main.ts's `pageWorld?.step(dt)`)
    // The walk stands on the world's own grid, as /testroom's (walk.setGround's third): the thrower's pick reads it.
    const source = (g as unknown as { source: { grid(): unknown; aim?(): unknown } }).source;
    expect(source.grid()).toBe(world!.grid);
    // The reticle east onto the barrier from the SEAL's eye (the aim alone stood in for: no pad turn in this test).
    source.aim = () => ({ eye: [110, 12, 200], far: [410, 12, 200] });
    const placed: { item: string; target?: number | null }[] = [];
    g.on('place', (p) => { placed.push({ item: p.item, target: p.target }); });
    // The disc's C4 record (`zweapon.rdr` ID 151: Explosion_Damage 18; `test/equipmentPage.test.ts`'s), the map's
    // table having none in this synthetic map; the kit's C4 slot and the pouch filled as a spawn fills it.
    g.setRecords([{ ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 }]);
    g.setKit(['M67', 'AN-M8', 'C4']);
    g.refill();                                                                           // the pouch full of the kit's (a spawn's)
    a.t.w.step(20);                                                                       // 0.32 s: past the settle (C4_AIM_SETTLE_S)
    expect(g.c4Target()).toBe(0);
    expect(g.plantC4()).toBe(true);
    a.t.w.step(90);                                                                       // C4_PLANT_SECONDS: 1.098 s
    expect(placed.at(-1)).toMatchObject({ item: 'C4', target: 0 });
    a.m.close();
  });

  it('the room\'s world followed: the NetPage is handed the same WorldState (protocol 10, MAP-03), as /testroom\'s', async () => {
    const setWorld = vi.spyOn(GrenadeThrower.prototype, 'setWorld');
    const a = await atBarrier();
    const world = setWorld.mock.calls.at(-1)![0]();
    const deps = (a.m.net() as unknown as { deps: NetPageDeps }).deps;
    expect(deps.world?.()).toBe(world);
    a.m.close();
    expect(setWorld.mock.calls.at(-1)![0]()).toBeNull();                                  // let go with the match
  });

  it('a map with no ground: no world, C4 none (main.ts: `map.ground && hullGrid`)', async () => {
    const setWorld = vi.spyOn(GrenadeThrower.prototype, 'setWorld');
    const x = handOff('seal');
    const t = options(x, { assets: Promise.resolve({ map: synthetic(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    expect(setWorld.mock.calls.at(-1)![0]()).toBeNull();
    m.close();
  });
});

describe('MATCH-GAPS review round: the front end match follows the room\'s world through the adopted client (protocol 10)', () => {
  /** The room's snapshot, a binary frame on the lobby's socket, with its environment. */
  const snapshot = (x: ReturnType<typeof handOff>, tick: number, env: { revision: number; epoch: number; states: { id: number; active: boolean }[] }): void => {
    x.socks[0]!.onmessage?.({ data: encodeSnapshot({ tick, own: null, bodies: [], env }) } as unknown as MessageEvent);
  };

  it("the room's barrier taken down before the match: down on the match's world at the adoption; a snapshot's env and a new epoch on it after", async () => {
    const setWorld = vi.spyOn(GrenadeThrower.prototype, 'setWorld');
    const x = handOff('seal');
    snapshot(x, 1, { revision: 3, epoch: 1, states: [{ id: 1, active: false }] });          // in the lobby: no world to lay it on
    x.say({ type: 'spawn', id: 2, at: [110, 0, 200], yaw: 0, after: 0 } as unknown as ServerEvent);
    const t = options(x, { assets: Promise.resolve({ map: barrierMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    const world = setWorld.mock.calls.at(-1)![0]() as WorldState;
    expect(world.isActive(BARRIER)).toBe(false);                                            // the room's state, laid on at the adoption
    expect(world.health.c4TargetAt(BARRIER, 18)).toBeNull();                                // no C4 target where the room has none
    snapshot(x, 2, { revision: 4, epoch: 1, states: [] });                                  // the room's world back as it opened
    expect(world.isActive(BARRIER)).toBe(true);
    snapshot(x, 3, { revision: 5, epoch: 1, states: [{ id: 1, active: false }] });          // down again in the room
    expect(world.isActive(BARRIER)).toBe(false);
    x.say({ type: 'roundStart', round: 2, seconds: 300, epoch: 2 } as unknown as ServerEvent);   // the next round: the world reset
    expect(world.isActive(BARRIER)).toBe(true);
    expect(world.health.c4TargetAt(BARRIER, 18)).toBe(0);
    m.close();
  });

  it('released to the lobby, the client lays the room\'s world on nothing of the match\'s', async () => {
    const setWorld = vi.spyOn(GrenadeThrower.prototype, 'setWorld');
    const x = handOff('seal');
    const t = options(x, { assets: Promise.resolve({ map: barrierMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    const world = setWorld.mock.calls.at(-1)![0]() as WorldState;
    expect(m.release()).toBe(x.h.client);
    snapshot(x, 9, { revision: 9, epoch: 1, states: [{ id: 1, active: false }] });
    expect(world.isActive(BARRIER)).toBe(true);
  });

  it('a world that will not build (its metadata throws): logged, the match joined without one, C4 none (the review\'s finding 2)', async () => {
    vi.spyOn(WorldState.prototype, 'applyInitial').mockImplementation(() => { throw new Error('bad metadata'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setWorld = vi.spyOn(GrenadeThrower.prototype, 'setWorld');
    const x = handOff('seal');
    const t = options(x, { assets: Promise.resolve({ map: barrierMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    expect(m.net()).not.toBeNull();                                                         // joined all the same
    expect(setWorld.mock.calls.at(-1)![0]()).toBeNull();
    expect(warn.mock.calls.some((c) => c.map(String).join(' ').includes('bad metadata'))).toBe(true);
    m.close();
  });
});

/**
 * ACT-1 (ruling ACT.R1; research 250 s1-s2): the action part on the menu-launched match -- `mountActions` with the door
 * and traversal pages it picks among, made in `./matchMount` with what `main.ts` lends it, following the lobby's client.
 * The synthetic map carries what each test needs as data (the tents, the Satchel's model, a door's spec off
 * `test/golden/doors.json`), never the disc.
 */
const START_BOMB: [number, number, number] = [40, 0, 40];                              // the synthetic map's StartBomb
const TERRORIST_TENT: [number, number, number] = [150, 0, 150];                          // the SEALs' plant site (`plantSite`)
const tent = (node: string, at: [number, number, number]): MapAction => ({
  node, type: 'MPBOMB', typeCode: 4, valve: '', anims: ['BombPlace'], team: null, range: 15, elevation: 15, points: 0,
  bitmap: 'action_mp_bomb.tif', path: `worldmodel/${node}`, at,
});
/** DEMOLITION's synthetic map: the two tents' MPBOMB records and the fittings' Satchel the world bomb is drawn with. */
const bombMap = (): LoadedMap => ({
  ...synthetic(),
  meta: {
    stem: 'MP2', actions: [tent('terrorist_tent', TERRORIST_TENT), tent('seal_tent', [-150, 0, 150])], instances: [],
    instanceByPath: new Map(), diagnostics: [], initial: [], scene: { programs: [], destructibles: [] },
  },
  grenade: { models: [{ name: 'Satchel', parts: [part('wall.tif')] }], bitmaps: {}, defaultMaterial: '' },
} as unknown as LoadedMap);
/**
 * PLANT-AIM: the synthetic maps carry no tent polygon for the action ray to strike, so these wiring tests lend the bomb
 * page's eligibility the pick a look at the patch under the SEALs' site would give (the pick's own tests: `bombPage`,
 * central `roomPlantAim`, `plantAim.devdisc`); the rest of its rule (state, carrier, reach from the firepoint) runs.
 */
function stubTentPick(): void {
  const proto = BombPage.prototype as unknown as { eligible(pick?: unknown): unknown };
  const real = proto.eligible;
  vi.spyOn(proto, 'eligible').mockImplementation(function (this: unknown, pick?: unknown) {
    return real.call(this, pick ?? { path: 'worldmodel/terrorist_tent', point: TERRORIST_TENT });
  });
}
const onGround: BombWire = { state: 1, pos: START_BOMB, carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
/** The lobby's welcome of a round in play with the bomb on the ground at StartBomb (the room's `objective`). */
const demolition = { ...welcome, version: 10, phase: 'play', startTick: 0, objective: onGround } as unknown as ServerEvent;
const hookOf = (t: ReturnType<typeof options>): MatchWindowHook => (t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
const named = (root: Object3D | null, name: string): Object3D[] => { const out: Object3D[] = []; root?.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('ACT-1: the action part on the menu-launched match (the playtest of 2026-10-06: the bomb on the menu path)', () => {
  it("the playtest's bomb: the welcome's objective (state 1 at StartBomb) draws the world bomb and marks ret_bomb on the HUD; a bomb frame naming this seat the carrier marks ret_base at its side's site and takes the world bomb away -- on the lane none of it (no BombPage on the front end)", async () => {
    const setMap = vi.spyOn(GrenadeThrower.prototype, 'setMap');
    const x = handOff('seal');
    const t = options(x, { events: [demolition], assets: Promise.resolve({ map: bombMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    const marks = (): unknown => hookOf(t).hud().model.extraMarks ?? [];
    // The lobby heard the welcome before the match was mounted: its objective reaches the part all the same.
    expect(marks()).toEqual([{ bitmap: 'ret_bomb.tif', x: START_BOMB[0], z: START_BOMB[2] }]);
    const g = setMap.mock.contexts.at(-1) as GrenadeThrower;
    const satchel = named(g.object, 'Satchel');
    expect(satchel).toHaveLength(1);                                                     // bomb-floor's Satchel (BOMB_MODEL_READING)
    expect(satchel[0]!.visible).toBe(true);
    expect(satchel[0]!.position.toArray()).toEqual(START_BOMB);
    expect(named(t.r.scene(), 'Satchel')).toHaveLength(1);                               // on the drawn scene
    // The room's pickup by proximity, told: this seat carries it.
    x.say({ type: 'bomb', ...onGround, state: 2, carrier: 2, pickupAfterTick: 240 } as unknown as ServerEvent);
    t.w.step(1);
    expect(marks()).toEqual([{ bitmap: 'ret_base.tif', x: TERRORIST_TENT[0], z: TERRORIST_TENT[2], type: 2, pulse: true }]);   // BOMB-MARKS: the carrier's side, type 2
    expect(satchel[0]!.visible).toBe(false);                                             // carried: no world bomb
    m.close();
  });
});

/** Frostfire's first door (`bdoor_4`, `test/golden/doors.json`), on a prop of its own path in the synthetic map. */
const GOLDEN_DOORS = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'golden/doors.json'), 'utf-8')) as { MP2: DoorSpec[] };
const doorMap = (): LoadedMap => {
  const s = synthetic();
  const door = { modelName: 'bdoor_4', parts: [part()], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 588, 142, 1117, 1]), order: 0, alternate: false, facade: 0, lod: null, paths: ['worldmodel/bdoor_4'] };
  return { ...s, props: [...s.props, door], doors: [GOLDEN_DOORS.MP2[0]!] } as unknown as LoadedMap;
};
/** The room's snapshot with its doors, a binary frame on the lobby's socket. */
const doorSnapshot = (x: ReturnType<typeof handOff>, tick: number, doors: { valve: number; phase: number }[]): void => {
  x.socks[0]!.onmessage?.({ data: encodeSnapshot({ tick, own: null, bodies: [], doors, env: { revision: 0, epoch: 1, states: [] } }) } as unknown as MessageEvent);
};
const doorEvents = (x: ReturnType<typeof handOff>): unknown[] => x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.startsWith('{'))
  .map((d) => JSON.parse(d) as { type: string }).filter((e) => e.type === 'door');

describe('ACT-1: the doors, the turret, the follow and the traversal on the menu-launched match', () => {
  it("the doors follow the room: the snapshot's door wire swings the synthetic map's leaf (DoorPage.frame -> DoorSet.applyWire), drawn through the view's moveNode and heard on the match's audio", async () => {
    const a = matchAudio();
    const played = vi.spyOn(a.game, 'play');
    const applied = vi.spyOn(DoorSet.prototype, 'applyWire');
    const x = handOff();
    const t = options(x, { audio: a.audio, assets: Promise.resolve({ map: doorMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    const leaf = named(t.r.scene(), 'bdoor_4')[0]!;
    expect(leaf).toBeDefined();
    const shut = leaf.matrix.clone();
    doorSnapshot(x, 1, [{ valve: 1, phase: 60 }]);                                      // the room swings it
    t.w.step(30);
    expect(applied.mock.calls.map(([wire]) => wire)).toContainEqual([{ valve: 1, phase: 60 }]);   // P7: beside the room's ack
    expect(leaf.matrix.equals(shut)).toBe(false);                                       // the leaf drawn where the swing has it
    expect(played.mock.calls.map(([name]) => name)).toContain('.DOOR_WOOD_OPEN');      // heard on the match's own audio
    m.close();
  });

  // P7 (DOOR_PREDICT_ADAPTATION): was "and runs nothing locally" -- the press is now predicted here, as the room's swing
  // to be (actor 'wire': the room's `motion` carries the clip), and settled by the room's snapshot.
  it("the door's action under the reticle sends the room a door event (the fake socket's frame) and predicts it here; a spectator's seat sends none (Cross's lane to it is ACT-3's)", async () => {
    const setMap = vi.spyOn(DoorPage.prototype, 'setMap');
    const used = vi.spyOn(DoorSet.prototype, 'use');
    const x = handOff();
    const t = options(x, { assets: Promise.resolve({ map: doorMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(2);
    const page = setMap.mock.contexts.at(-1) as DoorPage;
    vi.spyOn(page, 'target').mockReturnValue(0);                                         // the door under the reticle (no hull in this map)
    expect(page.action()).toBe(true);
    // LATER 362: the action button's chased press rides the event (the room picks the kick from it).
    expect(doorEvents(x)).toEqual([{ type: 'door', seq: expect.any(Number) as number, door: 0, press: expect.any(Number) as number }]);
    expect(used.mock.calls.map((c) => [c[0], c[2]])).toEqual([[0, 'wire']]);           // P7: predicted, once, its clip the room's
    x.say({ type: 'demoted', position: 1 } as unknown as ServerEvent);                   // a spectator's seat now
    expect(page.action()).toBe(false);
    expect(doorEvents(x)).toHaveLength(1);
    m.close();
  });

  it('the turret: a turret event seating this page locks the walk (no stick reaches the mover), hands the trigger to the part (NetPage.frame\'s trigger argument is the turret\'s), and a release unlocks it; a death\'s release unlocks nothing (TurretPage.setLocked\'s rule)', async () => {
    const netFrame = vi.spyOn(NetPage.prototype, 'frame');
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const a = await armed();
    a.t.w.step(2);
    const locked = (): boolean => (netFrame.mock.contexts.at(-1) as unknown as { deps: { walk: WalkMode } }).deps.walk.isLocked();
    expect(locked()).toBe(false);
    a.x.say({ type: 'turret', id: 0, occupant: 2, ammo: 750 } as unknown as ServerEvent);   // the room seats this page
    expect(locked()).toBe(true);
    a.press(5, true);                                                                    // R1: the turret's trigger
    a.t.w.step(2);
    expect(netFrame.mock.calls.at(-1)?.[2]).toBe(true);                                  // the room's view of the trigger: the turret's
    expect(pull).not.toHaveBeenCalled();                                                 // never the rifle's
    a.press(5, false);
    a.t.w.step(1);
    expect(netFrame.mock.calls.at(-1)?.[2]).toBe(false);
    a.x.say({ type: 'turret', id: 0, occupant: null, ammo: 750 } as unknown as ServerEvent);   // the release
    expect(locked()).toBe(false);
    a.x.say({ type: 'turret', id: 0, occupant: 2, ammo: 750 } as unknown as ServerEvent);
    expect(locked()).toBe(true);
    vi.spyOn(WalkMode.prototype, 'isDead').mockReturnValue(true);                        // the room releases the dead's gun first
    a.x.say({ type: 'turret', id: 0, occupant: null, ammo: 750 } as unknown as ServerEvent);
    expect(locked()).toBe(true);                                                         // the death's lock stands
    a.m.close();
  });

  it('the switches and the bomb follow the lobby client from the join: RoomEvents.following() is the adopted client; a reconnect\'s client is followed on the next frame (followNet); the teardown lets it go and the window\'s blur listener with it', async () => {
    const follow = vi.spyOn(RoomEvents.prototype, 'follow');
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    const events = follow.mock.contexts.at(-1) as RoomEvents;
    expect(events.following()).toBe(x.h.client);
    expect(t.w.live.has('blur')).toBe(true);                                             // XR-06: the window's blur cancels a hold
    // LATER 237: the firearm asks the open client's `lastSeq` each frame (`commandSeq`), as every `NetClient` has it;
    // NET-RES-2d's link watch its `heardAt` (heard now: the watch stays under its bound and never drops this stand-in).
    const next = { on: () => () => {}, state: 'open', bodies: () => [], id: 2, team: 'seal', role: 'player', lastSeq: () => 0, heardAt: () => performance.now() };
    const net = m.net() as unknown as { client: unknown };
    net.client = next;                                                                   // NetPage's reconnect replaced its client
    t.w.step(1);
    expect(events.following()).toBe(next);
    net.client = x.h.client;
    m.release();
    expect(events.following()).toBeNull();
    expect(t.w.live.has('blur')).toBe(false);
  });

  it('the traversal: the clips reach it with the body\'s (setClips beside play.setClips), its input before the walk\'s frame and effectsFrame each frame on the firearm\'s effects, as /testroom\'s (PAR-10, research 257 s3); the HUD\'s climb and slide are ACT-4\'s', async () => {
    const clips = vi.spyOn(TraversalPage.prototype, 'setClips'), bodyClips = vi.spyOn(Play.prototype, 'setClips');
    const input = vi.spyOn(TraversalPage.prototype, 'input'), effects = vi.spyOn(TraversalPage.prototype, 'effectsFrame');
    const setEffects = vi.spyOn(TraversalPage.prototype, 'setEffects');
    const walkFrame = vi.spyOn(WalkMode.prototype, 'frame');
    const a = await armed();
    expect(clips).toHaveBeenCalledTimes(1);
    expect(clips.mock.calls[0]![0]).toBe(bodyClips.mock.calls.at(-1)![0]);
    input.mockClear(); effects.mockClear(); walkFrame.mockClear();
    a.t.w.step(3);
    expect(input).toHaveBeenCalledTimes(3);
    expect(effects).toHaveBeenCalledTimes(3);
    expect(input.mock.invocationCallOrder[0]!).toBeLessThan(walkFrame.mock.invocationCallOrder[0]!);
    expect(setEffects).toHaveBeenCalledTimes(1);                                         // PAR-10: the firearm's effects, once at the mount
    expect(setEffects.mock.calls[0]![0]).not.toBeNull();
    a.m.close();
  });
});

describe('ACT-1: one action part, both pages (ONE-WIRE)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('the follow lines: acts.follow(net.client) after new NetPage in join(), acts.followNet() after net.frame(), acts.follow(null) in the teardown -- main.ts\'s three', () => {
    const main = src('main.ts'), mount = src('matchMount.ts');
    expect(main).toMatch(/net = new NetPage\([\s\S]{0,800}?\n\s+acts\.follow\(net\.client\);/);
    expect(main).toMatch(/net\?\.frame\(dt, fly\.camera, fire\.triggerHeld\(\) \|\| acts\.triggerHeld\(\), frameTime\.real\(\)\);[\s\S]{0,800}?\n\s+acts\.followNet\(\);/);
    expect(main).toMatch(/acts\.unlock\(\);[^\n]*\n\s+acts\.follow\(null\);/);
    expect(mount).toMatch(/net = new NetPage\([^\n]*\n\s+acts\.follow\(net\.client\);/);
    expect(mount).toMatch(/net\?\.frame\(dt, fly\.camera, firearm\.fire\.triggerHeld\(\) \|\| acts\.triggerHeld\(\), frameTime\.real\(\)\);[^\n]*\n\s+acts\.followNet\(\);/);
    expect(mount).toMatch(/const teardown = [\s\S]*?acts\.unlock\(\);[^\n]*\n\s+acts\.follow\(null\);[^\n]*\n\s+acts\.dispose\(\);/);
  });
  it('the frame order mirrors main.ts: traversal.input before walk.frame; doors.frame and turrets.frame after followNet and before the world\'s step; turretFrame after fireFrame; net.frame\'s trigger is the firearm\'s OR the turret\'s', () => {
    const order = (text: string, lines: RegExp[]): void => {
      const at = lines.map((l) => text.search(l));
      for (const [i, n] of at.entries()) expect(n, String(lines[i])).toBeGreaterThan(-1);
      expect([...at].sort((p, q) => p - q)).toEqual(at);
    };
    const frameOf = (text: string, start: RegExp): string => text.slice(text.search(start));
    order(frameOf(src('main.ts'), /const frame = \(\): void => \{/), [
      /traversal\.input\(\);/, /walk\.frame\(dt\);/, /net\?\.frame\(dt, fly\.camera, fire\.triggerHeld\(\) \|\| acts\.triggerHeld\(\), frameTime\.real\(\)\);/, /acts\.followNet\(\);/,
      /doors\.frame\(dt\);/, /acts\.turrets\.frame\(\);/, /pageWorld\?\.step\(dt\);/, /firearm\.fireFrame\(dt, walking\);/, /acts\.turretFrame\(frameTime\.real\(\), walk\.isDead\(\)\);/,
    ]);
    order(frameOf(src('matchMount.ts'), /const frame = \(now: number\): void => \{/), [
      /traversal\.input\(\);/, /walk\.frame\(dt\);/, /net\?\.frame\(dt, fly\.camera, firearm\.fire\.triggerHeld\(\) \|\| acts\.triggerHeld\(\), frameTime\.real\(\)\);/, /acts\.followNet\(\);/,
      /doors\.frame\(dt\);/, /acts\.turrets\.frame\(\);/, /world\?\.world\.step\(dt\);/, /firearm\.fireFrame\(dt, walking\);/, /acts\.turretFrame\(frameTime\.real\(\), walk\.isDead\(\)\);/,
    ]);
  });

  it("PAR-91 (research 317 B3): both pages hand their play the own corpse's rule -- the room's rules (the welcome's, NetPage's) and its waiting room -- on the frame's real seconds; no match, none", () => {
    // `Play.frame`'s `ownCorpseS` (play.test.ts's PAR-91 cases hold the hide): `corpseShownS(rules, 'own', waiting)`,
    // `OWN_BODY_FADE_READING` -- BODY_FADE_S in a respawn game, Infinity in classic, a classic waiting room the respawn rule.
    // The rules by `NetPage.roomRules()`, the public reader (was: `net['rules']`, the private field by element access).
    // NU-11b H2: and the seat a ghost (`NetPage.ghost()`), its own body unseen (nu11GhostOwnBody.test.ts holds the hide).
    const call = /play\.frame\(dt, walk, fly\.camera, frameTime\.real\(\), net \? corpseShownS\(net\.roomRules\(\), 'own', net\.waitingRoom\(\)\) : Infinity, net\?\.ghost\(\) === true\);/g;
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f).match(call), f).toHaveLength(1);
      expect(src(f), f).toMatch(/^import \{ corpseShownS, DEATH_CLIPS, FLINCH_CLIPS \} from '\.\/net\/deaths';$/m);
      expect(src(f), f).not.toMatch(/net\['rules'\]/);
    }
    expect(src('netPage.ts')).toMatch(/^ {2}roomRules\(\): Rules \{\n {4}return this\.rules;\n {2}\}$/m);
  });
});

/**
 * ACT-4 (ruling ACT.R4; research 250 s5): the HUD's prompts on the menu-launched match -- `main.ts`'s HUD lines
 * (`traversal.hudFrame(hud)`, `acts.bomb.hudFrame()`, `hostages.frame()`, `traversal.effectsFrame()`, `feedHud`'s
 * `climb` and `nearby`) on the front end's `Hud`, and the development hook's reads the menu-path specs take
 * (`e2e/menuMatch.ts` `ACT4_READS`), each `/testroom`'s `__viewer` line. A synthetic DEMOLITION map on a floor: the two
 * tents' MPBOMB records as data; the door under the reticle and the ladder are the pages' own answers, stubbed.
 */
const promptMap = (): LoadedMap => ({
  ...grounded(),
  meta: {
    stem: 'MP2', actions: [tent('terrorist_tent', TERRORIST_TENT), tent('seal_tent', [-150, 0, 150])], instances: [],
    instanceByPath: new Map(), diagnostics: [], initial: [], scene: { programs: [], destructibles: [] },
  },
} as unknown as LoadedMap);
/** The traversal page's move, as the HUD lines and the picker read it: on a ladder, or a ledge in reach. */
const fakeMove = (kind: 'ladder' | 'none', climb: boolean) => ({
  state: () => ({ kind }), holdAction: () => {}, ripple: () => null,
  pose: () => null,                                     // PAR-89: the slide loop's frame reads the clip (none here)
  climbPrompt: () => (climb ? { visible: true, kind: 'low' } : null),
});

describe("ACT-4: the HUD's prompts on the menu-launched match", () => {
  it("a door under the reticle puts door in the HUD's action slot; on a ladder ladder_slide; at a plant site with the bomb carried bomb; the defuse's prompt is DEFUSE_PROMPT_ICON_READING; none off the walk or dead", async () => {
    const a = await armed({}, { events: [demolition], assets: Promise.resolve({ map: promptMap(), clips: null }) });
    a.t.w.step(2);
    const slot = (): string | null => hookOf(a.t).hud().model.action;
    expect(slot()).toBeNull();                                                           // nothing in reach at the spawn
    // A door under the reticle (`DoorPage.target`): the context's prompt through `feedHud`'s `nearby`.
    const door = vi.spyOn(DoorPage.prototype, 'target').mockReturnValue(0);
    a.t.w.step(1);
    expect(slot()).toBe('door');
    door.mockRestore();
    a.t.w.step(1);
    expect(slot()).toBeNull();
    // On a ladder: the slide's icon through `traversal.hudFrame(hud)`; a ledge in reach: the climb through `feedHud`'s `climb`.
    const move = vi.spyOn(TraversalPage.prototype, 'traversal').mockReturnValue(fakeMove('ladder', false) as never);
    a.t.w.step(1);
    expect(slot()).toBe('ladder_slide');
    move.mockReturnValue(fakeMove('none', true) as never);
    a.t.w.step(1);
    expect(slot()).toBe('climb');
    move.mockRestore();
    a.t.w.step(1);
    expect(slot()).toBeNull();
    // The bomb carried by this seat, stood at its side's site (the Terrorists' tent): the plant's `bomb`.
    stubTentPick();
    a.x.say({ type: 'spawn', id: 2, at: TERRORIST_TENT, yaw: 0, after: 0 } as unknown as ServerEvent);
    a.x.say({ type: 'bomb', ...onGround, state: 2, carrier: 2 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(slot()).toBe('bomb');
    // Planted by the other side at this seat's feet: the defuse's prompt.
    a.x.say({ type: 'bomb', ...onGround, state: 3, pos: TERRORIST_TENT, carrier: null, planter: 3, plantingTeam: 'terrorist', detonateTick: 600 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(slot()).toBe(DEFUSE_PROMPT_ICON_READING);
    // Dead: none; off the walk: none.
    const dead = vi.spyOn(WalkMode.prototype, 'isDead').mockReturnValue(true);
    a.t.w.step(1);
    expect(slot()).toBeNull();
    dead.mockRestore();
    a.t.w.step(1);
    expect(slot()).toBe(DEFUSE_PROMPT_ICON_READING);
    vi.spyOn(WalkMode.prototype, 'mode').mockReturnValue('fly');
    a.t.w.step(1);
    expect(slot()).toBeNull();
    a.m.close();
  });

  it("the bomb's marks and fuse reach the HUD through bomb.hudFrame once a frame: ret_bomb/ret_base in extraMarks, the fuse in defuseTimer while planted", async () => {
    const hudFrame = vi.spyOn(BombPage.prototype, 'hudFrame');
    const a = await armed({}, { events: [demolition], assets: Promise.resolve({ map: promptMap(), clips: null }) });
    a.t.w.step(1);
    hudFrame.mockClear();
    a.t.w.step(3);
    expect(hudFrame).toHaveBeenCalledTimes(3);                                           // once a drawn frame
    const model = () => hookOf(a.t).hud().model;
    expect(model().extraMarks).toEqual([{ bitmap: 'ret_bomb.tif', x: START_BOMB[0], z: START_BOMB[2] }]);
    expect(model().defuseTimer ?? null).toBeNull();
    a.x.say({ type: 'bomb', ...onGround, state: 2, carrier: 2 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(model().extraMarks).toEqual([{ bitmap: 'ret_base.tif', x: TERRORIST_TENT[0], z: TERRORIST_TENT[2], type: 2, pulse: true }]);   // BOMB-MARKS: the carrier's side, type 2
    a.x.say({ type: 'bomb', ...onGround, state: 3, pos: TERRORIST_TENT, carrier: null, planter: 2, plantingTeam: 'seal', detonateTick: 600 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(model().extraMarks).toEqual([{ bitmap: 'ret_bomb.tif', x: TERRORIST_TENT[0], z: TERRORIST_TENT[2] }]);
    expect(model().defuseTimer).toBeGreaterThan(0);                                      // the fuse in the round timer's place
    a.x.say({ type: 'bomb', ...onGround, state: 4, pos: TERRORIST_TENT, carrier: null, planter: 2, plantingTeam: 'seal', defuser: 3, detonateTick: 600 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(model().defuseTimer).toBeNull();                                              // decided: the slot given back
    a.m.close();
  });

  it("PB.R2's goldens: the hook's ownBody() reads the own body as drawn -- the Satchel from this page's pickup until its plant, the main clip and the throw layer's, the weapons' mounts; the same line on main.ts's __viewer (a development instrument)", async () => {
    const a = await armed({}, { events: [demolition], assets: Promise.resolve({ map: promptMap(), clips: null }) });
    a.t.w.step(1);
    const own = () => hookOf(a.t).ownBody();
    expect(own()).toMatchObject({ gear: [], throwClip: null, mounts: { rifle: expect.any(String), pistol: expect.any(String) } });
    a.x.say({ type: 'bomb', ...onGround, state: 2, carrier: 2 } as unknown as ServerEvent);   // this page carries it
    a.t.w.step(1);
    expect(own().gear).toEqual(['Satchel']);
    a.x.say({ type: 'bomb', ...onGround, state: 3, pos: TERRORIST_TENT, carrier: null, planter: 2, plantingTeam: 'seal', detonateTick: 600 } as unknown as ServerEvent);
    a.t.w.step(1);
    expect(own().gear).toEqual([]);
    a.m.close();
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    expect(src('main.ts')).toMatch(/\n\s+ownBody: \(\) => ownBodyRead\(play, throwPose\),/);
    expect(src('matchMount.ts')).toMatch(/\n\s+ownBody: \(\) => ownBodyRead\(play, throws\.throwPose\),/);
  });

  it("the hook (a development build): hud, feet, setCamera, pose, floorUnder, doors, traversal, worldStates, worldActive, alive, waiting -- present under DEV, gone at the teardown; the production build folds it away (build_keyboard.test.ts's scan covers MATCH_WINDOW_HOOK)", async () => {
    const doorMapped = vi.spyOn(DoorPage.prototype, 'setMap'), clipped = vi.spyOn(TraversalPage.prototype, 'setClips');
    const a = await armed();
    a.t.w.step(2);
    const h = hookOf(a.t);
    const reads = ['hud', 'feet', 'setCamera', 'pose', 'floorUnder', 'doors', 'traversal', 'worldStates', 'worldActive', 'alive', 'waiting'] as const;
    for (const r of reads) expect(typeof (h as unknown as Record<string, unknown>)[r], r).toBe('function');
    // `bomb()` (acts.bomb.state()): /testroom's hook has no such line (crossroads.spec reads the room's frames) -- not
    // added (research 250 s5: reported to the controller, the brief's STOP on that read).
    expect('bomb' in h).toBe(false);
    expect('teleport' in h).toBe(false);                                                 // ACT.R4: none on a served match
    const feet = h.feet()!;
    expect(feet[0]).toBeCloseTo(0, 3);
    expect(feet[2]).toBeCloseTo(0, 3);
    h.setCamera({ yaw: 90, pitch: -10 });
    expect(h.pose().yaw).toBeCloseTo(90, 3);
    expect(h.pose().pitch).toBeCloseTo(-10, 3);
    expect(h.floorUnder(10, 10, 5)).toBeCloseTo(0, 3);                                   // the floor under: the walk's pick
    expect(h.floorUnder(500, 500, 5)).toBeNull();                                        // off the hull
    expect(h.doors()).toEqual((doorMapped.mock.contexts.at(-1) as DoorPage).stats());
    expect(h.traversal()).toEqual((clipped.mock.contexts.at(-1) as TraversalPage).stats());
    expect(h.traversal()?.kind).toBe('none');                                            // on the floor: no move
    expect(h.worldStates()).toEqual([]);                                                 // the page's world: no instances on this map
    expect(h.worldActive('worldmodel/none')).toBe(true);                                 // no flag turned off on its path (WorldState.isActive)
    expect(h.alive()).toBe(true);                                                        // NetPage.gate: a player, not dead
    expect(h.waiting()).toBe(a.m.net()!.waitingRoom());
    a.m.release();
    expect((a.t.o.win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK]).toBeUndefined();
    vi.stubEnv('DEV', false);
    try {
      const b = await armed();
      b.t.w.step(1);
      expect((b.t.o.win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK]).toBeUndefined();
      b.m.close();
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("ACT-4: the HUD lines are main.ts's (ACT.R4)", () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it("the four HUD lines are main.ts's: traversal.hudFrame(hud), acts.bomb.hudFrame(), traversal.effectsFrame(), feedHud's climb and nearby", () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const text = src(f);
      expect(text, f).toMatch(/\n\s+traversal\.hudFrame\(hud\);/);
      expect(text, f).toMatch(/\n\s+acts\.bomb\.hudFrame\(\);/);
      expect(text, f).toMatch(/\n\s+traversal\.effectsFrame\(\);/);
      expect(text, f).toMatch(/firearm\.feedHud\(walking, \{[^\n]*\n\s+climb: traversal\.hudClimb\(\),[^\n]*\n\s+nearby: acts\.prompt\(walking\),[^\n]*\n\s+\}\);/);
      expect(text, f).not.toMatch(/firearm\.feedHud\(walking\);/);                       // never the bare feed
    }
  });
  it("the HUD lines' order is main.ts's: traversal.hudFrame(hud), acts.bomb.hudFrame(), hostages.frame(), traversal.effectsFrame(), firearm.feedHud(...), after hud.setVisible", () => {
    // PAR-94 B2/B3: both pages' HUD line gated on the seat's spawn (was: `/hud\.setVisible\(walking\);/`).
    const lines = [/hud\.setVisible\(walking && spawned\);/, /traversal\.hudFrame\(hud\);/, /acts\.bomb\.hudFrame\(\);/, /hostages\.frame\(\);/, /traversal\.effectsFrame\(\);/, /firearm\.feedHud\(walking, \{/];
    const pages: [string, RegExp][] = [['main.ts', /const frame = \(\): void => \{/], ['matchMount.ts', /const frame = \(now: number\): void => \{/]];
    for (const [f, start] of pages) {
      const whole = src(f), text = whole.slice(whole.search(start));
      const at = lines.map((l) => text.search(l));
      for (const [i, n] of at.entries()) expect(n, `${f}: ${String(lines[i])}`).toBeGreaterThan(-1);
      expect([...at].sort((p, q) => p - q), f).toEqual(at);
    }
  });
});

/**
 * ACT-3 (ruling ACT.R3; research 214 s4, 250 s4): Cross on the menu-launched match's pad is the action button as the
 * player update reads it -- `playerLanes`' action lane (`acts.lanes`: the press, the hold, the release that fires),
 * `acts.wiring.endFrame()` after the lanes, and the cancels `/testroom` has: the R2 inventory's (or the Chat menu's) open,
 * the loading hold, a lost pad (`PadWatch`), the own death; the window's blur is the part's own (ACT-1's test).
 */
describe("ACT-3: the hold on Cross (XR-06's lifecycle on the menu-launched match)", () => {
  /** The match on a floor carrying `map`'s data, its pad's Cross pressed through `a.press(0, ...)`, the room's sends read. */
  async function crossArmed(map: LoadedMap, o: { events?: ServerEvent[]; blocked?: () => boolean; sound?: MatchAssets['sound'] } = {}) {
    const press = vi.spyOn(ActionLifecycle.prototype, 'press');
    const cancel = vi.spyOn(ActionWiring.prototype, 'cancel');
    const a = await armed(o.blocked ? { blocked: o.blocked } : {}, {
      assets: Promise.resolve({ map: { ...map, ground: grounded().ground } as LoadedMap, clips: null, ...(o.sound ? { sound: o.sound } : {}) }),
      ...(o.events ? { events: o.events } : {}),
    });
    const sent = (): { type: string }[] => a.x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.startsWith('{')).map((d) => JSON.parse(d) as { type: string });
    const acted = (): string[] => sent().map((e) => e.type).filter((t) => t === 'door' || t === 'action' || t === 'bombAction');
    /** Every command the walk sent the room, once each (a batch repeats the unacknowledged). */
    const commands = (): Command[] => {
      const seen = new Map<number, Command>();
      for (const d of a.x.socks[0]!.sent as unknown[]) if (d instanceof Uint8Array && frameKind(d) === Frame.Commands) for (const c of decodeCommands(d).commands) seen.set(c.seq, c);
      return [...seen.values()];
    };
    const life = (): ActionLifecycle | undefined => press.mock.contexts[0] as ActionLifecycle | undefined;
    const tap = (b: number): void => { a.press(b, true); a.t.w.step(1); a.press(b, false); a.t.w.step(1); };
    return { ...a, cancel, acted, commands, life, tap, pressed: press };
  }
  const underReticle = (): void => { vi.spyOn(DoorPage.prototype, 'target').mockReturnValue(0); };   // the door in reach (no hull here)

  it("a Cross held into a plant site (the carrier at the site): the commands sent carry Button.ActionHeld, the lifecycle holds bombPlant, the release fires nothing and sends no door/action event", async () => {
    const tick = vi.spyOn(BombPage.prototype, 'tick');
    stubTentPick();
    const a = await crossArmed(bombMap(), { events: [demolition] });
    a.x.say({ type: 'spawn', id: 2, at: TERRORIST_TENT, yaw: 0, after: 0 } as unknown as ServerEvent);   // stood at the SEALs' site
    a.x.say({ type: 'bomb', ...onGround, state: 2, carrier: 2, pickupAfterTick: 0 } as unknown as ServerEvent);   // carrying it
    a.t.w.step(3);
    const before = a.commands().length;
    a.press(0, true);                                                                    // Cross down
    a.t.w.step(20);
    expect(a.life()?.down()).toBe(true);
    expect(a.life()?.heldContext()).toBe('bombPlant');
    const held = a.commands().slice(before);
    expect(held.length).toBeGreaterThan(0);
    expect(held.some((c) => (c.buttons & Button.ActionHeld) !== 0)).toBe(true);         // the room's count (FUN_00594600)
    expect(tick.mock.calls.some(([on]) => on)).toBe(true);                               // and the page's prediction of it
    a.press(0, false);                                                                   // let go
    a.t.w.step(3);
    expect(a.life()?.down()).toBe(false);
    expect(a.acted()).toEqual([]);                                                       // a hold's release fires nothing
    expect(a.commands().slice(before).some((c) => (c.buttons & Button.Action) !== 0)).toBe(false);
    a.m.close();
  });

  it("Cross released on a door under the reticle fires the door's send once; the walk's filter is told a page took it (no Button.Action on the command, no climb)", async () => {
    underReticle();
    const climb = vi.spyOn(Traversal.prototype, 'action');
    const a = await crossArmed(doorMap());
    a.t.w.step(2);
    a.press(0, true);
    a.t.w.step(2);
    expect(a.acted()).toEqual([]);                                                       // the press fires nothing: the release does
    a.press(0, false);
    a.t.w.step(3);
    expect(a.acted()).toEqual(['door']);
    expect(a.commands().some((c) => (c.buttons & Button.Action) !== 0)).toBe(false);
    expect(climb).not.toHaveBeenCalled();
    a.m.close();
  });

  it("Cross released with no page context runs the walk's own action through the filter (walk.setActionFilter, set by mountActions): the climb, as /testroom's; a release with a page context runs the page's and not the walk's", async () => {
    const climb = vi.spyOn(Traversal.prototype, 'action');
    const filter = vi.spyOn(ActionWiring.prototype, 'filter');
    const a = await crossArmed(doorMap());
    a.t.w.step(2);
    a.tap(0);                                                                            // nothing in reach
    a.t.w.step(2);
    expect(filter).toHaveBeenCalledTimes(1);                                             // the walk asked the part first
    expect(filter.mock.results[0]!.value).toBe(false);                                   // no page took it
    expect(climb).toHaveBeenCalledTimes(1);                                              // research 86: the walk's own action
    expect(a.commands().some((c) => (c.buttons & Button.Action) !== 0)).toBe(true);     // and the room reads the press
    expect(a.acted()).toEqual([]);
    underReticle();                                                                      // now a door in reach
    a.tap(0);
    a.t.w.step(2);
    expect(filter).toHaveBeenCalledTimes(2);
    expect(filter.mock.results[1]!.value).toBe(true);                                    // a page took it
    expect(climb).toHaveBeenCalledTimes(1);                                              // the walk's not run
    expect(a.acted()).toEqual(['door']);
    a.m.close();
  });

  it("the R2 inventory's open is a cancel ('menu'): a Cross held as R2 opens fires nothing at its release; the inventory keeps Cross while open (INVENTORY_LANES), and the next press after the close is a press", async () => {
    underReticle();
    const inv = vi.spyOn(InventoryMenu.prototype, 'frame');
    const a = await crossArmed(doorMap());
    a.t.w.step(2);
    a.press(0, true);                                                                    // Cross held on the door
    a.t.w.step(1);
    expect(a.life()?.heldContext()).toBe('door');
    a.press(7, true);                                                                    // R2 opens the menu over it
    a.t.w.step(1);
    expect(a.acted()).toEqual([]);                                                       // the lanes read Cross up (the menu's now): no release
    const menu = inv.mock.contexts.at(-1) as InventoryMenu;
    expect(menu.isOpen()).toBe(true);
    expect(a.cancel.mock.calls).toEqual([['menu']]);
    expect(a.life()?.down()).toBe(false);
    expect(a.life()?.lastCancel()).toBe('menu');
    a.press(0, false); a.press(7, false);
    a.t.w.step(2);
    expect(a.acted()).toEqual([]);                                                       // a cancel is never a release
    const presses = a.pressed.mock.calls.length;
    a.tap(0);                                                                            // Cross while open: the menu's
    expect(a.pressed.mock.calls.length).toBe(presses);
    expect(a.acted()).toEqual([]);
    if (menu.isOpen()) a.tap(3);                                                         // Triangle closes it (if the Cross took nothing)
    expect(menu.isOpen()).toBe(false);
    a.t.w.step(1);
    a.tap(0);                                                                            // after the close: a press, then its release
    expect(a.pressed.mock.calls.length).toBe(presses + 1);
    expect(a.acted()).toEqual(['door']);
    a.m.close();
  });

  it("the Chat menu's open is a cancel ('menu') too: a Cross held at a plant site as Circle opens the menu ends the hold -- no ActionHeld after it, nothing fired at its release (playerLanes skips the action lane while the menu owns the pad)", async () => {
    const taunts = { defaults: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'], captions: {}, vocals: { seal: [], terrorist: [] } };
    const sound = { data: { ...soundData(), beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, taunts } as unknown as SoundData, loops: [] };
    stubTentPick();
    const a = await crossArmed(bombMap(), { events: [demolition], sound });
    const hook = (a.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    a.x.say({ type: 'spawn', id: 2, at: TERRORIST_TENT, yaw: 0, after: 0 } as unknown as ServerEvent);   // stood at the SEALs' site
    a.x.say({ type: 'bomb', ...onGround, state: 2, carrier: 2, pickupAfterTick: 0 } as unknown as ServerEvent);   // carrying it
    a.t.w.step(3);
    a.press(0, true);                                                                    // Cross held: the plant's hold
    a.t.w.step(5);
    expect(a.life()?.heldContext()).toBe('bombPlant');
    a.press(1, true); a.t.w.step(1); a.press(1, false); a.t.w.step(1);                   // Circle tapped, Cross still down
    expect(hook.taunts().open).toBe(true);
    expect(a.cancel.mock.calls).toEqual([['menu']]);
    expect(a.life()?.down()).toBe(false);                                                // no hold with no end
    a.t.w.step(3);
    const after = a.commands().length;
    a.t.w.step(5);
    expect(a.commands().slice(after).some((c) => (c.buttons & Button.ActionHeld) !== 0)).toBe(false);   // the room's count stops
    a.press(0, false);
    a.press(3, true); a.t.w.step(1); a.press(3, false); a.t.w.step(2);                   // Triangle closes the menu
    expect(hook.taunts().open).toBe(false);
    expect(a.acted()).toEqual([]);
    a.m.close();
  });

  it("the loading hold (LobbyMatch.blocked) cancels a hold ('loading'); a pad pulled mid-hold is a cancel ('padLost', PadWatch), never the release its vanished lanes read as; the own death cancels ('death', MatchNetHooks.died)", async () => {
    underReticle();
    let blocked = false;
    const a = await crossArmed(doorMap(), { blocked: () => blocked });
    a.t.w.step(2);
    // The loading hold: a Cross held into it is let go once (no edge is read under the hold's flush).
    a.press(0, true);
    a.t.w.step(1);
    expect(a.life()?.down()).toBe(true);
    blocked = true;
    a.t.w.step(2);
    expect(a.cancel.mock.calls).toEqual([['loading']]);                                  // once, not each held frame
    expect(a.life()?.down()).toBe(false);
    a.press(0, false);
    blocked = false;
    a.t.w.step(2);
    expect(a.acted()).toEqual([]);
    // The pad pulled with Cross down: its lanes read as all up -- the release edge -- but the watch cancels first.
    expect(a.t.w.live.has('gamepadconnected') && a.t.w.live.has('gamepaddisconnected')).toBe(true);   // PadWatch on the window
    a.press(0, true);
    a.t.w.step(1);
    expect(a.life()?.down()).toBe(true);
    const win = a.t.o.win!;
    const nav = win.navigator!;
    win.navigator = { getGamepads: () => [] };
    a.t.w.step(2);
    expect(a.acted()).toEqual([]);                                                       // no release from the vanished lanes
    expect(a.cancel.mock.calls.at(-1)).toEqual(['padLost']);
    win.navigator = nav;                                                                 // plugged back, Cross let go
    a.press(0, false);
    a.t.w.step(2);
    expect(a.acted()).toEqual([]);
    // The own death with Cross down.
    a.press(0, true);
    a.t.w.step(1);
    expect(a.life()?.down()).toBe(true);
    a.x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    expect(a.cancel.mock.calls.at(-1)).toEqual(['death']);
    expect(a.life()?.down()).toBe(false);
    a.press(0, false);
    a.t.w.step(2);
    expect(a.acted()).toEqual([]);
    a.m.close();
    expect(a.t.w.live.has('gamepadconnected') || a.t.w.live.has('gamepaddisconnected')).toBe(false);   // let go at the teardown
  });

  it("the lane order: triggerLane, the inventory's frame, then playerLanes' action lane (acts.lanes: press/hold/release, elapse, traversal.padLanes), then endFrame -- main.ts's order, pinned by text", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    const order = (text: string, lines: RegExp[]): void => {
      const at = lines.map((l) => text.search(l));
      for (const [i, n] of at.entries()) expect(n, String(lines[i])).toBeGreaterThan(-1);
      expect([...at].sort((p, q) => p - q)).toEqual(at);
    };
    const main = src('main.ts'), mount = src('matchMount.ts');
    const bodyOf = (text: string, start: RegExp, end: RegExp): string => {
      const begin = text.search(start);
      expect(begin, String(start)).toBeGreaterThanOrEqual(0);
      const s = text.slice(begin), finish = s.search(end);
      expect(finish, String(end)).toBeGreaterThanOrEqual(0);
      return s.slice(0, finish);
    };
    // /testroom's padFrame past its hold: the watch, the pad, the trigger, the inventory, the menu's cancel, the lanes, the end.
    const mainPad = bodyOf(main, /function padFrame\(dt: number\): void \{/, /\n\}\n/);
    order(mainPad.slice(mainPad.indexOf('return;')), [
      /pads\.poll\(navigator\);/, /gamePad\.poll\(navigator\);/,
      /nativeSettings\.frame\(performance\.now\(\), down, polled, touch\.pad\);/, /const start = startMenu\.pad\(down, input, dt\);/,
      /const menu = start\.owns \|\| editorOwns \|\| chat\.owns \|\| playOn && \(armory\.isOpen\(\) \? armory\.pad\(edges\) : exchangePart\.pad\(edges\)\);/,
      /input = exchangeInput\.frame\(input, menu\);/, /if \(playOn && !menu && input\.fire !== padMerged\.fire\) trigger\(input\.fire\);/,
      /const game = menu \|\| !walking \? input : inventory\.frame\(padMerged, input, dt, frameTime\.real\(\)\);/,
      /if \(over && !menuOver\) \{ cancelAction\(over\); stanceButton\.reset\(\); \}/, /walk\.holdForMenu\(menu \|\| inventory\.isOpen\(\)\);/,
      /playerLanes\(lanes, padGame, game, frameTime\.real\(\), \{ walking, menu, runAndTalk: startMenu\.runAndTalk\(\) \}\);/, /acts\.wiring\.endFrame\(\);/,
    ]);
    expect(mainPad).toMatch(/if \(acts\.wiring\.lifecycle\.down\(\)\) cancelAction\('loading'\);/);
    expect(main).toMatch(/cancel: \(\) => cancelAction\('padLost'\),/);
    expect(main).toMatch(/died: \(\) => \{ cancelAction\('death'\); \},/);
    // The front end's: the same order and cancels through the same part (`acts.cancel` is what main.ts's `cancelAction` calls).
    const mountPad = bodyOf(mount, /const padFrame = \(dt: number, now: number\): void => \{/, /\n {2}\};\n/);
    order(mountPad, [
      /if \(held && acts\.wiring\.lifecycle\.down\(\)\) acts\.cancel\('loading'\);/, /pads\.poll\(nav\);/, /gamePad\.poll\(nav\);/,
      /o\.settings\?\.frame\(now, down, polled, touch\.pad\);/, /const start = startMenu\.pad\(down, mergeInput\(touch\.input, pad\), dt\);/,
      /const menu = start\.owns \|\| chat\.owns \|\| \(armory\.isOpen\(\) \? armory\.pad\(edges\) : exchange\.pad\(edges\)\);/,
      /const input = exchange\.input\.frame\(chat\.input, menu\);/, /firearm\.triggerLane\(padMerged, input\);/,
      /const game = menu \|\| !walking \? input : throws\.inventory\.frame\(padMerged, input, dt, frameTime\.real\(\)\);/,
      /const over: CancelCause \| null = armory\.isOpen\(\) \? 'armory' : menu \|\| throws\.inventory\.isOpen\(\) \? 'menu' : null;/,
      /if \(over && !menuOver\) \{ acts\.cancel\(over\); stanceButton\.reset\(\); \}/,
      /walk\.holdForMenu\(menu \|\| throws\.inventory\.isOpen\(\)\);/,
      /playerLanes\(lanes, padGame, game, frameTime\.real\(\), \{ walking, menu, runAndTalk: startMenu\.runAndTalk\(\) \}\);/, /acts\.wiring\.endFrame\(\);/,
    ]);
    // The native editor receives input before START, whose existing ownership masks every normal game lane.
    expect(main).toMatch(/settings: nativeSettings,/);
    expect(mount).toMatch(/settings: o\.settings,/);
    const start = src('startMenu.ts');
    expect(start).toMatch(/if \(this\.d\.settings\?\.isOpen\(\)\) \{ this\.settingsHeld = true; return; \}/);
    expect(start).toMatch(/const owns = was \|\| this\.open_;\s+return \{ owns, input: this\.consume\.frame\(input, owns\), held: owns \? new Set<PadButton>\(\) : held \};/);
    expect(mount).toMatch(/new PadWatch\(\{[^\n]*cancel: \(\) => \{ acts\.cancel\('padLost'\); \} \}\);/);
    expect(mount).toMatch(/died: \(\) => \{ acts\.cancel\('death'\); \},/);
    // The part's own lane, which both pages hand `playerLanes`: Cross's edges, the hold, PF-34's elapse, research 86's lanes.
    order(bodyOf(src('matchActions.ts'), /lanes: \(before, after, dt\) => \{/, /\n {4}\},\n/), [
      /wiring\.press\(\);/, /wiring\.release\(\);/, /wiring\.hold\(dt\);/, /wiring\.lifecycle\.elapse\(dt, d\.drops\?\.candidates\?\.\(\) \?\? \(dropAhead\(\) !== null\)\);/, /traversal\.padLanes\(\{ \.\.\.before, action: was \}, \{ \.\.\.after, action: act, leanLeft: sides\.left, leanRight: sides\.right \}\);/,
    ]);
  });
});

/**
 * ACT-2 (research 215 s7, 250 s3): the turret as `agent/turret-feel` left it, on the menu-launched match -- `main.ts`'s
 * five lines mirrored into `./matchMount`: `TURRET_CLIPS` in the clips asked of the worker, `mountedMuzzle` on the
 * firearm, the `turret` dep's five on the action part (the sounds on the match's audio, the bodies' feet, the clips, the
 * hand, this page's own round drawn), the two `setMountPose`, and the hook's `turrets()` / `turretParts()`. The
 * synthetic map carries one Vigilance-shaped placement (`mp51_turret03`: PKM TURRET, 750 rounds, yaw -70..70, pitch
 * -45..45, reach 22; research 215 s2-s3) as data, its gun a drawn prop at its path; never the disc.
 */
const MP51_ROOT = 'worldmodel/mp51_turret03';
const MP51_GUN = `${MP51_ROOT}=RMG_turret/turret/gun`;
const RAD = Math.PI / 180;
const mp51Turret = (): TurretPlacement => ({
  id: 0, root: MP51_ROOT, name: 'mp51_turret03',
  def: { index: 0, name: 'RMG_turret', manual: true, thermal: false, parts: ['turret', 'gun', 'firepoint'], limitsDeg: { yaw: [-70, 70], pitch: [-45, 45] } },
  parts: { turret: `${MP51_ROOT}=RMG_turret/turret`, gun: MP51_GUN, firepoint: `${MP51_GUN}/firepoint` },
  origin: [0, 10, -20], facing: 0, gunOrigin: [0, 12, -20], firepointOrigin: [0, 12, -24],
  firepointMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 12, -24, 1],
  limits: { yaw: [-70 * RAD, 70 * RAD], pitch: [-45 * RAD, 45 * RAD] }, mountRange: 22, mountAngleCos: 0.5,
  weapon: 'PKM TURRET', ammoInit: 750,
} as unknown as TurretPlacement);
/** The floor, the placement, and its gun drawn as a prop at the gun's path (route (a), research 215 s3). */
const turretMap = (): LoadedMap => {
  const g = grounded();
  const gun = { modelName: 'gun', parts: [part()], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 12, -20, 1]), order: 0, alternate: false, facade: 0, lod: null, paths: [MP51_GUN] };
  return { ...g, props: [...g.props, gun], turrets: [mp51Turret()] } as unknown as LoadedMap;
};
/**
 * The arsenal's PKM TURRET (id 205: `test/matchNet.test.ts`'s), its cadence 0.1 s (`turretInterval`: fireWait x 0.8 in
 * AUTO, the disc's mode -- PAR-59: a SINGLE turret claims one round a pull, `FUN_005c0940`).
 */
const PKM = { ...HELD_RIFLE, id: 205, name: 'PKM TURRET', fireWait: 0.125, fireModes: [3], piercing: 4.5, maximumRange: 800, magazine: 250, mags: 3 };
/** PAR-55: its arsenal item's `IconTextureName` (the disc's: `test/turretPage.test.ts`). */
const PKM_ITEM = { id: 205, name: 'PKM TURRET', icon: 'Turret_RMG.tif' };
const pkmArsenal = { table: { arsenal: { byName: new Map([['PKM TURRET', PKM_ITEM]]), items: new Map([[205, PKM_ITEM]]) }, records: new Map(), turretRecords: new Map([[205, PKM]]) }, map: null };
const seat = (x: ReturnType<typeof handOff>, occupant: number | null, ammo = 750): void => { x.say({ type: 'turret', id: 0, occupant, ammo } as unknown as ServerEvent); };

describe('ACT-2: the turret on the menu-launched match (research 215 s7, turret-feel mirrored)', () => {
  it("a turret event seating this page: the HUD's box is the kit's holding the turret's weapon (PAR-55, TURRET_AMMO_HUD_READING: the 750 in magazines of 250 -- 250/250, 2 MAGS -- its HUDW icon and its own fire mode, on a synthetic mp51_turret placement), R1 claims a turret round of the room (a fire event, weapon 0, the drawn round's muzzle and rolled line, the view's eye) at the record's cadence and never the rifle's -- LATER 180: seated from a spawn the body's raise reads 0, so the press's frame is the raise latch's and the first claim goes one game frame later", async () => {
    const netFrame = vi.spyOn(NetPage.prototype, 'frame');
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const draw = vi.spyOn(Fire.prototype, 'drawRound');
    const map = turretMap();
    const a = await armed({}, { assets: Promise.resolve({ map, clips: null }) });
    (map as unknown as { arsenal: unknown }).arsenal = pkmArsenal;                      // the turret's record (the room's `turretRecord`)
    a.t.w.step(2);
    const walk = (netFrame.mock.contexts.at(-1) as unknown as { deps: { walk: WalkMode } }).deps.walk;
    const kitBox = (): unknown => { const m = hookOf(a.t).hud().model; return { weaponIcon: m.weaponIcon, fireMode: m.fireMode, fireModeIcon: m.fireModeIcon ?? null }; };
    const unmounted = kitBox();                                                          // the kit's firearm's
    seat(a.x, 2);                                                                        // the room seats this page
    a.t.w.step(1);
    const { rounds, capacity, spare, weaponIcon, fireMode, fireModeRow } = hookOf(a.t).hud().model;
    expect({ rounds, capacity, spare }).toEqual({ rounds: 250, capacity: 250, spare: 2 });   // TURRET_AMMO_HUD_READING (PAR-55)
    // PAR-55: the turret's HUDW icon, not the rifle's; the row shown (class 205 is not refused) at the record's first mode.
    expect({ weaponIcon, fireMode, fireModeRow: fireModeRow ?? true }).toEqual({ weaponIcon: 'turret_rmg.tif', fireMode: 'auto', fireModeRow: true });
    a.press(5, true);                                                                    // R1 held: the turret's trigger
    a.t.w.step(1);
    // LATER 180 (`TurretTrigger`, `FUN_005c0ae0` D:L476423-476438): the press's frame is the latch's, refused; the claim
    // on the first page frame by which one game frame of real seconds has gone (`RAISE_LATCH_FRAME_READING`): 0.032 s is
    // under `GAME_FRAME_DT` (0.0334), 0.048 s is past it -- the 4th page frame counting the press's.
    expect(a.fires()).toHaveLength(0);                                                   // the latch's frame
    a.t.w.step(2);
    expect(a.fires()).toHaveLength(0);                                                   // under one game frame since the latch
    a.t.w.step(1);
    expect(a.fires()).toHaveLength(1);                                                   // one game frame later: one claim
    const claim = a.fires()[0] as { weapon: number; from: number[]; dir: number[] };
    const aim = walk.fireAim()!;
    expect(claim.weapon).toBe(0);                                                        // the room's turretRound picks the record
    // TURRET-CONE P2 (research 215 s8.2): the claim is the round this page draws -- its muzzle and its line rolled on the
    // turret's cone (`TurretPage.round`) -- the eye the view's (was: `from` the view's eye, the line unused by the room).
    const drawn = draw.mock.calls[0]!;
    claim.from.forEach((v, i) => expect(v).toBeCloseTo((drawn[0] as number[])[i]!, 9));
    claim.dir.forEach((v, i) => expect(v).toBeCloseTo((drawn[1] as number[])[i]!, 9));
    (claim as unknown as { eye: number[] }).eye.forEach((v, i) => expect(v).toBeCloseTo(aim.eye[i]!, 3));   // the view's ray
    a.t.w.step(6);
    expect(a.fires()).toHaveLength(1);                                                   // 0.096 s: not yet the PKM's 0.1 s
    a.t.w.step(1);
    expect(a.fires()).toHaveLength(2);                                                   // the cadence: the next at 0.1 s
    // Each claim drawn here as the room fires it (`turretRound`, research 215 s7): the PKM's id, counted from the mount.
    expect(draw.mock.calls.map((c) => [c[4], c[5]])).toEqual([[205, 1], [205, 2]]);
    expect(pull).not.toHaveBeenCalled();                                                 // never the rifle's
    a.press(5, false);
    seat(a.x, null);                                                                     // released: the firearm's box again
    a.t.w.step(1);
    expect(kitBox()).toEqual(unmounted);
    a.m.close();
  });

  it("the mount pose: the own body takes the turret's clip through walk.setMountPose and a mounted other through remote.setMountPose; the mount's sound plays on the match's audio at the placement", async () => {
    const ownPose = vi.spyOn(WalkMode.prototype, 'setMountPose'), otherPose = vi.spyOn(RemotePlayers.prototype, 'setMountPose');
    vi.spyOn(RemotePlayers.prototype, 'playClips').mockReturnValue({
      clips: [{ name: TURRET_MOUNT_CLIPS.rifle, frameCount: 20 }, { name: TURRET_MOUNT_CLIPS.pistol, frameCount: 20 }, { name: TURRET_HOLD_CLIP, frameCount: 3 }], table: null,
    } as never);
    const feet = RemotePlayers.prototype.feet;
    vi.spyOn(RemotePlayers.prototype, 'feet').mockImplementation(function (this: RemotePlayers, id: number) { return id === 3 ? [1, 10, -16] : feet.call(this, id); });
    vi.spyOn(WalkMode.prototype, 'hand').mockReturnValue(1);                             // the own hand: the pistol
    const au = matchAudio();
    const played = vi.spyOn(au.game, 'play');
    const a = await armed({}, { audio: au.audio, assets: Promise.resolve({ map: turretMap(), clips: null }) });
    a.t.w.step(2);
    const own = ownPose.mock.calls.at(-1)?.[0] as (() => TraversalPose | null) | undefined;
    const other = otherPose.mock.calls.at(-1)?.[0] as ((id: number) => TraversalPose | null) | undefined;
    expect(typeof own).toBe('function');
    expect(typeof other).toBe('function');
    expect(own!()).toBeNull();                                                           // unmounted: the body's own play
    const grabs = (): unknown[] => played.mock.calls.filter(([name]) => name === '.GRAB_TURRET');
    seat(a.x, 2);
    // The own body: its hand's mount clip (`walk.hand()`), the sound at its feet -- the seat the steer takes it to.
    expect(own!()?.clip).toBe(TURRET_MOUNT_CLIPS.pistol);
    expect(grabs()).toEqual([['.GRAB_TURRET', hookOf(a.t).feet(), 'play', 1]]);
    seat(a.x, null);
    expect(played.mock.calls.filter(([name]) => name === '.RELEASE_TURRET')).toHaveLength(1);
    // Another seated: its pose through the others' bodies (no body of its slot here: the rifle's), heard at its feet.
    seat(a.x, 3);
    expect(other!(3)?.clip).toBe(TURRET_MOUNT_CLIPS.rifle);
    expect(grabs().at(-1)).toEqual(['.GRAB_TURRET', [1, 10, -16], 'play', 1]);
    // `mountedMuzzle`: its round flashed at the turret's firepoint (`TurretPage.muzzleOf`), not at its rifle.
    const firepoint = Float32Array.from(mp51Turret().firepointMatrix!);
    vi.spyOn(TurretPage.prototype, 'muzzleOf').mockImplementation((id) => (id === 3 ? firepoint : null));
    const onRound = vi.spyOn(Effects.prototype, 'onRound').mockImplementation(() => {});
    a.x.say({ type: 'shot', id: 3, weapon: 62, from: [0, 12, -24], to: [0, 12, -60], normal: null, material: null } as unknown as ServerEvent);
    const flash = onRound.mock.calls.at(-1)?.[1] as { node: { elements: number[] } } | null | undefined;
    expect(flash?.node ? Array.from(flash.node.elements) : null).toEqual(Array.from(firepoint));
    a.m.close();
  });

  it("the hook (a development build): turrets() lists the placements with placementView's numbers and the held one; turretParts() the drawn parts under the roots", async () => {
    const attached = vi.spyOn(TurretPage.prototype, 'attach');
    const a = await armed({}, { assets: Promise.resolve({ map: turretMap(), clips: null }) });
    a.t.w.step(2);
    const h = hookOf(a.t);
    const page = attached.mock.contexts.at(-1) as TurretPage;
    expect(typeof h.turrets).toBe('function');
    expect(h.turrets()).toEqual({ placements: [placementView(mp51Turret())], ...page.stats() });
    expect(h.turrets().held).toBeNull();
    seat(a.x, 2);
    // LATER 151 (research 215 s7.11): the release is offered 1.25 s after the mount, and the page reads its own
    // `performance.now()` here (no clock seam in matchMount.ts), so the test waits for real -- no fake timers, by ruling.
    await new Promise((r) => setTimeout(r, 1300));
    expect(h.turrets()).toMatchObject({ held: 0, prompt: 'turret_dismount', turrets: [{ id: 0, occupant: 2, ammo: 750 }] });
    expect(h.turrets().placements[0]!.limitsDeg.yaw![1]).toBeCloseTo(70, 6);
    a.t.w.step(1);
    const parts = h.turretParts();
    expect(parts.map((p) => p.path)).toEqual([MP51_GUN]);                                // the gun under the root; the crate not
    expect(parts).toEqual(drawnTurretParts(a.t.r.scene(), [MP51_ROOT]));
    a.m.release();
    expect((a.t.o.win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK]).toBeUndefined();
  });

  it("turret-feel's five main.ts lines are matchMount.ts's: TURRET_CLIPS in the clips list, mountedMuzzle, the turret dep's five, the two setMountPose", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    const main = src('main.ts'), mount = src('matchMount.ts');
    for (const [f, text, audio, map] of [['main.ts', main, 'gameAudio', 'loaded'], ['matchMount.ts', mount, 'sound\\.audio', 'map']] as const) {
      expect(text, f).toMatch(/\.\.\.BINOCULAR_CLIPS, \.\.\.TURRET_CLIPS\]/);
      expect(text, f).toMatch(/\n\s+mountedMuzzle: \(id\) => acts\.turrets\.muzzleOf\(id\),/);
      // The hands (the trigger, the box, the mount: ACT-1's; the box's icon and mode: PAR-55's) through the part's actionHands.
      expect(text, f).toMatch(/hands: throws\.hands\(actionHands\(\(\) => acts\)\),/);   // PAR-55: the trigger, the box, its icon and mode, the mount
      expect(text, f).toMatch(new RegExp([
        // PAR-34 group 7 widened the window: the drops line carries the candidate count beside `ahead`; LkPaioX5 (c) again:
        // the second candidate and the drops' items beside it.
        String.raw`mountActions\(\{[\s\S]{0,1700}?\n\s+turret: \{`,
        String.raw`\n\s+sound: \(name, at\) => \{ ${audio}\.play\(name, at, 'play', 1\); \},`,
        String.raw`\n\s+bodyFeet: \(id\) => remote\.feet\(id\), clips: \(\) => remote\.playClips\(\),`,
        String.raw`\n\s+hand: \(id\) => \(id === net\?\.client\.id \? walk\.hand\(\) : \(net\?\.client\.bodies\(\)\.find\(\(b\) => b\.id === id\)\?\.slot === 1 \? 1 : 0\)\),`,
        String.raw`\n\s+round: \(record, from, dir, frame, count\) => firearm\.turretRound\(record, from, dir, frame, count\),`,
        String.raw`\n\s+\},[\s\S]{0,200}?\n\s*\}\);`,
        String.raw`\n\s*walk\.setMountPose\(\(\) => acts\.turrets\.ownPose\(\)\);[^\n]*`,
        String.raw`\n\s*remote\.setMountPose\(\(id\) => acts\.turrets\.turretPose\(id\)\);`,
      ].join('')));
      // The hook's two reads (`__viewer` on /testroom; the menu hook's last two, after ACT-4's `waiting`).
      expect(text, f).toMatch(new RegExp(String.raw`\n\s+turrets: \(\) => \(\{ placements: \(${map}\?\.turrets \?\? \[\]\)\.map\(placementView\), \.\.\.acts\.turrets\.stats\(\) \}\),`));
      expect(text, f).toMatch(new RegExp(String.raw`\n\s+turretParts: \(\) => drawnTurretParts\(view\?\.group \?\? null, \(${map}\?\.turrets \?\? \[\]\)\.map\(\(t\) => t\.root\)\),`));
    }
    expect(mount).toMatch(/\n\s+waiting: [^\n]*(?:\n\s+\/\/[^\n]*)*\n\s+turrets: [^\n]*\n\s+turretParts: [^\n]*\n\s+\} satisfies MatchWindowHook;/);
  });
});

/**
 * PAR-24 (E01 of the PARITY plan's gates; ACT.R8's general rule: timed holds count real time, not page frames; research
 * 252 s2). The seam is the mount's real pipeline on its fakes: the fake window's frame clock at a chosen period
 * (`step(n, ms)`) -> matchMount.ts's `frame(now)` and its 0.1 s clamp -> `padFrame` -> `playerLanes` -> the action
 * part's `lanes` (`./matchActions`) -> `ActionLifecycle.elapse` (spied, passed through) and the stance button's
 * `update`. At 5 fps a frame is 0.2 s of real time and the clamp hands 0.1 s on, so a timed rule fed the clamped step
 * runs at half speed. The case was written before the menu path mounted the world drops (PAR-4, below), so it does not
 * put a weapon in reach: the seconds the mount hands `elapse` each frame are recorded and fed to a claim hold armed as a pickup's
 * release arms it (`ActionLifecycle.release` on the `pickup` context). The cases were written as `it.fails`, holding the
 * mismatch until the wave-4 hunk (PAR.R3; research 252 s4) handed the timed rules the frame's real seconds
 * (`./frameTime`); the hunk landed and they are ordinary cases.
 */
describe('PAR-24 (E01): the timed holds through the mount\'s frame count real time (ACT.R8\'s rule; research 252)', () => {
  const FIVE_FPS_MS = 200, SIXTY_FPS_MS = 1000 / 60;
  const frames = (n: number, ms: number): number[] => Array.from({ length: n }, () => ms);
  /**
   * The match on a floor; one frame a `periods` entry, that many ms after the last; `blocked(i)` the loading hold over
   * frame `i`. Returns the seconds the mount handed `ActionLifecycle.elapse` in each frame (0 where none ran).
   */
  async function credited(periods: readonly number[], blocked: (frame: number) => boolean = () => false): Promise<number[]> {
    const elapse = vi.spyOn(ActionLifecycle.prototype, 'elapse');
    let at = -1;
    const a = await armed({ blocked: () => blocked(at) });
    a.t.w.step(3);
    const out: number[] = [];
    for (const [i, ms] of periods.entries()) {
      at = i;
      const n = elapse.mock.calls.length;
      a.t.w.step(1, ms);
      out.push(elapse.mock.calls.slice(n).reduce((sum, [s]) => sum + s, 0));
    }
    a.m.close();
    elapse.mockRestore();
    return out;
  }
  /** A claim hold armed as a pickup's release arms it, fed `seconds` a frame in reach: the real time (s) it ends at. */
  function claimEnds(periods: readonly number[], seconds: readonly number[]): number | null {
    const life = new ActionLifecycle(() => 'pickup');
    life.press();
    life.release();
    expect(life.pickupHeld()).toBe(true);
    let real = 0;
    for (const [i, s] of seconds.entries()) {
      real += periods[i]! / 1000;
      life.elapse(s, true);
      if (!life.pickupHeld()) return real;
    }
    return null;
  }

  it("the claim hold at 5 fps (0.2 s frames, which the 0.1 s clamp halves) ends after 3.0 s of real time, as the 60-fps control's does (PICKUP_PROMPT_COOLDOWN_READING)", async () => {
    const fast = frames(240, SIXTY_FPS_MS), slow = frames(40, FIVE_FPS_MS);
    const at60 = claimEnds(fast, await credited(fast));
    expect(at60).toBeGreaterThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING - 1e-9);           // the control: 3 s, to one frame
    expect(at60).toBeLessThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + SIXTY_FPS_MS / 1000 + 1e-9);
    expect(claimEnds(slow, await credited(slow))).toBeCloseTo(PICKUP_PROMPT_COOLDOWN_READING, 9);   // the lane: 6 s
  });

  it('a long frame credits the claim hold its real time and no more: a 1 s stall between 60-fps frames ends the hold after 3.0 s of real time, never sooner', async () => {
    const periods = [...frames(60, SIXTY_FPS_MS), 1000, ...frames(150, SIXTY_FPS_MS)];
    const at = claimEnds(periods, await credited(periods));
    expect(at).toBeGreaterThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING - 1e-9);              // never early
    expect(at).toBeLessThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + SIXTY_FPS_MS / 1000 + 1e-9);   // the lane: 3.9 s
  });

  it('the frames under the loading hold (padFrame stops before the lanes) credit the claim hold nothing: 2 s held mid-hold end it 2 s later', async () => {
    const periods = frames(400, SIXTY_FPS_MS);
    const at = claimEnds(periods, await credited(periods, (i) => i >= 60 && i < 180));
    expect(at).toBeGreaterThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + 2 - 1e-9);
    expect(at).toBeLessThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + 2 + 2 * SIXTY_FPS_MS / 1000 + 1e-9);
  });

  /** Triangle pressed on the mount's pad and held, `ms` a frame: the real time (s) from the press's frame to prone. */
  async function proneAfter(ms: number): Promise<number | null> {
    const stance = vi.spyOn(WalkMode.prototype, 'setStance');
    const a = await armed();
    a.t.w.step(3);
    a.press(3, true);
    a.t.w.step(1, ms);                                                                   // the press's frame: it counts nothing
    let real = 0, at: number | null = null;
    for (let i = 0; i < 100 && at === null; i++) {
      const n = stance.mock.calls.length;
      a.t.w.step(1, ms);
      real += ms / 1000;
      if (stance.mock.calls.slice(n).some(([s]) => s === 'prone')) at = real;
    }
    a.m.close();
    stance.mockRestore();
    return at;
  }

  it("the stance button's hold (STANCE_HOLD_S_PLACEHOLDER) at 5 fps goes prone 0.4 s of real time after the press's frame, as the 60-fps control does", async () => {
    const at60 = await proneAfter(SIXTY_FPS_MS);
    expect(at60).toBeGreaterThanOrEqual(STANCE_HOLD_S_PLACEHOLDER - 1e-9);
    expect(at60).toBeLessThanOrEqual(STANCE_HOLD_S_PLACEHOLDER + SIXTY_FPS_MS / 1000 + 1e-9);
    expect(await proneAfter(FIVE_FPS_MS)).toBeCloseTo(STANCE_HOLD_S_PLACEHOLDER, 9);   // the lane: 0.8 s
  });

  it("both pages read the frame's real seconds once (FrameTime) beside the clamped step and hand them to the timed rules: playerLanes (the lifecycle's hold and claim hold, the stance button) and the turret's cadence", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    const main = src('main.ts'), mount = src('matchMount.ts');
    expect(main).toMatch(/\n {4}const dt = Math\.min\(frameTime\.frame\(performance\.now\(\)\), 0\.1\);/);
    expect(mount).toMatch(/\n {4}const dt = Math\.min\(frameTime\.frame\(now\), 0\.1\);/);
    for (const [f, text] of [['main.ts', main], ['matchMount.ts', mount]] as const) {
      expect(text, f).toMatch(/import \{ FrameTime \} from '\.\/frameTime';/);
      expect(text, f).toMatch(/const frameTime = new FrameTime\(\);/);
      expect(text, f).toMatch(/playerLanes\(lanes, padGame, game, frameTime\.real\(\), \{ walking, menu(?:: chat\.owns)?, runAndTalk: startMenu\.runAndTalk\(\) \}\);/);
      expect(text, f).toMatch(/acts\.turretFrame\(frameTime\.real\(\), walk\.isDead\(\)\);/);
      expect(text, f).not.toMatch(/getDelta\(\)|const dt = last < 0/);
    }
  });
});

/**
 * PAR-34 group 1 (research 252 s3; ACT.R8): the rifle at 5 fps through the mount's frame (the PAR-24 seam: the fake
 * window's `step(n, ms)`, the 0.1 s clamp, the real seconds in `./frameTime`).
 *
 * - **The rate, the reload and the after-shot lock stay on the clamped step: it is the command clock the room checks.**
 *   A round names the walker's latest command (`NetPage.fireEvent`'s `lastSeq`), and the room drops one whose command
 *   is fewer than the weapon's cycle after the last round's (`room.ts` `fire`: `frame.count - p.lastFire[w] < cycle`,
 *   `cycle = fastest x TICK_HZ - 1`), and times both locks on the same count (`setLock`: "on the command clock"). The
 *   walker sends one command a 1/60 tick of the clamped step, so below 10 fps the commands run at the clamped step's
 *   rate: a rate on real seconds would fire two rounds in a 5-fps frame, both naming its last command, and the room
 *   would drop the second as 'rate'. The case pins that no round the page sends at 5 fps is one the room's count drops.
 * - **The lowering countdown is a timed rule and counts real seconds** (`FUN_00594cf0`'s `ctrl+0x234`, 5 s from
 *   `FUN_00598280` D:L454808-454809, run down by the controller's frame time): at 5 fps the rifle is asked down 5 s of
 *   real time after the trigger's last edge, as the 60-fps control is. Its envelope (in 0.1 s, out 0.5 s) is the Fire
 *   clips' blend weight, an animation on the clips' clamped step, and stays.
 */
describe('PAR-34 group 1: the rifle at 5 fps (research 252 s3; ACT.R8)', () => {
  const FIVE_FPS_MS = 200, SIXTY_FPS_MS = 1000 / 60;

  /** R1 tapped (held 3 frames, let go 1) for `n` frames of `ms`: the rounds' commands and the room's cycle for the gun. */
  async function tapped(n: number, ms: number): Promise<{ seqs: number[]; cycle: number }> {
    const weapon = vi.spyOn(Fire.prototype, 'setWeapon');
    const a = await armed();
    a.t.w.step(3);
    for (let i = 0; i < n; i++) { a.press(5, i % 4 !== 3); a.t.w.step(1, ms); }
    const seqs = a.fires().map((e) => (e as { seq: number }).seq);
    const record = weapon.mock.calls.at(-1)![0];
    const fastest = Math.min(...record.fireModes.filter((m) => m > 0).map((m) => fireInterval(record.fireWait, m)), record.fireWait);
    a.m.close();
    weapon.mockRestore();
    return { seqs, cycle: fastest * TICK_HZ - 1 };                                       // room.ts `fire`'s cycle
  }

  it("the rate stays on the command clock: at 5 fps, as at 60, no round the page sends names a command under the room's cycle after the last round's (room.ts `fire`'s 'rate')", async () => {
    for (const ms of [SIXTY_FPS_MS, 1000 / 30, FIVE_FPS_MS]) {
      const { seqs, cycle } = await tapped(40, ms);
      expect(seqs.length, `${ms} ms`).toBeGreaterThan(4);
      for (let i = 1; i < seqs.length; i++) expect(seqs[i]! - seqs[i - 1]!, `${ms} ms, round ${i}`).toBeGreaterThanOrEqual(cycle);
    }
  });

  /** R1 tapped once, then idle at `ms` a frame: the real time (s) from the release's frame to the raise's first ask down. */
  async function lowersAfter(ms: number): Promise<number | null> {
    const request = vi.spyOn(WeaponRaise.prototype, 'request');
    const a = await armed();
    a.t.w.step(3);
    a.press(5, true);
    a.t.w.step(1, ms);
    a.press(5, false);
    a.t.w.step(1, ms);                                                                   // the release's frame: its edge resets the countdown
    let real = 0, at: number | null = null;
    for (let i = 0; i < 400 && at === null; i++) {
      const n = request.mock.calls.length;
      a.t.w.step(1, ms);
      real += ms / 1000;
      if (request.mock.calls.slice(n).some(([t]) => t === 2)) at = real;
    }
    a.m.close();
    request.mockRestore();
    return at;
  }

  it('the rifle is asked down LOWER_DELAY (5 s) of real time after the last trigger edge at 5 fps, as the 60-fps control is (FUN_00594cf0 ctrl+0x234)', async () => {
    const at60 = await lowersAfter(SIXTY_FPS_MS);
    expect(at60).toBeGreaterThanOrEqual(LOWER_DELAY.base - 1e-9);
    expect(at60).toBeLessThanOrEqual(LOWER_DELAY.base + SIXTY_FPS_MS / 1000 + 1e-9);
    expect(await lowersAfter(FIVE_FPS_MS)).toBeCloseTo(LOWER_DELAY.base, 9);            // the lane: 10 s
  });
});

/**
 * PAR-34 group 2 (research 252 s3; ACT.R8): the R2 inventory's idle close (`INVENTORY_IDLE_CLOSE`, `FUN_0021bda0`
 * L72705: `5.0 < DAT_0040c100`, the count run by the frame's time) is a timed rule and counts real seconds; its slide and
 * fade are the menu's animations and keep the clamped step (the count starts only once the open has played out, state 3).
 */
describe('PAR-34 group 2: the R2 inventory closes after 5 s idle of real time at 5 fps (research 252 s3; ACT.R8)', () => {
  /** R2 pressed and let go at `ms` a frame: the real time (s) from the first frame the menu counts idle to its close. */
  async function closesAfter(ms: number): Promise<number | null> {
    const press = vi.spyOn(InventoryMenu.prototype, 'press');
    const a = await armed();
    a.t.w.step(3);
    a.press(7, true);
    a.t.w.step(1, ms);
    a.press(7, false);
    const menu = press.mock.contexts.at(-1) as InventoryMenu;
    expect(menu.isOpen()).toBe(true);
    let counting = false, real = 0, at: number | null = null;
    for (let i = 0; i < 1000 && at === null; i++) {
      const was = counting;
      a.t.w.step(1, ms);
      if (was) real += ms / 1000;                                                        // a frame whose press counted idle
      if (!menu.isOpen()) at = real;
      counting = menu.visual().state === 3;                                              // the next frame's press counts
    }
    a.m.close();
    press.mockRestore();
    return at;
  }

  it('INVENTORY_IDLE_CLOSE at 5 fps closes the open menu after 5 s of counted real time (within a frame), as the 60-fps control does', async () => {
    const at60 = await closesAfter(1000 / 60);
    expect(at60).toBeGreaterThan(INVENTORY_IDLE_CLOSE - 1e-9);
    expect(at60).toBeLessThanOrEqual(INVENTORY_IDLE_CLOSE + 2 / 60 + 1e-9);
    const at5 = await closesAfter(200);
    expect(at5).toBeGreaterThan(INVENTORY_IDLE_CLOSE - 1e-9);
    expect(at5).toBeLessThanOrEqual(INVENTORY_IDLE_CLOSE + 0.2 + 1e-9);                   // the lane: 10.2 s
  });
});

/**
 * PAR-34 group 3 (research 252 s3; ACT.R8): the mount's frame hands the throwables (`./matchThrow`'s `frame`) the
 * frame's real seconds beside the clamped step: the grenades' timed rules (`GrenadeThrower.update`'s `real`: the held
 * throw, the flight's fuse, a smoke's life, the C4 settle) and the flashbang's wash (`WhiteOut.update`) count them; the
 * launcher's rate (`RocketLauncher.update`) keeps the clamped step -- the command clock the room checks
 * (`room.ts` `launchRocket`: `p.ran < p.rocketWaitUntil`).
 */
describe("PAR-34 group 3: the mount hands the throwables the frame's real seconds (research 252 s3; ACT.R8)", () => {
  it('at 5 fps the grenades and the wash are handed 0.2 s a frame and the launcher 0.1 s; at 60 fps all the frame', async () => {
    const grenade = vi.spyOn(GrenadeThrower.prototype, 'update'), wash = vi.spyOn(WhiteOut.prototype, 'update');
    const rocket = vi.spyOn(RocketLauncher.prototype, 'update');
    const a = await armed();
    a.t.w.step(3);
    for (const [ms, dt] of [[200, 0.1], [1000 / 60, 1 / 60]] as const) {
      a.t.w.step(2, ms);
      expect(grenade.mock.calls.at(-1)![0], `${ms} ms`).toBeCloseTo(dt, 9);
      expect((grenade.mock.calls.at(-1) as unknown[])[1], `${ms} ms`).toBeCloseTo(ms / 1000, 9);   // the lane: none
      expect(wash.mock.calls.at(-1)![0], `${ms} ms`).toBeCloseTo(ms / 1000, 9);         // the lane: 0.1 at 5 fps
      expect(rocket.mock.calls.at(-1)![0], `${ms} ms`).toBeCloseTo(dt, 9);
    }
    a.m.close();
  });
});

/**
 * PAR-34 group 5 (research 252 s3; ACT.R8): the mount's frame hands the others' bodies (`NetPage.frame` ->
 * `RemotePlayers.frame`) the frame's real seconds beside the clamped step: a hostage's rescued fade counts them (and a
 * corpse's timed rule would, `corpseShownS`; NU-4: another seat's corpse has none -- was: "a corpse's fade
 * (`BODY_FADE_S`)"); the clips keep the clamped step.
 */
describe("PAR-34 group 5: the mount hands the bodies the frame's real seconds (research 252 s3; ACT.R8)", () => {
  it('at 5 fps RemotePlayers.frame is handed 0.1 s clamped and 0.2 s real; at 60 fps the frame both', async () => {
    const bodies = vi.spyOn(RemotePlayers.prototype, 'frame');
    const a = await armed();
    a.t.w.step(3);
    for (const [ms, dt] of [[200, 0.1], [1000 / 60, 1 / 60]] as const) {
      a.t.w.step(2, ms);
      const last = bodies.mock.calls.at(-1) as unknown[];
      expect(last[0], `${ms} ms`).toBeCloseTo(dt, 9);
      expect(last[3], `${ms} ms`).toBeCloseTo(ms / 1000, 9);                            // the lane: none
    }
    a.m.close();
  });
});

describe("PAR-12 and PAR-3 through the mount (research 255 s6: the integrator's mount-level cases)", () => {
  it("PAR-12: the menu's renderer starts at the device's cap and trades pixels for slow frames (./matchViewport); the visual viewport's resize reaches the renderer; the teardown takes every listener off", async () => {
    const x = handOff();
    const t = options(x);
    const ratios: number[] = [];
    let ratio = 2, resized = 0;
    const renderer: MatchRenderer = {
      ...t.r.r,
      resize: () => { resized++; },
      setPixelRatio: (v) => { ratios.push(v); ratio = v; },
      pixelRatio: () => ratio,
    };
    const visual = new Map<string, Set<EventListener>>();
    const win = {
      ...t.w.win,
      visualViewport: {
        addEventListener: (type: string, fn: EventListener) => { (visual.get(type) ?? visual.set(type, new Set()).get(type)!).add(fn); },
        removeEventListener: (type: string, fn: EventListener) => { visual.get(type)?.delete(fn); },
      },
    };
    const m = mountMatch(document.body, { ...t.o, renderer: () => Promise.resolve(renderer), win });
    await flush();
    // CPS-4a (CPS.R7): the cap is the default render scale's (Balanced) for the canvas's box (none in jsdom: 1 x 1).
    const cap = renderCapFor(VIDEO_SETTINGS_DEFAULTS.renderScale, globalThis.devicePixelRatio, wantsTouchControls(), 1, 1).ratioCap;
    expect(ratios[0]).toBe(cap);                                                         // `./main`'s `created.setPixelRatio(RATIO_CAP)`
    expect(visual.get('resize')?.size).toBe(1);
    expect(t.w.live.has('resize') && t.w.live.has('orientationchange')).toBe(true);
    const before = resized;
    for (const fn of [...visual.get('resize')!]) fn(new Event('resize'));               // a phone's browser bar
    expect(resized).toBe(before + 1);
    t.w.step(60, 50);                                                                    // 3 s of 50 ms frames: past the 2 s gap, slow
    expect(ratios.length).toBeGreaterThan(1);
    expect(ratios[1]).toBeCloseTo(cap * 0.9, 9);                                         // VS-3: the panic, two steps of 5 % of the cap
    m.close();
    expect(visual.get('resize')?.size).toBe(0);
    expect(t.w.live.has('resize') || t.w.live.has('orientationchange')).toBe(false);
  });

  it("CPS-4a (CPS.R7, a browser adaptation): the page's video settings heard mid-match -- the render scale's cap at the next tick, the shadows' switch, the SHOW FPS readout", async () => {
    localStorage.clear();
    const x = handOff();
    const t = options(x);
    const ratios: number[] = [];
    let ratio = 2;
    const renderer: MatchRenderer = { ...t.r.r, setPixelRatio: (v) => { ratios.push(v); ratio = v; }, pixelRatio: () => ratio };
    const cleared = vi.spyOn(CharacterShadow.prototype, 'clear');
    const m = mountMatch(document.body, { ...t.o, renderer: () => Promise.resolve(renderer) });
    await flush();
    const keeper = videoSettingsKeeper();
    expect(ratios).toEqual([1]);                                                         // Balanced at dpr 1
    t.w.step(13);                                                                        // 60 fps
    keeper.set({ renderScale: 'performance' });
    expect(ratios).toEqual([1]);                                                         // not before the tick
    t.w.step(13);
    expect(ratios).toEqual([1, 0.75]);                                                   // 0.75 of Balanced
    keeper.set({ renderScale: 'quality' });
    t.w.step(13);
    expect(ratios.at(-1)).toBe(renderCapFor('quality', globalThis.devicePixelRatio, wantsTouchControls(), 1, 1).ratioCap);
    // Shadows: on (the default), the character shadow's frame line runs each frame (a renderer without targets: `clear`);
    // off, cleared once and its frame skipped.
    cleared.mockClear();
    t.w.step(5);
    expect(cleared.mock.calls.length).toBeGreaterThanOrEqual(5);
    keeper.set({ shadows: false });
    cleared.mockClear();
    t.w.step(5);
    expect(cleared).not.toHaveBeenCalled();
    keeper.set({ shadows: true });
    t.w.step(2);
    expect(cleared.mock.calls.length).toBeGreaterThanOrEqual(2);
    // SHOW FPS from the launcher's row: the START menu's readout follows (one key, `s2u.viewer.showFps`).
    const fps = document.querySelector<HTMLElement>('[data-match-fps]')!;
    expect(fps.hidden).toBe(true);
    keeper.set({ showFps: true });
    expect(fps.hidden).toBe(false);
    keeper.set({ showFps: false });
    expect(fps.hidden).toBe(true);
    m.close();
    keeper.set({ renderScale: 'performance' });                                          // heard no more
    t.w.step(13);
    expect(ratios.at(-1)).toBe(renderCapFor('quality', globalThis.devicePixelRatio, wantsTouchControls(), 1, 1).ratioCap);
    localStorage.clear();
  });

  it("PAR-3: the page's ARMORY read (MatchMountOptions.armory) hands the HUD the round screens' two bitmaps once it resolves; none after the match is let go", async () => {
    const px = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    const read = { bitmaps: [[ROUND_SCREEN_BITMAPS.background, px(4, 4)], [ROUND_SCREEN_BITMAPS.panel, px(2, 2)], ['popupop.tif', px(2, 2)]] as const };
    const handed: string[][] = [];
    const spy = vi.spyOn(Hud.prototype, 'addBitmaps');
    spy.mockImplementation(function (this: Hud, extra) { handed.push(Object.keys(extra).sort()); });
    const x = handOff();
    const t = options(x, { armory: Promise.resolve(read) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(handed).toEqual([['backsolid.tif', 'multplay_back.tif']]);                  // the two the screens draw, no more
    m.close();
    let late!: (v: typeof read) => void;
    const t2 = options(handOff(), { armory: new Promise((res) => { late = res; }) });
    const m2 = mountMatch(document.body, t2.o);
    m2.close();
    late(read);
    await flush();
    expect(handed).toHaveLength(1);                                                      // a read landing after the teardown hands nothing
  });
});

/**
 * PAR-4 (audit A.4; research 234 s5-s6): the world drops on the menu path -- `/testroom`'s part (`./drops` `WorldDrops`)
 * on the mount's scene, the action part's pickup context on it (`acts`' `drops.ahead`), the room's `drop` / `taken` /
 * `kit` through the two net deps `PART_DEPS.worldDrops` lists (`drops`, `kitChanged`), and the resets at a round's start
 * (`roundClear`, the drops going with the air: DROP_LIFETIME_PLACEHOLDER) and at the teardown (`./main`'s map left). The
 * claim hold's real-time count is PAR-24's (above).
 */
describe('PAR-4: the world drops and the Cross pickup on the menu-launched match (./drops; H120)', () => {
  it("a death's weapon drop ahead of the feet is the action button's: Cross claims it from the room, whose taken and kit take it into the kit; a round's start clears what still lies; the teardown lets the drops go", async () => {
    const reset = vi.spyOn(WorldDrops.prototype, 'reset');
    const a = await armed();
    a.t.w.step(2);
    const hook = (a.t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    const feet = hook.feet()!;
    expect(feet).not.toBeNull();
    const sent = (type: string) => a.x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.startsWith('{'))
      .map((d) => JSON.parse(d) as { type: string; did?: number }).filter((e) => e.type === type);
    const cross = (): void => { a.press(0, true); a.t.w.step(2); a.press(0, false); a.t.w.step(2); };
    // Yaw 0 faces -z (`WorldDrops.promptAt`); 5 units ahead is inside PICKUP_REACH_READING (20).
    const ahead: [number, number, number] = [feet[0], feet[1], feet[2] - 5];
    a.x.say({ type: 'kill', killer: 2, victim: 3, weapon: 'M4A1', how: 'weapon', clip: null } as unknown as ServerEvent);
    a.x.say({ type: 'drop', did: 7, kind: 'weapon', item: 62, at: ahead, yaw: 0, from: 3 } as unknown as ServerEvent);   // the victim's weapon
    a.t.w.step(2);
    cross();
    expect(sent('pickup').map((e) => e.did)).toEqual([7]);                              // the claim, the room's to grant
    const taken = [62, ...hook.kit().slice(1)];
    a.x.say({ type: 'taken', did: 7, by: 2, kit: taken } as unknown as ServerEvent);
    a.x.say({ type: 'kit', loadout: taken, slot: 0, rounds: [[30, 30, 0, 0, 0, 0, 0, 0, 0, 0], [15, 15, 0, 0, 0, 0, 0, 0, 0, 0]] } as unknown as ServerEvent);
    a.t.w.step(2);
    expect(hook.kit()).toEqual(taken);                                                   // kitChanged: the claimed weapon in the hand's slot
    // Another drop lies through the claim's 3 s hold (counted while one is in reach), then the round starts.
    a.x.say({ type: 'drop', did: 8, kind: 'weapon', item: 54, at: ahead, yaw: 0, from: 3 } as unknown as ServerEvent);
    a.t.w.step(240);
    const resets = reset.mock.calls.length;
    a.x.say({ type: 'roundStart', round: 2, seconds: 300, epoch: 2 } as unknown as ServerEvent);
    a.x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);
    a.t.w.step(240);
    expect(reset.mock.calls.length).toBeGreaterThan(resets);                             // roundClear: the drops go with the air
    cross();
    expect(sent('pickup').map((e) => e.did)).toEqual([7]);                              // nothing lies to claim where drop 8 lay
    // The same spot, the same facing: a drop laid there now is offered and claimed -- the press above was in reach and
    // ahead, so its silence is the round's reset, not the spawn having moved the SEAL away (the review's F4).
    const now = hook.feet()!;
    expect(Math.hypot(ahead[0] - now[0], ahead[1] - now[1], ahead[2] - now[2])).toBeLessThan(20);   // PICKUP_REACH_READING
    a.x.say({ type: 'drop', did: 9, kind: 'weapon', item: 54, at: ahead, yaw: 0, from: 3 } as unknown as ServerEvent);
    a.t.w.step(2);
    cross();
    expect(sent('pickup').map((e) => e.did)).toEqual([7, 9]);
    const before = reset.mock.calls.length;
    a.m.close();
    expect(reset.mock.calls.length).toBeGreaterThan(before);                             // the teardown
  });
});

/**
 * PAR-2's review (finding 1; the main merge controller's ruling, 2026-10-11): the original has no in-match ARMORY -- its
 * ARMORY is the lobby's, before the launch (research 95 §4.1, 167 R167.1, 182 §4.5; `ARMORY_SEAT_READING`). The seat
 * ARMORY is mounted on the menu match but dormant: no hello of the menu match asks the room to hold a seat for it --
 * neither the lobby's (`./gameLobbyHost`) nor the one the page sends itself when it reopens its socket after a drop
 * (`NetPage.open`), so no drop, reconnect and promotion opens it and holds the spawn.
 */
describe('PAR-2: the seat ARMORY dormant on the menu match -- no hello asks the room for it', () => {
  it('the lobby\'s hello and the reopened socket\'s hello carry no `armory`; the part\'s NetPage dep says so', async () => {
    const opened: (Sock & { url: string })[] = [];
    class FakeSocket {
      binaryType = ''; readyState = 1; sent: string[] = []; closed: number[] = [];
      onopen: ((e: unknown) => void) | null = null; onclose: ((e: unknown) => void) | null = null;
      onmessage: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null;
      constructor(readonly url: string) { opened.push(this as unknown as Sock & { url: string }); }
      send(d: string): void { this.sent.push(d); }
      close(c?: number): void { this.closed.push(c ?? 0); }
    }
    vi.stubGlobal('WebSocket', FakeSocket);
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    const hellos = (s: { sent: string[] }): Record<string, unknown>[] => s.sent.filter((d) => typeof d === 'string' && d.includes('"hello"')).map((d) => JSON.parse(d) as Record<string, unknown>);
    expect(hellos(x.socks[0]!)).toHaveLength(1);
    expect(hellos(x.socks[0]!)[0]).not.toHaveProperty('armory');                       // the lobby's
    // A drop: NetPage reopens the game socket itself after its backoff (1 s after a match reached).
    x.socks[0]!.onclose?.({ code: 1006, reason: '' });
    t.w.step(1);
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now + 60_000);
    t.w.step(1);
    expect(opened).toHaveLength(1);                                                      // the page's own socket
    opened[0]!.onopen?.({});
    expect(hellos(opened[0]!)).toHaveLength(1);
    expect(hellos(opened[0]!)[0]).not.toHaveProperty('armory');                          // nor the page's own
    expect(hellos(opened[0]!)[0]).not.toHaveProperty('armoryOpen');
    m.close();
    vi.unstubAllGlobals();
  });
  it('the menu match hands the part a dormant switch: `playing` false (its hello asks for no seat); /testroom keeps its stand-in', () => {
    const mount = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf-8');
    expect(mount).toMatch(/const armoryPart = mountArmory\(\{[\s\S]*?playing: \(\) => false,/);
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');
    expect(main).toMatch(/playing: \(\) => !NO_ARMORY && playOn,/);
  });
  it('finding 5: the right mouse button steps no zoom under the open ARMORY (main.ts\'s gate)', () => {
    const mount = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf-8');
    expect(mount).toMatch(/const onMouseDown = \(e: MouseEvent\): void => \{ if \(e\.button === 2 && !armory\.isOpen\(\) && !\(o\.blocked\?\.\(\) \?\? false\)\) firearm\.stepZoom\('cycle'\); \};/);
  });
});

/**
 * NU-9 through the real page (research 327 §5 N1, research 329 §5 T4): the front end's match sets the walker's own name
 * and tag on the HUD once a frame (`ownHudName`), reads TEAMMATE NAMES once at the mount (`gameVars.valve`,
 * `DISPLAY_MP_TEAM_NAMES`; absent, the golden's 1) and feeds the over-head tags each frame from its net page and its
 * `RemotePlayers` (`teamTagInput`, `teamTags`). The bodies are stand-ins here (no map): a teammate's head is put straight
 * ahead of the match's camera by a spy on `RemotePlayers.headAt`.
 */
describe('NU-9: the names and the over-head tags through the front end\'s match (research 327 N1, 329 T4)', () => {
  const hookOf = (t: ReturnType<typeof options>) => (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
  const rows = (clan?: string) => ({ type: 'score', rows: [
    { id: 2, name: 'socomc', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0, ...(clan ? { clan } : {}) },
    { id: 3, name: 'kilo', team: 'terrorist', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
    { id: 4, name: 'lima', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0, clan: 'NSW' },
  ], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } } as unknown as ServerEvent);
  /** The match mounted, a SEAL teammate `lima` (4) joined and his head 100 units ahead of the camera. */
  async function mounted(extra: Partial<MatchMountOptions> = {}, team: 'seal' | 'terrorist' = 'seal') {
    const x = handOff(team);
    const t = options(x, extra);
    const m = mountMatch(document.body, t.o);
    await flush();
    const hook = hookOf(t);
    vi.spyOn(RemotePlayers.prototype, 'headAt').mockImplementation((id: number) => {
      if (id !== 4) return null;
      const p = hook.pose(), yaw = (p.yaw * Math.PI) / 180, pitch = (p.pitch * Math.PI) / 180;
      return [p.x - Math.sin(yaw) * 100, p.y + Math.tan(pitch) * 100 - 3, p.z - Math.cos(yaw) * 100];
    });
    x.say({ type: 'joined', id: 4, name: 'lima', team: 'seal' } as unknown as ServerEvent);
    x.say(rows());
    t.w.step(2);
    return { x, t, m, hook };
  }

  it('N1: the welcome\'s name on the HUD\'s model, the tag apart; the seat\'s row clan its tag on the next frame', async () => {
    const { x, t, m, hook } = await mounted();
    expect(hook.hud().model).toMatchObject({ name: 'socomc', tag: '' });
    x.say(rows('NSW'));
    t.w.step(1);
    expect(hook.hud().model).toMatchObject({ name: 'socomc', tag: 'NSW' });
    m.close();
  });

  it('T4: a teammate\'s body in view draws a tag with his name and clan; TEAMMATE NAMES absent: on (the golden\'s 1)', async () => {
    const { m, hook } = await mounted();
    const model = hook.hud().model;
    expect(model.teamTags?.points.map((p) => [p.id, p.text, p.alpha])).toEqual([[4, '[NSW] lima', 100]]);
    expect(model.teammateNames).toBe(true);
    m.close();
  });

  it('T4: the valve 0 -- no texts (the model\'s option off), the tags still computed; a teammate talking in view: his sprites\' holder set', async () => {
    const { x, t, m, hook } = await mounted({ gameVars: { uiVar: () => null, valve: (n) => (n === 'DISPLAY_MP_TEAM_NAMES' ? 0 : null) } });
    expect(hook.hud().model.teammateNames).toBe(false);
    x.say({ type: 'voiceFloor', channel: 0, holder: 4 } as unknown as ServerEvent);
    t.w.step(1);
    const tags = hook.hud().model.teamTags!;
    expect(tags.holder).toBe(4);
    expect(tags.points.map((p) => p.id)).toEqual([4]);
    m.close();
  });

  it('SS-2 (H422 answered (a)): the look is this browser\'s s2u.viewer.nameTags, read at the mount -- Modern by default, Original when set; the valve on', async () => {
    localStorage.removeItem(NAME_TAGS_KEY);
    const a = await mounted({ gameVars: { uiVar: () => null, valve: (n) => (n === 'DISPLAY_MP_TEAM_NAMES' ? 1 : null) } });
    expect([a.hook.hud().model.teammateNames, a.hook.hud().model.teammateNamesOriginal]).toEqual([true, false]);
    a.m.close();
    localStorage.setItem(NAME_TAGS_KEY, 'original');
    try {
      const b = await mounted({ gameVars: { uiVar: () => null, valve: (n) => (n === 'DISPLAY_MP_TEAM_NAMES' ? 1 : null) } });
      expect([b.hook.hud().model.teammateNames, b.hook.hud().model.teammateNamesOriginal]).toEqual([true, true]);
      expect(b.hook.hud().model.teamTags?.scale).toBe(0.9);              // the original's tags (`./hudTags` `teamTags`)
      b.m.close();
      const c = await mounted({ gameVars: { uiVar: () => null, valve: (n) => (n === 'DISPLAY_MP_TEAM_NAMES' ? 0 : null) } });
      expect([c.hook.hud().model.teammateNames, c.hook.hud().model.teammateNamesOriginal]).toEqual([false, false]);   // off is the card's
      c.m.close();
    } finally { localStorage.removeItem(NAME_TAGS_KEY); }
  });

  it('T4: the valve changed mid-match keeps the mount\'s value (read once, D:L77558-77559)', async () => {
    let names = 1;
    const { t, m, hook } = await mounted({ gameVars: { uiVar: () => null, valve: (n) => (n === 'DISPLAY_MP_TEAM_NAMES' ? names : null) } });
    expect(hook.hud().model.teammateNames).toBe(true);
    names = 0;
    t.w.step(2);
    expect(hook.hud().model.teammateNames).toBe(true);
    m.close();
  });

  it('T4: a spectator draws none (his side shares no team bit, research 329 §1.2): the seat demoted to a spectator (protocol 5)', async () => {
    const { x, t, m, hook } = await mounted();
    expect(hook.hud().model.teamTags?.points.map((p) => p.id)).toEqual([4]);    // a SEAL player: lima's tag
    x.say({ type: 'demoted', position: 1 } as unknown as ServerEvent);
    t.w.step(2);
    expect(hook.hud().model.teamTags?.points ?? []).toEqual([]);
    m.close();
  });
});

/**
 * PAR-94 B2 (research 322 §4.1 B2, D2; the sprint 40 ledger's C25): no kit drawn for a seat the room has not spawned. The
 * original's HUD update runs only under the camera's actor (`FUN_001f7ff0` D:L56540, the gate D:L56631), which its load
 * makes before the first frame (R322.3); the port's mount puts the side's default kit on the body (`loadouts.spawn(seat,
 * { network: true })`) and, before B2, drew the HUD and its reticle from the first frame while the room had spawned
 * nobody. `spawned` is the page's own `spawn` heard this match (`NetPage`'s `case 'spawn'` -> the deps' `respawned`).
 */
describe('PAR-94 B2: the front end match draws no HUD and no reticle before the room spawns the seat', () => {
  // The HUD's batches need its bitmaps: the map's `hud` record, every library's name at a small size.
  const tiny = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
  const hudMap = (): LoadedMap => ({
    ...grounded(),
    hud: Object.fromEntries(Object.values(HUD_LIBRARIES).flat().map((n) => [n, n === 'font_text_01.tif' ? tiny(512, 128) : tiny(32, 32)])),
  } as unknown as LoadedMap);
  const spawnOf = (kit?: number[]) => ({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0, ...(kit ? { kit } : {}) } as unknown as ServerEvent);
  async function mount(events: ServerEvent[]) {
    const x = handOff();
    const reticle = vi.spyOn(Reticle.prototype, 'setVisible');
    const t = options(x, { events, assets: Promise.resolve({ map: hudMap(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    const hud = (): boolean => hookOf(t).hud().visible;
    const reticleOn = (): boolean | undefined => reticle.mock.calls.at(-1)?.[0];
    return { x, t, m, hud, reticleOn };
  }

  it('no spawn replayed: walking, but neither the HUD nor the reticle after a frame; the room\'s spawn brings both', async () => {
    const a = await mount([welcome]);
    a.t.w.step(3);
    expect(hookOf(a.t).hud().frame.height).toBeGreaterThan(0);                          // the HUD drew a frame: it could be visible
    expect([a.hud(), a.reticleOn()]).toEqual([false, false]);
    a.x.say(spawnOf());
    a.t.w.step(1);
    expect([a.hud(), a.reticleOn()]).toEqual([true, true]);
    a.m.close();
  });

  it('the seat\'s spawn among the replayed events: both from the first frame (B1\'s order)', async () => {
    const a = await mount([welcome, spawnOf([1, 2, 3, 4, 5])]);
    a.t.w.step(1);
    expect([a.hud(), a.reticleOn()]).toEqual([true, true]);
    a.m.close();
  });

  it('pin: a dead seat keeps today\'s HUD (the reticle hidden while dead) and a respawned one has both', async () => {
    const a = await mount([welcome, spawnOf()]);
    a.t.w.step(2);
    a.x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    a.t.w.step(1);
    expect([a.hud(), a.reticleOn()]).toEqual([true, false]);
    a.x.say(spawnOf());
    a.t.w.step(1);
    expect([a.hud(), a.reticleOn()]).toEqual([true, true]);
    a.m.close();
  });
});

/**
 * SA-6c (`GAME_RETOKEN_ADAPTATION`; SA.R22 (5)): the hand-over keeps the seat's one provider -- the match's page is handed
 * the lobby's (`GameLobbyHandOff.reseat` into `NetPageDeps.game.reseat`), so its retry asks that one and no other, and
 * the adopted socket asks nothing until its first drop.
 */
describe('SA-6c: the front end\'s match retries through the lobby\'s provider (GameLobbyHandOff.reseat)', () => {
  it('no ask while the adopted socket stands; its drop asks the handed-on provider, once, before any socket opens', async () => {
    const x = handOff();
    let asks = 0;
    const reseat = { game: 7, reseat: () => { asks++; return new Promise<never>(() => {}); } };
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const t = options(x, { handOff: { ...x.h, reseat } });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(m.net()?.client).toBe(x.h.client);
    for (let i = 0; i < 20; i++) { clock += 100; t.w.step(); }
    expect(asks).toBe(0);
    x.socks[0]!.onclose?.({ code: 1006, reason: '' });
    for (let i = 0; i < 40; i++) { clock += 100; t.w.step(); }
    expect(asks).toBe(1);
    expect(x.socks).toHaveLength(1);
    m.close();
  });
});

// PAR-48c (issue #138; the menu spec's browser run, two probes): WATCH GAME's page had its spectator flown and the room's
// spectator role, but its renderer still pending (WebGPU's adapter request held over 20 s, LATER 128), and the frame set
// the HUD's spectator view only inside its draw -- `hud().model.spectator` null. `./main`'s frame sets it every frame
// (main.ts `hud.setSpectator(spectating)`); this page's now does too, the drawing alone waiting on the renderer.
describe('PAR-48c: the spectator HUD\'s view is the frame\'s, not the draw\'s', () => {
  const watcher = { ...welcome, role: 'spectator', team: null, queue: 0, phase: 'play' } as unknown as ServerEvent;
  const hookOf = (t: ReturnType<typeof options>) => (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;

  it('a WATCH GAME spectator whose renderer has not come: the free camera\'s view all the same, and nothing drawn', async () => {
    const x = handOff('seal', undefined, watcher);
    const t = options(x, { events: [watcher], renderer: () => new Promise<MatchRenderer>(() => {}) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(3);
    expect(m.net()?.client.role).toBe('spectator');
    expect(hookOf(t).hud().model.spectator).toEqual({ path: 'spectator', followed: null, stats: null });
    expect(t.r.drawn).toHaveLength(0);                                               // the renderer never came: no draw
    expect(hookOf(t).drawing()).toBe(false);
    m.close();
  });

  it('drawing() (a test instrument, no game behaviour): false until the renderer comes, then true', async () => {
    const x = handOff('seal', undefined, watcher);
    let give: (r: MatchRenderer) => void = () => {};
    const t = options(x, { events: [watcher], renderer: () => new Promise<MatchRenderer>((r) => { give = r; }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(hookOf(t).drawing()).toBe(false);
    give(t.r.r);
    await flush();
    t.w.step(2);
    expect(hookOf(t).drawing()).toBe(true);
    expect(t.r.drawn.length).toBeGreaterThan(0);
    expect(hookOf(t).hud().model.spectator?.path).toBe('spectator');
    m.close();
  });

  // The review's F1: with a renderer, the pad's change of view shows in the frame it is made (`./main`'s order: the pad,
  // then the view, then the draw), as before PAR-48c's fix -- not a frame late.
  it('with a renderer, the pad\'s change of view is the same frame\'s view (the pad, then the view, as ./main)', async () => {
    const x = handOff('seal', undefined, watcher);
    const t = options(x, { events: [watcher] });
    vi.spyOn(NetPage.prototype, 'spectatorPad').mockImplementation(function (this: NetPage) {
      const s = this.spectator as unknown as { modeNow: string; targetNow: number | null };
      s.modeNow = 'follow'; s.targetNow = 3;                                                // the pad's follow of kilo, this frame
    });
    const m = mountMatch(document.body, t.o);
    await flush();
    expect(hookOf(t).drawing()).toBe(true);
    t.w.step(1);
    expect(hookOf(t).hud().model.spectator?.followed?.name).toBe('kilo');
    m.close();
  });
});

// LATER 129 (PAR-48c's review F2): the frame's game state is the frame's, as `./main`'s, not held for the renderer's
// arrival -- the spectator's pad (`NetPage.spectatorPad`), the hostage order offered afresh (`HostagePage.frame`), the
// slide's loop (`TraversalPage.soundFrame`); with a renderer, in `./main`'s order (the render, the pad, the view, the
// hostages, the sound, the HUD's render).
// VS-4 (VS.R2; product track, a browser adaptation with no original): the frame cap skips draws only. The simulation, the
// net's frame and the timed rules run every animation frame on its real seconds, so a capped run steps what an uncapped
// one does; only the world's render, the HUD's and the shadow's frame wait for the gate (`../src/frameCap`).
describe('VS-4: the frame cap in the front end\'s match skips draws, never steps', () => {
  /** 10 s of 60 Hz frames under `cap`: the walk's and the net's frames, the seconds the net was handed, the draws. */
  async function run(cap: FrameCap, change?: { at: number; cap: FrameCap }, overlay: 'off' | 'fps' = 'off') {
    localStorage.clear();
    const keeper = videoSettingsKeeperV2();
    keeper.set({ frameCap: cap, overlay });
    const walks = vi.spyOn(WalkMode.prototype, 'frame');
    const nets = vi.spyOn(NetPage.prototype, 'frame');
    const huds = vi.spyOn(Hud.prototype, 'render');
    const shadows = vi.spyOn(CharacterShadow.prototype, 'clear');
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    walks.mockClear(); nets.mockClear(); huds.mockClear(); shadows.mockClear();
    const before = t.r.drawn.length;
    for (let i = 0; i < 600; i++) {
      if (change && i === change.at) keeper.set({ frameCap: change.cap });
      t.w.step(1, 1000 / 60);
    }
    const out = {
      walks: walks.mock.calls.length, nets: nets.mock.calls.length,
      walkSeconds: walks.mock.calls.reduce((sum, c) => sum + c[0], 0),
      readout: document.querySelector<HTMLElement>('[data-match-fps]')?.textContent ?? null,
      netSeconds: nets.mock.calls.reduce((sum, c) => sum + (c[3] ?? c[0]), 0),
      draws: t.r.drawn.length - before, huds: huds.mock.calls.length, shadows: shadows.mock.calls.length,
    };
    m.close();
    walks.mockRestore(); nets.mockRestore(); huds.mockRestore(); shadows.mockRestore();
    localStorage.clear();
    return out;
  }

  it('cap 30 over 10 s of 60 Hz frames: the walk\'s and the net\'s frames and their real seconds equal the cap-Off run\'s; the draws are half', async () => {
    const off = await run(0), capped = await run(30);
    expect(off.walks).toBe(600);
    expect(off.draws).toBe(600);
    expect(capped.walks).toBe(off.walks);                                              // the simulation's step: every frame
    expect(capped.nets).toBe(off.nets);                                                // the net's frame: every frame
    expect(off.nets).toBeGreaterThan(0);
    expect(capped.netSeconds).toBeCloseTo(off.netSeconds, 9);                          // the timed rules: the same real time
    expect(capped.walkSeconds).toBeCloseTo(off.walkSeconds, 9);                        // the walk's step: the same seconds (review F3)
    expect(Math.abs(capped.draws - 300)).toBeLessThanOrEqual(1);                       // the world's render: half
    expect(Math.abs(capped.huds - off.huds / 2)).toBeLessThanOrEqual(1);              // the HUD's render: half
    expect(Math.abs(capped.shadows - off.shadows / 2)).toBeLessThanOrEqual(1);        // the shadow's frame: half
  });

  it('cap 60 and 120 on a 60 Hz display draw every frame (Review focus 2); a cap set mid-match is heard at once', async () => {
    expect((await run(60)).draws).toBe(600);
    expect((await run(120)).draws).toBe(600);
    const mid = await run(0, { at: 300, cap: 30 });
    expect(mid.walks).toBe(600);
    expect(Math.abs(mid.draws - 450)).toBeLessThanOrEqual(1);                          // 300 Off, then 150 at 30
  });

  it('review F1: under a cap the readout shows the drawn rate -- cap 30 at 60 Hz reads 30 fps; Off reads the display\'s 60', async () => {
    expect((await run(30, undefined, 'fps')).readout).toMatch(/^30 fps · 33\.3 ms$/);
    expect((await run(0, undefined, 'fps')).readout).toMatch(/^60 fps · 16\.7 ms$/);
    expect((await run(120, undefined, 'fps')).readout).toMatch(/^60 fps · 16\.7 ms$/);  // a cap above the display: the display's rate
  });

  it('review F2: the adaptive ratio is handed a frame-time target only for a cap below 60 (0: its default target), at the mount and at a change', async () => {
    const proto = AdaptiveRatio.prototype as unknown as { setTarget?: (ms: number) => void };
    const targets: number[] = [];
    proto.setTarget = (ms: number): void => { targets.push(ms); };
    try {
      for (const cap of [0, 30, 60, 120] as const) {
        targets.length = 0;
        await run(cap);
        expect(targets[0], `cap ${cap}`).toBe(cap === 30 ? 1000 / 30 : 0);
      }
      targets.length = 0;
      await run(30, { at: 10, cap: 120 });
      expect(targets).toEqual([1000 / 30, 0]);                                           // the change to 120: the default again
      targets.length = 0;
      await run(120, { at: 10, cap: 30 });
      expect(targets).toEqual([0, 1000 / 30]);
    } finally {
      delete proto.setTarget;
    }
  });
});

// VS-7 (VS.R7; product track, a browser adaptation with no original): Automatic's first-match probe is fed the match's
// drawn frames only, once the first frame is drawn (the warm-ups settled, `firstDrawn`); the dynamic scale's floor is
// the device class's under Automatic (`../src/autoQuality` `AUTO_FLOOR_SHARE_ADAPTATION`), VS-3's under a preset.
describe('VS-7: Automatic in the front end\'s match -- the first-match probe and the class\'s floor', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  /** A mount under `set` (nothing: Automatic), `frames` 60 Hz frames: the drawn count at each probe frame and at firstFrame. */
  async function run(frames: number, set?: Parameters<ReturnType<typeof videoSettingsKeeperV2>['set']>[0]) {
    localStorage.clear();
    if (set) videoSettingsKeeperV2().set(set);
    const fed: { drawn: number; ms: number }[] = [];
    const first: number[] = [];
    const floors: unknown[] = [];
    const probeFrame = FirstMatchProbe.prototype.frame;
    const x = handOff();
    let assetsIn!: (a: MatchAssets | null) => void;
    const t = options(x, { assets: new Promise((res) => { assetsIn = res; }), firstFrame: () => { first.push(t.r.drawn.length); } } as Partial<MatchMountOptions>);
    vi.spyOn(FirstMatchProbe.prototype, 'frame').mockImplementation(function (this: FirstMatchProbe, ms: number, full: boolean) {
      fed.push({ drawn: t.r.drawn.length, ms });
      return probeFrame.call(this, ms, full);
    });
    const ratioFrame = AdaptiveRatio.prototype.frame;
    vi.spyOn(AdaptiveRatio.prototype, 'frame').mockImplementation(function (this: AdaptiveRatio, ...a: Parameters<AdaptiveRatio['frame']>) {
      floors.push((this as unknown as { opts: unknown }).opts);
      return ratioFrame.apply(this, a);
    });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(3, 1000 / 60);                                                             // drawn, no world in yet
    assetsIn({ map: synthetic(), clips: null }); await flush();
    t.w.step(frames, 1000 / 60);
    m.close();
    return { fed, first, floors, saved: localStorage.getItem(VIDEO_AUTO_KEY) };
  }

  it('fed only the frames drawn after the first world frame; 3 s of them save Automatic\'s result once', async () => {
    const r = await run(220);
    expect(r.first).toHaveLength(1);
    expect(r.fed.length).toBeGreaterThan(180);
    expect(r.fed.every((f) => f.drawn > r.first[0]!)).toBe(true);                       // never a frame before the loading hold let go
    expect(r.fed.every((f) => Math.abs(f.ms - 1000 / 60) < 1e-6)).toBe(true);            // the frame's real ms
    expect(JSON.parse(r.saved!)).toMatchObject({ deviceClass: 'standard', preset: 'balanced' });
  });

  it('a match that ends before 3 s saves nothing (Review focus 4)', async () => {
    const r = await run(120);
    expect(r.fed.length).toBeGreaterThan(0);
    expect(r.saved).toBeNull();
  });

  it('under a preset (or Custom) no probe runs and nothing is saved', async () => {
    for (const set of [{ preset: 'balanced' as const }, { frameCap: 30 as const }]) {
      const r = await run(220, set);
      expect(r.fed, JSON.stringify(set)).toEqual([]);
      expect(r.saved, JSON.stringify(set)).toBeNull();
    }
  });

  it('review F2: the match draws the v2 percent and ceiling -- the Xbox start at 1920x1080 ratio 1 caps 0.6667 (1280x720); Balanced 1; Custom 85 %', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1920);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(1080);
    const capOf = async (setUp: () => void, mid?: () => void): Promise<number[]> => {
      localStorage.clear();
      setUp();
      const x = handOff();
      const t = options(x);
      const ratios: number[] = [];
      let ratio = 2;
      const renderer: MatchRenderer = { ...t.r.r, setPixelRatio: (v) => { ratios.push(v); ratio = v; }, pixelRatio: () => ratio };
      const m = mountMatch(document.body, { ...t.o, renderer: () => Promise.resolve(renderer) });
      await flush();
      if (mid) { mid(); t.w.step(13); }
      m.close();
      return ratios;
    };
    expect((await capOf(() => { localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox'); }))[0]).toBeCloseTo(720 / 1080, 9);
    expect((await capOf(() => undefined))[0]).toBe(1);                                  // Balanced: today's cap
    expect((await capOf(() => { videoSettingsKeeperV2().set({ renderScalePct: 85 }); }))[0]).toBeCloseTo(0.85, 9);
    expect((await capOf(() => undefined, () => { videoSettingsKeeperV2().set({ renderScalePct: 85 }); })).at(-1)).toBeCloseTo(0.85, 9);   // heard mid-match
    localStorage.clear();
  });

  it('the dynamic scale\'s options: the class\'s floor share under Automatic, VS-3\'s own under a preset', async () => {
    const auto = await run(3);
    expect(auto.floors.length).toBeGreaterThan(0);
    expect(auto.floors[0]).not.toBe(ADAPTIVE_V2_ADAPTATION);
    expect(auto.floors[0]).toEqual({ ...ADAPTIVE_V2_ADAPTATION, floorShare: AUTO_FLOOR_SHARE_ADAPTATION.standard });
    const preset = await run(3, { preset: 'balanced' });
    expect(preset.floors[0]).toBe(ADAPTIVE_V2_ADAPTATION);
  });
});

describe('LATER 129: the menu match\'s game state runs each frame, the renderer or not', () => {
  const watcher = { ...welcome, role: 'spectator', team: null, queue: 0, phase: 'play' } as unknown as ServerEvent;

  it('no renderer yet: the spectator\'s pad, the hostage offer and the slide\'s loop each frame all the same', async () => {
    const pad = vi.spyOn(NetPage.prototype, 'spectatorPad');
    const offer = vi.spyOn(HostagePage.prototype, 'frame');
    const slide = vi.spyOn(TraversalPage.prototype, 'soundFrame');
    const x = handOff('seal', undefined, watcher);
    const t = options(x, { events: [watcher], renderer: () => new Promise<MatchRenderer>(() => {}) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(3);
    expect([pad.mock.calls.length, offer.mock.calls.length, slide.mock.calls.length]).toEqual([3, 3, 3]);
    expect(t.r.drawn).toHaveLength(0);                                               // nothing drawn: no renderer
    m.close();
  });

  it('with a renderer: the order is ./main\'s -- the render, the pad, the hostages, the sound, the HUD\'s render', async () => {
    const order: string[] = [];
    vi.spyOn(NetPage.prototype, 'spectatorPad').mockImplementation(() => { order.push('pad'); });
    vi.spyOn(HostagePage.prototype, 'frame').mockImplementation(() => { order.push('hostages'); });
    vi.spyOn(TraversalPage.prototype, 'soundFrame').mockImplementation(() => { order.push('sound'); });
    vi.spyOn(Hud.prototype, 'render').mockImplementation(() => { order.push('hud'); });
    const x = handOff('seal', undefined, watcher);
    const t = options(x, { events: [watcher] });
    const draw = t.r.r.render;
    t.r.r.render = (s, c) => { order.push('render'); draw(s, c); };
    const m = mountMatch(document.body, t.o);
    await flush();
    order.length = 0;
    t.w.step(1);
    expect(order).toEqual(['render', 'pad', 'hostages', 'sound', 'hud']);
    m.close();
  });
});

// OT.R79 (LATER 378; `../src/picture`): VIDEO MODE's picture in the front end's match -- MODERN (the default: native, what
// the match drew before), PS2 (`./main`'s: the 640 x 448 frame, the HUD's, the canvas's 4:3 box), EXPERIMENTAL (Modern with
// the experimental renderer) -- applied when the renderer comes and at a change; the page's body never touched, so no exit
// (the return, the abandon, the error, a reload) can leave a class on it.
describe('OT.R79: the front end\'s match draws VIDEO MODE\'s picture', () => {
  type Rec = { presentation: string[]; experimental: boolean[]; resized: [number, number][] };
  const recording = (base: MatchRenderer): { r: MatchRenderer; rec: Rec } => {
    const rec: Rec = { presentation: [], experimental: [], resized: [] };
    return {
      rec,
      r: {
        ...base,
        resize: (w, h) => { rec.resized.push([w, h]); },
        setPresentation: (m) => { rec.presentation.push(m); },
        setExperimental: (e) => { rec.experimental.push(e.enabled); },
      },
    };
  };
  const source = (start: 'modern' | 'ps2') => {
    let p = start;
    const heard = new Set<(v: typeof p) => void>();
    return {
      get: () => p,
      observe: (f: (v: typeof p) => void) => { heard.add(f); return () => { heard.delete(f); }; },
      set: (v: typeof p) => { p = v; for (const f of [...heard]) f(v); },
      heard: () => heard.size,
    };
  };
  const mounted = async (start: 'modern' | 'ps2' | null, renderer?: () => Promise<MatchRenderer>) => {
    const x = handOff();
    const fake = fakeRenderer(), r = recording(fake.r), pic = start === null ? null : source(start);
    const t = options(x, { renderer: renderer ?? (() => Promise.resolve(r.r)), ...(pic ? { picture: pic } : {}) });
    const body = document.body.className;
    const hud = vi.spyOn(Hud.prototype, 'setPresentation');
    const m = mountMatch(document.body, t.o);
    await flush();
    return { m, rec: r.rec, pic, body, hud, x };
  };
  afterEach(() => { vi.restoreAllMocks(); });

  // VS-6 (the spec's §4.2 Texture filtering; a browser adaptation): the keeper's `filtering` applied live under the
  // Modern picture (`./experimentalWorldSampling` `setWorldAnisotropy`), never under PS2; the match's close lets it go.
  it("VS-6: Texture filtering follows the keeper live -- Anisotropic on under Modern, never under PS2, off at the close", async () => {
    localStorage.clear();
    const keeper = videoSettingsKeeperV2();
    const { m, pic } = await mounted('modern');
    expect(worldAnisotropyOn()).toBe(false);                               // Original: the default
    keeper.set({ filtering: 'anisotropic' });
    expect(worldAnisotropyOn()).toBe(true);                                // live, no new match
    pic!.set('ps2');
    expect(worldAnisotropyOn()).toBe(false);                               // the PS2 picture: the console's sampling
    pic!.set('modern');
    expect(worldAnisotropyOn()).toBe(true);
    keeper.set({ filtering: 'original' });
    expect(worldAnisotropyOn()).toBe(false);
    keeper.set({ filtering: 'anisotropic' });
    m.close();
    expect(worldAnisotropyOn()).toBe(false);                               // the page's sampling is the match's no more
    keeper.set({ filtering: 'anisotropic' });
    expect(worldAnisotropyOn()).toBe(false);                               // heard no more
    localStorage.clear();
  });

  // B206 ML-6 removed the HD (experimental) picture from `VideoPicture`; a value stored before it is still never Modern here.
  it("VS-6 review F3: Anisotropic only under the Modern picture -- a stored HD (experimental) picture never turns it on", async () => {
    localStorage.clear();
    videoSettingsKeeperV2().set({ filtering: 'anisotropic' });
    const a = await mounted('experimental' as unknown as 'modern');
    expect(worldAnisotropyOn()).toBe(false);
    a.pic!.set('modern');
    expect(worldAnisotropyOn()).toBe(true);
    a.pic!.set('experimental' as unknown as 'modern');
    expect(worldAnisotropyOn()).toBe(false);
    a.m.close();
    localStorage.clear();
  });

  it("VS-6 review F2: a mount's teardown clears the page's anisotropy only when it is the mount holding it", async () => {
    localStorage.clear();
    videoSettingsKeeperV2().set({ filtering: 'anisotropic' });
    const a = await mounted('modern');
    const b = await mounted('modern');                                     // the page's current holder
    expect(worldAnisotropyOn()).toBe(true);
    a.m.close();
    expect(worldAnisotropyOn()).toBe(true);                                // b still holds it
    b.m.close();
    expect(worldAnisotropyOn()).toBe(false);
    localStorage.clear();
  });

  it('VS-6: a saved Anisotropic is applied when the renderer comes; a mount under PS2 never turns it on', async () => {
    localStorage.clear();
    videoSettingsKeeperV2().set({ filtering: 'anisotropic' });
    const a = await mounted('modern');
    expect(worldAnisotropyOn()).toBe(true);
    a.m.close();
    const b = await mounted('ps2');
    expect(worldAnisotropyOn()).toBe(false);
    b.m.close();
    localStorage.clear();
  });

  it('no picture named: MODERN -- native, no experimental, the canvas\'s own size, no PS2 box', async () => {
    const { m, rec, hud } = await mounted(null);
    expect(m.canvas.classList.contains('s2u-match')).toBe(true);
    expect(m.canvas.classList.contains('s2u-picture-ps2')).toBe(false);
    expect(rec.presentation.at(-1)).toBe('native');
    expect(rec.experimental.at(-1)).toBe(false);
    expect(rec.resized.at(-1)).not.toEqual([640, 448]);
    expect(hud.mock.calls.at(-1)?.[0]).toBe('native');
    m.close();
  });

  it('PS2: the 640 x 448 frame, the HUD\'s PS2 presentation, the canvas\'s 4:3 box; a change follows live', async () => {
    const { m, rec, pic, hud } = await mounted('ps2');
    expect(rec.presentation.at(-1)).toBe('ps2');
    expect(rec.resized.at(-1)).toEqual([640, 448]);
    expect(hud.mock.calls.at(-1)?.[0]).toBe('ps2');
    expect(m.canvas.classList.contains('s2u-picture-ps2')).toBe(true);
    expect(rec.experimental.at(-1)).toBe(false);
    pic!.set('modern');                                                                   // B206 ML-6: no HD picture to turn it on
    expect(rec.presentation.at(-1)).toBe('native');
    expect(rec.experimental.at(-1)).toBe(false);
    expect(rec.experimental.every((on) => !on)).toBe(true);
    expect(m.canvas.classList.contains('s2u-picture-ps2')).toBe(false);
    m.close();
  });

  it('the return (release): the body\'s classes as they were, the picture no longer followed, the canvas\'s classes off', async () => {
    const { m, pic, body } = await mounted('ps2');
    expect(document.body.className).toBe(body);                                          // mid-match too: never the body's
    const canvas = m.canvas;
    m.release();
    expect(document.body.className).toBe(body);
    expect(pic!.heard()).toBe(0);
    expect(canvas.classList.contains('s2u-picture-ps2')).toBe(false);
  });

  it('the abandon (close): the body\'s classes as they were, the picture no longer followed', async () => {
    const { m, pic, body } = await mounted('ps2');
    m.close();
    expect(document.body.className).toBe(body);
    expect(pic!.heard()).toBe(0);
  });

  it('the error (no renderer comes): the picture still applies to the canvas, and the close leaves the body as it was', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { m, pic, body } = await mounted('ps2', () => Promise.reject(new Error('no GPU')));
    expect(warn).toHaveBeenCalled();
    expect(m.canvas.classList.contains('s2u-picture-ps2')).toBe(true);
    pic!.set('modern');                                                                   // no renderer: nothing throws
    m.close();
    expect(document.body.className).toBe(body);
    expect(pic!.heard()).toBe(0);
  });

  it('a reload mid-match: nothing of the picture is on the body to leave behind; the next match reads the stored picture', async () => {
    const first = await mounted('ps2');
    expect(document.body.className).toBe(first.body);
    // A reload ends the document without a teardown: what survives is the stored choice (`../src/picture`), read anew.
    const second = await mounted('ps2');
    expect(second.rec.presentation.at(-1)).toBe('ps2');
    first.m.close(); second.m.close();
    expect(document.body.className).toBe(first.body);
  });
});

// B206 ML-3 (ML.R5, R9, R11; product track, ML.R2): the match takes the texture pack chosen in MODS from the page's
// MODS state -- at its mount and at the change notice -- under MODERN and PS2 alike, never from the picture.
describe("B206 ML-3: the front end's match applies the MODS texture pack", () => {
  const keeper = (id: string | null) => {
    let v = id;
    const heard = new Set<(x: string | null) => void>();
    return { get: () => v, ready: Promise.resolve(), observe: (f: (x: string | null) => void) => { heard.add(f); return () => { heard.delete(f); }; },
      refresh: async () => {}, dispose: () => {}, set(x: string | null) { v = x; for (const f of [...heard]) f(x); } };
  };
  for (const picture of ['modern', 'ps2'] as const) it(`the HD pack chosen in MODS turns the match's HD runtime on under ${picture.toUpperCase()}, off at the close`, async () => {
    const x = handOff(), fake = fakeRenderer(), calls: boolean[] = [];
    const choice = keeper(`hd:${'a'.repeat(64)}`);
    const pic = { get: () => picture, observe: () => () => {} };
    const t = options(x, { renderer: () => Promise.resolve(fake.r), picture: pic, texturePacks: { choice, hd: () => ({ setEnabled: async (on: boolean) => { calls.push(on); } }) } });
    const m = mountMatch(document.body, t.o);
    await flush(); await flush();
    expect(calls).toEqual([true]);
    choice.set(null); await flush();                                       // the notice: Original chosen on Home
    expect(calls).toEqual([true, false]);
    choice.set(`hd:${'a'.repeat(64)}`); await flush();
    expect(calls).toEqual([true, false, true]);
    m.close(); await flush();
    expect(calls.at(-1)).toBe(false);
  });
});

/**
 * B138's BTL.R8 (botsLand.spec, 5 of 6 rendered runs): a human who joins a launched respawn bot game is welcomed a
 * spectator in the queue, promoted into a CPU's place in the lobby, handed on, and dead at its load (research 322 §5.3).
 * The front end's mount must draw the respawn line once `RESPAWN_PROMPT_S` has passed, as #474's direct player welcome
 * does (`menuRespawnJoin.spec`); the rendered runs met the death help with that line never drawn.
 */
describe('B138 BTL.R8: the promoted spectator dead at its load turns ready in the front end\'s mount', () => {
  for (const order of ['after the mount', 'before the mount (replayed)'] as const) it(`welcome (spectator, queue 1), promoted, the hand-off, deadAtLoad ${order}: the HUD's respawn line past RESPAWN_PROMPT_S`, async () => {
    let now = 100_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const spectator = { ...welcome, role: 'spectator', team: null, queue: 1, rules: 'respawn', phase: 'play', players: [] } as unknown as ServerEvent;
    const socks: Sock[] = [];
    const hands: GameLobbyHandOff[] = [];
    const host = new GameSocketHost({
      pinned: PINNED, ticket: () => 'tkt', holds: () => {}, matchStart: (h) => { hands.push(h); },
      socket: () => {
        const sent: string[] = [], closed: number[] = [];
        const k = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
        socks.push(k);
        return k;
      },
    });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    socks[0]!.onopen?.({});
    const say = (ev: ServerEvent): void => { socks[0]!.onmessage?.({ data: JSON.stringify(ev) }); };
    say(spectator);
    say({ type: 'promoted', team: 'terrorist', ghost: false, char: 0 } as unknown as ServerEvent);   // a CPU's place, in the lobby
    host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: true });
    const x = { host, h: hands[0]!, socks, say, lobbyHolds: [] as boolean[] };
    const death = { type: 'deadAtLoad', id: 2, at: [0, 0, 0], yaw: 0 } as unknown as ServerEvent;
    const early = order !== 'after the mount';
    if (early) say(death);                                            // heard in the load: LobbyMatch keeps it for the page
    const t = options(x, { events: [x.h.welcome!, ...(early ? [death] : [])], assets: Promise.resolve({ map: grounded(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(5);
    if (!early) say(death);
    const net = m.net()!;
    const walkOf = (n: typeof net) => (n as unknown as { deps: { walk: { mode(): string; isDead(): boolean } } }).deps.walk;
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    for (let i = 0; i < 6 * 60; i++) { now += 1000 / 60; t.w.step(1, 1000 / 60); }
    const why = {
      role: net.client.role, state: net.client.state, mode: walkOf(net).mode(), dead: walkOf(net).isDead(), active: net.respawnInputActive(),
      ghost: net.ghost(), prompt: net.prompt(),
    };
    expect(why).toMatchObject({ role: 'player', state: 'open', mode: 'walk', dead: true, active: true, ghost: true });
    expect(net.prompt()).toMatchObject({ ghost: false, respawnReady: true });
    expect(hook.hud().model.spectator?.respawnReady, JSON.stringify(why)).toBe(true);
    m.close();
  });

  // B138's invite run (a fresh page opened straight into the join): the hand-off before the room's welcome, so the match's
  // replay (`LobbyMatch`'s kept events) holds the spectator's welcome, the promotion and the load death themselves.
  it('the hand-off before the welcome: the replay\'s spectator welcome, promotion and load death leave the walk on its body', async () => {
    let now = 100_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const spectator = { ...welcome, role: 'spectator', team: null, queue: 1, rules: 'respawn', phase: 'play', players: [] } as unknown as ServerEvent;
    const promoted = { type: 'promoted', team: 'terrorist', ghost: false, char: 0 } as unknown as ServerEvent;
    const death = { type: 'deadAtLoad', id: 2, at: [0, 0, 0], yaw: 0 } as unknown as ServerEvent;
    const socks: Sock[] = [];
    const hands: GameLobbyHandOff[] = [];
    const host = new GameSocketHost({
      pinned: PINNED, ticket: () => 'tkt', holds: () => {}, matchStart: (h) => { hands.push(h); },
      socket: () => {
        const sent: string[] = [], closed: number[] = [];
        const k = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
        socks.push(k);
        return k;
      },
    });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    socks[0]!.onopen?.({});
    host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: true });
    const say = (ev: ServerEvent): void => { socks[0]!.onmessage?.({ data: JSON.stringify(ev) }); };
    for (const ev of [spectator, promoted, death]) say(ev);           // heard by the client while the match loads
    const x = { host, h: hands[0]!, socks, say, lobbyHolds: [] as boolean[] };
    expect(x.h.welcome).toBeNull();
    const t = options(x, { events: [spectator, promoted, death], assets: Promise.resolve({ map: grounded(), clips: null }) });
    const m = mountMatch(document.body, t.o);
    await flush();
    t.w.step(5);
    const net = m.net()!;
    for (let i = 0; i < 6 * 60; i++) { now += 1000 / 60; t.w.step(1, 1000 / 60); }
    const terms = net.respawnTerms();
    expect(terms, JSON.stringify(terms)).toMatchObject({ role: 'player', state: 'open', walkMode: 'walk', walkDead: true, inputActive: true, ready: true });
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook | undefined>)[MATCH_WINDOW_HOOK]!;
    expect(hook.hud().model.spectator?.respawnReady).toBe(true);
    expect(hook.respawnTerms()).toMatchObject({ ready: true });
    m.close();
  });
});

describe('CPS H9: the match hook\'s renderStats (a development build\'s, under ?devmode; PRF-4\'s renderStats on the match\'s renderer)', () => {
  // CPS H9, 2026-11-03: the match's draw count unread (only the test room's `__viewer.renderStats()` had it: 532 calls a
  // frame on MP2, 834 on MP6, the room empty); the live scene reads this one (`tools/perf/cpf/liveRun.ts`).
  const counted = { frame: 77, render: { calls: 9999, drawCalls: 1203, triangles: 450_000, points: 0, lines: 3 }, memory: { geometries: 610, textures: 280, programs: 96 } };
  const mount = (search: string | null) => {
    const x = handOff();
    let rendererIn!: (r: MatchRenderer) => void;
    const t = options(x, { renderer: () => new Promise((res) => { rendererIn = res; }) });
    if (search !== null) (t.o.win as MatchWindow).location = { search };
    Object.assign(t.r.r.renderer, { info: counted });
    const m = mountMatch(document.body, t.o);
    return { t, m, rendererIn: () => rendererIn(t.r.r) };
  };

  it('with ?devmode: null until the renderer comes, then its renderer.info counts as one renderer labelled match; gone at the teardown', async () => {
    const a = mount('?devmode&menuflow=dlgNetLogin.rdr');
    const hook = hookOf(a.t);
    expect(typeof hook.renderStats).toBe('function');
    expect(hook.renderStats!()).toBeNull();                                              // no renderer yet
    a.rendererIn(); await flush();
    expect(hook.renderStats!()).toEqual({
      renderers: [{ label: 'match', render: { drawCalls: 1203, triangles: 450_000, points: 0, lines: 3, frame: 77 }, memory: { geometries: 610, textures: 280 }, programs: 96 }],
      sum: { render: { drawCalls: 1203, triangles: 450_000, points: 0, lines: 3 }, memory: { geometries: 610, textures: 280 }, programs: 96 },
    });
    a.m.close();
    expect((a.t.o.win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK]).toBeUndefined();
  });

  it('reads the last frame\'s draw counts, snapshotted at the frame\'s tail: three\'s reset between frames leaves them (CPS H9, 2026-11-03T01:58Z)', async () => {
    // CPS H9, 2026-11-03T01:58Z (the owner's PC): `__frontEndMatch.renderStats()` gave calls 0, triangles 0 between frames
    // (programs 170, textures 472 right): `info.autoReset` zeroes the frame's counts at the next animation frame's start.
    const a = mount('?devmode');
    const info = { frame: 0, render: { calls: 0, drawCalls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 610, textures: 472, programs: 170 } };
    const reset = (): void => { info.frame++; info.render.drawCalls = 0; info.render.triangles = 0; info.render.points = 0; info.render.lines = 0; };
    Object.assign(a.t.r.r.renderer, { info });
    a.t.r.r.render = () => { info.render.calls++; info.render.drawCalls += 500; info.render.triangles += 200_000; };   // the world's render
    a.rendererIn(); await flush();
    const hook = hookOf(a.t);
    reset(); a.t.w.step(1);
    const drawn = { drawCalls: info.render.drawCalls, triangles: info.render.triangles };
    expect(drawn.drawCalls).toBeGreaterThanOrEqual(500);
    reset();                                                         // three's reset before the read between frames
    expect(hook.renderStats!()!.renderers[0]!.render).toEqual({ ...drawn, points: 0, lines: 0, frame: 1 });
    expect(hook.renderStats!()!.renderers[0]!.memory).toEqual({ geometries: 610, textures: 472 });   // alive now
    reset(); a.t.w.step(1); reset();                                 // a second frame: its own counts
    expect(hook.renderStats!()!.sum.render).toMatchObject(drawn);
    expect(hook.renderStats!()!.renderers[0]!.render.frame).toBe(3);
    a.m.close();
  });

  it('shadowStats: the own shadow\'s drawn and skipped counts beside renderStats, under the same gate (CPS H9)', async () => {
    // CPS H9, 2026-11-03T01:58Z: `charShadow.ts` fell to 0.15% of the main thread while the seat walked and fired --
    // whether the idle skip took moving frames is read from these counts (`./charShadow` `CharacterShadow.stats`).
    const a = mount('?devmode');
    const hook = hookOf(a.t);
    expect(typeof hook.shadowStats).toBe('function');
    a.rendererIn(); await flush();
    a.t.w.step(2);
    expect(hook.shadowStats!()).toEqual({ drawn: 0, skipped: 0 });  // the fake renderer has no render targets: no map drawn
    a.m.close();
    for (const search of ['', null]) {
      const b = mount(search);
      b.rendererIn(); await flush();
      expect('shadowStats' in hookOf(b.t)).toBe(false);
      b.m.close();
    }
  });

  it("seatState: the seat alive, dead, spectating and the walk's mode, from the mount's own walk and client role (CPS cell-alive)", async () => {
    // CPS cell-alive (2026-11-03, window 2, 07:34-08:03Z): the seat dead or spectating most of the live cell's window in
    // several runs; the live scene reads this once a second (`tools/perf/cpf/liveRun.ts`, `frames.ts` `seatStats`).
    const a = mount('?devmode');
    const hook = hookOf(a.t);
    expect(typeof hook.seatState).toBe('function');
    a.rendererIn(); await flush();
    a.t.w.step(5);
    const net = a.m.net()!;
    const walk = (net as unknown as { deps: { walk: { mode(): string; isDead(): boolean } } }).deps.walk;
    expect(net.client.role).toBe('player');
    expect(hook.seatState!()).toEqual({ alive: walk.mode() === 'walk' && !walk.isDead(), dead: walk.isDead(), spectator: false, mode: walk.mode() });
    a.m.close();
    // a spectator's welcome: spectating, never alive
    const x = handOff('seal', undefined, { ...welcome, role: 'spectator', team: null, queue: 1 } as unknown as ServerEvent);
    const t = options(x, {});
    (t.o.win as MatchWindow).location = { search: '?devmode' };
    const m = mountMatch(document.body, t.o);
    await flush(); t.w.step(5);
    expect(hookOf(t).seatState!()).toMatchObject({ alive: false, spectator: true });
    m.close();
    for (const search of ['', null]) {
      const b = mount(search);
      b.rendererIn(); await flush();
      expect('seatState' in hookOf(b.t)).toBe(false);
      b.m.close();
    }
  });

  it('without ?devmode (or no location on the window) the hook has no renderStats; a release build has no hook at all', async () => {
    for (const search of ['', null]) {
      const a = mount(search);
      a.rendererIn(); await flush();
      expect('renderStats' in hookOf(a.t)).toBe(false);
      a.m.close();
    }
    vi.stubEnv('DEV', false);
    try {
      const b = mount('?devmode');
      b.rendererIn(); await flush();
      expect((b.t.o.win as unknown as Record<string, unknown>)[MATCH_WINDOW_HOOK]).toBeUndefined();
      b.m.close();
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('VS-8: the front end\'s match sends the perf report at its teardown, with its seats and its map', () => {
  // the page's one beacon and sampler fresh on both sides: an earlier test's send would hold this one inside the beacon's 30 s
  beforeEach(() => { resetPageClientErrorBeaconForTest(); resetPageFrameSamplerForTest(); });
  afterEach(() => { vi.unstubAllGlobals(); resetPageClientErrorBeaconForTest(); resetPageFrameSamplerForTest(); });

  it('a match of a minute: one perf report at close, the room\'s seats and the map\'s code; a match of 10 s: none', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (_url: unknown, init?: RequestInit) => { calls.push(String(init?.body)); return Promise.resolve(new Response(null, { status: 204 })); });
    let clock = 1000;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => clock);
    const x = handOff();
    const t = options(x, { assets: Promise.resolve({ map: synthetic(), clips: null }) } as Partial<MatchMountOptions>);
    const m = mountMatch(document.body, t.o);
    await flush();
    x.say({ type: 'score', rows: [
      { id: 2, name: 'socomc', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
      { id: 3, name: 'kilo', team: 'terrorist', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
      { id: 4, name: 'lima', team: 'terrorist', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
    ], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } } as unknown as ServerEvent);
    t.w.step(5);
    const seats = m.net()?.rows.length ?? null;
    expect(seats).toBe(3);                                               // the room's rows
    clock += 60_000;
    m.close();
    expect(await beaconPerfPending()).toBe(true);
    const perf = calls.map((b) => JSON.parse(b) as PerfReport).filter((r) => r.kind === 'perf');
    expect(perf).toHaveLength(1);
    expect(perf[0]).toMatchObject({ kind: 'perf', v: 1, seats: 3, map: 'MP2', durationMs: 60_000, scaleAtEnd: null });   // the map's code (its archive stem); the fake renderer has no pixel ratio
    expect(JSON.stringify(perf[0])).not.toMatch(/socomc|kilo|lima/);       // no name of the room's rows

    resetPageClientErrorBeaconForTest();                                // a fresh page's rate
    calls.length = 0;
    const y = handOff();
    const u = options(y, { assets: Promise.resolve({ map: synthetic(), clips: null }) } as Partial<MatchMountOptions>);
    const n = mountMatch(document.body, u.o);
    await flush();
    u.w.step(5);
    clock += 10_000;
    n.close();
    expect(await beaconPerfPending()).toBe(false);
    expect(calls.filter((b) => (JSON.parse(b) as { kind?: string }).kind === 'perf')).toHaveLength(0);
  });
});

/**
 * FP-1a's FP.R13 spec (a test instrument, no original; a development build's hook only, `MATCH_WINDOW_HOOK`): the match
 * hook reads the lever gates as the page draws them -- `gates()`, the same shape the test room's hook gives
 * (`../src/main.ts` `gates: () => gates.stats()`, `GatePage.stats`).
 */
describe('FP.R13: the match hook reads the gates', () => {
  it('gates(): the GatePage\'s stats, none on a map without gates', async () => {
    const x = handOff();
    const t = options(x);
    const m = mountMatch(document.body, t.o);
    await flush();
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    expect(hook.gates()).toEqual([]);
    m.close();
  });
  it('the match\'s gates read is the page\'s GatePage, as the test room\'s hook reads its own', () => {
    const mount = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');
    expect(mount).toMatch(/\n\s+gates: \(\) => gates\.stats\(\),/);
  });
});

/**
 * FP-1a's FP.R13 spec (a test instrument, no original): the match hook's `escortees()` -- each hostage as the room told the
 * page (`NetPage.hostages`: the welcome's `hostages`, each `hostageState`, `../src/netPage.ts` HX-1), where the page draws
 * its body (`RemotePlayers.feet`) else where told, and rescued when the room's AI top state is 0x11
 * (`HostageStateWire.ai`), the rule `NetPage.hostageMarks` reads the room's state by; the AI's top state and its leader as
 * told, so the spec reads the follow order (9) by the room's word, not by time (attempt 9).
 */
describe('FP.R13: the match hook reads the hostages', () => {
  const hostage = { id: 240, name: 'forge_hostage_1', character: 'mp_fem1', at: [10, 0, 20], yaw: 0, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 };
  const welcomed = { ...(welcome as unknown as Record<string, unknown>), hostages: [hostage] } as unknown as ServerEvent;
  it('escortees(): each told hostage, its place, its name, its state and leader; rescued once the room says 0x11', async () => {
    const x = handOff('seal', undefined, welcomed);
    const t = options(x, { events: [welcomed] });
    const m = mountMatch(document.body, t.o);
    await flush();
    const hook = (t.o.win as unknown as Record<string, MatchWindowHook>)[MATCH_WINDOW_HOOK]!;
    expect(hook.escortees()).toEqual([{ id: 240, name: 'forge_hostage_1', at: [10, 0, 20], alive: true, ai: 0x17, leader: null, rescued: false }]);
    x.say({ type: 'hostageState', id: 240, alive: true, ai: 9, leader: 1, rescuer: null, opacity: 1, unit: 0x21 } as unknown as ServerEvent);
    t.w.step(1);
    expect(hook.escortees().map((e) => [e.ai, e.leader, e.rescued])).toEqual([[9, 1, false]]);
    x.say({ type: 'hostageState', id: 240, alive: true, ai: 0x11, leader: null, rescuer: 2, opacity: 1, unit: 17 } as unknown as ServerEvent);
    t.w.step(1);
    expect(hook.escortees().map((e) => e.rescued)).toEqual([true]);
    m.close();
  });
});

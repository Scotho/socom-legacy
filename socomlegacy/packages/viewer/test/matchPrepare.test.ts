// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Object3D, Scene } from 'three';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import { GameAudio, type AudioOut } from '../src/audio';
import type { LoadedBody } from '../src/body';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { FrameTime } from '../src/frameTime';
import { PlayerLoadout } from '../src/loadout';
import { matchLoader, mountMatch, prepareMount, type MatchLoaderOptions, type MatchMountOptions, type MatchRenderer, type MatchWindow, type MatchWorker } from '../src/matchMount';
import { silentOut, type MatchAudio } from '../src/matchSound';
import { hdTextures } from '../src/hdTexturePack';
import { pictureExperimentalSettings, type VideoPicture } from '../src/picture';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent, Team } from '../src/net/protocol';
import type { ViewerRequest, ViewerResponse } from '../src/worker';
import { buildWorld } from '../src/world';
import { createRenderer } from '../src/renderer';

// IP3: `buildWorld` counted (passed through), so the prepare is seen to build the world once and the attach never.
vi.mock('../src/world', async (original) => {
  const m = await original<typeof import('../src/world')>();
  return { ...m, buildWorld: vi.fn(m.buildWorld) };
});

// L3lsGcIs fix 1 (product track): three's renderer under `../src/renderer`, for the one case that runs the page's own
// renderer in the prepare -- each `compileAsync` recorded with the target then set (no GPU); the others use their fakes.
const compiled = vi.hoisted(() => [] as { scene: unknown; target: import('three').RenderTarget | null }[]);
vi.mock('three/webgpu', async (original) => {
  const actual = await original<typeof import('three/webgpu')>();
  class RecordingRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: import('three').RenderTarget | null = null;
    backend = { isWebGLBackend: true, createRenderPipeline() {} };
    async init() {} setPixelRatio() {} setSize() {} setClearColor() {}
    getRenderTarget() { return this.target; } setRenderTarget(t: import('three').RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(640, 448); }
    render() {} async dispose() {}
    compileAsync(scene: unknown) { compiled.push({ scene, target: this.target }); return Promise.resolve(); }
  }
  return { ...actual, WebGPURenderer: RecordingRenderer };
});

/**
 * IP3 (card bbXnSJNH; `LOAD_REPORT_AT_PREPARED_READING`, research 166 §3; 5d's design, 2026-11-02): the prepare IS the
 * mount, stopped before `join()`. `MatchLoader.prepare` runs the mount's own stage 1 (`prepareMount`) on a hidden canvas
 * -- its construction, `place`, the renderer, the picture and the three warms, its frames drawn until its own BLACK-GAP
 * gate -- and the mount of the same mission attaches the hand-off's options to it and runs `join()`: no second `place`,
 * renderer or warm. Before the attach it is inert: no input bound, no client heard, nothing audible, no touch layer. The
 * worker, the renderer, the audio's output and the window's frame clock are fakes; no server is contacted (R293), no
 * browser is run.
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const welcome = {
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false,
} as unknown as ServerEvent;

/** The lobby's game socket, seated and handed on (`GAME_LOBBY_MATCH_START`) -- `test/matchMount.test.ts`'s. */
function handOff(mission = 'mp2'): GameLobbyHandOff {
  const socks: Sock[] = [];
  const hands: GameLobbyHandOff[] = [];
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: () => {}, matchStart: (h) => { hands.push(h); },
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
  socks[0]!.onmessage?.({ data: JSON.stringify(welcome) });
  host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission, lateJoiner: false });
  return hands[0]!;
}

/** The window's frame clock and its listeners by type (added, not yet taken off). */
function fakeWindow() {
  const frames = new Map<number, FrameRequestCallback>();
  const listening = new Map<string, number>();
  let id = 0;
  const win: MatchWindow = {
    requestAnimationFrame: (cb) => { frames.set(++id, cb); return id; },
    cancelAnimationFrame: (i) => { frames.delete(i); },
    addEventListener: (type: string) => { listening.set(type, (listening.get(type) ?? 0) + 1); },
    removeEventListener: (type: string) => { listening.set(type, (listening.get(type) ?? 0) - 1); },
    navigator: { getGamepads: () => [] },
  };
  let now = 0;
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { const due = [...frames.values()]; frames.clear(); now += 16; for (const f of due) f(now); } };
  /** The input listeners live on the window: keys, the mouse, the pad, touch. */
  const input = (): string[] => [...listening].filter(([t, n]) => n > 0 && /^(key|mouse|pointer|gamepad|touch)/.test(t)).map(([t]) => t);
  return { win, step, frames, input };
}

/** A map of two triangles and one prop (`test/matchMount.test.ts`'s `synthetic`): enough for `buildWorld`. */
const part = (texture = 'wall.tif'): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: texture, fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
/** A body of three parts and one skinned triangle (`later568CameraMask.test.ts`'s): the own body `place` puts on. */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const bone = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: 'sealtex',
    parts: [bone('skel_root', -1), bone('hips', 0), bone('rhand', 1)],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 3, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
}
const synthetic = (archive = 'MP2'): LoadedMap => ({
  archive, camera: null, path: `RUN/${archive}.ZDB`, name: 'synthetic', lines: null,
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
  body: body('sealbody', 'seal'), terrorist: body('terbody', 'terrorist'),
} as unknown as LoadedMap);

/** The map's effect data (`test/matchMount.test.ts`'s LATER 253 case): one mark, so the mount's scene warm runs (`warmMapEffects`). */
const effects = (): unknown => ({
  archive: 'SYN', programs: [], absent: [], ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
  textures: [['bullet_mark_stone.tif', { rgba: { data: new Uint8ClampedArray(16).fill(200), width: 2, height: 2 }, gs: null }]],
  materials: ['UNKNOWN', 'STONE'], defaultMaterial: 1,
  marks: [{ set: 'BULLET', material: 'STONE', texture: 'bullet_mark_stone.tif', minSize: 1, maxSize: 2 }], footprints: [],
});

/** A worker that answers every request at once: the mission's map, no clips, the effects above, no sound. */
function answeringWorker() {
  let hear: ((e: MessageEvent<ViewerResponse>) => void) | null = null;
  const asked: ViewerRequest[] = [];
  const say = (m: unknown): void => { hear?.({ data: m } as MessageEvent<ViewerResponse>); };
  const worker: MatchWorker = {
    postMessage: (r) => {
      asked.push(r);
      queueMicrotask(() => {
        if (r.kind === 'load') say({ kind: 'map', id: r.id, map: synthetic(r.path.includes('MP3') ? 'MP3' : 'MP2') });
        else if (r.kind === 'play') say({ kind: 'play', id: r.id, data: null });
        else if (r.kind === 'effects') say({ kind: 'effects', id: r.id, data: effects() });
        else if (r.kind === 'sound') say({ kind: 'error', id: r.id, message: 'none' });
      });
    },
    addEventListener: ((type: string, fn: (e: MessageEvent<ViewerResponse>) => void) => { if (type === 'message') hear = fn; }) as MatchWorker['addEventListener'],
    terminate: () => {},
  };
  return { worker, asked };
}

/** What a renderer's whole-scene warm was handed: the scene's effects warm-up group and own body there at the call. */
interface WarmSeen { effectsWarmUp: boolean; ownBody: string | null }
/** The renderers made, counted: each one's warms (and what they held), prepares (and what each was given), draws and disposal. */
function rendererFactory(o: { fail?: boolean; hangWarm?: () => boolean; onRender?: () => void } = {}) {
  const made: { canvas: HTMLCanvasElement; warms: WarmSeen[]; prepares: { objects: string[]; target: boolean }[]; drawn: Scene[]; disposed: number; r: MatchRenderer; settle: () => void }[] = [];
  const make = (canvas: HTMLCanvasElement): Promise<MatchRenderer> => {
    if (o.fail) return Promise.reject(new Error('no adapter'));
    const rec = { canvas, warms: [] as WarmSeen[], prepares: [] as { objects: string[]; target: boolean }[], drawn: [] as Scene[], disposed: 0, r: null as unknown as MatchRenderer, settle: () => {} };
    rec.r = {
      render: (s) => { rec.drawn.push(s as Scene); o.onRender?.(); }, resize: () => {}, setClearColor: () => {}, backend: 'webgpu',
      warm: (scene) => {
        rec.warms.push({ effectsWarmUp: !!scene.getObjectByName('effects warm-up'), ownBody: scene.children.find((c) => c.name.startsWith('body '))?.name ?? null });
        return o.hangWarm?.() ? new Promise<void>((res) => { rec.settle = res; }) : Promise.resolve();   // review F1: a compile that never ends
      },
      prepare: (objects, _scene, _camera, options) => { rec.prepares.push({ objects: objects.map((x) => x.name), target: !!options?.target }); return Promise.resolve(); },
      renderer: { autoClear: true, getDrawingBufferSize: (v: { x: number; y: number }) => { v.x = 640; v.y = 448; return v; }, render: () => {}, dispose: () => { rec.disposed++; } } as unknown as MatchRenderer['renderer'],
    };
    made.push(rec);
    return Promise.resolve(rec.r);
  };
  return { make, made };
}

/** The match's audio over an output that counts what would sound: a play or a loop reaching the speakers. */
function countingAudio() {
  const reached = { play: 0, loop: 0 };
  const out: AudioOut = { ...silentOut(), unlocked: true, state: 'running', play: () => { reached.play++; }, loop: () => { reached.loop++; return null; } };
  const game = new GameAudio(out, undefined, { inline: false });
  const setData = vi.spyOn(game, 'setData');
  let released = 0;
  const audio: MatchAudio = { game, release: () => { released++; } };
  return { audio, reached, setData, released: () => released };
}

/** VIDEO MODE's keeper as the page's is (`./picture` `pictureKeeper`): its observers told from a copy, in order. */
function fakePicture(start: VideoPicture = 'modern') {
  let picture = start;
  const heard = new Set<(p: VideoPicture) => void>();
  return {
    get: (): VideoPicture => picture,
    set: (p: VideoPicture): void => { if (p === picture) return; picture = p; for (const fn of [...heard]) fn(p); },
    observe: (fn: (p: VideoPicture) => void): (() => void) => { heard.add(fn); return () => { heard.delete(fn); }; },
    count: (): number => heard.size,
  };
}

const worldGroup = (s: Scene | undefined): Object3D | null => s?.children.find((c) => c.name.endsWith('worldmodel')) ?? null;

function mountOptions(h: GameLobbyHandOff, w: ReturnType<typeof fakeWindow>, extra: Partial<MatchMountOptions> = {}): Omit<MatchMountOptions, 'assets'> {
  return { client: h.client, events: [welcome], handOff: h, holds: () => {}, win: w.win, ...extra };
}

/** A loader over the fakes, its stage-1 inputs the window's (as the front end gives the page's). */
function loaderOf(f: ReturnType<typeof rendererFactory>, w: ReturnType<typeof fakeWindow>, extra: MatchLoaderOptions = {}) {
  const { worker, asked } = answeringWorker();
  const loader = matchLoader({ kind: 'http', baseUrl: '/maps' } as never, () => worker, { renderer: f.make, win: w.win, ...extra });
  return { loader, asked };
}

/** `prepare`, its frames run until it settles (the mount's own BLACK-GAP gate: the warm settled, two frames drawn). */
async function prepared(loader: ReturnType<typeof matchLoader>, w: ReturnType<typeof fakeWindow>, mission = 'mp2'): Promise<boolean> {
  let done = false;
  const p = loader.prepare(mission).then(() => { done = true; });
  for (let i = 0; i < 30 && !done; i++) { await flush(); w.step(1); }
  await flush();
  return done && (await p.then(() => true));
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('IP3: the prepare IS the mount, stopped before join() (5d)', () => {
  it('prepare runs the mount\'s stage 1 once: one buildWorld, one renderer, one scene warm holding the effects warm-up and the own body; settles at the BLACK-GAP gate', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    const built = vi.mocked(buildWorld).mock.calls.length;
    let settled = false;
    void loader.prepare('mp2').then(() => { settled = true; });
    await flush(); await flush();
    expect(f.made).toHaveLength(1);
    const p = f.made[0]!;
    expect(p.canvas.isConnected).toBe(true);
    expect(p.canvas.style.visibility).toBe('hidden');                 // not over the menus
    expect(p.canvas.style.position).toBe('fixed');                    // the mount's own canvas's placement (`placeMatchCanvas`)
    expect(vi.mocked(buildWorld).mock.calls.length - built).toBe(1);  // `place`, once
    expect(p.warms).toEqual([{ effectsWarmUp: true, ownBody: 'body sealbody' }]);   // the mount's `warmEffects`: the effects and the body in it
    expect(p.prepares.some((x) => x.target && x.objects.includes('body sealbody'))).toBe(true);   // `warmShadow`: the body's shadow programs
    expect(settled).toBe(false);                                      // no frame drawn yet
    w.step(1);
    await flush();
    expect(settled).toBe(false);                                      // one frame: the gate is two (BLACK-GAP's)
    w.step(1);
    await flush();
    expect(settled).toBe(true);
    expect(worldGroup(p.drawn[0])?.children.length).toBeGreaterThan(0);   // the world revealed into the drawn scene
    const drawn = p.drawn.length;
    w.step(5);
    expect(p.drawn).toHaveLength(drawn);                              // its frames stopped until the attach
    await loader.prepare('mp2');
    expect(f.made).toHaveLength(1);                                   // the same mission: kept, not made again
    loader.dispose();
  });

  it('the attach runs join() and nothing of stage 1 again: no second renderer, buildWorld or warm; the canvas shown; the hand-off\'s client adopted', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    expect(await prepared(loader, w)).toBe(true);
    const p = f.made[0]!;
    const world = worldGroup(p.drawn[0]);
    const built = vi.mocked(buildWorld).mock.calls.length, prepares = p.prepares.length;
    const h = handOff('mp2');
    let firstFrame = 0;
    const m = loader.mount(document.body, mountOptions(h, w, { firstFrame: () => { firstFrame++; } }));
    expect(m.canvas).toBe(p.canvas);
    expect(p.canvas.style.visibility).toBe('');                       // shown, as the mount's own canvas is
    expect(m.net()?.client).toBe(h.client);                           // join(): the NetPage on the hand-off's client, at once
    w.step(1);
    expect(firstFrame).toBe(0);
    w.step(1);
    expect(firstFrame).toBe(1);                                       // BLACK-GAP: two frames drawn on the shown canvas
    w.step(3);
    await flush();
    expect(f.made, 'no second renderer').toHaveLength(1);
    expect(vi.mocked(buildWorld).mock.calls.length, 'no second buildWorld').toBe(built);
    expect(p.warms, 'no second warm').toHaveLength(1);
    expect(p.prepares).toHaveLength(prepares);
    expect(worldGroup(p.drawn.at(-1))).toBe(world);                   // the prepared world, drawn by the match
    m.close();
    expect(p.disposed).toBe(1);
    expect(p.canvas.isConnected).toBe(false);
    loader.dispose();
  });

  it('before the attach it is inert -- no input listener, no touch layer, no client heard, nothing audible; the attach binds and hears', async () => {
    const f = rendererFactory(), w = fakeWindow(), a = countingAudio();
    let team: Team | null = null;
    const { loader } = loaderOf(f, w, { audio: () => a.audio, side: () => team });
    const h = handOff('mp2');
    const heard = vi.spyOn(h.client, 'on');
    expect(await prepared(loader, w)).toBe(true);
    expect(w.input()).toEqual([]);                                    // keys, mouse, pad: none bound
    expect(document.querySelectorAll('canvas')).toHaveLength(1);      // the hidden canvas alone: no touch layer built
    expect(document.body.children).toHaveLength(1);
    expect(heard).not.toHaveBeenCalled();                             // the prepare is handed no client: it reads a side
    expect(a.setData).not.toHaveBeenCalled();                         // no map sound in, so nothing can sound
    expect(a.reached).toEqual({ play: 0, loop: 0 });
    const m = loader.mount(document.body, mountOptions(h, w));
    expect(w.input().length).toBeGreaterThan(0);                      // bound at the attach
    expect(heard).toHaveBeenCalled();                                 // the events kept for the replay, the hook's count
    expect(a.setData).toHaveBeenCalledTimes(1);                       // the map's sound, now
    m.close();
    expect(a.released()).toBe(1);                                     // the prepare's audio, let go by the match's teardown
    expect(team).toBeNull();
    loader.dispose();
  });

  it("the hand-off's own audio is let go unused when the prepare has the match's (no second output); the close lets the prepare's go, once each", async () => {
    const f = rendererFactory(), w = fakeWindow(), mine = countingAudio(), theirs = countingAudio();
    const { loader } = loaderOf(f, w, { audio: () => mine.audio });
    await prepared(loader, w);
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w, { audio: theirs.audio }));
    expect(theirs.released()).toBe(1);
    expect(theirs.setData).not.toHaveBeenCalled();
    expect(mine.setData).toHaveBeenCalledTimes(1);
    expect(f.made).toHaveLength(1);
    m.close();
    // The review's finding 1: the attach's options never replace a stage-1 one, so the teardown lets go the audio the
    // match played on -- the prepare's -- and the hand-off's is not let go twice.
    expect({ mine: mine.released(), theirs: theirs.released() }).toEqual({ mine: 1, theirs: 1 });
    loader.dispose();
  });

  it("the review's finding 1, the release path: the prepare's audio let go once, the hand-off's once (at the mount)", async () => {
    const f = rendererFactory(), w = fakeWindow(), mine = countingAudio(), theirs = countingAudio();
    const { loader } = loaderOf(f, w, { audio: () => mine.audio });
    await prepared(loader, w);
    const h = handOff('mp2');
    const m = loader.mount(document.body, mountOptions(h, w, { audio: theirs.audio }));
    expect(m.release()).toBe(h.client);
    expect({ mine: mine.released(), theirs: theirs.released() }).toEqual({ mine: 1, theirs: 1 });
    loader.dispose();
  });

  it("the review's finding 1: no option the attach is handed replaces a stage-1 one (`PreparedMount.attach` keeps the stage's audio and picture)", async () => {
    const f = rendererFactory(), w = fakeWindow(), mine = countingAudio(), theirs = countingAudio();
    const stagePicture = fakePicture(), otherPicture = fakePicture();
    const h = handOff('mp2');
    const p = prepareMount(document.body, {
      assets: Promise.resolve({ map: synthetic(), clips: null, effects: effects() as never }), renderer: f.make, win: w.win,
      audio: mine.audio, picture: stagePicture,
    });
    // A caller handing the attach the whole of its options, stage-1 keys among them (as `MatchLoader.mount` does).
    const m = p.attach(document.body, { ...mountOptions(h, w), audio: theirs.audio, picture: otherPicture } as never);
    await flush(); await flush();
    expect(otherPicture.count()).toBe(0);                             // the stage's picture followed, not the attach's
    expect(stagePicture.count()).toBe(1);
    m.close();
    expect({ mine: mine.released(), theirs: theirs.released() }).toEqual({ mine: 1, theirs: 0 });
    expect(stagePicture.count()).toBe(0);
  });

  it('a side change before the launch re-runs the seat\'s own lines once and warms only the new body and its kit (5d (a))', async () => {
    const f = rendererFactory(), w = fakeWindow();
    let team: Team | null = 'seal';
    const { loader } = loaderOf(f, w, { side: () => team });
    await prepared(loader, w);
    const p = f.made[0]!;
    const spawn = vi.spyOn(PlayerLoadout.prototype, 'spawn');
    const prepares = p.prepares.length;
    loader.reseat();                                                  // no change: nothing
    expect(spawn).not.toHaveBeenCalled();
    team = 'terrorist';                                               // SWITCH TEAMS in the game lobby
    loader.reseat();
    expect(spawn.mock.calls.map((c) => c[0])).toEqual(['terrorist', 'terrorist']);   // `seatLines`: its spawn, and `spawnKit`'s
    const added = p.prepares.slice(prepares);
    expect(added).toEqual([
      { objects: ['body terbody'], target: true },                    // `warmShadow`: the new body's shadow programs
      { objects: ['body terbody'], target: false },                   // the new body and the kit under it, on the scene
    ]);
    expect(p.warms).toHaveLength(1);                                  // never the whole scene again
    loader.reseat();
    expect(spawn).toHaveBeenCalledTimes(2);                           // once a change
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w));
    expect(f.made).toHaveLength(1);
    m.close();
    loader.dispose();
  });

  it('drop = the mount\'s own teardown: what a close lets go, a prepared match let go before its attach lets go', async () => {
    const outcome = async (end: 'drop' | 'close') => {
      const f = rendererFactory(), w = fakeWindow(), a = countingAudio();
      const { loader } = loaderOf(f, w, { audio: () => a.audio });
      await prepared(loader, w);
      const p = f.made[0]!;
      const scene = p.drawn.at(-1)!;
      if (end === 'drop') loader.dropPrepared();
      else loader.mount(document.body, mountOptions(handOff('mp2'), w)).close();
      const left = { disposed: p.disposed, canvas: p.canvas.isConnected, world: worldGroup(scene) !== null, released: a.released(), frames: w.frames.size, holds: loader.holds('mp2') };
      loader.dispose();
      return left;
    };
    const dropped = await outcome('drop'), closed = await outcome('close');
    expect(dropped).toEqual({ disposed: 1, canvas: false, world: false, released: 1, frames: 0, holds: null });
    expect(dropped).toEqual(closed);
  });

  it('prepareMount then attach is mountMatch: the same match on the same options (`mountMatch` runs both stages at once)', async () => {
    const run = async (two: boolean) => {
      const f = rendererFactory(), w = fakeWindow(), h = handOff('mp2');
      const o: MatchMountOptions = { ...mountOptions(h, w), renderer: f.make, assets: Promise.resolve({ map: synthetic(), clips: null, effects: effects() as never }) };
      const m = two ? prepareMount(document.body, o).attach(document.body, o) : mountMatch(document.body, o);
      await flush(); await flush();
      w.step(3);
      const seen = { net: m.net()?.client === h.client, warms: f.made[0]!.warms, drawn: f.made[0]!.drawn.length };
      m.close();
      return seen;
    };
    expect(await run(true)).toEqual(await run(false));
  });

  it('FrameTime.restart: the frame after it counts as a first (the prepared match\'s pause no frame\'s real time)', () => {
    const t = new FrameTime();
    t.frame(1000); t.frame(1016);
    expect(t.real()).toBeCloseTo(0.016, 6);
    t.restart();
    expect(t.real()).toBe(0);
    expect(t.frame(90000)).toBe(0);
    expect(t.frame(90016)).toBeCloseTo(0.016, 6);
  });
});

describe('IP3: MatchLoader.prepare -- kept, let go', () => {
  it('a prepare of another mission, and dispose, release the prepared one: the renderer disposed, the canvas removed', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    await prepared(loader, w, 'mp2');
    const first = f.made[0]!;
    await prepared(loader, w, 'mp3');
    expect(first.disposed).toBe(1);
    expect(first.canvas.isConnected).toBe(false);
    expect(f.made).toHaveLength(2);
    const second = f.made[1]!;
    loader.dispose();
    expect(second.disposed).toBe(1);
    expect(second.canvas.isConnected).toBe(false);
  });

  it('a load of another mission drops the prepared one', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    await prepared(loader, w);
    void loader.load('mp3');
    expect(f.made[0]!.disposed).toBe(1);
    expect(f.made[0]!.canvas.isConnected).toBe(false);
    loader.dispose();
  });

  it('a prepare that fails resolves, logs once and leaves nothing prepared: the mount makes its own renderer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = rendererFactory({ fail: true }), w = fakeWindow();
    const later = rendererFactory();
    let calls = 0;
    const make = (c: HTMLCanvasElement): Promise<MatchRenderer> => (++calls === 1 ? failing.make(c) : later.make(c));
    const { worker } = answeringWorker();
    const loader = matchLoader({ kind: 'http', baseUrl: '/maps' } as never, () => worker, { renderer: make, win: w.win });
    await expect(loader.prepare('mp2')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);      // its canvas removed (its teardown)
    expect(loader.holds('mp2')).toBeNull();
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w));
    await flush();
    expect(calls).toBe(2);                                            // nothing prepared: the mount made its own
    expect(later.made[0]!.canvas).toBe(m.canvas);
    m.close();
    loader.dispose();
  });
});

describe('IP3 lobby prepare (`LOBBY_PREPARE_ADAPTATION`): the hand-off reuses the match the game lobby prepared', () => {
  it('prepare twice, in flight then settled, makes one renderer: the same work, settled when it settles', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    const lobby = loader.prepare('mp2');
    expect(loader.holds('mp2')).toBe('preparing');
    const hand = loader.prepare('mp2');
    expect(hand).toBe(lobby);                                         // the in-flight one, not a second
    await prepared(loader, w);
    expect(loader.holds('mp2')).toBe('prepared');
    expect(loader.holds('mp3')).toBeNull();
    await loader.prepare('mp2');
    expect(f.made).toHaveLength(1);
    expect(f.made[0]!.warms).toHaveLength(1);
    loader.dispose();
  });

  it('a load of the prepared mission keeps it -- settled or still in flight -- and the decode is not asked again', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader, asked } = loaderOf(f, w);
    const lobby = loader.prepare('mp2');
    void loader.load('mp2');                                          // the hand-off's load while the lobby's prepare runs
    await prepared(loader, w);
    await lobby;
    void loader.load('mp2');                                          // and once it is prepared
    expect(f.made).toHaveLength(1);
    expect(f.made[0]!.disposed).toBe(0);
    expect(f.made[0]!.canvas.isConnected).toBe(true);
    expect(loader.holds('mp2')).toBe('prepared');
    expect(asked.filter((r) => r.kind === 'load')).toHaveLength(1);
    loader.dispose();
  });

  it('a mount after the lobby prepare makes no renderer and no buildWorld', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    await prepared(loader, w);                                        // the lobby's
    const built = vi.mocked(buildWorld).mock.calls.length;
    void loader.load('mp2');                                          // the hand-off's load, then its prepare
    await loader.prepare('mp2');
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w));
    await flush();
    w.step(3);
    expect(f.made, 'no second renderer').toHaveLength(1);
    expect(vi.mocked(buildWorld).mock.calls.length, 'no second buildWorld').toBe(built);
    expect(m.canvas).toBe(f.made[0]!.canvas);
    m.close();
    loader.dispose();
  });

  it('dropPrepared lets the prepared match go (the renderer, the canvas, the world) and keeps the loader and its assets', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader, asked } = loaderOf(f, w);
    await prepared(loader, w);
    loader.dropPrepared();
    expect(f.made[0]!.disposed).toBe(1);
    expect(f.made[0]!.canvas.isConnected).toBe(false);
    expect(loader.holds('mp2')).toBeNull();
    const loads = asked.filter((r) => r.kind === 'load').length;
    await expect(loader.load('mp2')).resolves.not.toBeNull();        // the decoded assets kept
    expect(asked.filter((r) => r.kind === 'load')).toHaveLength(loads);
    loader.dispose();
  });

  it('dropPrepared during the prepare: the job settles with nothing kept, its canvas removed', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    const job = loader.prepare('mp2');
    await flush(); await flush();
    loader.dropPrepared();
    await job;
    expect(loader.holds('mp2')).toBeNull();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    for (const r of f.made) expect(r.disposed).toBe(1);
    loader.dispose();
  });
});

describe('IP3 review folds on the prepare (F1-F3) and 5d\'s N1', () => {
  it('F1: a prepare whose compile never ends is dropped whole at once -- its canvas and renderer -- and the mount makes its own renderer', async () => {
    let hang = true;
    const f = rendererFactory({ hangWarm: () => hang }), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    void loader.prepare('mp2');
    await flush(); await flush();
    expect(f.made).toHaveLength(1);
    const hung = f.made[0]!;
    expect(hung.warms).toHaveLength(1);                               // in its warm, which never settles
    expect(loader.holds('mp2')).toBe('preparing');
    loader.dropPrepared();                                            // the game left (`lobbyRelease`) or the load ended unmounted
    expect(hung.disposed).toBe(1);
    expect(hung.canvas.isConnected).toBe(false);
    expect(loader.holds('mp2')).toBeNull();
    hang = false;
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w));
    await flush();
    expect(f.made).toHaveLength(2);                                   // the mount's own
    expect(m.canvas).toBe(f.made[1]!.canvas);
    expect(m.canvas).not.toBe(hung.canvas);
    m.close();
    loader.dispose();
  });

  it("F2: a drop inside the prepare's own last frame still lets the prepared match go, once", async () => {
    let loaderRef: ReturnType<typeof matchLoader> | null = null;
    let renders = 0;
    const f = rendererFactory({ onRender: () => { if (++renders === 2) loaderRef?.dropPrepared(); } }), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    loaderRef = loader;
    await prepared(loader, w);                                        // the drop runs inside its gate's frame's draw
    await flush();
    expect(loader.holds('mp2')).toBeNull();
    expect(f.made[0]!.disposed).toBe(1);
    expect(f.made[0]!.canvas.isConnected).toBe(false);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    expect(w.frames.size).toBe(0);                                    // no frame asked after the teardown
    loader.dispose();
    expect(f.made[0]!.disposed).toBe(1);                              // let go once
  });

  it('F3: under the HD picture (the pack collected before the world is built) the prepare does nothing; a prepared match is not taken once HD is on', async () => {
    let hd = true;
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w, { hdPack: () => hd });
    await loader.prepare('mp2');
    expect(f.made).toHaveLength(0);
    expect(loader.holds('mp2')).toBeNull();
    hd = false;
    await prepared(loader, w);                                        // prepared under MODERN
    expect(f.made).toHaveLength(1);
    hd = true;                                                        // HD chosen before the hand-off
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w));
    await flush();
    expect(f.made[0]!.disposed).toBe(1);                              // the prepared one let go
    expect(f.made).toHaveLength(2);                                   // the mount's own, its world built after the collect
    expect(m.canvas).toBe(f.made[1]!.canvas);
    m.close();
    loader.dispose();
  });

  it("the review's finding 3: HD turned on in the lobby drops the held prepare before the prepare's own picture observer can start the pack", async () => {
    const f = rendererFactory(), w = fakeWindow(), keeper = fakePicture('modern');
    const collect = vi.spyOn(hdTextures, 'collect');
    const { loader } = loaderOf(f, w, { picture: keeper, hdPack: () => pictureExperimentalSettings(keeper.get()).hdPack });
    await prepared(loader, w);
    expect(loader.holds('mp2')).toBe('prepared');
    expect(collect).not.toHaveBeenCalled();
    keeper.set('experimental');                                       // VIDEO MODE: HD (GoE Soul), the match still held
    expect(loader.holds('mp2')).toBeNull();                           // let go at once
    expect(f.made[0]!.disposed).toBe(1);
    expect(f.made[0]!.canvas.isConnected).toBe(false);
    expect(collect).not.toHaveBeenCalled();                           // no HD collect, no pack, for a match the mount would refuse
    expect(keeper.count()).toBe(1);                                   // the loader's own watch alone
    loader.dispose();
    expect(keeper.count()).toBe(0);
  });

  it("the review's finding 3: HD turned on while the prepare is still being made lets it go too", async () => {
    let hang = true;
    const f = rendererFactory({ hangWarm: () => hang }), w = fakeWindow(), keeper = fakePicture('modern');
    const collect = vi.spyOn(hdTextures, 'collect');
    const { loader } = loaderOf(f, w, { picture: keeper, hdPack: () => pictureExperimentalSettings(keeper.get()).hdPack });
    const job = loader.prepare('mp2');
    await flush(); await flush();
    expect(loader.holds('mp2')).toBe('preparing');
    keeper.set('experimental');
    await job;
    hang = false;
    expect(loader.holds('mp2')).toBeNull();
    expect(f.made[0]!.disposed).toBe(1);
    expect(collect).not.toHaveBeenCalled();
    loader.dispose();
  });

  it('N1: past the load\'s bound the prepare is kept -- the mount takes the one still warming (no second renderer), and its first frame follows the warm', async () => {
    let hang = true;
    const f = rendererFactory({ hangWarm: () => hang }), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    void loader.prepare('mp2');                                       // its warm never ends: `loaded` went at the bound
    await flush(); await flush();
    w.step(4);
    expect(loader.holds('mp2')).toBe('preparing');
    hang = false;
    let firstFrame = 0;
    const h = handOff('mp2');
    const m = loader.mount(document.body, mountOptions(h, w, { firstFrame: () => { firstFrame++; } }));
    expect(f.made).toHaveLength(1);                                   // the prepared mount taken, still warming
    expect(m.canvas).toBe(f.made[0]!.canvas);
    expect(m.net()?.client).toBe(h.client);
    expect(loader.holds('mp2')).toBeNull();
    w.step(3);
    expect(firstFrame).toBe(0);                                       // the compile still running
    f.made[0]!.settle();
    await flush();
    w.step(2);
    expect(firstFrame).toBe(1);
    expect(f.made[0]!.warms).toHaveLength(1);
    m.close();
    loader.dispose();
  });

  it("L3lsGcIs fix 1: the prepare's scene warm (the page's own renderer) compiles the world under the glow target's context too, before it settles", async () => {
    compiled.length = 0;
    const made: Awaited<ReturnType<typeof createRenderer>>[] = [];
    const f = { made: [], make: async (c: HTMLCanvasElement) => { const v = await createRenderer(c); made.push(v); return v; } };
    const w = fakeWindow();
    const { loader } = loaderOf(f as unknown as ReturnType<typeof rendererFactory>, w);
    expect(await prepared(loader, w)).toBe(true);
    expect(made).toHaveLength(1);
    // The scene the mount warmed whole: the one holding the world group.
    const scene = compiled.map((c) => c.scene as Scene).find((s) => worldGroup(s) !== null)!;
    expect(scene).toBeDefined();
    // three r186's render-context key (`RenderContexts.get`): the target's attachments, not its size, then the MRT's id
    // ('default': the page sets no MRT) and the call depth (0: compileAsync's default, and a top-level render's -- its
    // `_callDepth` starts at -1 and `render` steps it once).
    const key = (t: import('three').RenderTarget, mrt: { id: number } | null = null, depth = 0) => `${t.textures.length}:${t.texture.format}:${t.texture.type}:${t.samples}:${t.depthBuffer}:${t.stencilBuffer}-${mrt?.id ?? 'default'}-${depth}`;
    const underTargets = compiled.filter((c) => c.scene === scene && c.target !== null).map((c) => c.target!);
    // The world's glow target, as the first glowing frame draws into it.
    const v = made[0]!;
    const drawn: (import('three').RenderTarget | null)[] = [];
    const render = vi.spyOn(v.renderer, 'render').mockImplementation(((s: unknown) => { if (s === scene) drawn.push(v.renderer.getRenderTarget()); }) as never);
    v.setGlow({ passes: 1, fix: 64 });
    v.render(scene, new (await import('three')).PerspectiveCamera());
    render.mockRestore();
    expect(drawn[0]).toBeTruthy();
    expect(underTargets.map((t) => key(t))).toContain(key(drawn[0]!));
    loader.dispose();
  });

  it('N1: a context lost on the prepared canvas drops it; the mount builds its own', async () => {
    const f = rendererFactory(), w = fakeWindow();
    const { loader } = loaderOf(f, w);
    await prepared(loader, w);
    f.made[0]!.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(f.made[0]!.disposed).toBe(1);
    expect(f.made[0]!.canvas.isConnected).toBe(false);
    expect(loader.holds('mp2')).toBeNull();
    const m = loader.mount(document.body, mountOptions(handOff('mp2'), w));
    await flush();
    expect(f.made).toHaveLength(2);
    expect(m.canvas).toBe(f.made[1]!.canvas);
    m.close();
    loader.dispose();
  });
});

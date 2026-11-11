// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CLAYMORE_RULES, type CollisionOwner, type EffectProgram, type GridParams, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../src/mover';
import type { LoadedMap } from '../src/loadMap';
import type { MapMeta } from '../src/mapMeta';
import type { SceneDestructible } from '../src/sceneHealth';
import { GLASS_FRAGMENTS_PLACEHOLDER, WorldState } from '../src/worldState';
import { Hud, MESSAGE_SCALE } from '../src/hud';
import { buildPageWorld } from '../src/matchWorld';
import { CLAYMORE_REFUSAL_COLOUR, CLAYMORE_REFUSAL_SCALE_READING, MESSAGE_COLOURS, messageLine, refusalLine } from '../src/matchMessages';

/**
 * MATCH-GAPS (web research 222 §4 rows 14-15, §9): the two pieces the front end's match lacked, as shared modules.
 * `./matchWorld` builds the page's world (`./worldState`: SUP-02, SUP-03, MAP-02) from a map as `/testroom`'s `show`
 * builds `pageWorld` -- the walk's hull grid, the opening state, a scene program's sound, call and destruction through
 * the page's hooks -- so the front end's C4 has the destructibles to aim at. `./matchMessages` posts the claymore's
 * refusal on the HUD's message window as the original posts it (`FUN_005be9a0` D:L475331: `FUN_002b6530` on the main
 * window 0x4366a0, the text 0x65f880, colour 2; research 87 §14). No game data, no game run.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, rel), 'utf8');

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const DI = 'worldmodel/access1=access1/good_parts/di_good';
const HIDDEN = 'worldmodel/later';
const quad = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 7, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points),
});
const POLYS = [
  quad('worldmodel/floor', 3, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  quad(DI, 2, [130, 0, 150, 130, 0, 250, 130, 60, 250, 130, 60, 150]),
  quad(HIDDEN, 2, [0, 0, 400, 20, 0, 400, 20, 40, 400, 0, 40, 400]),
];
/** The barrier node's world matrix (row-major): its origin (130, 0, 150), a corner of its polygon, not the box's centre. */
const DI_WORLD = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 130, 0, 150, 1];
const owners = (): CollisionOwner[] => POLYS.map((q, i) => ({ modelName: 'worldmodel', path: q.path, first: i, count: 1, flags: 0x1001 }));
/** A death that plays a sound, throws its debris and turns the barrier off (`breakapane`'s shape, research 209 s13). */
const breaks: EffectProgram = {
  name: 'access1', root: 1, flags: 0x20, nodes: ['NA', DI],
  sequences: [{ name: 'NA', activation: 1, ops: [
    { op: 'sound', sound: '.GLS_BRK_VSMALL', node: -7, volume: 0.5, newPlay: true },
    { op: 'destruction', node: -7 },
    { op: 'active', node: -7, on: false },
  ] }],
};
const barrier: SceneDestructible = {
  id: 0, key: `access1#0@${DI}`, anim: 'access1', instance: 1, targetPath: DI, root: DI,
  health: 1, armor: 0, shield: 17, program: breaks, nodes: [null, DI],
};
/** The barrier's map metadata: its placements, one node zAnim turns off at the opening, the barrier a destructible. */
function barrierMeta(): MapMeta {
  const instances = POLYS.map((q, id) => ({ id, path: q.path, node: q.path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: q.path }));
  return {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    initial: [{ path: HIDDEN, deactivate: true, saveActive: false, saveTransform: false, saveParent: false }],
    scene: { destructibles: [barrier], programs: [] },
    worlds: new Map([[DI, DI_WORLD]]),
  } as unknown as MapMeta;
}
const map = (o: { ground?: boolean; meta?: boolean } = {}): LoadedMap => ({
  ground: o.ground === false ? undefined : packGround(params, POLYS, owners()),
  meta: o.meta === false ? undefined : barrierMeta(),
} as unknown as LoadedMap);
const hooks = () => ({ setNodeActive: vi.fn(), sound: vi.fn(), effect: vi.fn(), log: vi.fn() });

describe('buildPageWorld: the page\'s world from the map, as /testroom\'s show builds pageWorld (SUP-02, SUP-03, MAP-02)', () => {
  it('none without the map\'s ground (main.ts: `map.ground && hullGrid`)', () => {
    expect(buildPageWorld(map({ ground: false }), hooks())).toBeNull();
  });

  it('a WorldState on the map\'s ground and its own hull grid, the opening state applied (zAnim\'s bit-31 nodes off)', () => {
    const m = map(), h = hooks();
    const built = buildPageWorld(m, h)!;
    expect(built.world).toBeInstanceOf(WorldState);
    expect(built.world.ground).toBe(m.ground);
    expect(built.world.grid).toBe(built.grid);                       // the grid the walk is to stand on (walk.setGround's third)
    expect(built.world.isActive(HIDDEN)).toBe(false);                // applyInitial
    expect(h.setNodeActive).toHaveBeenCalledWith(HIDDEN, false);     // drawn as the world has it
  });

  it('a map with no metadata takes the bare one (main.ts `bareMeta()`): a world, no destructibles', () => {
    const built = buildPageWorld(map({ meta: false }), hooks())!;
    expect(built.world.scene.destructibles).toEqual([]);
  });

  it('its destructibles are C4\'s targets: the barrier takes the charge\'s 18 (shield 17), the floor none', () => {
    const { world } = buildPageWorld(map(), hooks())!;
    expect(world.health.c4TargetAt(DI, 18)).toBe(0);
    expect(world.health.c4TargetAt('worldmodel/floor', 18)).toBeNull();
    expect(world.health.c4TargetAt(DI, 16)).toBeNull();               // FUN_002739b0: the shield above the charge
  });

  it('a death\'s program through the page\'s hooks: the sound at the node\'s world origin, the debris logged once per node, the node hidden', () => {
    const h = hooks();
    const { world } = buildPageWorld(map(), h)!;
    expect(world.health.hitAt(DI, { kind: 'explosion', rating: 18, modifier: 0, point: [130, 30, 200] }).died).toBe(true);
    world.step(0.1);
    // SCENE_SOUND_PLACE_READING: FUN_002659c0 through FUN_00310980 (D:L112446-112462) -- the node's origin, not the
    // centre of its polygons' box (130, 30, 200), which the page took before.
    expect(h.sound).toHaveBeenCalledWith('.GLS_BRK_VSMALL', [130, 0, 150], 0.5);
    expect(h.log).toHaveBeenCalledTimes(1);
    expect(h.log.mock.calls[0]![0]).toContain(`DESTRUCTION_SOURCE at ${DI}`);
    expect(h.log.mock.calls[0]![0]).toContain(GLASS_FRAGMENTS_PLACEHOLDER);
    expect(h.setNodeActive).toHaveBeenCalledWith(DI, false);
    expect(world.isActive(DI)).toBe(false);
  });

  it('reads no page markup and never names ./main (OT.R12: the front end loads it with the match)', () => {
    for (const f of ['../src/matchWorld.ts', '../src/matchMessages.ts']) {
      expect(read(f)).not.toMatch(/from '\.\/main'|document\.|getElementById|querySelector/);
    }
  });
});

/**
 * LATER 409 (AS-1; research 237 §0.2): the page's world runs each autostart program after the opening fold, at load and
 * again at the reset (the set's start, `FUN_0026c600` D:L116360-116372; the gate `flags & 3 == 1` is research 115
 * R115.6's reading, `AUTOSTART_INITIAL_READING`; the reset starts the sets again, `AUTOSTART_RESET_READING`). A world built as the room
 * builds its own (`new WorldState`, `runAutostartPrograms` unset) keeps the opening fold and runs no program. A hand-built
 * blink: its opening turns `FLASH` off, a 1 s wait, then on for the drawing only (PF.R26: the wire's flag stays off).
 */
const FLASH = 'worldmodel/flash';
const blink: EffectProgram = {
  name: 'blink', root: 1, flags: 0x21, nodes: ['NA', 'flash'],
  sequences: [{ name: 'NA', activation: 1, ops: [
    { op: 'active', node: 1, on: false },
    { op: 'wait', seconds: 1, range: 0, frames: null },
    { op: 'active', node: 1, on: true },
    { op: 'wait', seconds: 5, range: 0, frames: null },
  ] }],
};
function blinkMap(): LoadedMap {
  const polys = [POLYS[0]!, quad(FLASH, 3, [0, 0, 600, 20, 0, 600, 20, 40, 600, 0, 40, 600])];
  const instances = polys.map((q, id) => ({ id, path: q.path, node: q.path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: q.path }));
  const meta = {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    initial: [{ path: FLASH, deactivate: true, saveActive: false, saveTransform: false, saveParent: false }],
    autostart: [{ path: FLASH, on: false }],
    scene: { destructibles: [], programs: [{ program: blink, search: [0, 0] }] },
    worlds: new Map([[FLASH, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 600, 1]]]),
  } as unknown as MapMeta;
  const own = polys.map((q, i): CollisionOwner => ({ modelName: 'worldmodel', path: q.path, first: i, count: 1, flags: 0x1001 }));
  return { ground: packGround(params, polys, own), meta } as unknown as LoadedMap;
}
const drawnLast = (h: ReturnType<typeof hooks>, path: string): boolean | undefined =>
  h.setNodeActive.mock.calls.filter((c) => c[0] === path).at(-1)?.[1] as boolean | undefined;

describe('LATER 409 (AS-1): the page runs the autostart programs at load and at the reset; the room\'s world does not', () => {
  it('the page: the program starts at load, its later command draws after the wait, the wire keeps the opening fold', () => {
    const h = hooks();
    const { world } = buildPageWorld(blinkMap(), h)!;
    expect(world.runAutostartPrograms).toBe(true);
    expect(world.running('blink')).toBe(true);
    expect(world.isActive(FLASH)).toBe(false);                        // the opening fold
    world.step(1.1);
    expect(drawnLast(h, FLASH)).toBe(true);                           // the program's OBJECT_ACTIVE_STATE on, drawn
    expect(world.isActive(FLASH)).toBe(false);                        // the wire's flag untouched (display run)
  });

  it('the page: the reset stops the program, re-applies the opening and starts the program again', () => {
    const h = hooks();
    const { world } = buildPageWorld(blinkMap(), h)!;
    const ons = (): number => h.setNodeActive.mock.calls.filter((c) => c[0] === FLASH && c[1] === true).length;
    world.step(1.1);
    const before = ons();
    world.reset();
    expect(world.isActive(FLASH)).toBe(false);
    expect(world.running('blink')).toBe(true);                        // started again (FUN_0026c600 after the restore)
    world.step(0.5);
    expect(ons()).toBe(before);                                       // inside the restarted program's wait
    world.step(0.6);
    expect(ons()).toBe(before + 1);                                   // its later command again
  });

  it('the room\'s world (runAutostartPrograms unset): the opening fold at load and at the reset, no program run', () => {
    const m = blinkMap();
    const shown: [string, boolean][] = [];
    const world = new WorldState(m.meta!, m.ground!, groundGrid(m.ground!), { visible: (path, on) => { shown.push([path, on]); } });
    expect(world.runAutostartPrograms).toBe(false);
    world.applyInitial();
    expect(world.running('blink')).toBe(false);
    world.step(2);
    world.reset();
    world.step(2);
    expect(world.running('blink')).toBe(false);
    expect(world.isActive(FLASH)).toBe(false);
    expect(shown.some(([p, on]) => p === FLASH && on)).toBe(false);
  });
});

/**
 * LATER 409 review F1: an autostart whose drawing comes only through a CALL_ANIMATION into the effect library (the
 * common set, absent from the map's own programs) is the effect runner's (`effectData.ts` `draws` searches the libraries
 * too; `EffectData.ambient` lists it). The world's run of it must not play its sound or its library call a second time:
 * the page hands the world the effect runner's ambient names, at the build (`./matchMount`) or once they land (`./main`).
 */
const torch: EffectProgram = {
  name: 'torch', root: 1, flags: 0x21, nodes: ['NA', 'flash'],
  sequences: [{ name: 'NA', activation: 1, ops: [
    { op: 'sound', sound: '.TORCH', node: 1, volume: 1, newPlay: true },
    { op: 'call', anim: 'torch_fire' },
    { op: 'active', node: 1, on: true },
    { op: 'wait', seconds: 5, range: 0, frames: null },
  ] }],
};
function torchMap(): LoadedMap {
  const m = blinkMap();
  (m.meta as unknown as { scene: unknown }).scene = { destructibles: [], programs: [{ program: torch, search: [0, 0] }] };
  return m;
}

describe('LATER 409 F1: an autostart the effect runner plays (a library call that draws) is not played by the world too', () => {
  it('the effect runner\'s ambient names at the build: no sound, no library call from the world; its node still drawn', () => {
    const h = hooks();
    const { world } = buildPageWorld(torchMap(), h, ['TORCH'])!;
    expect(world.running('torch')).toBe(true);
    world.step(0.1);
    expect(h.sound).not.toHaveBeenCalled();
    expect(h.effect).not.toHaveBeenCalled();
    expect(drawnLast(h, FLASH)).toBe(true);                           // OBJECT_ACTIVE_STATE stays the world's
  });

  it('the names landing after the build (`./main`: the effect data comes once the map is shown) stop the world\'s copy', () => {
    const h = hooks();
    const { world } = buildPageWorld(torchMap(), h)!;
    world.setAmbient(['torch']);
    h.sound.mockClear(); h.effect.mockClear();                        // before the hand-over the world was its only player
    world.reset();                                                    // the effect runner starts its ambient again too
    world.step(0.1);
    expect(h.sound).not.toHaveBeenCalled();
    expect(h.effect).not.toHaveBeenCalled();
  });

  it('a list that does not name it (the effect runner does not play it): the world plays its sound and its call', () => {
    const h = hooks();
    const { world } = buildPageWorld(torchMap(), h, [])!;
    world.step(0.1);
    expect(h.sound).toHaveBeenCalledWith('.TORCH', [0, 0, 600], 1);   // the node's origin (SCENE_SOUND_PLACE_READING)
    expect(h.effect).toHaveBeenCalledWith('torch_fire', world.placeOf(FLASH));
  });
});

describe('the claymore\'s refusal on the message window (FUN_005be9a0 D:L475331; research 87 §14)', () => {
  it('the window\'s colours: index 0..5 as FUN_002b7530 reads them, the GS\'s 128 as 1', () => {
    expect(MESSAGE_COLOURS).toEqual([[128, 128, 128], [128, 128, 64], [64, 64, 96], [64, 128, 64], [128, 64, 32], [128, 64, 64]]);
    expect(messageLine('x', 2, 0.9)).toEqual({ text: 'x', scale: 0.9, rgb: [0.5, 0.5, 0.75] });
  });

  it('posts the original\'s text on the main window in colour 2, at the window\'s own scale (the reading)', () => {
    expect(CLAYMORE_REFUSAL_COLOUR).toBe(2);
    expect(CLAYMORE_REFUSAL_SCALE_READING).toBe(MESSAGE_SCALE);
    const hud = new Hud();
    const post = vi.spyOn(hud, 'postMessage');
    refusalLine(hud)(CLAYMORE_RULES.maxPlacedMessage);
    expect(post).toHaveBeenCalledWith([{ text: 'Unable To Deploy: Max Equipment Items Placed (4)', scale: MESSAGE_SCALE, rgb: [0.5, 0.5, 0.75] }]);
    hud.step(0.5);
    // TAUNT-WRAP (research 87 §14.1): posted at the window's own 0.9 (CLAYMORE_REFUSAL_SCALE_READING) the refusal measures
    // over 297, so FUN_002b6530 (D:L158010-158055) puts it on two lines of the window, broken at a space.
    const refusal = hud.state().model.banner.find((m) => m.lines.map((l) => l.text).join(' ') === CLAYMORE_RULES.maxPlacedMessage);
    expect(refusal?.lines.map((l) => l.text)).toEqual(['Unable To Deploy: Max Equipment Items', 'Placed (4)']);
    hud.dispose();
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, EffectOp, EffectProgram, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, type GroundData } from '../src/mover';
import type { MapMeta } from '../src/mapMeta';
import { SCENE_SOUND_CAMERA_NODE_PLACEHOLDER, SCENE_SOUND_MOVING_NODE_PLACEHOLDER, WorldState } from '../src/worldState';

/**
 * A scene program's `SOUND` on the page's world (`WorldState`'s host), no game data: the autostart runs MP71's
 * `seagull_squak1..4` and `doggy_ruff1..3` in miniature.
 *
 * - The place (`SCENE_SOUND_PLACE_READING`): `FUN_002659c0`'s new play (D:L112411-112462) starts the place at 0, adds the
 *   command's offset with flag 4 (`FUN_00309240`, D:L112423-112426), and with flag 2 carries it through the node's
 *   matrices up to the world (`FUN_0026f4e0` then `FUN_00310980`, D:L112446-112450; D:L212139-212147) -- the node's world
 *   origin for a gull, which has no polygons. Placed, it plays through the bank's +0x14 play with that point
 *   (D:L112458-112462), where `FUN_00342670` applies the sound's RANGE and pan (D:L241907-241950); with neither flag, or
 *   flag 2 and a node that does not resolve and no offset, through the +0x18 play without one. Was: the centre of the
 *   node's polygons' box, null (unplaced, full volume) for a node with none -- MP71's gulls everywhere at full volume.
 * - The emitters' loops: an autostart's `~` sound (MP71's `~DIST_DOGS` at `dog1`) is the audio's emitter's
 *   (`@s2u/sound` `zanimEmitters`, `GameAudio`'s placed loops), never played by the world's run -- as the effect
 *   runner's ambient runs skip them (`./effects`). Was: the world played each once, unplaced, at the match's start.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR = 'worldmodel/floor', GULL = 'worldmodel/seagull2', DOG = 'worldmodel/dog1', GUNS = 'worldmodel/battle/guns';
const SKY = 'worldmodel/skydome', FLASH = 'worldmodel/skydome/flash1';
/** A placement's world matrix, row-major (row vectors: `flattenScene`'s `world`): a translation, and a quarter yaw. */
const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const yawed = (x: number, y: number, z: number): number[] => [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, x, y, z, 1];
const WORLDS = new Map<string, readonly number[]>([
  [FLOOR, at(0, 0, 0)], [GULL, at(2004.334, 50.6, 1733)], [DOG, at(2286.1, 181.232, 180.145)], ['worldmodel/battle', at(40, 0, 0)], [GUNS, yawed(50, 0, 0)],
  [SKY, at(1440, 0, 1440)], [FLASH, at(1440, 300, 1440)],
]);

function hull(): GroundData {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: FLOOR, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: FLOOR, first: 0, count: 1, flags: 0x1001 }];
  return packGround(params, [floor], owners);
}

const sound = (name: string, node: number, flags: number, extra: Partial<Extract<EffectOp, { op: 'sound' }>> = {}): EffectOp =>
  ({ op: 'sound', sound: name, node, volume: 1, flags, newPlay: (flags & 0x80) !== 0, ...extra });
/** An autostart (flags 0x21) whose one activation-1 sequence is `ops`, its root the node `root`. */
const autostart = (name: string, root: string, ops: EffectOp[]): EffectProgram =>
  ({ name, root: 1, flags: 0x21, nodes: ['NA', root], sequences: [{ name: 'NA', activation: 1, ops }] });

function meta(programs: EffectProgram[], extra: Partial<MapMeta> = {}): MapMeta {
  const paths = [FLOOR, GULL, DOG, 'worldmodel/battle', GUNS, SKY, FLASH];
  const instances = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
  return {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), initial: [], diagnostics: [],
    scene: { destructibles: [], programs: programs.map((program) => ({ program, search: program.nodes.map(() => 0) })) },
    ...extra,
  };
}

type Heard = { name: string; path: string | null; volume: number; at: [number, number, number] | null };
function world(m: MapMeta): { world: WorldState; heard: Heard[] } {
  const ground = hull();
  const heard: Heard[] = [];
  const w = new WorldState(m, ground, groundGrid(ground), {
    sound: (name, path, volume, at?: [number, number, number] | null) => { heard.push({ name, path, volume, at: at ?? null }); },
  });
  w.runAutostartPrograms = true;
  w.autostartRandom = () => 0.5;
  w.applyInitial();
  return { world: w, heard };
}

describe("a scene program's SOUND on the page's world", () => {
  it("an autostart's `~` loop is the audio's emitter's: the world's run plays none of it; its `.` one-shots play", () => {
    const { world: w, heard } = world(meta([
      autostart('doggy_ruff1', 'dog1', [sound('~DIST_DOGS', 1, 0x82)]),
      autostart('seagull_squak2', 'seagull2', [sound('.SEABIRD_SQUAK', 1, 0x182)]),
    ]));
    w.step(0.1);
    expect(heard.map((h) => h.name)).toEqual(['.SEABIRD_SQUAK']);
    w.reset();                                                        // the round's restart runs them again: still none
    w.step(0.1);
    expect(heard.map((h) => h.name)).toEqual(['.SEABIRD_SQUAK', '.SEABIRD_SQUAK']);
  });

  it('a `~` sound outside an autostart run (an action, a death) still plays: the emitters hold only the autostarts\'', () => {
    const steam: EffectProgram = { name: 'steam_on', root: 1, flags: 0x20, nodes: ['NA', 'dog1'], sequences: [{ name: 'NA', activation: 1, ops: [sound('~STEAM', 1, 0x82)] }] };
    const m = meta([steam], { actions: [{ path: DOG, valve: 'steam_valve', anims: ['steam_on'] } as unknown as MapMeta['actions'][number]] });
    const { world: w, heard } = world(m);
    expect(w.executeAction('steam_valve', false, true)).toBe(true);
    expect(heard.map((h) => h.name)).toEqual(['~STEAM']);
  });

  it("a `~` sound in a program an autostart calls that is not itself an autostart reaches the sound hook: no emitter holds it", () => {
    // MP81's shape: `swing_hook_N` calls `sound_hook_N` (`~CRANE`). `zanimEmitters` takes only the activation-1 programs'
    // own sounds, so the world no longer suppresses a callee's `~`. Whether the crane's sound is played at all stays
    // `CRANE_SOUND_PLACEHOLDER`'s open question (`./cranes`, research 176 §9.1); this checks the world's skip only.
    const soundHook: EffectProgram = { name: 'sound_hook_1', root: 1, flags: 0x20, nodes: ['NA', 'dog1'], sequences: [{ name: 'NA', activation: 1, ops: [sound('~CRANE', 1, 0x82)] }] };
    const { world: w, heard } = world(meta([autostart('swing_hook_1', 'dog1', [{ op: 'call', anim: 'sound_hook_1' }]), soundHook]));
    w.step(0.1);
    expect(heard.map((h) => h.name)).toEqual(['~CRANE']);
  });

  it("a `~` sound in an autostart that another autostart calls is its emitter's: neither run plays it", () => {
    // `zanimEmitters` holds every activation-1 program's own `~` at a node, however it is reached; played by the caller's run
    // too, it would sound twice (the emitter's loop and the world's once).
    const ruff = autostart('doggy_ruff1', 'dog1', [sound('~DIST_DOGS', 1, 0x82)]);
    const { world: w, heard } = world(meta([autostart('dogs_start', 'dog1', [{ op: 'call', anim: 'doggy_ruff1' }]), ruff]));
    w.step(0.1);
    expect(heard.map((h) => h.name)).toEqual([]);
  });

  it("a placed SOUND (flag 2) at a node with no polygons -- MP71's seagull2 -- plays at the node's world origin", () => {
    const { world: w, heard } = world(meta([autostart('seagull_squak2', 'seagull2', [sound('.SEABIRD_SQUAK', 1, 0x182)])], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard).toEqual([{ name: '.SEABIRD_SQUAK', path: GULL, volume: 1, at: [2004.334, 50.6, 1733] }]);
    expect(w.placeOf(GULL)).toBeNull();                               // its polygons' box: none (was the sound's place)
  });

  it("flag 4's offset is carried through the node's matrix (mp6_battlesounds' 0x86); with no node flag it is the place itself", () => {
    const { world: w, heard } = world(meta([
      autostart('battle', 'guns', [
        sound('.MG_BURST', 1, 0x86, { offset: [0, 0, 10] }),
        sound('.FAR_GUNS', 1, 0x84, { offset: [5, 6, 7] }),
      ]),
    ], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard.map((h) => [h.name, h.at])).toEqual([['.MG_BURST', [60, 0, 0]], ['.FAR_GUNS', [5, 6, 7]]]);
  });

  it('unplaced: flag 2 clear (no node read, though +16 names one), or a node no placement carries and no offset', () => {
    const lost: EffectProgram = { name: 'lost', root: 1, flags: 0x21, nodes: ['NA', 'seagull2', 'pipe'], sequences: [{ name: 'NA', activation: 1, ops: [
      sound('.BELL', 1, 0x80),                                         // flag 2 clear: the place is never set (D:L112446)
      sound('.HISS', 2, 0x82),                                         // `pipe` resolves nowhere (FUN_0026f4e0 returns 0)
      sound('.DRAIN', 2, 0x86, { offset: [0, -60, 30] }),              // Vigilance's water_drain: its bare offset
    ] }] };
    const { world: w, heard } = world(meta([lost], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard.map((h) => [h.name, h.at])).toEqual([['.BELL', null], ['.HISS', null], ['.DRAIN', [0, -60, 30]]]);
  });

  it('a placed SOUND at a `camera` no placement carries plays unplaced, not at its bare offset (SCENE_SOUND_CAMERA_NODE_PLACEHOLDER)', () => {
    expect(SCENE_SOUND_CAMERA_NODE_PLACEHOLDER).toBe('unplaced');
    // mp6_battlesounds' near gunfire: `camera` + (200, 100, 0) -- whether the game's own camera node answers the name is unread.
    const battle: EffectProgram = { name: 'mp6_battlesounds', root: 0, flags: 0x21, nodes: ['NA', 'mp6_skydome', 'camera'], sequences: [{ name: 'NA', activation: 1, ops: [
      sound('.MG_NEAR', 2, 0x86, { offset: [200, 100, 0] }),
    ] }] };
    const { world: w, heard } = world(meta([battle], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard.map((h) => [h.name, h.at])).toEqual([['.MG_NEAR', null]]);
  });

  it('a placed SOUND at a node a program holds at the camera (`translate_sky`) plays unplaced, as at a `camera` (MP73)', () => {
    // Sandstorm's shape: `translate_sky` (0x21) moves `skydome` to `camera` (`OBJECT_TRANSLATE_STATE`, +7 the reference),
    // and `mp73_battlesounds` plays `.EXP_DISTANT` (0x86) at `skydome` + (-600, 0, -120). The original's node stands at the
    // camera, so the sound plays that far from the listener; the port's sky stands at its rest (1440, 0, 1440), where the
    // place would be (840, 0, 1320) on the ground. The node is found from the data, whatever its name.
    const follow: EffectProgram = { name: 'translate_sky', root: 0, flags: 0x21, nodes: ['NA', 'skydome', 'camera'], sequences: [{ name: 'NA', activation: 1, ops: [
      { op: 'translate', node: 1, ref: 2, flags: 16, xyz: [0, 0, 0] },  // looped on the disc
    ] }] };
    const battle: EffectProgram = { name: 'mp73_battlesounds', root: 0, flags: 0x21, nodes: ['NA', 'skydome', 'flash1', 'seagull2'], sequences: [{ name: 'NA', activation: 1, ops: [
      sound('.EXP_DISTANT', 1, 0x86, { offset: [-600, 0, -120] }),
      sound('.EXP_FLASH', 2, 0x86, { offset: [0, 0, 10] }),          // a node under the moved one moves with it
      sound('.SEABIRD_SQUAK', 3, 0x82),                               // a node nothing moves keeps its place
    ] }] };
    const { world: w, heard } = world(meta([follow, battle], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard.map((h) => [h.name, h.path, h.at])).toEqual([
      ['.EXP_DISTANT', SKY, null], ['.EXP_FLASH', FLASH, null], ['.SEABIRD_SQUAK', GULL, [2004.334, 50.6, 1733]],
    ]);
  });

  it("a node a program translates to another node than the camera keeps its place (the follow is the camera's only)", () => {
    const move: EffectProgram = { name: 'move_sky', root: 0, flags: 0x21, nodes: ['NA', 'skydome', 'seagull2'], sequences: [{ name: 'NA', activation: 1, ops: [
      { op: 'translate', node: 1, ref: 2, flags: 0, xyz: [0, 0, 0] },
    ] }] };
    const battle = autostart('battle', 'skydome', [sound('.EXP_DISTANT', 1, 0x86, { offset: [-600, 0, -120] })]);
    const { world: w, heard } = world(meta([move, battle], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard.map((h) => h.at)).toEqual([[840, 0, 1320]]);
  });

  it('a moving node (a gate, a crane hook) plays at its rest origin: SCENE_SOUND_MOVING_NODE_PLACEHOLDER', () => {
    expect(SCENE_SOUND_MOVING_NODE_PLACEHOLDER).toBe('restOrigin');
  });

  it("a node under a moved one plays where it stands now: the origin carried by the move (a door's leaf, `nodeMoved`)", () => {
    const { world: w, heard } = world(meta([autostart('battle', 'guns', [{ op: 'while', forever: true }, sound('.MG_BURST', 1, 0x82), { op: 'wait', seconds: 1, range: 0, frames: null }, { op: 'endWhile' }])], { worlds: WORLDS }));
    w.step(0.1);
    expect(heard.at(-1)!.at).toEqual([50, 0, 0]);
    w.nodeMoved('worldmodel/battle', at(0, 0, 100));                  // the parent moved 100 along z, from rest
    w.step(1.0); w.step(0.1);                                      // past the wait; the loop comes round on the next tick
    expect(heard.at(-1)!.at).toEqual([50, 0, 100]);
  });
});

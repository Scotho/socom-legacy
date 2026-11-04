// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { parseAnimSets, parseSceneGraph, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readMapMeta, type MapMeta } from '../src/mapMeta';
import { groundGrid, packGround, type GroundData } from '../src/mover';
import { SI_SCRIPT_MOTION_PLACEHOLDER, WorldState } from '../src/worldState';

/**
 * AS-1 (research 237 §0.2): the page runs the autostart programs after their opening fold (the set's start,
 * `FUN_0026c600` D:L116360-116372; the gate is `AUTOSTART_INITIAL_READING`, research 115 R115.6). Desert Glory's fixture. `mp6_battlesounds` (flags 0x21) blinks `flsh1a1` on after its 0.001 s
 * wait; `mp6_parent` (flags 0x21) calls `mp6_f18s_a` when the first `RANDOM_WEIGHT` 0.25 holds, and that flyover's
 * `f181` turns `f18_1` on, runs `OBJECT_MOTION_SI_SCRIPT` (command 26) and turns it off. The six `f18_*.zan`
 * `Script_Data` are 0 bytes and command 26's tick is not read, so the on and the off are the same tick. The mode
 * script `objectives` is not started (the room owns it). A world that leaves `runAutostartPrograms` unset -- the
 * room's -- runs none of this.
 */

const mp6 = fixture('RUN/MP6.ZDB');
const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const poly = (path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10]),
});

function hull(): GroundData {
  const path = 'worldmodel/floor';
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path, first: 0, count: 1, flags: 0x1001 }];
  return packGround(params, [poly(path)], owners);
}

function pathOf(meta: MapMeta, node: string): string {
  const found = meta.instances.find((i) => i.node.toLowerCase() === node.toLowerCase());
  if (!found) throw new Error(`no placement of ${node}`);
  return found.path;
}

function loaded() {
  const toc = parseZdb(mp6!);
  const bytes = mp6!;
  const meta = readMapMeta(bytes, toc, 'MP6', parseSceneGraph(Zar.parse(zdbMember(bytes, toc, 'MP6_GEO.ZED'))));
  const seen: { path: string; on: boolean }[] = [];
  const sounds: string[] = [];
  const ground = hull();
  const world = new WorldState(meta, ground, groundGrid(ground), {
    visible: (path, on) => { seen.push({ path, on }); },
    sound: (name) => { sounds.push(name); },
  });
  return { meta, world, seen, sounds };
}

describe.skipIf(mp6 === null)(`AS-1: the page runs the autostart programs${mp6 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('MP6: the flash turns on, the flyover calls, and f18_1 is on only for the unread SI command', () => {
    const archive = parseAnimSets(Zar.parse(zdbMember(mp6!, parseZdb(mp6!), 'MZANIM.ZAR')));
    const scripts = archive.sets.flatMap((s) => s.siScripts).filter((s) => s.object === 'f18_1' || s.object === 'f18_2');
    expect(scripts.length).toBe(6);
    expect(scripts.every((s) => s.dataSize === 0)).toBe(true);

    const { meta, world, seen, sounds } = loaded();
    world.runAutostartPrograms = true;
    world.autostartRandom = () => 0;                                 // the first RANDOM_WEIGHT branch (0 <= p)
    world.applyInitial();
    expect(world.running('objectives')).toBe(false);
    expect(world.running('mp6_parent')).toBe(true);
    expect(world.running('mp6_battlesounds')).toBe(true);

    const jet = pathOf(meta, 'f18_1');
    const flash = pathOf(meta, 'flsh1a1');
    expect(world.isActive(jet)).toBe(false);                         // the wire stays the opening fold
    expect(world.isActive(flash)).toBe(false);
    const jetOn = seen.filter((e) => e.path === jet).map((e) => e.on);
    expect(jetOn).toContain(true);
    expect(SI_SCRIPT_MOTION_PLACEHOLDER).toBe('returns at once');
    expect(jetOn.at(-1)).toBe(false);                                // command 26 returned at once: off in the same tick

    world.step(0.02);                                                 // flash1a's WAIT 0.001, then OBJECT_ACTIVE_STATE on
    expect(seen.filter((e) => e.path === flash).at(-1)?.on).toBe(true);
    expect(world.isActive(flash)).toBe(false);

    world.step(3);                                                    // mp6_f18s_a's WAIT 3, then .JET_FLYBY
    expect(sounds).toContain('.JET_FLYBY');

    world.reset();                                                    // FUN_0026c600 again
    expect(world.running('mp6_parent')).toBe(true);
    expect(world.running('objectives')).toBe(false);
    world.step(0.02);
    expect(seen.filter((e) => e.path === flash).at(-1)?.on).toBe(true);
  });

  it('a world that is not the page runs no autostart program (the room\'s wire)', () => {
    const { meta, world, seen } = loaded();
    world.applyInitial();
    const flash = pathOf(meta, 'flsh1a1');
    const n = seen.length;
    world.step(1);
    expect(world.running('mp6_parent')).toBe(false);
    expect(world.running('mp6_battlesounds')).toBe(false);
    expect(seen.slice(n).some((e) => e.path === flash && e.on)).toBe(false);
  });
});

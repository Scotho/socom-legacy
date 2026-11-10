import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { flattenScene, NODE_CALLER, NODE_ROOT, parseSceneGraph, type EffectProgram } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { fireNodeNames, readMapMeta } from '../src/mapMeta';

/**
 * DF-5 (research 386 §3.2, 175 §5.1): where a scene program's `FIRE_WEAPON` round starts. `FUN_0025ccb0` resolves the
 * command's i8 +8 through `FUN_0026f4e0` (D:L107229-107230) and starts the round at that node's world position through
 * `FUN_00310980` (D:L107232); `FUN_0026f4e0` answers 0xf9 (-7, `NODE_ROOT`) with the context's instance (+0x3c), else
 * the node reference at the animation's root index (byte +1; D:L118170-118180) -- the program's own root, the placement
 * it runs on. So a round at -7 starts at the root's placement, as a round at a named node starts at that node's.
 */

const prog = (node: number): EffectProgram => ({
  name: 'blow', root: 1, flags: 0, nodes: ['NA', 'Barrel_Fuel9', 'part1'],
  sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'fireWeapon', weapon: 'exploding_fuel', ammo: 'explosive_stuff', node, f1: 0.001, f2: 0.01 }] }],
});

describe("DF-5: a FIRE_WEAPON's start node (fireNodeNames)", () => {
  it('RED: node -7 (NODE_ROOT) names the program\'s own root reference; a named node its own name; 0 and the caller none', () => {
    expect(NODE_ROOT).toBe(-7);
    expect(fireNodeNames(prog(NODE_ROOT))).toEqual(['barrel_fuel9']);
    expect(fireNodeNames(prog(2))).toEqual(['part1']);
    expect(fireNodeNames(prog(0))).toEqual([]);                  // no node: the offset itself (the room's `sceneRound`)
    expect(fireNodeNames(prog(NODE_CALLER))).toEqual([]);        // the caller's node is the context's, not the program's
    expect(fireNodeNames({ ...prog(NODE_ROOT), nodes: ['NA', 'NA'] })).toEqual([]);   // a root no name places
  });
});

const mp6 = fixture('RUN/MP6.ZDB');
describe.skipIf(mp6 === null)(`DF-5 on Desert Glory's fixture${mp6 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("RED: fireNodes holds each fuel barrel's root placement (destroy_fuel1/2 fire at -7) with its flattenScene matrix; the gastank stays", () => {
    const toc = parseZdb(mp6!);
    const models = parseSceneGraph(Zar.parse(zdbMember(mp6!, toc, 'MP6_GEO.ZED')));
    const meta = readMapMeta(mp6!, toc, 'MP6', models);
    const flat = flattenScene(models, 'worldmodel');
    const world = (path: string): number[] => Array.from(flat.find((f) => f.path === path)!.world);
    const fuel = meta.scene!.destructibles.filter((d) => /^destroy_fuel[12]$/.test(d.anim));
    expect(fuel.map((d) => d.root)).toEqual(['worldmodel/barrel_fuel1', 'worldmodel/barrel_fuel2']);
    for (const d of fuel) {
      expect(d.program.sequences.flatMap((s) => s.ops).filter((o) => o.op === 'fireWeapon')).toEqual([
        { op: 'fireWeapon', weapon: 'exploding_fuel', ammo: 'explosive_stuff', node: NODE_ROOT, f1: 0.001, f2: 0.01 },
      ]);
      expect(meta.fireNodes!.get(d.root)).toEqual(world(d.root));
    }
    const gastank = 'worldmodel/truck_stop/truck_assembly=truck_assembly/truck_parts/gastank';
    expect(meta.fireNodes!.get(gastank)).toEqual(world(gastank));
    expect([...meta.fireNodes!.keys()].sort()).toEqual(['worldmodel/barrel_fuel1', 'worldmodel/barrel_fuel2', gastank]);
  });
});

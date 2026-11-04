import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, surfaceMaterial, type EffectProgram } from '@s2u/scene';
import { actionRayDetail } from '../src/equipment';
import { GateSet, type GateSpec } from '../src/gates';
import { groundPolygons } from '../src/mover';
import { simMapFromBytes, type SimMap } from '../src/simMap';
import { aimHitKept, aimQueryAdmits } from '../src/net/aimQuery';
import { forkGround } from '../src/worldState';

/**
 * MAP-07 on the dev disc (`SOCOM_DISC`; MP11 and MP62 are no fixtures): Death Trap's and Enowapi's gates as the readers
 * build them (research 174 §5 and §5.1, 175 §5.3), the world-space travel of every placed gate (the plan's "measure
 * world-space transformed movement for every placed gate"), no lever handle bound to a panel (the original's pick is
 * the action node or a descendant, `FUN_005aa470`), Enowapi's `look_di` read (the review's A10), and the
 * `destroy_accessN` programs read for a stop of the gate (A12). Skipped without the disc, the skip said in its name.
 */

const DISC = process.env.SOCOM_DISC;
const has = (stem: string): boolean => !!DISC && existsSync(resolve(DISC, `RUN/${stem}.ZDB`));
const load = (stem: string): { map: SimMap; bytes: Uint8Array } => {
  const bytes = new Uint8Array(readFileSync(resolve(DISC!, `RUN/${stem}.ZDB`)));
  return { map: simMapFromBytes(bytes, `RUN/${stem}.ZDB`), bytes };
};
type V3 = [number, number, number];

/** A gate's world-space travel: its first polygon's first point after `pulls` pulls of `action`, each run out. */
function travel(map: SimMap, gate: GateSpec, actions: number[]): V3[] {
  const ground = forkGround(map.ground);
  const set = new GateSet([gate], ground);
  const owner = ground.owners[gate.owners[0]!]!;
  const at = (): V3 => {
    const p = groundPolygons(ground)[owner.first]!.points;
    return [p[0]!, p[1]!, p[2]!];
  };
  const p0 = at();
  return actions.map((action) => {
    expect(set.use(action)).toBe(true);
    for (let i = 0; i < 60 * 4; i++) set.step(1 / 60);
    const p = at();
    return [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]];
  });
}

const summary = (map: SimMap) => (map.gates ?? []).map((g) => ({
  node: g.node, path: g.path, open: g.open, seconds: g.seconds,
  // `points` (the record's `+0x38`, `FUN_002b4f40` D:L157330): what `FUN_002bb5b0` scores once a round through
  // `FUN_00545530` only when it is non-zero (D:L160627-160646). Every lever's is 0: a pull scores nothing (research 174 §5.1).
  levers: g.levers.map((l) => {
    const a = map.meta!.actions[l.action]!;
    return { node: l.node, valve: l.valve, range: a.range, type: a.type, points: a.points };
  }),
}));

/** Every program of the map's MZANIM by name. */
function programs(bytes: Uint8Array): Map<string, EffectProgram> {
  const archive = parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR')));
  return new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name.toLowerCase(), decodeEffectProgram(a)] as const));
}

describe.skipIf(!has('MP11'))(`Death Trap's lever gates on the disc${has('MP11') ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent)'}`, () => {
  it('two gates, -20 on the parent X over 3 s, about 20 on world -Z, each its own lever, no handle bound', () => {
    const { map } = load('MP11');
    expect(summary(map)).toEqual([
      { node: 'gate_move1', path: 'worldmodel/access1/gate_move1', open: [-20, 0, 0], seconds: 3, levers: [{ node: 'epanel_di1', valve: 'gate1', range: 15, type: 'SWITCH', points: 0 }] },
      { node: 'gate_move2', path: 'worldmodel/access2/gate_move2', open: [-20, 0, 0], seconds: 3, levers: [{ node: 'epanel_di2', valve: 'gate2', range: 15, type: 'SWITCH', points: 0 }] },
    ]);
    for (const g of map.gates!) {
      const [opened, shut] = travel(map, g, [g.levers[0]!.action, g.levers[0]!.action]);
      expect(Math.abs(opened![0])).toBeLessThan(0.05);
      expect(Math.abs(opened![1])).toBeLessThan(0.01);
      expect(opened![2]).toBeCloseTo(-20, 2);
      for (const v of shut!) expect(Math.abs(v)).toBeLessThan(1e-3);
    }
    for (const a of map.meta!.actions) expect(a).not.toHaveProperty('aim');
  });
});

describe.skipIf(!has('MP62'))(`Enowapi's lever gates on the disc${has('MP62') ? '' : ' (SOCOM_DISC with RUN/MP62.ZDB absent)'}`, () => {
  it('two gates rising 35 over 3 s; di2 and di3 share gate 2 and both its valves; no handle bound', () => {
    const { map } = load('MP62');
    expect(summary(map)).toEqual([
      { node: 'gate_move1', path: 'worldmodel/access1/gate_move1', open: [0, 35, 0], seconds: 3, levers: [{ node: 'epanel_di1', valve: 'fusebox2', range: 20, type: 'SWITCH', points: 0 }] },
      {
        node: 'gate_move2', path: 'worldmodel/access2/gate_move2', open: [0, 35, 0], seconds: 3,
        levers: [
          { node: 'epanel_di2', valve: 'woodgate', range: 20, type: 'SWITCH', points: 0 },
          { node: 'epanel_di3', valve: 'woodgate2', range: 20, type: 'SWITCH', points: 0 },
        ],
      },
    ]);
    const [g1, g2] = map.gates!;
    const one = travel(map, g1!, [g1!.levers[0]!.action, g1!.levers[0]!.action]);
    expect(one[0]![1]).toBeCloseTo(35, 3);
    expect(Math.abs(one[1]![1])).toBeLessThan(1e-3);
    // `gate_openclose2` opens on `woodgate == 0 OR woodgate2 == 0` (EXPRESSION operator 3) and writes both: di2 opens
    // (+35) and di3 then closes (0). The runner folds the operator as `FUN_0025e960` since LATER 310 (research 89 §18,
    // 106 §3); before it, every pull ran `gateclose` and the leaf sank 35 a pull.
    const two = travel(map, g2!, [g2!.levers[0]!.action, g2!.levers[1]!.action]);
    expect(two[0]![1]).toBeCloseTo(35, 3);
    expect(Math.abs(two[1]![1])).toBeLessThan(1e-3);
    for (const a of map.meta!.actions) expect(a).not.toHaveProperty('aim');
    // The lever handles hold no collision: a hit there could never name the panel anyway.
    expect(map.ground.owners.filter((o) => /\/lever_\d/.test(o.path))).toEqual([]);
  });

  it("look_di is the tower's own solid wood, a miss for the lever: under di3's panel the ray meets it, at the panel the panel", () => {
    const { map } = load('MP62');
    const polys = groundPolygons(map.ground);
    const owner = map.ground.owners.find((o) => o.path === 'worldmodel/look_di')!;
    expect(owner).toBeDefined();
    const look = polys.slice(owner.first, owner.first + owner.count);
    expect(look).toHaveLength(18);
    const mat = (n: number) => surfaceMaterial(n, map.defaultMaterial ?? '');
    for (const p of look) {
      expect(p.cameratype).toBe(0);
      expect(mat(p.material).name).toBe('WOOD_THICK');
      expect(aimQueryAdmits(p, 'eye')).toBe(true);    // the side bit, no camera skip (`FUN_002d2890`)
      expect(aimHitKept(p, mat)).toBe(true);          // an opaque hit, not a use volume (`FUN_005aa6e0`)
    }
    // di3's panel faces +z at z ~1868.2, x 1657.4-1661.0, y 238.5-243.8; look_di's wall stands 0.2 behind it.
    const actions = map.meta!.actions;
    const di3 = actions.findIndex((a) => a.node === 'epanel_di3');
    expect(di3).toBeGreaterThanOrEqual(0);
    const ray = (eye: V3, at: V3): ReturnType<typeof actionRayDetail> => {
      const d = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]], n = Math.hypot(...d);
      return actionRayDetail(map.grid, eye, eye.map((v, k) => v + (d[k]! / n) * 100) as V3, actions, mat);
    };
    expect(ray([1659.2, 247, 1878], [1659.2, 241.1, 1868.25]).pick?.path).toBe('worldmodel/epanel_di3');
    const under = ray([1659.2, 255, 1871], [1659.2, 237.5, 1868.2]);
    expect(under.pick?.path).toBe('worldmodel/look_di');
    expect(under.actionPath).toBeNull();
  });

  it('destroy_access1/2 stop no gate: they swap the parts and fly them, and never touch gate_openclose', () => {
    const { bytes } = load('MP62');
    const progs = programs(bytes);
    for (const name of ['destroy_access1', 'destroy_access2']) {
      const p = progs.get(name)!;
      const kinds = new Set(p.sequences.flatMap((s) => s.ops.map((o) => o.op)));
      expect([...kinds].sort()).toEqual(['active', 'call', 'callSequence', 'endForChildren', 'endif', 'forChildren', 'if', 'makeWorldChild', 'sound', 'valve'].sort());
      expect(JSON.stringify(p)).not.toMatch(/gate_openclose|gate_move/);
    }
  });
});

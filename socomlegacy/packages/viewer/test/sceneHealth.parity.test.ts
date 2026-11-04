// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readKitTable } from '@s2u/scene';
import { under } from '../src/mapMeta';
import { groundPolygons } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * MAP-06 on the fixtures (research 209 s13; research 203 s7): the kind-3 damage blocks bound to their placed nodes
 * through the map's metadata (`MapMeta.scene`, `destructiblesOf`). Frostfire's `door_slab` is placed three times --
 * one in each door's prototype (`bdoor_4`, `wdoor_1`, `wdoor_2`) -- and each placement is its own destructible with its
 * own `pane1` (`SCENE_INSTANCE_SCOPE_READING`); Crossroads' two bases are the 2/21 blocks on `basedi`.
 */

const MP2 = fixture('RUN/MP2.ZDB');
const MP72 = fixture('RUN/MP72.ZDB');
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const M4 = { kind: 'impact' as const, rating: 2.3, modifier: 0.3, point: [0, 0, 0] as [number, number, number] };

describe(`the scene's destructibles on the disc's maps${MP2 && MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)('door_slab binds one destructible per placed slab: three panes under bdoor_4, wdoor_1, wdoor_2, each pane1 its own instance', () => {
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
    const list = map.meta!.scene!.destructibles;
    expect(list.map((d) => d.anim)).toEqual(['door_slab', 'door_slab', 'door_slab']);
    expect(list.map((d) => d.root)).toEqual([
      'worldmodel/bdoor_4/door1=door1/door_slab', 'worldmodel/wdoor_1/door1=door1/door_slab', 'worldmodel/wdoor_2/door1=door1/door_slab',
    ]);
    expect(list.map((d) => d.targetPath)).toEqual(list.map((d) => `${d.root}/pane1`));
    expect(list.map((d) => d.instance)).toEqual([876, 910, 915]);          // the slabs' flattenScene ids (PF.R15)
    expect(new Set(list.map((d) => d.key)).size).toBe(3);
    for (const d of list) expect([d.health, d.armor, d.shield]).toEqual([1, 0, 0]);
    // A rifle round breaks one pane: door_slab calls breakapane, whose OBJECT_ACTIVE_STATE turns its root -- this
    // slab's pane1 -- off; the other two stand. Two polygons a pane, gone from the collision with it.
    const world = new WorldState(map.meta!, map.ground, map.grid);
    world.applyInitial();
    const h = world.health;
    expect(list.map((d) => h.at(d.targetPath))).toEqual([0, 1, 2]);
    expect(h.hitAt(list[1]!.targetPath, M4)).toEqual({ applied: true, died: true });
    expect(list.map((d) => world.isActive(d.targetPath))).toEqual([true, false, true]);
    const owners = map.ground.owners.filter((o) => o.path === list[1]!.targetPath);
    expect(owners.map((o) => o.count)).toEqual([2]);
    expect(owners[0]!.flags! & 1).toBe(0);
    // The round's reset: every record's health back and every placement's pane1 with it -- each slab's reference
    // saves its own pane (SUP-02: a search-0 reference beneath each placement of its root first,
    // SCENE_INSTANCE_SCOPE_READING; research 210 s6), so a broken wdoor pane is back too.
    expect(h.hitAt(list[2]!.targetPath, M4)).toEqual({ applied: true, died: true });
    expect(h.hitAt(list[0]!.targetPath, M4)).toEqual({ applied: true, died: true });
    world.reset();
    expect(list.map((d) => h.hp(d.id))).toEqual([1, 1, 1]);
    expect(list.map((d) => world.isActive(d.targetPath))).toEqual([true, true, true]);
    expect(list.map((d) => h.at(d.targetPath))).toEqual([0, 1, 2]);
    for (const d of list) for (const o of map.ground.owners.filter((x) => x.path === d.targetPath)) expect(o.flags! & 1).toBe(1);
  });

  it.skipIf(!MP72)("Crossroads' bases: destroy_seal_base and destroy_terrorist_base, health 2 and shield 21 on basedi -- C4's 18 refused, the bomb's 50 accepted", () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const list = map.meta!.scene!.destructibles;
    expect(list.map((d) => `${d.anim} ${d.targetPath}`).sort()).toEqual([
      'destroy_seal_base worldmodel/seal_base/crates_hospital=crates_hospital/healthy/basedi',
      'destroy_terrorist_base worldmodel/terrorist_base/crates_weapons=crates_weapons/healthy/basedi',
    ]);
    for (const d of list) expect([d.health, d.armor, d.shield]).toEqual([2, 0, 21]);
    const world = new WorldState(map.meta!, map.ground, map.grid);
    world.applyInitial();
    for (const d of list) {
      expect(world.health.c4TargetAt(d.targetPath, 18)).toBeNull();
      expect(world.health.c4TargetAt(d.targetPath, 50)).toBe(d.id);
    }
    // Nothing on the street changes for a round: 2.3 + 0.3 < 21.
    expect(world.health.hitAt(list[0]!.targetPath, M4)).toEqual({ applied: false, died: false });
  });

  // XR-08 (research 213 s5; 173 s3; PF.R14): the bases' blocks against the two explosives' ZWEAPON ratings -- MPBOMB's
  // Explosion_Damage 50 (radius 30 raw, 300 u, `throwableRecord`'s WORLD_SCALE) and C4's 18 (`readKitTable`).
  it.skipIf(!MP72 || !ZWEAPON)("Crossroads' two bases are the kind-3 blocks on basedi, 2 / 0 / 21; the bomb's 50 qualifies, C4's 18 does not", () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const table = readKitTable(ZWEAPON!);
    const bomb = table.throwables!.get(table.arsenal.byName.get('MPBOMB')!.id)!.record;
    const c4 = table.throwables!.get(table.arsenal.byName.get('C4')!.id)!.record;
    expect([bomb.id, bomb.ammo, bomb.ammoId, bomb.explosionDamage, bomb.explosionRadius]).toEqual([154, 'MPBOMB Ammo', 19, 50, 300]);
    expect([c4.id, c4.explosionDamage]).toEqual([151, 18]);
    const list = map.meta!.scene!.destructibles;
    const base = (side: string) => list.find((d) => d.anim === `destroy_${side}_base`)!;
    for (const side of ['terrorist', 'seal']) {
      const d = base(side);
      expect(d.targetPath.endsWith('/healthy/basedi'), side).toBe(true);
      expect(d.root).toBe(`worldmodel/${side}_base`);
      expect([d.health, d.armor, d.shield], side).toEqual([2, 0, 21]);
    }
    const world = new WorldState(map.meta!, map.ground, map.grid);
    world.applyInitial();
    const h = world.health;
    for (const d of list) {
      expect(h.accepts(d.id, bomb.explosionDamage)).toBe(true);
      expect(h.accepts(d.id, c4.explosionDamage)).toBe(false);
    }
    // At the terrorist tent's MPBOMB node (inside the terrorist base's box): C4's blast reaches nothing; the bomb's takes
    // that base only (the SEAL base's box is ~1465 u off), its death the room's silent run of destroy_terrorist_base.
    const tent = map.meta!.actions.find((a) => a.node === 'terrorist_tent')!.at as [number, number, number];
    // AD-5: the point the blast is measured to (SCENE_BOUNDS_MIDPOINT_READING): the midpoint of basedi's polygons' box,
    // (531.15, 32.47, 1528.97) for the terrorist base, 20.03 u from the tent's node (0.067 of the bomb's 300 u: the full
    // 50, FUN_003c7600 D:L318730-318735); the SEAL tent's node 19.20 u from its base's (2003.51, 73.02, 1429.09).
    const all = groundPolygons(map.ground);
    const mid = (target: string): number[] => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const o of map.ground.owners) if (under(o.path, target)) for (const p of all.slice(o.first, o.first + o.count)) {
        for (let k = 0; k < p.points.length; k += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, p.points[k + a]!); hi[a] = Math.max(hi[a]!, p.points[k + a]!); }
      }
      return [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2);
    };
    const away = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const tMid = mid(base('terrorist').targetPath), sMid = mid(base('seal').targetPath);
    [531.15, 32.47, 1528.97].forEach((v, a) => expect(tMid[a]).toBeCloseTo(v, 1));
    [2003.51, 73.02, 1429.09].forEach((v, a) => expect(sMid[a]).toBeCloseTo(v, 1));
    expect(away(tent, tMid)).toBeCloseTo(20.03, 1);
    expect(h.blastAt(tent, c4.explosionDamage, c4.explosionRadius, () => true)).toEqual([]);
    expect(h.blastAt(tent, bomb.explosionDamage, bomb.explosionRadius, () => true)).toEqual([base('terrorist').id]);
    // AD-5: the tent's node is 20.03 u from the base's basedi midpoint (531.15, 32.47, 1528.97; 0.067R): the full 50, x14
    // (700) against health 2, floored at 0 (FUN_003c7490 D:L318634-318638). Was -48 (2 - 50: no x14, no floor).
    expect(h.hp(base('terrorist').id)).toBe(0);
    expect(h.hp(base('seal').id)).toBe(2);
    // The mirror: at the SEAL tent's node (2.5 u east of its basedi box) the bomb takes the SEAL base only. The room's
    // line test over either tent's 15 u plant reach meets nothing but basedi (research 213 s5's probe).
    const other = new WorldState(map.meta!, map.ground, map.grid);
    other.applyInitial();
    const sealTent = map.meta!.actions.find((a) => a.node === 'seal_tent')!.at as [number, number, number];
    expect(away(sealTent, sMid)).toBeCloseTo(19.2, 1);
    expect(other.health.blastAt(sealTent, bomb.explosionDamage, bomb.explosionRadius, () => true)).toEqual([base('seal').id]);
  });
});

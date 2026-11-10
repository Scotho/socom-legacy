// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { flattenScene, NODE_ROOT, parseSceneGraph } from '@s2u/scene';
import { R0004_SHIELD_EDITS } from '../../viewer/src/sceneHealth';
import { roomOn } from './sceneRoundsDisc';

/**
 * DF-5 (research 386 §3.2, 175 §5.1) on Desert Glory's fixture (`test-fixtures/RUN/MP6.ZDB`, the kit table
 * `RUN/ZWEAPON.ZAR`): `destroy_fuel1/2` fire `FIRE_WEAPON exploding_fuel` at node -7 -- `FUN_0026f4e0` answers -7 with
 * the program's own root (D:L118170-118180), and `FUN_0025ccb0` starts the round at that node's world position
 * (D:L107229-107232) -- so the barrel's death fires its round at the barrel. Was: `fireNodes` held named nodes only and
 * `Room.sceneRound` dropped the round (no node matrix for the root's path).
 *
 * The barrels' block reads health 150 behind shield 150. `FUN_00273a50` runs the death only at health <= 0 or with a
 * damage sequence (`+0x10`, `_zanim_anim_params.m_damage_seq_offset`, D:L120980-120991; both barrels' read 0), and the
 * health moves only when the rating plus the weapon's modifier reaches the shield (`FUN_003c7490` D:L318606-318622):
 * no round in `zweapon.rdr` does (the highest `Explosion_Damage` MPBOMB's 50, the highest `Damage_Modifier` 0.4), and
 * r0004 edits no MP6 shield. So no weapon kills a barrel in play: the death below is driven by a test hit of rating 150
 * (an instrument, no weapon's), to show where the round goes when the death runs.
 */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const PRESENT = existsSync(join(FIXTURES, 'RUN/MP6.ZDB')) && existsSync(join(FIXTURES, 'RUN/ZWEAPON.ZAR')) && existsSync(join(FIXTURES, 'RUN/MPZANIM.ZAR'));

/** zweapon.rdr's records under `key`. */
function records(key: string): RdrNode[][] {
  const zar = Zar.parse(new Uint8Array(readFileSync(join(FIXTURES, 'RUN/ZWEAPON.ZAR'))));
  const script = parseRdr(zar.data(zar.root.children[0] as NonNullable<(typeof zar.root.children)[0]>));
  return (rdrGet(script, key) as unknown[]).filter((r): r is RdrNode[] => Array.isArray(r));
}
const num = (r: RdrNode[], key: string): number => { const v = rdrGet(r, key); return v === undefined ? 0 : Number(v); };

/** A placement's world origin on MP6, off its `flattenScene` matrix (not the room's `fireNodes`). */
function originOf(path: string): number[] {
  const zdb = new Uint8Array(readFileSync(join(FIXTURES, 'RUN/MP6.ZDB')));
  const models = parseSceneGraph(Zar.parse(zdbMember(zdb, parseZdb(zdb), 'MP6_GEO.ZED')));
  const w = flattenScene(models, 'worldmodel').find((f) => f.path === path)!.world;
  return [w[12]!, w[13]!, w[14]!];
}

describe.skipIf(!PRESENT)(`DF-5: Desert Glory's fuel barrels fire at their root (fixture${PRESENT ? '' : ': test-fixtures absent -- skipped'})`, () => {
  it("RED: barrel_fuel1's death queues exploding_fuel at the barrel's placement and every page is told it a tick on; barrel_fuel2's at its own", async () => {
    const s = await roomOn(FIXTURES, 'MP6');
    const fuel = s.map.meta!.scene!.destructibles.filter((d) => /^destroy_fuel[12]$/.test(d.anim));
    expect(fuel).toHaveLength(2);
    const told: [string, number[]][] = [];
    for (const d of fuel) {
      expect(d.program.sequences.flatMap((q) => q.ops).find((o) => o.op === 'fireWeapon')).toMatchObject({ weapon: 'exploding_fuel', node: NODE_ROOT });
      const at = originOf(d.root);                                   // the root placement's world origin
      expect(s.room.world.health.hitAt(d.targetPath, { kind: 'explosion', rating: 150, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
      s.step(); s.step();
      told.push([d.root, at.map((v) => Math.round(v * 1000) / 1000)]);
      expect(s.client(2).of('sceneRound').at(-1)).toEqual({ type: 'sceneRound', kind: 'exploding_fuel', at });
    }
    expect(s.client(1).of('sceneRound').map((e) => e.kind)).toEqual(['exploding_fuel', 'exploding_fuel']);
    expect(told[0]![1]).not.toEqual(told[1]![1]);                    // each at its own barrel
  }, 120_000);

  it("the gastank (node=gastank) still fires at its named node; the round is the kit table's exploding_fuel", async () => {
    const s = await roomOn(FIXTURES, 'MP6');
    const tank = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'truck_stop_gas_hit')!;
    const at = s.origin('truck_parts/gastank');
    expect(at.map(Math.round)).toEqual([1901, 11, 1888]);           // research 175 §5.1: (1900.851, 11.146, 1887.691)
    expect(s.room.world.health.hitAt(tank.targetPath, { kind: 'explosion', rating: 10, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    s.step(); s.step();
    expect(s.client(1).of('sceneRound')).toEqual([{ type: 'sceneRound', kind: 'exploding_fuel', at }]);
  }, 120_000);

  it("no round in zweapon.rdr reaches the barrels' shield 150 (FUN_003c7490 D:L318622): MPBOMB's 50 plus the top modifier 0.4; r0004 edits no MP6 shield", async () => {
    const s = await roomOn(FIXTURES, 'MP6');
    const fuel = s.map.meta!.scene!.destructibles.filter((d) => /^destroy_fuel[12]$/.test(d.anim));
    for (const d of fuel) expect([d.health, d.shield]).toEqual([150, 150]);
    const rating = Math.max(...records('ZAMMO').map((r) => Math.max(num(r, 'ImpactDamage'), num(r, 'Explosion_Damage'))));
    const modifier = Math.max(...records('ZWEAPON').map((r) => num(r, 'Damage_Modifier')));
    expect([rating, modifier]).toEqual([50, 0.4]);
    expect(rating + modifier).toBeLessThan(150);
    expect(R0004_SHIELD_EDITS.filter((e) => e.mission === 'mp6')).toEqual([]);
    for (const d of fuel) {
      expect(s.room.world.health.hitAt(d.targetPath, { kind: 'explosion', rating, modifier, point: [0, 0, 0] })).toEqual({ applied: false, died: false });
    }
    // Nothing else starts the barrels' programs: no program of the set calls them, no action executes them.
    const calls = s.map.meta!.scene!.programs.flatMap((p) => p.program.sequences.flatMap((q) => q.ops))
      .filter((o) => (o.op === 'call' && /^destroy_fuel/i.test(o.anim)));
    expect(calls).toEqual([]);
    expect(s.map.meta!.actions.filter((a) => a.anims.some((n) => /^destroy_fuel/i.test(n)))).toEqual([]);
    s.step(); s.step();
    expect(s.client(1).of('sceneRound')).toEqual([]);
  }, 120_000);
});

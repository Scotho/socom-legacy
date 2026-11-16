// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blastExposed, blastLine1, blastPoint, BLAST_HEAD_OVER_READING } from '../../viewer/src/net/blast';
import { TICK_HZ } from '../../viewer/src/sim';
import { roomOn, surfacesOver, type Live } from './sceneRoundsDisc';

/**
 * Research 386 §3.2 (LATER 63) on the scene programs' `FIRE_WEAPON` rounds the room fires, through `loadSimMap` and the
 * kit table (`RUN/ZWEAPON.ZAR`), one map at a time:
 *
 * - The terrorist base: `destroy_terrorist_base` opens on `FIRE_WEAPON MPBOMB` at its `healthy` node, then `WAIT 0.15`,
 *   then the model swap -- so the round (fuse 0.001 s) goes off with the healthy hull still there. Its node lies under
 *   the floor slab over it (MP72: y 13.812, the lowest surface over it 14.3); the blast's line to a head is one-sided
 *   (`blastSeen`, research 281 §4.3: a face is met only from its front), so a round under an upward floor reaches the
 *   bodies above it: a body the bomb's blast reaches beside the base is reached again. `destroy_seal_base` fires none.
 * - Every body here stands on a surface of the hull (`grounded`): line 1 (NADE-BLAST, `blastLine1`) runs to a point over
 *   the FEET, so a body floating over its column takes lines no player's can. Was: 160 u south at the node's y + 2
 *   (15.812), where the only surface is y 0 -- a body reached there that the ground's would not be (research 386 s3.2).
 * - Grounded 160 u south the base's round reaches nobody: from the node + 1.0 (`blastPoint`; the round is a pool round,
 *   `FUN_003c9fb0` state 4 `FUN_003c8330` lifts it, state 5 `FUN_003c7dd0` walks it, D:L320094) line 1 descends and meets
 *   `terrorist_tent`'s ASPHALT top (y 14.312, PENETRATION 0) 22.8 u out -- for any end up to 12.75 over the feet (open
 *   from 12.80); the captures' bracket for that end (`BLAST_LINE1_END_PLACEHOLDER`, [unread, 11.31), 11.35 at its widest)
 *   tops out 1.4 under it, so a retake that moves the end inside the bracket does not change this. The command does not
 *   free it: `FUN_0025ccb0` sets the round's +5 bit 1 (both lines' material checks passed, D:L319096, D:L459192) only
 *   from its byte +10 bit 0 (D:L107318-107320), which is 0 on every base map's `destroy_terrorist_base` (reading).
 * - The bridges: each switch fires MPBOMB at the arch's `damage_point2`, then 0.1 s on at `damage_point` (research 213
 *   §2.1-§2.2): a body on the ground under the arch takes both; the presser at the switch is over 300 u from both.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP72.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));

/** The total of a body's parts' health. */
const total = (p: Live): number => p.health.hp.reduce((a, b) => a + b, 0);

type Room = Awaited<ReturnType<typeof roomOn>>;
/**
 * Feet on the hull's surface `dx`, `dz` off `at`: the highest surface at or under `at`'s y + 2 there (the browser spec's
 * own rule, `crossroadsBaseRound.spec.ts`), else the column's lowest (the ground rising over the node's height, as 600 u
 * east) -- never a point over the column with nothing under it.
 */
function grounded(s: Room, at: readonly number[], dx: number, dz: number): [number, number, number] {
  const x = at[0]! + dx, z = at[2]! + dz;
  const all = surfacesOver(s.map.ground, x, z);
  const y = all.filter((h) => h <= at[1]! + 2).at(-1) ?? all[0];
  expect(y, `a surface under (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeDefined();
  return [x, y!, z];
}

describe.skipIf(!DISC)(`research 386 §3.2: Crossroads' scene rounds (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it("the terrorist base's death fires its own MPBOMB at its healthy node a tick on, before its swap; it reaches a body on the floor 100 u east-south-east the bomb's blast reached -- twice; the SEAL base's death fires none", async () => {
    const s = await roomOn(DISC!, 'MP72');
    const tbase = s.origin('terrorist_base/crates_weapons=crates_weapons/healthy');
    const ops = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_terrorist_base')!.program.sequences[0]!.ops;
    expect(ops[0]).toMatchObject({ op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', f1: 0.001 });
    expect(ops[1]).toMatchObject({ op: 'wait' });
    expect((ops[1] as { seconds: number }).seconds).toBeCloseTo(0.15, 5);   // the swap after the round
    expect(tbase[1]).toBeCloseTo(13.812, 3);
    expect(surfacesOver(s.map.ground, tbase[0]!, tbase[2]!).map((y) => Math.round(y * 10) / 10)[0]).toBe(14.3);   // the node under the floor
    // A body on the floor 100 u east-south-east of the base (112.5 degrees off +z; the bomb's and the base's lines both
    // clear, and nearer the bomb's blast at random 0.5 kills him before the round), the far control 600 u east.
    s.place(1, grounded(s, tbase, 100 * Math.sin(5 * Math.PI / 8), 100 * Math.cos(5 * Math.PI / 8)));
    s.place(2, grounded(s, tbase, 600, 0));
    s.bombBlast([tbase[0]!, tbase[1]! + 40, tbase[2]!]);          // the bomb's blast 40 u over the base
    expect(s.client(1).of('blast')).toHaveLength(1);               // reached: the ring and the knock
    s.step(); s.step();
    expect(s.client(2).of('sceneRound').map((e) => [e.kind, e.at.map(Math.round)])).toEqual([['MPBOMB', tbase.map(Math.round)]]);
    expect(s.room.world.isActive('worldmodel/terrorist_base/crates_weapons=crates_weapons/healthy')).toBe(true);   // not swapped yet
    expect(s.client(1).of('blast')).toHaveLength(2);               // the base's own round: lifted over the floor (LATER 992), both lines clear
    expect(s.client(2).of('blast')).toEqual([]);                    // 600 u off: out of both
    const seal = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_seal_base')!;
    expect(seal.program.sequences.flatMap((q) => q.ops).some((o) => o.op === 'fireWeapon')).toBe(false);
    expect(s.room.world.health.hitAt(seal.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    s.step(); s.step();
    expect(s.client(2).of('sceneRound')).toHaveLength(1);
  }, 120_000);

  it("the base's round alone takes health off a body on the floor 60 u south (the fragments drawn low: random 0.01); 386 §3.2", async () => {
    const s = await roomOn(DISC!, 'MP72', () => 0.01);
    const tbase = s.origin('terrorist_base/crates_weapons=crates_weapons/healthy');
    const body = s.place(1, grounded(s, tbase, 0, -60));
    const full = total(body);
    expect(full).toBe(178);
    const base = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_terrorist_base')!;
    expect(s.room.world.health.hitAt(base.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    expect(s.client(1).of('blast')).toEqual([]);
    s.step(); s.step();
    expect(s.client(1).of('blast')).toHaveLength(1);
    expect(total(body)).toBe(170);                                  // the base round's fragment (deterministic at random 0.01)
  }, 120_000);

  it("the browser spec's spots: grounded 160 u south (the only surface there, y 0) the base's round spares a body inside its radius -- line 1 meets the tent's ASPHALT top, line 2 clear -- and reaches one on the deck 160 u north-north-east; 386 §3.2 (reading, pending review)", async () => {
    const s = await roomOn(DISC!, 'MP72', () => 0.01);
    const tbase = s.origin('terrorist_base/crates_weapons=crates_weapons/healthy');
    const column = surfacesOver(s.map.ground, tbase[0]!, tbase[2]! - 160);
    expect(column).toHaveLength(1);
    expect(column[0]).toBeCloseTo(0, 3);
    const feet = grounded(s, tbase, 0, -160);
    const nne = [tbase[0]! + 160 * Math.sin(Math.PI / 8), tbase[2]! + 160 * Math.cos(Math.PI / 8)] as const;
    const deck = surfacesOver(s.map.ground, nne[0], nne[1]).find((y) => Math.abs(y - 24) < 0.01);
    expect(deck).toBeDefined();                                     // the ground under it (12.9) has no head room
    const reached = s.place(1, [nne[0], deck!, nne[1]]), spared = s.place(2, feet);
    // Why: from the lifted node line 1 descends to the end over these feet and meets `terrorist_tent`'s top (y 14.312,
    // PENETRATION 0) for any end up to 12.75 (open from 12.80) -- above the captures' bracket for it -- and the head's
    // line rises and is clear.
    const from = blastPoint(tbase), def = s.map.defaultMaterial ?? '';
    for (const end of [9, 11.3, 11.35, 12.75]) expect(blastLine1(s.map.grid, from, [feet[0], feet[1] + end, feet[2]], 300, def), `line 1 to ${end}`).toBe(false);
    expect(blastLine1(s.map.grid, from, [feet[0], feet[1] + 12.8, feet[2]], 300, def), 'line 1 to 12.8').toBe(true);
    expect(blastExposed(s.map.grid, from, [feet[0], feet[1] + BLAST_HEAD_OVER_READING.stand, feet[2]], def)).toBe(true);
    const base = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_terrorist_base')!;
    expect(s.room.world.health.hitAt(base.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    s.step(); s.step();
    expect(s.client(2).of('sceneRound')).toHaveLength(1);           // the round went off
    expect(s.client(1).of('blast')).toHaveLength(1);                // the deck: reached
    expect(s.client(2).of('blast')).toEqual([]);                    // 160 u south: spared
    expect(total(spared)).toBe(178);
    expect(total(reached)).toBeLessThan(178);                       // the fragments drawn low (random 0.01): hurt
  }, 120_000);

  for (const site of ['seal', 'terrorist'] as const) {
    it(`${site}_demo_site1: two MPBOMB rounds, at damage_point2 then 0.1 s on at damage_point; a body on the ground 200 u off takes exactly both (no fragment drawn, 178 kept), one 20 u off dies of the first (178 -> 8); the presser at the switch takes neither`, async () => {
      for (const [off, blasts, hp, alive] of [[200, 2, 178, true], [20, 1, 8, false]] as const) {
        const s = await roomOn(DISC!, 'MP72');
        const a = s.map.meta!.actions.find((x) => x.anims.includes(`${site}_demo_site1`))!;
        const dp2 = s.origin(`${site}_demo_1/arch=arch/damage_point2`), dp = s.origin(`${site}_demo_1/arch=arch/damage_point`);
        for (const p of [dp, dp2]) expect(Math.hypot(a.at[0] - p[0]!, a.at[1] - p[1]!, a.at[2] - p[2]!)).toBeGreaterThan(300);
        const ground = surfacesOver(s.map.ground, dp[0]! + off, dp[2]!).filter((y) => y < dp[1]!).at(-1)!;
        const body = s.place(1, [dp[0]! + off, ground, dp[2]!]);
        s.place(2, [a.at[0], a.at[1], a.at[2]]);
        expect(total(body)).toBe(178);
        expect(s.room.world.executeAction(a.valve)).toBe(true);
        for (let k = 0; k < Math.ceil(0.3 * TICK_HZ); k++) s.step();
        const told = s.client(2).of('sceneRound');
        expect(told.map((e) => e.kind)).toEqual(['MPBOMB', 'MPBOMB']);
        for (let i = 0; i < 3; i++) { expect(told[0]!.at[i]).toBeCloseTo(dp2[i]!, 2); expect(told[1]!.at[i]).toBeCloseTo(dp[i]!, 2); }
        expect(s.client(1).of('blast'), `${off} u`).toHaveLength(blasts);
        expect(total(body), `${off} u`).toBe(hp);
        expect(body.alive, `${off} u`).toBe(alive);
        expect(s.client(2).of('blast')).toEqual([]);
      }
    }, 240_000);
  }
});

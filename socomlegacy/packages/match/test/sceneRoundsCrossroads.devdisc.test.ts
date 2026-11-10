// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
 * - The bridges: each switch fires MPBOMB at the arch's `damage_point2`, then 0.1 s on at `damage_point` (research 213
 *   §2.1-§2.2): a body on the ground under the arch takes both; the presser at the switch is over 300 u from both.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP72.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));

/** The total of a body's parts' health. */
const total = (p: Live): number => p.health.hp.reduce((a, b) => a + b, 0);

describe.skipIf(!DISC)(`research 386 §3.2: Crossroads' scene rounds (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it("the terrorist base's death fires its own MPBOMB at its healthy node a tick on, before its swap; from under the floor it reaches a body the bomb's blast reached -- twice; the SEAL base's death fires none", async () => {
    const s = await roomOn(DISC!, 'MP72');
    const tbase = s.origin('terrorist_base/crates_weapons=crates_weapons/healthy');
    const ops = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_terrorist_base')!.program.sequences[0]!.ops;
    expect(ops[0]).toMatchObject({ op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', f1: 0.001 });
    expect(ops[1]).toMatchObject({ op: 'wait' });
    expect((ops[1] as { seconds: number }).seconds).toBeCloseTo(0.15, 5);   // the swap after the round
    expect(tbase[1]).toBeCloseTo(13.812, 3);
    expect(surfacesOver(s.map.ground, tbase[0]!, tbase[2]!).map((y) => Math.round(y * 10) / 10)[0]).toBe(14.3);   // the node under the floor
    // A body 160 u south of the base (in the open there: the bomb's and the base's lines both clear).
    s.place(1, [tbase[0]!, tbase[1]! + 2, tbase[2]! - 160]);
    s.place(2, [tbase[0]! + 600, tbase[1]! + 2, tbase[2]!]);
    s.bombBlast([tbase[0]!, tbase[1]! + 40, tbase[2]!]);          // the bomb's blast 40 u over the base
    expect(s.client(1).of('blast')).toHaveLength(1);               // reached: the ring and the knock
    s.step(); s.step();
    expect(s.client(2).of('sceneRound').map((e) => [e.kind, e.at.map(Math.round)])).toEqual([['MPBOMB', tbase.map(Math.round)]]);
    expect(s.room.world.isActive('worldmodel/terrorist_base/crates_weapons=crates_weapons/healthy')).toBe(true);   // not swapped yet
    expect(s.client(1).of('blast')).toHaveLength(2);               // the base's own round: under the floor, the line one-sided
    expect(s.client(2).of('blast')).toEqual([]);                    // 600 u off: out of both
    const seal = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_seal_base')!;
    expect(seal.program.sequences.flatMap((q) => q.ops).some((o) => o.op === 'fireWeapon')).toBe(false);
    expect(s.room.world.health.hitAt(seal.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    s.step(); s.step();
    expect(s.client(2).of('sceneRound')).toHaveLength(1);
  }, 120_000);

  it("the base's round alone, from under the floor, takes health off a body 160 u south (the fragments drawn low: random 0.01); 386 §3.2", async () => {
    const s = await roomOn(DISC!, 'MP72', () => 0.01);
    const tbase = s.origin('terrorist_base/crates_weapons=crates_weapons/healthy');
    const body = s.place(1, [tbase[0]!, tbase[1]! + 2, tbase[2]! - 160]);
    const full = total(body);
    expect(full).toBe(178);
    const base = s.map.meta!.scene!.destructibles.find((d) => d.anim === 'destroy_terrorist_base')!;
    expect(s.room.world.health.hitAt(base.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    expect(s.client(1).of('blast')).toEqual([]);
    s.step(); s.step();
    expect(s.client(1).of('blast')).toHaveLength(1);
    expect(total(body)).toBe(170);                                  // the base round's fragment (deterministic at random 0.01)
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

// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plantSite } from '../../viewer/src/net/objective';
import { roomOn } from './sceneRoundsDisc';

/**
 * Bitter Jungle (MP9, DEMOLITION: `missionlist.rdr` TYPE 2) -- the bomb at each base in the room, off the disc. Product
 * track: a test instrument, it changes nothing the game does. Until this the bomb's effect on the map's structures had
 * been asked only as lines (`central/test/mp9ShackBlast.parity.test.ts`), never as a blast in a room.
 *
 * As built (2026-11-21), not checked against the original:
 * - the map's destructibles: the two bases (HP 2, shield 21), `big_shack_destroy`, `ammo_depot_destroy`, eight
 *   `gcrate_destroy` and nine `bbox_destroy` (each HP 1, shield 45);
 * - the bomb at the terrorists' base (`terrorist_tent`, planted by a SEAL) kills that base, the ammo depot, crates 1-7
 *   and bullet boxes 1-3;
 * - the bomb at the SEALs' base (`seal_tent`, which stands inside the big shack) kills that base and NOTHING ELSE: the
 *   shack stays whole, though MPBOMB's 50 beats its shield 45 point-blank (a direct 50 kills it) and the blast's line
 *   reaches it (187 of 192, `mp9ShackBlast`). The rating that arrives is under 45 after the falloff over the distance to
 *   the shack's midpoint (AD-5, research 209). Whether the original's shack survives its own base's bomb is not known:
 *   a capture of a DEMOLITION round on MP9 settles it.
 * - the round's reset gives everything back but the flown debris parts' own flags (off, under a group that is off again).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP9.ZDB')));

describe.skipIf(!DISC)(`Bitter Jungle's bomb and its structures (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  const blown = async (side: 'seal' | 'terrorist') => {
    const h = await roomOn(DISC!, 'MP9');
    const site = plantSite(side, h.map.meta!.actions)!;
    h.place(1, [0, 500, 0]);
    h.place(2, [0, 500, 0]);                                       // both seats out of the blast
    h.bombBlast([site.at[0], site.at[1] + 0.1, site.at[2]]);
    for (let i = 0; i < 60 * 6; i++) h.step();
    const health = h.room.world.health;
    const dead = h.map.meta!.scene!.destructibles.filter((d) => health.isSpent(d.id)).map((d) => `${d.anim} ${d.root}`).sort();
    return { h, site, dead };
  };

  it('the destructibles are the two bases, the shack, the depot, eight crates and nine bullet boxes', async () => {
    const h = await roomOn(DISC!, 'MP9');
    const tally = new Map<string, number>();
    for (const d of h.map.meta!.scene!.destructibles) { const k = `${d.anim} hp${d.health} shield${d.shield}`; tally.set(k, (tally.get(k) ?? 0) + 1); }
    expect([...tally].map(([k, n]) => `${n} ${k}`).sort()).toEqual([
      '1 ammo_depot_destroy hp1 shield45', '1 big_shack_destroy hp1 shield45', '1 destroy_seal_base hp2 shield21', '1 destroy_terrorist_base hp2 shield21',
      '8 gcrate_destroy hp1 shield45', '9 bbox_destroy hp1 shield45',
    ]);
    expect(plantSite('seal', h.map.meta!.actions)!.node).toBe('terrorist_tent');
    expect(plantSite('terrorist', h.map.meta!.actions)!.node).toBe('seal_tent');
  }, 300_000);

  it("the bomb at the terrorists' base kills the base, the ammo depot, crates 1-7 and boxes 1-3; the reset gives them back", async () => {
    const { h, dead } = await blown('seal');
    expect(dead).toEqual([
      'ammo_depot_destroy worldmodel/ammo_depot', 'bbox_destroy worldmodel/bbox1', 'bbox_destroy worldmodel/bbox2', 'bbox_destroy worldmodel/bbox3',
      'destroy_terrorist_base worldmodel/terrorist_base',
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `gcrate_destroy worldmodel/gcrate${n}`),
    ].sort());
    expect(h.room.world.isActive('worldmodel/ammo_depot/congo2_depot01=congo2_depot01/depot_good')).toBe(false);
    expect(h.room.world.isActive('worldmodel/ammo_depot/congo2_depot01=congo2_depot01/depot_leftover')).toBe(true);
    (h.room as unknown as { startRound(): void }).startRound();
    for (let i = 0; i < 60; i++) h.step();
    // What the reset leaves: only the flown debris parts, off under their group, which is off again (they are saved by no
    // reference; whether a second death in a later round still shows them on the page is not checked).
    expect(h.room.world.states().filter((x) => !/_parts\/part\d+$/.test(x.path))).toEqual([]);
    expect(h.map.meta!.scene!.destructibles.filter((d) => h.room.world.health.isSpent(d.id))).toEqual([]);
  }, 300_000);

  it("the bomb at the SEALs' base, inside the big shack, kills that base alone: the shack stands (as built; the original's is not known)", async () => {
    const { h, dead } = await blown('terrorist');
    expect(dead).toEqual(['destroy_seal_base worldmodel/seal_base']);
    const shack = h.map.meta!.scene!.destructibles.find((d) => d.anim === 'big_shack_destroy')!;
    expect(h.room.world.isActive('worldmodel/big_shack/zshack3=zshack3/shack_good')).toBe(true);
    // Point-blank the bomb's 50 does beat the shack's 45: it is the falloff over the distance that spares it.
    expect(h.room.world.health.hitAt(shack.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
  }, 300_000);
});

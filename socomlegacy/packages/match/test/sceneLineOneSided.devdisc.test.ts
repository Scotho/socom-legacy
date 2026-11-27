import { describe, expect, it } from 'vitest';
import { M67, surfaceMaterial, type WorldPoly } from '@s2u/scene';
import { blastPoint } from '../../viewer/src/net/blast';
import { blastLine } from '../../viewer/src/sceneHealth';
import { roomOn, surfacesOver } from './sceneRoundsDisc';

/**
 * LATER 1087 (b) (research 430 s3.1, research 281 s4.3; simulation track, reading, reviewed -- the second reader's decode
 * of the ELF's VU0 microcode and its fresh review, `reviews/later1087-decode-review.md`, PASS WITH FINDINGS, high;
 * dev-disc): the original's scene blast line is ONE-SIDED on map geometry. The line to a destructible
 * (`FUN_003c7ee0` -> `FUN_0031dd90`, type 2) runs the batched `FUN_002d3030`, which takes the mode per collider
 * (D:L175277-175282): 0x30 two-sided only for a collider with `+0x80` bit 1, 0x20 one-sided otherwise, and the hull's
 * colliders (`FUN_00316e30`, D:L215827-215828) clear bit 1. So a face blocks the line only when it is met from its front.
 * The controller's ruling (A) of 2026-11-15 kept it two-sided until this reading; superseded.
 *
 * The spot is the rig's (`agent-mail/handoffs/stage2/later1087-rig-spot-coreA.md`, from a census of the port's maps):
 * MP6's ground-floor bar, its table tops single upward faces (`good/matdi`, WOOD_THICK, penetration 0) with nothing
 * beneath. A: an M67 on the floor 2 m west of table2 -- the lines to the bottles rise through the table top from below:
 * one-sided they pass. B: outside the bar's south wall, met from the front -- blocked either way. C: open -- passes either
 * way. The bottles are scored (their box midpoints 1.6-2.1 u over the top, a robust crossing); the flat items are not.
 */

type V3 = [number, number, number];
const DISC = process.env.SOCOM_DISC;

describe.skipIf(!DISC)('LATER 1087 (b): the scene blast line is one-sided -- MP6\'s bar (dev-disc)', () => {
  it('A from behind the table top: the bottles reached; B behind the south wall: none; C open: reached', async () => {
    const s = await roomOn(DISC!, 'MP6');
    const grid = s.map.grid, def = s.map.defaultMaterial ?? '';
    // the room's scene health, read structurally (its `midpoint` is private to `SceneHealth`: the line's end, FUN_003c7ee0's box midpoint)
    type Destructible = { id: number; targetPath: string; anim: string };
    const world = (s.room as unknown as { world: { health: { list: Destructible[]; midpoint(id: number): V3 | null } } }).world;
    const pen = (p: WorldPoly): number => surfaceMaterial(p.material, def).penetration;
    const item = (name: string) => {
      const d = world.health.list.find((x) => x.targetPath.includes(`/${name}/`) || x.targetPath.endsWith(`/${name}`) || x.anim === name);
      expect(d, name).toBeDefined();
      return { d: d!, mid: world.health.midpoint(d!.id)! };
    };
    const at = (x: number, z: number): V3 => {
      const floor = surfacesOver(s.map.ground, x, z).reduce((b, y) => (Math.abs(y) < Math.abs(b) ? y : b), Infinity);
      return blastPoint([x, floor + 1, z]) as V3;
    };
    const reaches = (from: V3, name: string): boolean => {
      const { d, mid } = item(name);
      return blastLine(grid, from, mid, d.targetPath, M67.explosionRadius, pen);
    };
    const A = at(1168.9, 1638.8), B = at(1182, 1599.4), C = at(1228.9, 1638.8);
    for (const b of ['beer9', 'beer7']) expect(reaches(A, b), `A -> ${b}: up through the table top from below`).toBe(true);
    for (const b of ['beer9', 'beer7', 'tincup6']) expect(reaches(B, b), `B -> ${b}: the south wall from its front`).toBe(false);
    for (const b of ['beer9', 'tincup6']) expect(reaches(C, b), `C -> ${b}: open`).toBe(true);
  }, 120_000);
});

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

/**
 * USED_SWITCH_PROMPT_ADAPTATION (the owner, 2026-11-08): a Forge switch used this round offers no prompt -- the disc's
 * own hide themselves (research 171 s4); a repeatable one (a toggle) always does.
 */
const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))("a used switch's prompt (SOCOM_ISO)", () => {
  it('aimed at its plate: offered, gone once used (once a round, as the disc\'s)', async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { accessTemplates, leverLook, withPlacedAccess } = await import('../../src/forge/placedAccess');
    const { WorldState } = await import('../../src/worldState');
    const { ActionPage } = await import('../../src/actionPage');
    const { groundGrid, groundPolygons } = await import('../../src/mover');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const [mp72, mp11] = [await loadMap(source, 'RUN/MP72.ZDB'), await loadMap(source, 'RUN/MP11.ZDB')];
    const gate = accessTemplates(mp11, 'MP11').find((x) => x.kind === 'gate')!;
    const steps = [{ do: 'message' as const, text: 'HI' }];
    const { map } = withPlacedAccess(mp72, [], () => null, [
      { script: { steps }, at: [1000, 100, 1800], yaw: 0 },
      { script: { steps }, at: [1000, 100, 1900], yaw: 0 },
    ], () => leverLook(gate.gate!.switches[0]!, gate.lib));
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!));
    world.applyInitial();
    const polys = groundPolygons(map.ground!);
    const aimAt = (name: string) => {
      const plate = polys.find((q) => q.path === `worldmodel/${name}/panel_di`)!;
      const c = [0, 1, 2].map((k) => { let t = 0; for (let i = k; i < plate.points.length; i += 3) t += plate.points[i]!; return t / (plate.points.length / 3); });
      // From 8 units off the plate along each horizontal axis, whichever side the ray meets it from.
      for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8]] as const) {
        const eye = [c[0]! + dx, c[1]!, c[2]! + dz], far = [c[0]! - dx, c[1]!, c[2]! - dz];
        const page = new ActionPage({ world: () => world, feet: () => [eye[0]!, c[1]! - 5, eye[2]!], aim: () => ({ eye, far }), net: () => null });
        if (page.target()) return page;
      }
      return null;
    };
    const one = aimAt('forge_switch_1')!, two = aimAt('forge_switch_2')!;
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    const idx = (n: string) => map.meta!.actions.findIndex((a) => a.node === n);
    world.markUsed(idx('forge_switch_1'));
    expect(one.target()).toBeNull();                                   // used: no prompt
    expect(two.target()).not.toBeNull();                               // not used: offered
  }, 240_000);
});

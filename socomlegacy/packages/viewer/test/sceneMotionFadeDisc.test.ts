// @vitest-environment node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../src/loadMap';
import { groundGrid } from '../src/mover';
import { buildWorld } from '../src/world';
import { WorldState } from '../src/worldState';

/**
 * V13-3c's review F1 (`SCENE_NODE_MOTION_PLACEHOLDER`, research 386 §3.5): the fade stands in for a FLIGHT only -- a motion
 * with a launch (`@s2u/scene` `MOTION`: FIXED_LAUNCH 0x8, RANDOM_LAUNCH 0x10, CALLER_VELOCITY 0x800, the flags
 * `effectMotion.ts`'s tick moves the node by) -- never a spin or a rotation in place. On MP6 (Desert Glory, the dev disc
 * through `loadMap`) the gas tank's death (`truck_stop_gas_hit`) calls `truck_stop_hitme`, whose `truck_rotate_parts`
 * only turns `body_truck`, `bucket_truck`, `window_right` and `window_left` (flags 259 / 291: lifetime and angular, no
 * launch, no off): in the original the truck tips and stays, so on the page it stays drawn. Skipped without the disc.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE = DISC !== '' && existsSync(join(DISC, 'RUN', 'MP6.ZDB'));

describe(`the motion fade: a flight only, never a spin (V13-3c review F1)${HAVE ? '' : ' (skipped: MP6 on the disc absent)'}`, () => {
  it.skipIf(!HAVE)("MP6: the gas tank's death turns the truck's parts in place -- all four stay drawn 3 s on, none faded", async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP6.ZDB');
    const view = buildWorld(map);
    for (const task of [...view.revealWorld, ...view.revealProps]) task();
    const off: { path: string; reached: number }[] = [];
    const faded = new Set<string>();
    const page = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!), {
      visible: (path, on) => { if (!on) off.push({ path, reached: view.setNodeActive(path, on) }); else view.setNodeActive(path, on); },
      opacity: (path, f) => { if (f < 1) faded.add(path); },
    });
    page.applyInitial();
    const d = map.meta!.scene!.destructibles.find((x) => x.anim === 'truck_stop_gas_hit')!;
    expect(d, 'truck_stop_gas_hit').toBeDefined();
    const parts = ['body_truck', 'bucket_truck', 'window_right', 'window_left'].map((n) => {
      const found = map.meta!.instances.filter((i) => i.node === n);
      expect(found.length, n).toBeGreaterThan(0);
      return found[0]!.path;
    });
    expect(view.setNodeActive(parts[0]!, true)).toBeGreaterThan(0);        // body_truck is drawn
    expect(page.takeDeath(d.id, false)).toBe(true);
    for (let k = 0; k < 3 * 60; k++) page.step(1 / 60);
    for (const p of parts) {
      expect(page.drawn(p), `${p} drawn`).toBe(true);
      expect([...faded].some((f) => p.startsWith(f) || f.startsWith(p)), `${p} faded`).toBe(false);
      expect(off.some((o) => p.startsWith(o.path) || o.path.startsWith(p)), `${p} hidden`).toBe(false);
    }
  }, 120_000);
});

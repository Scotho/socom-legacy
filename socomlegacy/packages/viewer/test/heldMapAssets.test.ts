import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../src/loadMap';

/**
 * Two maps' assets that the disc does not hold whole, read as the original reads them. Ported from Chris's
 * browser-beta-v5 (`chris/browser-beta-integration` d578f347: `packages/viewer/test/heldMapAssets.test.ts`), with his
 * Vigilance wording replaced: the substitution is the engine's own, not a fallback (web research 82 section D5 and
 * round 4). Names only. Reads `SOCOM_DISC`; skips without it.
 */

const DISC = process.env.SOCOM_DISC;
const has = (stem: string): boolean => !!DISC && existsSync(resolve(DISC, `RUN/${stem}.ZDB`));
const HAVE = has('MP51') && has('MP81');

describe.skipIf(!HAVE)(`held-map assets off the disc${HAVE ? '' : ' (SOCOM_DISC with RUN/MP51.ZDB and RUN/MP81.ZDB absent)'}`, () => {
  it('Vigilance: cloud_scroll.tif is in no library, and its reflection entry draws specular_map.tif as the engine does', async () => {
    const map = await loadMap(new FsAssetSource(DISC as string), 'RUN/MP51.ZDB');
    expect(map.textures['cloud_scroll.tif']).toBeUndefined();
    expect(map.textures['specular_map.tif']).toBeDefined();
    // FUN_003bb2c0 resolves a textured palette entry's name or takes DAT_004b4d90, the loaded `specular_map` texture,
    // which the env pass FUN_003b5f20 draws (research 82 round 4): the original's substitution, so no fallback note.
    expect(map.envMaterials?.find((e) => e.index === 5)?.texture).toBe('specular_map.tif');
    expect(map.diagnostics.some((n) => /cloud_scroll\.tif: in none of the map's \d+ asset libs/.test(n))).toBe(true);
    expect(map.diagnostics.some((n) => /fallback/i.test(n))).toBe(false);
  }, 60_000);

  it('Chain Reaction: both drydock doors read their swings; the absent kick clips are named as the kick, not run', async () => {
    const map = await loadMap(new FsAssetSource(DISC as string), 'RUN/MP81.ZDB');
    expect(map.doors?.map((d) => d.node)).toEqual(['door_drydock21', 'door_drydock22']);
    expect(map.doors?.map((d) => d.programs[0]?.name)).toEqual(['singleDoor_right', 'singleDoor_left']);
    for (const [node, clip, swing] of [
      ['door_drydock21', 'kick_Door_right', 'singleDoor_right'], ['door_drydock22', 'kick_Door_left', 'singleDoor_left'],
    ] as const) {
      expect(map.diagnostics).toContain(
        `doors: ${node}: kick animation ${clip} not in MZANIM.ZAR; the swing ${swing} is read (the record holds one animation, as the game loads it: research 92 section 6)`,
      );
    }
  }, 60_000);
});

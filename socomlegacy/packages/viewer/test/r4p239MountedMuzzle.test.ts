import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readWeapon } from '@s2u/scene';
import { MOUNTED_MUZZLE_FLASH_READING, muzzleCarrier } from '../src/effectRules';

/**
 * R4P-239 (PROVEN on r0004 by the capture Q-239, a PKM on MP73; atlas-parity on agent/spc-atlas): a gun mounted on a type-3
 * entity draws NO muzzle flash. r0004 always clears the fire point for such a gun and plays the clip in its no-point form
 * (D4:L521540-521565); why that form draws nothing stays `MOUNTED_MUZZLE_FLASH_READING`. In the port the muzzle animation
 * plays only at the node a round's caller hands `Effects.onRound` (`effects.ts` `playRound`): a mounted round hands none,
 * so its flash cannot draw while its tracer and impact (placed by the round's own points) still play.
 */

describe('R4P-239: a mounted gun hands the muzzle animation no node', () => {
  it('muzzleCarrier: mounted, none; not mounted, the carrier as given', () => {
    const node = { node: 'gun', muzzle: [0, 0, 0] };
    expect(muzzleCarrier(true, node)).toBeNull();
    expect(muzzleCarrier(true, null)).toBeNull();
    expect(muzzleCarrier(false, node)).toBe(node);
    expect(muzzleCarrier(false, null)).toBeNull();
    expect(MOUNTED_MUZZLE_FLASH_READING).toBe('no flash drawn');
  });

  it('both mounted round paths in matchFirearm.ts go through muzzleCarrier (the local turret round and a remote mounted body)', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../src/matchFirearm.ts'), 'utf8');
    expect(src, 'the local turret round').toMatch(/effects\.onRound\(e, muzzleCarrier\(true, frame \?/);
    expect(src, 'a remote mounted body').toMatch(/effects\.onRound\(e, muzzleCarrier\(mounted !== null, mounted \?/);
    expect(src).not.toMatch(/effects\.onRound\(e, frame \?/);
    expect(src).not.toMatch(/effects\.onRound\(e, mounted \?/);
  });
});

const web = resolve(import.meta.dirname, '../../..');
const ZWEAPON = [resolve(web, 'test-fixtures/RUN/ZWEAPON.ZAR'), resolve(web, 'public/maps/RUN/ZWEAPON.ZAR'),
  ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, 'RUN/ZWEAPON.ZAR')] : [])]
  .find((p) => existsSync(p));

describe.skipIf(!ZWEAPON)('R4P-239 dev-disc: the turret guns name a muzzle animation, so the change is not vacuous', () => {
  it('PKM TURRET and LMG TURRET carry a FireAnimName (the flash the port drew before, at the turret firepoint)', () => {
    const bytes = new Uint8Array(readFileSync(ZWEAPON as string));
    for (const name of ['PKM TURRET', 'LMG TURRET']) expect(readWeapon(bytes, name).fireAnim, name).not.toBeNull();
  });
});

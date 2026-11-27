import { describe, expect, it } from 'vitest';
import type { Material } from '@s2u/sound';
import { defaultMaterialIndex } from '../src/soundData';
import { surfaceMaterial } from '@s2u/scene';

/**
 * A map's `DefaultMaterial` name to its SOILS index, matched case-SENSITIVELY as the game's soil lookup does
 * (r0001 `FUN_002de9e0` D:L181709-181726; r0004 `FUN_002fb9d0`): a name no entry spells exactly is 0, `UNKNOWN`,
 * whose step/crawl/land handles are null and play nothing (`FUN_005a39b0` D:L460419). Shadow Falls (MP64) writes
 * `stone`, so its byte-0 floors are silent on the console (ATLAS L202; reading, pending review).
 */
const mats = ['UNKNOWN', 'GRASS', 'STONE', 'SAND'].map((name) => ({ name }) as unknown as Material);

describe('defaultMaterialIndex: the SOILS name matched exactly (FUN_002de9e0)', () => {
  it('an exact name gives its index', () => {
    expect(defaultMaterialIndex(mats, 'STONE')).toBe(2);
    expect(defaultMaterialIndex(mats, 'GRASS')).toBe(1);
  });
  it('MP64\'s lower-case "stone" matches no entry: 0, UNKNOWN (silent)', () => {
    expect(defaultMaterialIndex(mats, 'stone')).toBe(0);
    expect(defaultMaterialIndex(mats, 'Grass')).toBe(0);
  });
  it('MP11\'s "none", and UNKNOWN itself, give 0', () => {
    expect(defaultMaterialIndex(mats, 'none')).toBe(0);
    expect(defaultMaterialIndex(mats, 'UNKNOWN')).toBe(0);
  });
});

describe("one rule in one place: the footsteps and the projectiles read byte 0 the same way (the read's F2)", () => {
  it("MP64 'stone' is UNKNOWN for both; MP12 'STONE' is STONE for both", () => {
    const table = [{ name: 'UNKNOWN' }, { name: 'PARTICLE_SYSTEM' }, { name: 'STONE' }] as never;
    const mats = [{ name: 'UNKNOWN' }, { name: 'PARTICLE_SYSTEM' }, { name: 'STONE' }] as unknown as Material[];
    expect(defaultMaterialIndex(mats, 'stone')).toBe(0);
    expect(surfaceMaterial(0, 'stone', table).name).toBe('UNKNOWN');
    expect(defaultMaterialIndex(mats, 'STONE')).toBe(2);
    expect(surfaceMaterial(0, 'STONE', table).name).toBe('STONE');
  });
});

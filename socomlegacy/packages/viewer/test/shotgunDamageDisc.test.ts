import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWeapon } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { applyHit, freshHealth, PART, pelletDamage } from '../src/net/damage';

// Disc reading: ZWEAPON.ZAR / 12 Gauge and its three weapons; research 94 C2.1.
// Fixture bytes take precedence, as in scene/test/weaponTable.parity.test.ts; no private data is committed.
const paths = [
  ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, 'RUN/ZWEAPON.ZAR'), resolve(process.env.SOCOM_DISC, 'ZWEAPON.ZAR')] : []),
  ...(process.env.SOCOM_PC_ROOT ? [resolve(process.env.SOCOM_PC_ROOT, 'game/disc/RUN/ZWEAPON.ZAR')] : []),
];
const path = paths.find(existsSync);
const bytes = fixture('RUN/ZWEAPON.ZAR') ?? (path ? new Uint8Array(readFileSync(path)) : null);

describe.skipIf(!bytes)('all three shotguns use the disc ammo damage online', () => {
  it.each(['870', 'Spas 12', 'JACKHAMMER'])('%s preserves 2.5 per pellet and the four-head-pellet kill threshold', (name) => {
    const weapon = readWeapon(bytes!, name);
    expect([weapon.impactDamage, weapon.piercing, weapon.pellets]).toEqual([2.5, 6, 4]);
    for (const distance of [50, 200, 600]) expect(pelletDamage(weapon, distance)).toBe(2.5);
    expect(pelletDamage(weapon, weapon.maximumRange * 10)).toBeNull();
    const h = freshHealth();
    for (let i = 0; i < 3; i++) expect(applyHit(h, PART.HEAD, pelletDamage(weapon, 50)!, weapon.piercing)).toBe(false);
    expect(h.hp[PART.HEAD]).toBe(0.5);
    expect(applyHit(h, PART.HEAD, pelletDamage(weapon, 50)!, weapon.piercing)).toBe(true);
  });
});

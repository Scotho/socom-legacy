import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as emplacement from '../../viewer/src/net/emplacement';

/**
 * The online parity sweep's AR-6 (P15; product track, no behaviour change): `TURRET_RETICLE_STANCE_READING` -- the stance
 * row the turret record's cone runs at while mounted (research 215 s8.2, the ledger's row in research 101; capture B 13
 * owed) -- is one name in the headless `net/emplacement.ts`, imported by the page (`matchFirearm.ts`, which imports
 * three.js and so cannot be the room's source) and by the room (`room.ts`, the cone's `coneStance`). Was: the page held
 * the constant and the room re-typed its value as a literal `'stand'`, so a reading moved on the page would leave the
 * room's copy behind.
 */
const src = (rel: string): string => readFileSync(resolve(import.meta.dirname, rel), 'utf8');

describe('AR-6 (P15): the turret stance row is one name, in the headless emplacement module', () => {
  it('net/emplacement.ts exports TURRET_RETICLE_STANCE_READING (the reading: stand)', () => {
    expect((emplacement as Record<string, unknown>).TURRET_RETICLE_STANCE_READING).toBe('stand');
  });

  it("room.ts gives the cone's coneStance that name, imported from net/emplacement -- no stance literal", () => {
    const room = src('../src/room.ts');
    expect(room).not.toMatch(/coneStance:\s*['"`](?:stand|crouch|prone)['"`]/);
    expect(room).toMatch(/coneStance:\s*TURRET_RETICLE_STANCE_READING\b/);
    expect(room).toMatch(/import\s*\{[^}]*\bTURRET_RETICLE_STANCE_READING\b[^}]*\}\s*from\s*'\.\.\/\.\.\/viewer\/src\/net\/emplacement'/);
  });

  it('matchFirearm.ts no longer defines the constant: it imports the one in net/emplacement', () => {
    const page = src('../../viewer/src/matchFirearm.ts');
    expect(page).not.toMatch(/export const TURRET_RETICLE_STANCE_READING\b/);
    expect(page).toMatch(/import\s*\{[^}]*\bTURRET_RETICLE_STANCE_READING\b[^}]*\}\s*from\s*'\.\/net\/emplacement'/);
  });
});

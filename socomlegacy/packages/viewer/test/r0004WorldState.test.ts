// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * R4B-09 (G1, research 383; fresh review 1's F1): r0004's switch-offs survive the world's opening state. The room
 * (`match/src/room.ts`), the page (`main.ts`) and `matchWorld.ts` build a `WorldState` over the hull and call
 * `applyInitial()`; its `sync` sets each owner's `m_active` from the map's zAnim references. A node r0004 switched off
 * at load (node vtable +0x38, r4 0x1ec450) -- and everything under it (`FUN_002d3030` D:L175073-175074) -- stays off
 * through `applyInitial()` and `reset()`, as `collisionOwners` built it.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN') : '';
const MP72 = fixture('RUN/MP72.ZDB');
const read = (stem: string): Uint8Array | null =>
  stem === 'MP72' && MP72 ? MP72 : DISC && existsSync(resolve(DISC, `${stem}.ZDB`)) ? new Uint8Array(readFileSync(resolve(DISC, `${stem}.ZDB`))) : null;

const CASES = [
  { stem: 'MP72', paths: /^worldmodel\/basket_open_up(=basket_open_up)?$/, off: 2 },
  { stem: 'MP71', paths: /^worldmodel\/b1\//, off: 4 },
  { stem: 'MP73', paths: /^worldmodel\/(comm_low|mywc20|wall_breaker\/good)\/room_chair01/, off: 12 },
] as const;

for (const c of CASES) {
  const bytes = read(c.stem);
  describe.skipIf(!bytes)(`R4B-09: ${c.stem}'s switch-offs through WorldState${bytes ? '' : ` (${c.stem === 'MP72' ? FIXTURES_ABSENT : 'SOCOM_DISC absent: skipped'})`}`, () => {
    it('stay off after applyInitial() and after reset()', () => {
      const map = simMapFromBytes(bytes!, `RUN/${c.stem}.ZDB`);
      const off = () => map.ground.owners.filter((o) => (o.flags! & 1) === 0).map((o) => o.path);
      const before = off();
      expect(before.filter((p) => c.paths.test(p))).toHaveLength(c.off);
      const w = new WorldState(map.meta!, map.ground, map.grid);
      w.skipEffects = true;
      w.applyInitial();
      expect(off().filter((p) => c.paths.test(p))).toHaveLength(c.off);
      w.reset();
      expect(off().filter((p) => c.paths.test(p))).toHaveLength(c.off);
    });
  });
}

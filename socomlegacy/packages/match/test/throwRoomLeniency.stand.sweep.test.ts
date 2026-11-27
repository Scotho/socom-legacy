import { describe, it } from 'vitest';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { crossLatches, judge, MP6_ZDB, sweepFlat, sweepLegs } from './throwRoomLeniencySweep';

// LANE-KILL B-06, the controller's conditions on the pitch floor (2026-11-21; THROW_AIM_FLOOR_ADAPTATION): stand. The
// grid, the legs and the verdict are `./throwRoomLeniencySweep`'s.
describe('LANE-KILL B-06: every throw the page lets go, stand, over the whole pitch range, is taken by the room', () => {
  it("stand: the synthetic grid's page-cleared throws are all taken", () => { const started = Date.now(); judge('stand flat', 'stand', sweepFlat('stand'), started); }, 3_600_000);
  it.skipIf(!MP6_ZDB)(`stand: the capture's legs on MP6, every pitch, all taken${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const started = Date.now();
    judge('stand legs', 'stand', await sweepLegs('stand'), started);
  }, 3_600_000);
  // The cross-latch cases (research 256 s5.4): thrown standing, the M67 selected crouched or prone.
  it("stand, selected crouched or prone: the synthetic grid's page-cleared throws are all taken", () => { const started = Date.now(); judge('stand flat cross', 'stand', sweepFlat('stand', crossLatches('stand')), started, false); }, 3_600_000);
  it.skipIf(!MP6_ZDB)(`stand, selected crouched or prone: the capture's legs on MP6, all taken${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const started = Date.now();
    judge('stand legs cross', 'stand', await sweepLegs('stand', crossLatches('stand')), started, false);
  }, 3_600_000);
});

import { describe, expect, it } from 'vitest';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { crossLatches, forgedThinWall, judge, MP6_ZDB, sweepFlat, sweepLegs } from './throwRoomLeniencySweep';

// LANE-KILL B-06, the controller's conditions on the pitch floor (2026-11-21; THROW_AIM_FLOOR_ADAPTATION): crouch. The
// grid, the legs and the verdict are `./throwRoomLeniencySweep`'s.
describe('LANE-KILL B-06: every throw the page lets go, crouch, over the whole pitch range, is taken by the room', () => {
  it('crouch: a forged full-power level throw through a thin wall (the delta review of 7bf7ac69cf, F1) is still refused', () => {
    expect(forgedThinWall('crouch')).toEqual([]);
  }, 120_000);
  it("crouch: the synthetic grid's page-cleared throws are all taken", () => { const started = Date.now(); judge('crouch flat', 'crouch', sweepFlat('crouch'), started); }, 3_600_000);
  it.skipIf(!MP6_ZDB)(`crouch: the capture's legs on MP6, every pitch, all taken${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const started = Date.now();
    judge('crouch legs', 'crouch', await sweepLegs('crouch'), started);
  }, 3_600_000);
  // The cross-latch cases (research 256 s5.4): thrown crouched, the M67 selected standing or prone.
  it("crouch, selected standing or prone: the synthetic grid's page-cleared throws are all taken", () => { const started = Date.now(); judge('crouch flat cross', 'crouch', sweepFlat('crouch', crossLatches('crouch')), started, false); }, 3_600_000);
  it.skipIf(!MP6_ZDB)(`crouch, selected standing or prone: the capture's legs on MP6, all taken${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const started = Date.now();
    judge('crouch legs cross', 'crouch', await sweepLegs('crouch', crossLatches('crouch')), started, false);
  }, 3_600_000);
});

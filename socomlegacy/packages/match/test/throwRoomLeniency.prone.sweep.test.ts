import { describe, expect, it } from 'vitest';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { crossLatches, forgedThinWall, judge, MP6_ZDB, sweepFlat, sweepLegs } from './throwRoomLeniencySweep';

// LANE-KILL B-06, the controller's conditions on the pitch floor (2026-11-21; THROW_AIM_FLOOR_ADAPTATION): prone. The
// grid, the legs and the verdict are `./throwRoomLeniencySweep`'s.
describe('LANE-KILL B-06: every throw the page lets go, prone, over the whole pitch range, is taken by the room', () => {
  it('prone: a forged full-power level throw through a thin wall (the delta review of 7bf7ac69cf, F1) is still refused', () => {
    expect(forgedThinWall('prone')).toEqual([]);
  }, 120_000);
  it("prone: the synthetic grid's page-cleared throws are all taken", () => { const started = Date.now(); judge('prone flat', 'prone', sweepFlat('prone'), started); }, 3_600_000);
  it.skipIf(!MP6_ZDB)(`prone: the capture's legs on MP6, every pitch, all taken${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const started = Date.now();
    judge('prone legs', 'prone', await sweepLegs('prone'), started);
  }, 3_600_000);
  // The cross-latch cases (research 256 s5.4): thrown prone, the M67 selected standing or crouched.
  it("prone, selected standing or crouched: the synthetic grid's page-cleared throws are all taken", () => { const started = Date.now(); judge('prone flat cross', 'prone', sweepFlat('prone', crossLatches('prone')), started, false); }, 3_600_000);
  it.skipIf(!MP6_ZDB)(`prone, selected standing or crouched: the capture's legs on MP6, all taken${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    const started = Date.now();
    judge('prone legs cross', 'prone', await sweepLegs('prone', crossLatches('prone')), started, false);
  }, 3_600_000);
});

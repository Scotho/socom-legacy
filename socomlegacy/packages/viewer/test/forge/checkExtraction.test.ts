import { describe, expect, it } from 'vitest';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { floorGround } from '../../src/forge/ground';
import { checkMap } from '../../src/forge/validate';

/**
 * Check map on an Extraction layout (a browser adaptation, FG.R2): at least one hostage and one extraction zone, the
 * base map's own (its escortees, its kind-1 zones) or placed, each one missing said.
 */
const layoutWith = (extra: Partial<Layout>): Layout => ({ ...emptyLayout({ kind: 'blank', library: 'floor' }), objectives: { gameType: 4 }, ...extra });
const issues = (l: Layout, base = { hostages: 0, zones: 0 }) => checkMap(l, floorGround(2000), [], undefined, undefined, base).issues
  .filter((i) => i.kind === 'extraction-missing').map((i) => i.text);

describe('checkMap: Extraction', () => {
  it('names a missing hostage and a missing extraction zone', () => {
    expect(issues(layoutWith({}))).toEqual([
      'Extraction has no hostage: place one with the Hostage tool.',
      'Extraction has no extraction zone: place one with the Zone tool.',
    ]);
  });

  it('Escort: three hostages, and a zone named Safety, the base\'s or placed', () => {
    const escort = (extra: Partial<Layout>, base = { hostages: 0, zones: 0, safety: false }) => checkMap({ ...layoutWith(extra), objectives: { gameType: 3 } }, floorGround(2000), [], undefined, undefined, base).issues
      .filter((i) => i.kind === 'escort-missing').map((i) => i.text);
    expect(escort({})).toEqual([
      'Escort needs three hostages (the VIPs): it has 0. Place them with the Hostage tool.',
      'Escort has no Safety zone: place one with the Zone tool.',
    ]);
    const h = { p: [0, 0, 0] as [number, number, number], yaw: 0 };
    expect(escort({ hostages: [h, h, h], extractionZones: [{ name: 'Safety', at: [0, 0, 0], size: [10, 10] }] })).toEqual([]);
    expect(escort({ hostages: [h] }, { hostages: 2, zones: 1, safety: true })).toEqual([]);
  });

  it('a placed one, or the base map\'s own, counts; another game type is not checked', () => {
    expect(issues(layoutWith({ hostages: [{ p: [0, 0, 0], yaw: 0 }], extractionZones: [{ name: 'Safety', at: [0, 0, 0], size: [10, 10] }] }))).toEqual([]);
    expect(issues(layoutWith({}), { hostages: 2, zones: 1 })).toEqual([]);
    expect(issues({ ...layoutWith({}), objectives: { gameType: 5 } })).toEqual([]);
  });
});

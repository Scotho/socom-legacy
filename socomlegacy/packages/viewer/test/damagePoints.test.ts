import { describe, expect, it } from 'vitest';
import { applyHit, freshHealth, overall, PART, quantiseHit, type Health } from '../src/net/damage';
import { damagePoints, DAMAGE_LIFE_POINTS_ADAPTATION } from '../src/net/damagePoints';

/**
 * Intake item 2, option (C) (merged on the owner's pick (INTAKE 144, as the main controller read it)): the damage report's DMG for one
 * applied hit -- the fall of the victim's HUD bar (`overall()`, `FUN_005a56d0` D:L461416-461437) x a life's 100, and at a
 * kill the bar that was left. PRODUCT TRACK (`DAMAGE_REPORT_ADAPTATION`). The figures are the worked test's
 * (`match/test/damageReportUnitsWorked.test.ts` on agent/wm-data-dmg b3dea736d8, its column (C)).
 */

const hit = (h: Health, part: number, raw: number, piercing: number): number => {
  const before = [...h.hp];
  const q = quantiseHit(raw, piercing);
  applyHit(h, part, q.damage, q.piercing);
  return damagePoints(before, h.hp);
};

describe('damagePoints (C): the HUD bar\'s fall x 100, a kill takes the bar that was left', () => {
  it('a life is 100', () => expect(DAMAGE_LIFE_POINTS_ADAPTATION).toBe(100));

  it('one head shot from full is a kill: 100 (the bar fell only 12.4; the top-up gives the rest)', () => {
    expect(hit(freshHealth(), PART.HEAD, 36.4, 3)).toBeCloseTo(100, 9);
  });

  it('an M4A1 body hit from full: 32.4 (the body\'s 18.5 and the four limbs\' caps, by the bar\'s weights)', () => {
    expect(hit(freshHealth(), PART.BODY, 36.4, 3)).toBeCloseTo(62.9 / 194 * 100, 6);
  });

  it('an M4A1 leg hit from full: 9.5 (18.5 of the bar\'s 194)', () => {
    expect(hit(freshHealth(), PART.RLEG, 36.4, 3)).toBeCloseTo(18.5 / 194 * 100, 6);
  });

  it('a body kill from full, hit by hit, sums to exactly 100', () => {
    const h = freshHealth();
    let sum = 0;
    for (let i = 0; i < 3; i++) sum += hit(h, PART.BODY, 36.4, 3);
    expect(h.hp[PART.BODY]).toBe(0);
    expect(sum).toBeCloseTo(100, 9);
  });

  it('a leg, then the body until dead: still exactly 100 for the life', () => {
    const h = freshHealth();
    let sum = hit(h, PART.RLEG, 36.4, 3);
    for (let i = 0; i < 3; i++) sum += hit(h, PART.BODY, 36.4, 3);
    expect(sum).toBeCloseTo(100, 9);
  });

  it('a wound reads the bar\'s own fall: equal to overall() before less after, x 100 (FUN_005a56d0)', () => {
    const h = freshHealth(), before = [...h.hp];
    h.hp[PART.HEAD] = 5; h.hp[PART.LARM] = 12.5;
    expect(damagePoints(before, h.hp)).toBeCloseTo((overall({ hp: before, armour: [] }) - overall(h)) * 100, 12);
  });

  it('two equal wounds read exactly equal (the fall taken on the weighted sums)', () => {
    const h = freshHealth();
    const b0 = [...h.hp]; h.hp[PART.RARM] = 27; const b1 = [...h.hp]; h.hp[PART.RARM] = 24;
    expect(damagePoints(b0, b1)).toBe(damagePoints(b1, h.hp));
  });

  it('nothing taken is 0', () => {
    const h = freshHealth();
    expect(damagePoints([...h.hp], h.hp)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, EMPTY_ITEM, ITEM, itemClass, type Loadout } from '@s2u/scene';
import { scopeLens, thermalFitted, thermalLensFitted, THERMAL_LENS, viewLens } from '../src/sights';
import { BINOCULARS, Zoom } from '../src/zoom';

/**
 * R4P-110: the thermal lens shows only with a sniper rifle in hand. PROVEN on r0004 by the capture record Q110-PC2
 * (4/4; agent/spc-atlas fb3d463de1, its weapons register "Q-110"): kit 102, 15, 195, 126, 151, Enable_ThermScope = 1,
 * posture 1; the M40A1 scoped draws the thermal view at view 0x0105 / magnification 6.0 and 0x0506 / 12.0, the Mark 23
 * zoomed to the binoculars (0x0104 / 9.0) the normal view (screenshots told apart by the centre colour; no memory
 * word for "thermal on" exists, so the test asserts the lens the page draws).
 *
 * The mechanism (a reading of r0004, the specification, pending review -- research 94 section C7): the lens function
 * (0x1f0750, states 5-12) asks the gate 0x547e50 at 0x1f0e90 with no entity; with none, the gate answers 1 only when the
 * kit holds item 195 (0x5cfe00(kit, 0xc3), 0x547e70) AND the class of the item at the kit's hand slot is 0x65, the
 * sniper rifles 101-120 (0x5cf750, 0x547e80-0x547e90: the hand slot `kit+0x824`, written by the weapon switch 0x5cc314;
 * an empty slot answers 0xfe). r0001 differs: its gate `FUN_005433c0` (0x5433d8-0x5433ec) is the kit alone. The capture
 * holds under both readings; IQ-118 (a picked-up M4A1 scoped, 195 in the kit; r0004 predicts the normal lens) settles
 * the split. The zoom records below are synthetic: `DEFAULT_RIFLE` with mode lists of the M40A1's, the Mark 23's and the
 * M4A1's shapes (the walk over such lists is pinned by `sights.test.ts`; the Mark 23's own record is not re-read here).
 */

const kit = (...ids: number[]): Loadout => {
  const l = [...ids];
  while (l.length < 5) l.push(EMPTY_ITEM);
  return l as unknown as Loadout;
};

/** The capture's kit (Q110-PC2): the M40A1, the Mark 23, the thermal scope, an HE grenade, C4. */
const Q110_KIT = kit(102, 15, ITEM.THERMAL, 126, ITEM.C4);
const M40A1 = { ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] };
const MARK23 = { ...DEFAULT_RIFLE, zoomModes: [1.5] };
const M4A1 = { ...DEFAULT_RIFLE, zoomModes: [1.5, 2.5] };

describe('R4P-110: the thermal lens needs 195 in the kit and a sniper in the hand slot (r0004 0x547e50)', () => {
  it('the capture\'s kit: the M40A1 in hand at 6.0 and 12.0 draws the thermal lens, the Mark 23 at the binoculars none', () => {
    expect([itemClass(102), itemClass(15)]).toEqual(['sniper', 'pistol']);
    const rifle = new Zoom(M40A1), thermal = thermalLensFitted(Q110_KIT, 102);
    const seen: [number, number, ReturnType<typeof viewLens>][] = [];
    for (let i = 0; i < 3; i++) { const s = rifle.zoomIn(); seen.push([s, rifle.target(), viewLens(s, thermal, false, true)]); }
    expect(seen).toEqual([[1, 1.01, null], [5, 6, THERMAL_LENS], [6, 12, THERMAL_LENS]]);
    const pistol = new Zoom(MARK23), pistolThermal = thermalLensFitted(Q110_KIT, 15);
    pistol.zoomIn();
    const s = pistol.zoomIn();
    expect([s, pistol.target(), viewLens(s, pistolThermal, false, true)]).toEqual([BINOCULARS, 9, null]);
  });

  it('an M4A1 (54, class rifle) in the hand slot with 195 in the kit: a scope state draws the plain lens', () => {
    expect(itemClass(54)).toBe('rifle');
    const z = new Zoom(M4A1);
    z.zoomIn();
    const s = z.zoomIn();
    expect(s).toBe(5);
    const thermal = thermalLensFitted(kit(54, 15, ITEM.THERMAL, 126, ITEM.C4), 54);
    expect(thermal).toBe(false);
    expect([viewLens(s, thermal, false), viewLens(s, thermal, true)]).toEqual(['to_scope_lens_fx', 'to_starlight_scope_lens_fx']);
    // the kit-only reading (r0001's) would draw the thermal lens here
    expect(thermalFitted(kit(54, 15, ITEM.THERMAL, 126, ITEM.C4))).toBe(true);
  });

  it('without 195 the M40A1\'s scope draws the plain lens (the starlight one at night)', () => {
    const plain = thermalLensFitted(kit(102, 15, 126, 126, ITEM.C4), 102);
    expect(plain).toBe(false);
    expect([viewLens(5, plain, false), viewLens(6, plain, false), viewLens(5, plain, true)])
      .toEqual(['to_scope_lens_fx', 'to_scope_lens_fx', 'to_starlight_scope_lens_fx']);
  });

  it('the hand slot empty (0xfe, no class): no thermal, whatever the kit holds', () => {
    expect([thermalLensFitted(Q110_KIT, null), thermalLensFitted(Q110_KIT, EMPTY_ITEM)]).toEqual([false, false]);
    expect(viewLens(5, thermalLensFitted(Q110_KIT, null), false)).toBe('to_scope_lens_fx');
  });

  it('every sniper id 101-120 in the hand passes, its neighbours 100 and 121 do not (the class table 0x3f3cb0)', () => {
    const ids = [100, 101, 110, 120, 121];
    expect(ids.map((id) => thermalLensFitted(Q110_KIT, id))).toEqual([false, true, true, true, false]);
  });

  it('the thermal turret\'s view state 2 is unchanged: its lens whatever the kit or the hand', () => {
    expect([viewLens(2, false, false), viewLens(2, true, true), viewLens(2, false, false, false)])
      .toEqual([THERMAL_LENS, THERMAL_LENS, null]);
    expect([5, 6, 12].map((st) => scopeLens(st, true, false))).toEqual([THERMAL_LENS, THERMAL_LENS, THERMAL_LENS]);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { gearMatrix, multiply, parseCharacterTable, playerCharacter, transformPoint } from '../src/index';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readPin, skeletonFromPin, type GearPin, type SkeletonPin } from './characterPins';

/**
 * Parity pins for the character's gear (socomlegacy/docs/research/78 §5-§6; registry docs/parity/registry/character.json):
 * `character.rdr`'s offsets for Frostfire's player, pinned in `golden/character-gear.json`, hung under the pinned bind
 * skeleton through `gearMatrix` with no game data; the fixture half re-reads the pin from `READERC.ZAR` and MP2.
 */
const pin = readPin<GearPin>('character-gear.json');
const skeleton = readPin<SkeletonPin>('character-skeleton.json');

/** The gear's offset times its part's bind world: where the piece is placed in the bind pose (78 §5.3). */
const placedOf = (name: string): Float32Array => {
  const s = skeletonFromPin(skeleton);
  const g = pin.defaultGear.find((x) => x.name === name)!;
  return multiply(gearMatrix(g, pin.angleUnits), s.bindWorld[s.indexOf(g.part)]!);
};
/** The largest departure of a placed piece's 3x3 from the identity. */
const turnLeft = (m: Float32Array): number => {
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(m[i * 4 + j]! - (i === j ? 1 : 0)));
  return worst;
};

describe("the player's gear, pinned (research 78 §5; no game data)", () => {
  it('dresses mp2_seal1 as seal_A_scuba in six pieces of 78 §5.2: two eyes, holster, belt, knife, satchel -- no goggles', () => {
    expect([pin.character, pin.model, pin.angleUnits, pin.gearCount]).toEqual(['mp2_seal1', 'seal_A_scuba', 'DEG', 49]);
    expect(pin.defaultGear.map((g) => [g.name, g.model, g.part])).toEqual([
      ['seal_A_right_eye', 'right_eye', 'head'], ['seal_A_left_eye', 'left_eye', 'head'], ['seal_holster', 'gear_holster', 'rthigh'],
      ['seal_scuba_aslt_gear', 'seal_scuba_aslt_gear', 'hips'], ['seal_scuba_knife', 'seal_scuba_knife', 'rcalf'], ['Satchel', 'Satchel', 'spinehi'],
    ]);
    expect(pin.defaultGear.map((g) => g.name)).not.toContain('seal_goggles');
  });

  it("lists in body_items exactly the 25 parts under skel_root's model, then rifle, pistol, grenade, weapon (78 §3.1, §5.2)", () => {
    const parts = skeleton.parts.map((p) => p.name).filter((n) => n !== 'body');
    expect(pin.bodyItems.slice(0, 25).sort()).toEqual([...parts].sort());
    expect(pin.bodyItems.slice(25)).toEqual(['rifle', 'pistol', 'grenade', 'weapon']);
  });

  it("undoes each worn piece's part bind turn under gearMatrix -- x, then y, then z about the fixed axes (78 §5.3)", () => {
    // 78 §5.3's residuals: left eye 0.005, holster 0.009, knife 0.012, belt 0.021, satchel 0.041; the next best
    // order misses by 0.7 to 1. The right eye shares the left eye's angles.
    const bound: Record<string, number> = {
      seal_A_right_eye: 0.005, seal_A_left_eye: 0.005, seal_holster: 0.009, seal_scuba_aslt_gear: 0.021, seal_scuba_knife: 0.012, Satchel: 0.041,
    };
    for (const g of pin.defaultGear) expect(turnLeft(placedOf(g.name)), g.name).toBeLessThan(bound[g.name]! + 5e-4);
  });

  it('puts the eyes 18.16 over the feet in the bind pose (the mean of the two, 18.161), 0.33 to each side, ahead along -z (78 §6.3)', () => {
    const eyes = ['seal_A_right_eye', 'seal_A_left_eye'].map((n) => transformPoint(placedOf(n), 0, 0, 0));
    expect((eyes[0]![1] + eyes[1]![1]) / 2).toBeCloseTo(18.161, 3);
    expect(eyes[0]![0]).toBeGreaterThan(0.3);                    // the right eye on the model's +x
    expect(eyes[1]![0]).toBeLessThan(-0.3);
    for (const e of eyes) expect(e[2]).toBeLessThan(-0.8);       // forward of the head joint, the model facing -z
  });

  it("hangs the belt at the hips' bind origin with the hips' 1.19 degree tilt kept (78 §5.3)", () => {
    const belt = placedOf('seal_scuba_aslt_gear');
    expect(transformPoint(belt, 0, 0, 0).map((x) => Math.round(x * 1e4) / 1e4 + 0)).toEqual([0, 11.67, 0.5334]);
    const tilt = (Math.asin(Math.abs(belt[6]!)) * 180) / Math.PI;      // row 1's z: the turn about x left in place
    expect(tilt).toBeCloseTo(1.19, 1);
  });
});

/** `READERC.ZAR` is not a map member: the extractor copies it beside the archives (78 §5). */
const READERC = fixture('RUN/READERC.ZAR');
const MP2 = fixture('RUN/MP2.ZDB');

describe(`the gear pin against the disc${READERC && MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!READERC || !MP2)("re-reads the pin from READERC.ZAR's character.rdr and MP2's chartype.rdr through parseCharacterTable", () => {
    const z = Zar.parse(READERC!);
    const table = parseCharacterTable(parseRdr(z.data(z.root.children.find((k) => k.name === 'character.rdr')!)));
    const readerm = Zar.parse(zdbMember(MP2!, parseZdb(MP2!), 'READERM.ZAR'));
    const who = playerCharacter(parseRdr(readerm.data(readerm.root.children.find((k) => k.name === 'chartype.rdr')!)))!;
    expect({
      angleUnits: table.angleUnits, bodyItems: table.bodyItems, gearCount: table.gear.size, character: who, model: table.model(who),
      defaultGear: table.defaultGear(who).map((g) => table.gear.get(g)),
    }).toEqual({
      angleUnits: pin.angleUnits, bodyItems: pin.bodyItems, gearCount: pin.gearCount, character: pin.character, model: pin.model, defaultGear: pin.defaultGear,
    });
  });
});

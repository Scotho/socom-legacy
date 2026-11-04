// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { characterModelNames, readSkeleton } from '../src/index';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readPin, skeletonFromPin, type SkeletonPin } from './characterPins';

/**
 * Parity pins for the character skeleton (socomlegacy/docs/research/78 §3; registry docs/parity/registry/character.json).
 * The unit half drives `readSkeleton` from the pin `golden/character-skeleton.json` with no game data; the fixture half
 * re-reads the pin from Frostfire's `CLIB_GEO.ZED` so it cannot rot.
 */
const pin = readPin<SkeletonPin>('character-skeleton.json');

/** 78 §3.1, transcribed from the note: the palette slot is the pre-order index, the parent in brackets (-1: the model). */
const SEAL_TREE: [string, number][] = [
  ['skel_root', -1], ['hips', 0], ['rthigh', 1], ['rcalf', 2], ['rfoot', 3], ['rtoe', 4], ['lthigh', 1], ['lcalf', 6],
  ['lfoot', 7], ['ltoe', 8], ['aimnodes', 1], ['spinelo', 10], ['spinehi', 11], ['rshoulder_wgt', 12], ['rscap', 12],
  ['rbicep', 12], ['rforearm', 15], ['rhand', 16], ['neck', 12], ['head', 18], ['lshoulder_wgt', 12], ['lscap', 12],
  ['lbicep', 12], ['lforearm', 22], ['lhand', 23], ['body', -1],
];

/** As JSON holds a number: -0 is written 0. */
const plain = (a: ArrayLike<number>): number[] => Array.from(a, (x) => x + 0);
const at = (m: Float32Array): number[] => [m[12]!, m[13]!, m[14]!];
/** The largest departure of a matrix's 3x3 from a rotation: |R R^T - I| over its entries, and |det| - 1. */
function rotationError(m: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let dot = 0;
    for (let k = 0; k < 3; k++) dot += m[4 * i + k]! * m[4 * j + k]!;
    worst = Math.max(worst, Math.abs(dot - (i === j ? 1 : 0)));
  }
  return worst;
}

describe('the character skeleton, pinned (research 78 §3; no game data)', () => {
  it('reads seal_A_scuba as 78 §3.1 draws it: 26 palette slots in pre-order, their parents, body beside skel_root', () => {
    const s = skeletonFromPin(pin);
    expect(s.parts.map((p) => [p.name, p.parent])).toEqual(SEAL_TREE);
    expect(s.parts.map((p) => p.index)).toEqual(SEAL_TREE.map((_, i) => i));
    expect(s.size).toBe(26);
  });

  it('composes the pinned bind locals local x parent: skel_root at (0, 11.67, 0.5334), head at y 17.625', () => {
    const s = skeletonFromPin(pin);
    const root = at(s.bindWorld[0]!);
    expect(root[0]!).toBeCloseTo(0, 6);
    expect(root[1]!).toBeCloseTo(11.67, 4);
    expect(root[2]!).toBeCloseTo(0.5334, 4);
    expect(at(s.bindWorld[s.indexOf('head')]!)[1]!).toBeCloseTo(17.625, 3);
    // body, the 26th slot, sits at the model origin with the identity (78 §3.1)
    expect(Array.from(s.bindWorld[25]!)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(Array.from(s.modelMatrix)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('faces -z: the toes lie ahead of the ankles, rtoe z -0.576 against rfoot z 1.091 (78 §3.2)', () => {
    const s = skeletonFromPin(pin);
    expect(at(s.bindWorld[s.indexOf('rtoe')]!)[2]!).toBeCloseTo(-0.576, 3);
    expect(at(s.bindWorld[s.indexOf('rfoot')]!)[2]!).toBeCloseTo(1.091, 3);
    expect(at(s.bindWorld[s.indexOf('ltoe')]!)[2]!).toBeLessThan(at(s.bindWorld[s.indexOf('lfoot')]!)[2]! - 1);
  });

  it('holds every bind matrix, local and world, to a rotation plus a translation within 7e-7 (78 §3.2)', () => {
    const s = skeletonFromPin(pin);
    const worst = Math.max(...s.parts.map((p) => rotationError(p.bindLocal)), ...s.bindWorld.map(rotationError));
    expect(worst).toBeLessThan(7e-7);
    for (const p of s.parts) expect([p.bindLocal[3], p.bindLocal[7], p.bindLocal[11], p.bindLocal[15]], p.name).toEqual([0, 0, 0, 1]);
  });

  it('pins every Frostfire character model to the same tree: 17 models, the SEAL names and parents on each', () => {
    expect(pin.frostfireModels).toHaveLength(17);
    const names = SEAL_TREE.map(([n]) => n).join(' '), parents = SEAL_TREE.map(([, p]) => p).join(' ');
    for (const m of pin.frostfireModels) expect([m.name, m.names, m.parents]).toEqual([m.name, names, parents]);
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const geoOf = (bytes: Uint8Array): Zar => Zar.parse(zdbMember(bytes, parseZdb(bytes), 'CLIB_GEO.ZED'));
const sha = (parts: Float32Array[]): string => {
  const h = createHash('sha1');
  for (const p of parts) h.update(new Uint8Array(p.buffer, p.byteOffset, p.byteLength));
  return h.digest('hex');
};

describe(`the character skeleton pin against the disc${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("re-reads the pin from MP2's CLIB_GEO.ZED through readSkeleton: seal_A_scuba's parts, matrices, boxes, words", () => {
    const s = readSkeleton(geoOf(MP2!), 'seal_A_scuba');
    expect({
      model: s.model,
      modelMatrix: plain(s.modelMatrix),
      parts: s.parts.map((p) => ({ name: p.name, parent: p.parent, bindLocal: plain(p.bindLocal), bbox: plain(p.bbox), type: p.type, flags: p.flags })),
    }).toEqual({ model: pin.model, modelMatrix: pin.modelMatrix, parts: pin.parts });
  });

  it.skipIf(!MP2)("re-reads every Frostfire character model's tree and bind locals (SHA-1) as pinned", () => {
    const geo = geoOf(MP2!);
    expect(characterModelNames(geo).map((name) => {
      const s = readSkeleton(geo, name);
      return { name, names: s.parts.map((p) => p.name).join(' '), parents: s.parts.map((p) => p.parent).join(' '), bindSha1: sha(s.parts.map((p) => p.bindLocal)) };
    })).toEqual(pin.frostfireModels);
  });

  for (const archive of ['MP6', 'MP72']) {
    const bytes = fixture(`RUN/${archive}.ZDB`);
    it.skipIf(!bytes)(`${archive}: every character model has the SEAL tree, slot 25 body or body_1 (78 §3.1)`, () => {
      const geo = geoOf(bytes!);
      const names = characterModelNames(geo);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const s = readSkeleton(geo, name);
        expect(s.parts.map((p) => [p.name === 'body_1' ? 'body' : p.name, p.parent]), name).toEqual(SEAL_TREE);
      }
    });
  }
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WeaponRecord } from '@s2u/scene';
import { Zoom } from '../src/zoom';

/**
 * The scope steps, day and night, against a CAPTURE OF THE ORIGINAL (LANE-KILL item 3, B-61: "leaving the scope lands in
 * third person" is the original's own steps). Evidence kind: a capture of the original running (r0004 under PCSX2,
 * PC 3, 2026-11-21; the state byte `actor+0x200`, the factor `actor+0x204`; summary
 * `agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL3-PC3/KILL3-summary.md`; record
 * `D:/s2u-records/KILL3-PC3/KILL3-PC3.zip`, sha256 9eaffc0ae577cd658cde04e46dcc87cc75ec9a17fefe839ab6eacc3a9e045ab0, on the hub, outside git). 3 trials each, identical;
 * compared value for value (the states exact; the factors to the record's resolution: `zoom204` is logged to 4 decimals, so
 * +-5e-5, `FACTOR_TOL`).
 *
 * The weapon records are the real ones (`packages/scene/test/golden/weapon-records.json`): the M4A1 SD (ID 62, zoom
 * modes [1.5, 3]) and the M87ELR (ID 103, [1.5, 8, 16]). Established parity: the port already matched when this was
 * written, so there is no red -- the file pins it.
 *
 * NOT a departure, recorded so nobody reads it as one: the capture's case 4 (M87ELR scoped, two SEPARATE bolt shots
 * ~2.4 s apart) stays in the scope on the original through both shots; the port does the same (nothing here drops it).
 * That does NOT test the port's "second round of ONE pull drops the scope" (`FUN_005c5340`, an automatic's burst), which
 * this capture did not exercise.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const M4A1_SD = PIN.records['62']!, M87ELR = PIN.records['103']!;

/** Presses of the d-pad: 'U' = Up (zoomIn), 'D' = Down (zoomOut). Returns the state after each press, from third person. */
const FACTOR_TOL = 5e-5;
/** The factors equal the capture's, each within the record's 4-decimal resolution. */
function expectFactors(got: number[], want: number[]): void {
  expect(got).toHaveLength(want.length);
  got.forEach((g, i) => expect(Math.abs(g - want[i]!)).toBeLessThanOrEqual(FACTOR_TOL));
}

function run(weapon: WeaponRecord, night: boolean, presses: string): { states: number[]; factors: number[] } {
  const z = new Zoom(weapon, night);
  const states = [z.state()], factors = [z.target()];
  for (const p of presses) {
    states.push(p === 'U' ? z.zoomIn() : z.zoomOut());
    factors.push(z.target());
  }
  return { states, factors };
}

describe('B-61: the scope steps against the capture of the original (KILL3, r0004, 3 trials each)', () => {
  it('the weapon records are the ones the capture used', () => {
    expect(M4A1_SD.zoomModes).toEqual([1.5, 3]);
    expect(M87ELR.zoomModes).toEqual([1.5, 8, 16]);
  });

  it('day, M4A1 SD: Up, Up, Up, Down, Down -> 0,1,5,5,1,0 (the extra Up at the one-level scope does nothing)', () => {
    const r = run(M4A1_SD, false, 'UUUDD');
    expect(r.states).toEqual([0, 1, 5, 5, 1, 0]);
    expectFactors(r.factors, [1, 1.01, 3, 3, 1.01, 1]);
  });

  it('day, M87ELR: Up x3, Down x3 -> 0,1,5,6,5,1,0; the factors 1, 1.01, 8, 16, 8, 1.01, 1', () => {
    const r = run(M87ELR, false, 'UUUDDD');
    expect(r.states).toEqual([0, 1, 5, 6, 5, 1, 0]);
    expectFactors(r.factors, [1, 1.01, 8, 16, 8, 1.01, 1]);
  });

  it('night, M4A1 SD: Up x4, Down x3 -> 0,1,3,5,5,3,1,0 (the night vision, state 3, between first person and the scope)', () => {
    const r = run(M4A1_SD, true, 'UUUUDDD');
    expect(r.states).toEqual([0, 1, 3, 5, 5, 3, 1, 0]);
    // the capture (K3c3n-m4sd-full): state 3 holds 1.01, state 5 is 3.0
    expectFactors(r.factors, [1, 1.01, 1.01, 3, 3, 1.01, 1.01, 1]);
  });

  it('night, M87ELR: Up x4, Down x4 -> 0,1,3,5,6,5,3,1,0', () => {
    const r = run(M87ELR, true, 'UUUUDDDD');
    expect(r.states).toEqual([0, 1, 3, 5, 6, 5, 3, 1, 0]);
    // the capture (K3c3n-m87): 1.01 at states 1 and 3, then 8.0 and 16.0
    expectFactors(r.factors, [1, 1.01, 1.01, 8, 16, 8, 1.01, 1.01, 1]);
  });
});

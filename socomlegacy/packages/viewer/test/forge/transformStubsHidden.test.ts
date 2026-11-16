import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { RECORD_SCALE_MAX_ADAPTATION, RECORD_SCALE_MIN_ADAPTATION } from '@s2u/creator-contracts';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { emptyLayout } from '../../src/forge/layout';
import {
  PIECE_PITCH_LIMIT, scaleOnLattice, signedDegrees, snappedScale, snappedTurn, turnOf, turnQuaternion,
} from '../../src/forge/transformStubs';

/**
 * FC-1 (the owner, 2026-11-07: "re: crispy's work, take this on and finish it: hiding the pitch/roll/scale"; a browser
 * adaptation, FG.R2 -- the game has no editor) hid the Overhaul's pitch, roll and scale controls behind one named switch
 * while record v3 kept a piece's yaw alone. FX-9 (FX.R3: "finish scale and rotate 100%"): the record keeps a piece's
 * pitch, roll and scale since FX-1 (`creator-contracts` `PoseRow`), so the switch is off and the controls are real; the
 * helpers here put a piece's turn and scale on the record's lattice, as the page shows and commits them.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string => readFileSync(resolve(here, '../../src/forge', path), 'utf8').replace(/\r\n/g, '\n');

describe('FX-9: the pitch / roll / scale controls switched on', () => {
  it('the switch exists, is false (the controls shown), and the page reads it', () => {
    expect(source('transformStubs.ts')).toMatch(/^export const FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION = false;$/m);
    expect(source('page.ts')).toMatch(/import \{ FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION \} from '\.\/transformStubs';/);
  });

  it('the Inspector has no stub left: its Pitch, Roll and Scale fields commit, none is put back as not wired', () => {
    const page = source('page.ts');
    expect(page).not.toContain('const transformStub = ');
    expect(page).toContain("for (const f of stubFields) f.addEventListener('change', () => commitTurnField(f));");
  });

  it('the gizmo has no stub left: the Scale tool and the tilt rings say nothing is not wired, and a scale drag is Set scale', () => {
    const page = source('page.ts');
    expect(page).not.toContain('not wired yet');
    expect(page).toContain("if (gizmo.mode === 'scale') personEdit('placement.set', { refs: selectionIds(), field: 'scale' }, () => edit(), true);");
  });

  it('a scale goes on the record lattice: one hundredth, held within 0.1..4 (the contract constants), a non-number 1', () => {
    expect([RECORD_SCALE_MIN_ADAPTATION, RECORD_SCALE_MAX_ADAPTATION]).toEqual([0.1, 4]);
    expect(scaleOnLattice(2)).toBe(2);
    expect(scaleOnLattice(0.5)).toBe(0.5);
    expect(scaleOnLattice(1.004)).toBe(1);
    expect(scaleOnLattice(1.006)).toBe(1.01);
    expect(scaleOnLattice(9)).toBe(RECORD_SCALE_MAX_ADAPTATION);
    expect(scaleOnLattice(0.01)).toBe(RECORD_SCALE_MIN_ADAPTATION);
    expect(scaleOnLattice(-2)).toBe(RECORD_SCALE_MIN_ADAPTATION);
    expect(scaleOnLattice(Number.NaN)).toBe(1);
    expect(snappedScale([2.004, 0, 7])).toEqual([2, 0.1, 4]);
  });

  it('a pitch or roll is shown signed, a whole degree in -179..180 (the record keeps a roll in 0..359)', () => {
    expect(signedDegrees(315)).toBe(-45);
    expect(signedDegrees(-45)).toBe(-45);
    expect(signedDegrees(180)).toBe(180);
    expect(signedDegrees(-180)).toBe(180);
    expect(signedDegrees(30.4)).toBe(30);
    expect(signedDegrees(359.6)).toBe(0);
    expect(Object.is(signedDegrees(-0.2), 0)).toBe(true);
  });

  it('a turn snaps to whole degrees, the pitch within -90..90, and at the gimbal the roll goes into the yaw (the record form)', () => {
    expect(PIECE_PITCH_LIMIT).toBe(90);
    expect(snappedTurn({ yaw: 10.4, pitch: 29.6, roll: -45.2 })).toEqual({ yaw: 10, pitch: 30, roll: -45 });
    expect(snappedTurn({ yaw: 0, pitch: 120, roll: 0 })).toEqual({ yaw: 0, pitch: 90, roll: 0 });
    expect(snappedTurn({ yaw: 0, pitch: -400, roll: 0 })).toEqual({ yaw: 0, pitch: -90, roll: 0 });
    expect(snappedTurn({ yaw: 50, pitch: 90, roll: 20 })).toEqual({ yaw: 30, pitch: 90, roll: 0 });
    expect(snappedTurn({ yaw: 50, pitch: -90, roll: 20 })).toEqual({ yaw: 70, pitch: -90, roll: 0 });
    // The canonical form is the same turn.
    const turned = turnQuaternion({ yaw: 50, pitch: 90, roll: 20 });
    const canonical = turnQuaternion(snappedTurn({ yaw: 50, pitch: 90, roll: 20 }));
    expect(Math.abs(turned.dot(canonical))).toBeCloseTo(1, 9);
  });

  it('a turn read back off its quaternion in the YXZ order is the turn written (yaw about Y, then pitch, then roll)', () => {
    const t = turnOf(turnQuaternion({ yaw: 120, pitch: 30, roll: -45 }));
    expect([t.yaw, t.pitch, t.roll].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([120, 30, -45]);
    expect(turnOf(new Quaternion()).pitch).toBe(0);
  });

  it("the agent: a piece's pitch sets (FX-9, no longer refused); a spawn's is refused as a marker's; a view's pitch still sets", () => {
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'piece:0', field: 'pitch', value: 30 }, []);
    expect(turnOf(new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(l.pieces[0]!.m))).pitch).toBeCloseTo(30, 9);
    l = planForgeLayout(l, 'spawn.place', { team: 'A', at: [5, 0, 0] }, []);
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'spawn:0', field: 'pitch', value: 30 }, [])).toThrow(/spawn:0 is a marker/);
    l = planForgeLayout(l, 'view.place', { at: [0, 10, 0], yaw: 0, pitch: 0 }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'view:0', field: 'pitch', value: -30 }, []);
    expect(l.scenicViews![0]!.pitch).toBe(-30);
    expect(source('agent/commands.ts')).not.toContain('is not supported yet');
  });
});

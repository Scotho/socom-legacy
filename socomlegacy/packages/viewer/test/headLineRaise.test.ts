// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { POSED_HEAD_READING, Walker, wallHeadLine } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';

/**
 * LATER 1201 + LATER 1169 (B) (the main controller's ruling, 2026-11-18; reading, pending review): the head line is the
 * head node as the frame's pose puts it (`FUN_0054aa30` D:L415441-415443, `FUN_002869d0` D:L130725), and the pose a
 * raised rifle plays is the Fire set (`FUN_0057a330` D:L438828-438860 at the raise weight). So a raised body's head line
 * is the Fire set's head, a lowered one's the base clips' -- the raise (`Command.raised`, the original's +0xf74 1 up / 2
 * down) picks the table. Between two stick samples the table is INTERPOLATED (was: the greater of the two).
 *
 * The capture (a memory trace of the original, relay-2, PC 2, r0004; the head chain composed offline by coreB,
 * `agent-mail/evidence/later1169-headchain-pc2/HEADCHAIN-READ.md`): the lowered run's greatest head 16.775-16.782 at the
 * stick word 0.75 (MP62, in water) and 15.751-15.758 at 1.0 (dry); the aimed run's 15.45-15.51 at 0.75 and 15.68-15.72 at
 * 1.0; at rest lowered 17.367-17.373, aimed 15.54-15.57 (stand) and 8.89 (crouch).
 */

const idle = { state: 'idle', forward: 0, right: 0, cls: -1 } as const;
const run = (m: number) => ({ state: 'stand', forward: m, right: 0, cls: 1 }) as const;
const LIFT = 2;

describe('LATER 1201: the head line follows the raise (the Fire set\'s head when the rifle is up)', () => {
  it('at rest standing: lowered the idle head 17.394, raised seal_fp_stand\'s 15.806 (+ 2)', () => {
    expect(wallHeadLine('stand', idle, false, null, false)).toBeCloseTo(17.394 + LIFT, 6);
    expect(wallHeadLine('stand', idle, false, null, true)).toBeCloseTo(15.806 + LIFT, 6);
  });
  it('at rest crouched: lowered 10.138, raised seal_fp_crouch\'s 9.298; prone unchanged by the raise', () => {
    expect(wallHeadLine('crouch', { ...idle, state: 'idle' }, false, null, true)).toBeCloseTo(9.298 + LIFT, 6);
    expect(wallHeadLine('crouch', idle, false, null, false)).toBeCloseTo(10.138 + LIFT, 6);
    expect(wallHeadLine('prone', idle, false, null, true)).toBe(wallHeadLine('prone', idle, false, null, false));
  });
  it('running forward at full: lowered seal_run\'s 15.761, raised seal_fp_run\'s table 15.706', () => {
    expect(wallHeadLine('stand', run(1), false, null, false)).toBeCloseTo(15.761 + LIFT, 6);
    expect(wallHeadLine('stand', run(1), false, null, true)).toBeCloseTo(15.706 + LIFT, 6);
  });
  it('the moving crouch\'s forward and back rows take the Fire set (13.025, 12.909); its strafes have none', () => {
    const c = (cls: 0 | 1 | 2 | 3) => ({ state: 'crouch', forward: cls === 1 ? 0.5 : cls === 3 ? -0.5 : 0, right: cls === 0 ? 0.5 : cls === 2 ? -0.5 : 0, cls }) as const;
    expect(wallHeadLine('crouch', c(1), false, null, true)).toBeCloseTo(13.025 + LIFT, 6);
    expect(wallHeadLine('crouch', c(3), false, null, true)).toBeCloseTo(12.909 + LIFT, 6);
    expect(wallHeadLine('crouch', c(0), false, null, true)).toBeCloseTo(12.990 + LIFT, 6);
  });
});

describe('LATER 1169 (B): between two stick samples the table is interpolated', () => {
  it('at 0.75 forward: lowered midway 17.024 -> 16.530 = 16.777, raised 15.782 -> 15.766 = 15.774', () => {
    expect(wallHeadLine('stand', run(0.75), false, null, false)).toBeCloseTo(16.777 + LIFT, 6);
    expect(wallHeadLine('stand', run(0.75), false, null, true)).toBeCloseTo(15.774 + LIFT, 6);
  });
  it('the lowered table against the capture: 0.75 within 0.01 of 16.775-16.782, 1.0 within 0.01 of 15.751-15.758', () => {
    const at = (m: number): number => wallHeadLine('stand', run(m), false, null, false) - LIFT;
    expect(Math.abs(at(0.75) - 16.7785)).toBeLessThan(0.01);
    expect(Math.abs(at(1.0) - 15.7545)).toBeLessThan(0.01);
    expect(POSED_HEAD_READING.stand.forward[9]).toBe(15.761);
  });
});

describe('the raise reaches the mover from the command (`Command.raised`, ER-2), page and room alike', () => {
  const grid = (): ReturnType<typeof buildGrid> => {
    const p: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-500, 0, 500, 500, 0, 500, 500, 0, -500, -500, 0, -500]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 };
    const owners: CollisionOwner[] = [{ modelName: p.modelName, path: 'floor0', first: 0, count: 1 }];
    return buildGrid(params, [], [], [p], owners);
  };
  it('prepare lays `raised` on the walker; absent is lowered', () => {
    const w = new Walker(grid());
    w.place(0, 1, 0);
    const sim = new MoverSim(w, null);
    const base: Command = { seq: 1, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    sim.prepare({ ...base, raised: true });
    expect(w.raised).toBe(true);
    sim.prepare({ ...base, seq: 2 });
    expect(w.raised).toBe(false);
  });
});

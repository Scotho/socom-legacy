import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { DOOR_MOVE_ARRIVE_READING, DOOR_MOVE_TIMEOUT_READING, DoorSet, OPEN_DOOR_TYPE, useSeconds, type DoorActor, type DoorSpec } from '../src/doors';
import { apply4, mul4 } from '../src/doorMath';
import { TICK } from '../src/mover';
import { GAME_FRAME_DT } from '@s2u/scene';

/**
 * LATER 1206, step 1 (the bodies seat, 2026-11-18; the main controller's order: MEASURE OURS FIRST): the port's door
 * program clocked on MP71 Fish Hook's door_rg_1, the door the rig timed on the original. From the use (`DoorSet.use`, t =
 * 0) at the room's tick (`TICK`, 60 Hz), the times the port reaches each phase:
 *   push -- the `Open door` ANIMATE's push on the presser (`DoorHooks.animate`, type `OPEN_DOOR_TYPE` = 63);
 *   valve -- the door's valve flips (`DoorSet.valve`, what `state(i).open` and the hostage test's "open" read);
 *   swing -- the leaf's first motion (`wire()`'s phase leaves 0 with the swing under way);
 *   rest -- the program done (`state(i).busy` false), the swing's end.
 * THE ORIGINAL (research 428 s8.1-s8.2; captures of r0004 on the same door): a player's X key-down -> the state flip
 * about 1.10-1.15 s (key-down estimated, not measured); anim 63 -> the state flip 0.684-0.701 s, the flip being the
 * swing's first motion; the flip -> fully open 0.967-0.984 s; a hostage's push of the door goal -> the open 1.21-1.27 s
 * (n = 7 + Q24b attempt3's 12). This file measures the port's phases and logs them beside those; it judges no gap yet
 * (LATER 1206's order: the gap is filed with these numbers first). Unit-test evidence on the fixture disc (MP71.ZDB).
 */

const MP71 = fixture('RUN/MP71.ZDB');

interface Phases { push: number | null; valve: number | null; swing: number | null; rest: number | null; pushes: number }

describe.skipIf(!MP71)(`LATER 1206: the port's door program clocked on MP71 door_rg_1${MP71 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP71 ? simMapFromBytes(MP71, 'RUN/MP71.ZDB') : null;

  function clocked(node: string): { phases: Phases; spec: DoorSpec } {
    let t = 0;
    const phases: Phases = { push: null, valve: null, swing: null, rest: null, pushes: 0 };
    const doors = new DoorSet(map!.doors ?? [], map!.ground, {
      animate: (_d, type) => { if (type === OPEN_DOOR_TYPE) { phases.pushes++; phases.push ??= t; } },
    });
    const i = doors.specs.findIndex((d) => d.node === node);
    expect(i, `${node} on MP71`).toBeGreaterThanOrEqual(0);
    expect(doors.valve(i), `${node} starts shut`).toBe(0);
    expect(doors.use(i, null)).toBe(true);
    for (let k = 0; k < 600 && phases.rest === null; k++) {
      doors.step(TICK);
      t += TICK;
      if (phases.valve === null && doors.valve(i) !== 0) phases.valve = t;
      if (phases.swing === null && doors.wire()[i]!.phase > 0) phases.swing = t;
      if (!doors.state(i).busy) phases.rest = t;
    }
    return { phases, spec: doors.specs[i]! };
  }

  it('door_rg_1: the push one game frame after the use, the valve at 0.717 s, the swing 0.733 s, the rest 1.717 s -- measured, logged against the original', () => {
    const { phases: p, spec } = clocked('door_rg_1');
    const f = (v: number | null): string => (v === null ? 'never' : `${v.toFixed(3)} s`);
    console.log(`LATER 1206 port door_rg_1: push ${f(p.push)} (x${p.pushes}), valve ${f(p.valve)}, swing ${f(p.swing)}, rest ${f(p.rest)}; useSeconds ${useSeconds(spec)?.toFixed(3)}`);
    console.log(`LATER 1206 port phases: push -> valve ${p.push !== null && p.valve !== null ? (p.valve - p.push).toFixed(3) : '-'} s, valve -> rest ${p.valve !== null && p.rest !== null ? (p.rest - p.valve).toFixed(3) : '-'} s`
      + ` | ORIGINAL: anim 63 -> flip 0.684-0.701 s, flip -> fully open 0.967-0.984 s, key-down -> flip ~1.10-1.15 s, hostage push -> open 1.21-1.27 s`);
    expect(p.pushes, 'one push').toBe(1);
    expect(p.push, 'the push').not.toBeNull();
    expect(p.valve, 'the valve flips').not.toBeNull();
    expect(p.rest, 'the program ends').not.toBeNull();
    // The port's own phases, pinned AS MEASURED (2026-11-18). LATER 1206 had read "the valve at 0.300 s" off `aiAnimate`'s
    // comment, which is Frostfire's program (a 0.25 s post-wait); door_rg_1's program waits longer: the valve flips 0.683 s
    // after the push -- the hostage test's 0.72 s from its use, reconciled. From anim 63 on the port is the original's:
    // push -> valve 0.683 s (the original's anim 63 -> flip 0.684-0.701 s) and valve -> rest 1.000 s (the flip -> fully
    // open 0.967-0.984 s). The gap is BEFORE anim 63: the port pushes it one game frame after the use, the original
    // 0.234-0.267 s after the PRESS row (PC 3) -- LATER 1206's candidate (b), the ai::MOVE before the animate
    // (`DOOR_MOVE_ORDER_READING`, not run).
    expect(p.push!).toBeCloseTo(2 / 60, 6);                      // one game frame: the 2nd room tick
    expect(p.valve!).toBeCloseTo(43 / 60, 6);
    expect(p.swing!).toBeCloseTo(44 / 60, 6);
    expect(p.rest!).toBeCloseTo(103 / 60, 6);
    expect(p.valve! - p.push!).toBeGreaterThanOrEqual(0.684 - 1 / 60);   // within a room tick of the original's 0.684-0.701
    expect(p.valve! - p.push!).toBeLessThanOrEqual(0.701 + 1 / 60);
  });
});

/**
 * LATER 1206, the hostage half (research 428 s8.4-s8.5; reading, pending review): the door program's `ai::MOVE` run before
 * its `ai::ANIMATE`. The begin `FUN_005d5d00` (D:L488725-488994) gives the presser's controller a goal -- mode 1 (`node`):
 * P = the node's world matrix applied to `pos` (`FUN_003085c0`, a point), d = the flat unit vector from P to the actor
 * (`FUN_003091d0`, x and z only), the point P + dist x d (`FUN_00309180`, `FUN_00309240`) and the facing -d -- and is
 * BLOCKING only when the controller answers its vtable +0x38 (an AI's `CSealCtrlAi`; a player's `CSealCtrl` /
 * `CRemoteCtrl` answer 0). Blocking, its tick (`FUN_005d5b40`, D:L488660-488722) holds the program until the body is within
 * `DOOR_MOVE_ARRIVE_READING` (1.0 u, `FUN_00566dc0` D:L429158) or `DOOR_MOVE_TIMEOUT_READING` (0.4 s, `DAT_00650ac0`,
 * D:L429080-429098) has passed. The port's hook (`DoorHooks.move`) answers null for a presser that does not block, else
 * the "arrived?" predicate; the runner counts the timeout in game frames as `aiAnimate` counts its waits.
 */
describe.skipIf(!MP71)(`LATER 1206: the door program's ai::MOVE before the ANIMATE on MP71 door_rg_1${MP71 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP71 ? simMapFromBytes(MP71, 'RUN/MP71.ZDB') : null;
  /** Where the hostage pushed from in the door match's C2 (research 428 s8), on the floor: the presser's feet at the use. */
  const FROM = [2189.75, 178.6, 794.58] as const;

  interface MoveCall { point: [number, number, number]; facing: [number, number, number]; actor: DoorActor }

  function clocked(actor: DoorActor, arrive: ((frame: number) => boolean) | 'none'): { push: number | null; calls: MoveCall[]; spec: DoorSpec } {
    let t = 0, push: number | null = null, frames = 0;
    const calls: MoveCall[] = [];
    const doors = new DoorSet(map!.doors ?? [], map!.ground, {
      animate: (_d, type) => { if (type === OPEN_DOOR_TYPE) push ??= t; },
      move: (_d, point, facing, who) => {
        calls.push({ point: [...point] as [number, number, number], facing: [...facing] as [number, number, number], actor: who });
        if (typeof who !== 'number' || arrive === 'none') return null;   // a player, or the page's own: not blocking
        return () => arrive(++frames);
      },
    });
    const i = doors.specs.findIndex((d) => d.node === 'door_rg_1');
    expect(doors.use(i, FROM, actor)).toBe(true);
    for (let k = 0; k < 600 && doors.state(i).busy; k++) {
      doors.step(TICK);
      t += TICK;
    }
    return { push, calls, spec: doors.specs[i]! };
  }

  it('the readings: the timeout 0.4 s (DAT_00650ac0), the arrival 1.0 u (+0x1b4, written by the begin)', () => {
    expect(DOOR_MOVE_TIMEOUT_READING).toBe(0.4);
    expect(DOOR_MOVE_ARRIVE_READING).toBe(1.0);
  });

  it('an AI presser that never arrives: the push comes DOOR_MOVE_TIMEOUT_READING (12 game frames) after a player push at 0.033 s', () => {
    const { push, calls } = clocked(7, () => false);
    expect(calls.length, 'the hook is asked once').toBe(1);
    expect(calls[0]!.actor).toBe(7);
    expect(push).not.toBeNull();
    // 0.4 s is 11.99 game frames: 12 counted, as `aiAnimate` counts its post-wait. The push comes a room tick past the
    // frame lattice's (the ANIMATE starts its own frame count afresh at the MOVE's end, as it does after the use).
    const frames = Math.ceil(DOOR_MOVE_TIMEOUT_READING / GAME_FRAME_DT - 1e-9);
    expect(frames).toBe(12);
    expect(push! - 2 / 60).toBeGreaterThanOrEqual(frames * GAME_FRAME_DT - TICK);
    expect(push! - 2 / 60).toBeLessThanOrEqual(frames * GAME_FRAME_DT + TICK);
  });

  it('an AI presser that arrives on the third game frame: the push one game frame after it', () => {
    const { push } = clocked(7, (frame) => frame >= 3);
    expect(push! - 2 / 60).toBeGreaterThanOrEqual(3 * GAME_FRAME_DT - TICK);
    expect(push! - 2 / 60).toBeLessThanOrEqual(3 * GAME_FRAME_DT + TICK);
  });

  it('a player press (actor self, the hook answering null): the timing unchanged, the push at 0.033 s', () => {
    const { push, calls } = clocked('self', () => false);
    expect(calls.length, 'the goal is still given').toBe(1);
    expect(push!).toBeCloseTo(2 / 60, 6);
  });

  it('the point: mode 1, P = the node world matrix on pos, the point dist from P toward the presser, facing P', () => {
    const { calls, spec } = clocked(7, () => true);
    const move = spec.programs[0]!.sequences.flatMap((s) => s.ops).find((o) => o.op === 'aiMove');
    expect(move?.op).toBe('aiMove');
    if (move?.op !== 'aiMove') return;
    expect(move.mode).toBe(1);
    const P = apply4(mul4(spec.local, spec.parent), move.pos[0], move.pos[1], move.pos[2]);
    const dx = FROM[0] - P[0], dz = FROM[2] - P[2], l = Math.hypot(dx, dz);
    const { point, facing } = calls[0]!;
    expect(point[0]).toBeCloseTo(P[0] + move.dist * dx / l, 3);
    expect(point[1]).toBeCloseTo(P[1], 3);
    expect(point[2]).toBeCloseTo(P[2] + move.dist * dz / l, 3);
    expect(facing[0]).toBeCloseTo(-dx / l, 5);
    expect(facing[2]).toBeCloseTo(-dz / l, 5);
    console.log(`LATER 1206 door_rg_1 MOVE: pos ${JSON.stringify(move.pos)} dist ${move.dist} node ${move.node}; P (${P.map((v) => v.toFixed(2)).join(', ')}); point (${point.map((v) => v.toFixed(2)).join(', ')}); facing (${facing.map((v) => v.toFixed(3)).join(', ')}); from C2 ${Math.hypot(point[0] - FROM[0], point[2] - FROM[2]).toFixed(2)} u`);
  });
});

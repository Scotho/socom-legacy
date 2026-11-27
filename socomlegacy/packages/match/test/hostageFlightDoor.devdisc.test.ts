import { describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../../viewer/src/simMap';
import { HostageFollow, type FollowDoors } from '../src/hostageFollow';
import { HostagePathPlanner } from '../src/hostagePath';

/**
 * LATER 1208 (simulation track; reading, pending review): a FLEEING hostage (0x1b `CAiSGrenade`'s move child 0x18) whose
 * run's route passes a shut door's bound marker cell uses the door, as a follower does.
 *
 * THE ORIGINAL (r0001 code read; one movement word measured on r0004):
 * - The run child's tick `FUN_005f1160` takes its route through `FUN_00562790` (D:L503231, D:L503263): the walker's route
 *   object at the controller's +0x46c, and movement state 3 (`FUN_0056cbf0`(actor, 3)).
 * - The controller tick `FUN_0056de10` runs the walker `FUN_00567900` in movement state 3 (D:L432565-432567), the walker
 *   whose type-1 body pushes `CAiSAction` (0xb) at a shut door's marker cell (research 428 s3).
 * - The push's gate `FUN_005f5cd0` admits 0xb over 0x1b: 0x1b's allowed-next mask 0x310468c2 has bit 11 (research 445 s4),
 *   and 0x1b's veto (its vtable 0x669350 slot +0x1c) is 0x555390, the same always-allow as the follow goal's (research
 *   418 s22.11); its run-time bits are `HOSTAGE_DOOR_PUSH_GATE_READING`, as for a follower.
 * - MEASURED (r0004, PC 1's Q24c M2, 2026-11-18, `rig/Q24c-PC1/`): the hostage's +0x3f4 read 3 through its whole 125 u run
 *   under 0x1b. Q24c never put the door on the run's line (neither trial's run went toward it), so the door use under a
 *   flight is not yet seen running: the capture that would show it is queued for the next Shadow session.
 *
 * THE PORT before LATER 1208: `HostageFollow.run` steered the flight's route with no door dispatch, so a fleeing hostage
 * ran into a shut door and pressed against it, still "moving", without ever using it.
 *
 * TEST CHOICES (stated): MP71, door_rg_1's marker cell (223, 83) (research 418 s22.13, as `hostageShutDoor.devdisc.test.ts`);
 * the hostage starts at Q24c M2's spot on the room side and runs to the cell of `hostageShutDoor`'s C2 stand beyond the door
 * (the planner's route: (222,85) (223,84) (223,83) (223,82) (224,81)); the room's door is a stand-in (`FollowDoors`): its
 * valve reads 0 until 0.7 s after the use (door_rg_1's post-wait, research 428 s8.3), then 1. The bare grid holds the
 * door's leaf as a wall whatever the valve (the room's `DoorSet` owns the swing), so the crossing is not asserted here.
 */

const MP71 = fixture('RUN/MP71.ZDB');
type V3 = [number, number, number];
const MARKER: AiLoc = { map: 0, x: 223, z: 83 };
const M2_HOSTAGE: V3 = [2183.11, 179.1, 804.32];
const C2_STAND: V3 = [2207.48, 178.6, 760.39];
/** The rig's door point (research 428 s8): the door's line is z = 787.0. */
const DOOR_Z = 787.0;
const DT = 1 / 60;

describe.skipIf(!MP71)('LATER 1208: a fleeing hostage uses a shut door on its run\'s route (MP71 door_rg_1, dev-disc)', () => {
  it('the run\'s route crosses door_rg_1\'s marker cell; the hostage uses the shut door from the room side, stands until it opens, then runs on', () => {
    const map = simMapFromBytes(MP71!, 'RUN/MP71.ZDB');
    const planner = new HostagePathPlanner(map.ai!);
    const from = planner.locate(M2_HOSTAGE), goal = planner.locate(C2_STAND);
    expect(from && goal, 'both ends on the AI map').toBeTruthy();
    const plan = planner.plan(from!, goal!);
    expect(plan?.points.some((p) => p.map === MARKER.map && p.x === MARKER.x && p.z === MARKER.z), 'the route passes the door\'s marker cell').toBe(true);

    let valve = 0, usedAt = -1, openAt = -1, frame = 0;
    const uses: V3[] = [];
    const doors: FollowDoors = {
      at: (loc) => (loc.map === MARKER.map && loc.x === MARKER.x && loc.z === MARKER.z ? 0 : null),
      valve: () => valve,
      use: (_door, feet) => { uses.push([feet[0], feet[1], feet[2]]); if (usedAt < 0) usedAt = frame; return true; },
    };
    const h = new HostageFollow(planner, map.grid, M2_HOSTAGE, 0, map.defaultMaterial, null, undefined, doors);
    let heldFrom: V3 | null = null, heldMoved = 0, afterOpen: boolean | null = null, openFeet: V3 | null = null, movedAfter = 0;
    for (frame = 0; frame < 6 * 60; frame++) {
      if (usedAt >= 0 && valve === 0 && (frame - usedAt) * DT >= 0.7) { valve = 1; openAt = frame; }
      const running = h.run(DT, goal!);
      if (usedAt >= 0 && openAt < 0) {
        heldFrom ??= h.feet;
        heldMoved = Math.max(heldMoved, Math.hypot(h.feet[0] - heldFrom[0], h.feet[2] - heldFrom[2]));
      }
      if (openAt >= 0 && frame === openAt + 2) afterOpen = running;
      if (openAt >= 0) {
        openFeet ??= h.feet;
        movedAfter = Math.max(movedAfter, Math.hypot(h.feet[0] - openFeet[0], h.feet[2] - openFeet[2]));
      }
    }
    expect(uses.length, 'the shut door used once by the fleeing hostage').toBe(1);
    const at = uses[0]!;
    expect(at[2], 'used from the room side').toBeGreaterThan(DOOR_Z);
    expect(Math.hypot(at[0] - 2194.6, at[2] - DOOR_Z), 'used from short of the door').toBeLessThan(20);
    // The door goal on top: the body stands while the door is shut (`HOSTAGE_DOOR_STAND_PLACEHOLDER`, as a follower's).
    expect(heldMoved, 'the body stands from the use to the open').toBeLessThan(0.05);
    // The goal complete on the open (the valve reads the wanted state): the flight's run goes on along its route.
    expect(afterOpen, 'the run goes on once the door is open').toBe(true);
    // ... and the body moves again (the hold's own return is true too: the review's F1).
    expect(movedAfter, 'the body runs on toward the door after the open').toBeGreaterThan(0.1);
  });

  it('the flight dropped mid-hold (`stopRun`, 0x1b ended) drops the door goal: a new run steers and does not use the door again', () => {
    const map = simMapFromBytes(MP71!, 'RUN/MP71.ZDB');
    const planner = new HostagePathPlanner(map.ai!);
    const goal = planner.locate(C2_STAND)!;
    let uses = 0;
    const doors: FollowDoors = { at: (loc) => (loc.x === MARKER.x && loc.z === MARKER.z && loc.map === MARKER.map ? 0 : null), valve: () => 0, use: () => { uses++; return true; } };
    const h = new HostageFollow(planner, map.grid, M2_HOSTAGE, 0, map.defaultMaterial, null, undefined, doors);
    let f = 0;
    for (; f < 6 * 60 && uses === 0; f++) h.run(DT, goal);
    expect(uses, 'the door used once before the stop').toBe(1);
    for (let k = 0; k < 10; k++) h.run(DT, goal);
    const held = h.feet;
    h.stopRun();
    // A new flight away from the door (north into the room, Q24c M1's round rest): plain steering, no second use.
    const away = planner.locate([2168.96, 179.1, 830.11])!;
    let moved = 0;
    for (let k = 0; k < 60; k++) { h.run(DT, away); moved = Math.max(moved, Math.hypot(h.feet[0] - held[0], h.feet[2] - held[2])); }
    expect(uses, 'no second use after the stop').toBe(1);
    expect(moved, 'the new run steers the body').toBeGreaterThan(0.1);
  });

  it('an open door (valve non-zero) is plain steering: no use, the run steers on to the door', () => {
    const map = simMapFromBytes(MP71!, 'RUN/MP71.ZDB');
    const planner = new HostagePathPlanner(map.ai!);
    const goal = planner.locate(C2_STAND)!;
    let uses = 0;
    const doors: FollowDoors = { at: (loc) => (loc.x === MARKER.x && loc.z === MARKER.z && loc.map === MARKER.map ? 0 : null), valve: () => 1, use: () => { uses++; return true; } };
    const h = new HostageFollow(planner, map.grid, M2_HOSTAGE, 0, map.defaultMaterial, null, undefined, doors);
    for (let f = 0; f < 3 * 60; f++) h.run(DT, goal);
    expect(uses).toBe(0);
    // The bare grid holds door_rg_1's leaf as a wall (the room's `DoorSet` owns its swing), so the body reaches the line.
    expect(Math.abs(h.feet[2] - DOOR_Z), 'steered up to the door\'s line').toBeLessThan(1);
  });
});

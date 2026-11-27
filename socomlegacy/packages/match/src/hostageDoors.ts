import type { AiLoc, AiMaps } from '@s2u/scene';

/**
 * WM-HOSTAGE task 2 (LATER 958's root; research 428 s4): the load-time binding of the AI maps' door markers to the map's
 * action objects, for every map -- never a per-door switch.
 *
 * MARKER_BIND_READING [reading; research 418 s22.10, the binder `FUN_002a8140` read twice from the r0001 bytes, its store
 * r1 0x2a8c20 the decompiled text lists as a removed block (D:L149776); MEASURED on MP71 by the rig, research 404 s30:
 * ids 1, 3, 4, 0, 2, 5]: after the load's reset of every marker id to 0xffff (D:L152138) and after the actions have their
 * ids (D:L152160), each marker of type 1, 2, 3, 5 or 7 (the type in bits 23-27 of its word) takes the id -- the load
 * index, D:L157310 -- of an action object: by name where the cell's record holds one (step A), else the nearest action
 * object in x-z among those within 25.0 of the marker in height (step B, `FUN_002b4b40` from D:L157076, no horizontal
 * limit). Types 0, 6 and 8 or more bind nothing; type 4 binds into another container (not a door; not carried here).
 *
 * MARKER_BIND_BY_NAME_READING: step A's name lookup (`FUN_00530f40`, `FUN_00351ef0`, `FUN_002b4e00`) and its record's bit
 * 6 are not read by the port; step B alone binds. MP71's six measured ids are step B's (the unit test holds them).
 *
 * MARKER_BIND_POSITION_READING: the action object's position as step B measures it is taken as its node's placed origin
 * (`MapAction.at`); `FUN_002b4b40`'s own read of the object's position is not transcribed (research 418 s22.10's
 * "not checked"). An action whose node is not placed (dropped by `readMapActions`) can take no binding here, and later
 * ids would shift: the caller passes every action record in load order, `at` null when unplaced.
 */
export const MARKER_BIND_READING = { types: [1, 2, 3, 5, 7], height: 25.0 } as const;
export const MARKER_BIND_BY_NAME_READING = 'step B only: the record-name lookup (step A) is not read' as const;
export const MARKER_BIND_POSITION_READING = 'the action node\'s placed origin' as const;

/** An action object as the binder sees it: its load index is its position in the list. */
export interface BindAction { node: string; at: readonly [number, number, number] | null }

/** One bound marker: its cell, its type, and the action (load index and node) it now names. */
export interface DoorMarker { loc: AiLoc; type: number; action: number; node: string }

const key = (l: AiLoc): string => `${l.map},${l.x},${l.z}`;

/**
 * The bound markers of every sub-map (`MARKER_BIND_READING`), keyed by cell. `point` is the cell's world point (the
 * planner's `point`). A marker with no action in reach stays unbound (its disc id 0xffff: no entry).
 */
export function bindDoorMarkers(ai: AiMaps, actions: readonly BindAction[], point: (loc: AiLoc) => readonly number[]): Map<string, DoorMarker> {
  const out = new Map<string, DoorMarker>();
  for (const sub of ai.maps) for (const m of sub.markers) {
    const type = (m.word >>> 23) & 0x1f;
    if (!(MARKER_BIND_READING.types as readonly number[]).includes(type)) continue;
    const p = point(m.loc);
    let best = -1, bestD = Infinity;
    actions.forEach((a, i) => {
      if (!a.at || Math.abs(a.at[1] - p[1]!) > MARKER_BIND_READING.height) return;
      const d = Math.hypot(a.at[0] - p[0]!, a.at[2] - p[2]!);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) out.set(key(m.loc), { loc: m.loc, type, action: best, node: actions[best]!.node });
  }
  return out;
}

/** The bound marker on cell `loc`, if any. */
export function doorMarkerAt(markers: ReadonlyMap<string, DoorMarker>, loc: AiLoc): DoorMarker | undefined {
  return markers.get(key(loc));
}

/**
 * HOSTAGE_DOOR_ACTION_READING [reading, pending review; research 428 s2-s3, the r0001 decompilation and research 418's
 * byte reads]: a following hostage's use of a shut door, as the port carries it (`HostageFollow`'s door action).
 * - The dispatch: the walker `FUN_00567900`, while the route point it steers to (the last of its reversed list,
 *   D:L429496) lies on a cell with bit 7 and more than one point is left (D:L429515), dispatches on the marker's type
 *   (the table at 0x65c990, lost by the text at D:L429545-429551); type 1 (`type`) looks the marker's id up among the
 *   map's actions (`FUN_002b4d80`) and, on a valve of 0 (r1 0x567f0c-0x567f14), pushes `CAiSAction` (state 0xb) aimed at
 *   it with the wanted state 1 (`wanted`; r1 0x567ff8, r4 0x56d338) and +0x2c |= 0x2 (no approach). Valve non-zero (open,
 *   or locked 99) is plain steering.
 * - `CAiSAction`'s tick `FUN_005efa50`: at the top of every tick it completes when the valve equals the wanted state
 *   (D:L502499-502504); stage 0 with +0x2c & 0x2 goes to stage 6 and ends the tick (D:L502508-502528; no facing vector
 *   on the type-1 push); stage 6 uses the action, `FUN_002b44e0`(object, actor, pick) with pick 0 (`pick`; `FUN_005ec4e0`
 *   only with +0x2c & 0x1, D:L502651-502654); refused, stage 8 completes at once (D:L502655-502656, D:L502670-502685);
 *   accepted, stage 7 waits with no timeout (D:L502665-502667). On completion the follow state resets to INIT without
 *   re-arming its start gate (research 404 s24.1, D:L510103-510112; research 428 s2).
 * - The port's action is a door of the room's door set only (the action's node matched to a `DoorSpec`'s, case
 *   insensitive): the room runs no other action object's use, so a type-1 marker bound to an action that is not a door
 *   steers. Which frame the goal's first tick falls in after the push is not read: the port ticks it from the next game
 *   frame, and completes the follow's reset on the frame the action completes (the follow replans on the next).
 */
export const HOSTAGE_DOOR_ACTION_READING = { type: 1, wanted: 1, pick: 0 } as const;

/**
 * HOSTAGE_DOOR_PUSH_GATE_READING (research 428 s3 (c)): the push's gate `FUN_005f5cd0` admits 0xb on a FOLLOW stack by its
 * masks, but it has run-time bits (+0x265, `[actor+4]+0xe1` & 0x10, D:L505609-505611) and an override whose producers for
 * a hostage are unread. The port takes them as clear -- every push is admitted -- as the rig's 4 of 4 opens show for
 * door_rg_1. Settles: a read of what sets those bits on a `CSealCtrlAi` escortee.
 */
export const HOSTAGE_DOOR_PUSH_GATE_READING = 'the gate\'s run-time bits taken as clear: every push admitted' as const;

/**
 * HOSTAGE_DOOR_USE_COUNT_PLACEHOLDER (research 428 s5a): `CAiSAction`'s stage 7 also ends when the action's use count (the
 * byte at r0001 +0x3e, r0004 +0x42) rises past the one recorded at the use (D:L502660, D:L502666). The port keeps no use
 * count (`viewer/src/doors.ts`); where the count's store runs in time (the use program's callback, r1 0x2b46d0) is
 * unread, so the port's wait ends only on the valve's top-of-tick completion (D:L502499-502504). On a door whose pick-0
 * program leaves the valve at a value other than the wanted 1, the port's stage 7 (no timeout) would hold the follower for
 * good where the original leaves on the count's rise (the bodies seat's fresh review, finding 4; door_rg_1 opens to 1;
 * the rig's Q24b read the use byte rise 2 -> 3 about 1 s AFTER the open, in every measured trial: the count is stored
 * late, so the valve ends the wait first there;
 * other maps' door programs not checked). Settles: the callback's frame against the valve's, read or measured.
 */
export const HOSTAGE_DOOR_USE_COUNT_PLACEHOLDER = 'no use count: the wait ends when the valve reads open' as const;

/**
 * HOSTAGE_DOOR_RULE_EVENT_READING (research 428 s5; review 1, finding 10): a player's door use fires the rules engine's
 * `interact` event (`room.ts` `useDoor`); whether the original's scripts see an AI's use is unread, so the hostage's use
 * fires none. Settles: a read of the script event an action's use raises and whether it names its user.
 */
export const HOSTAGE_DOOR_RULE_EVENT_READING = 'the hostage\'s use fires no interact event' as const;

/**
 * HOSTAGE_DOOR_STAND_PLACEHOLDER (research 428 s0, s2, s8; was HOSTAGE_DOOR_STAND_READING until 2026-11-18): the port stands
 * the body (zero commands) from the push to the action's end. REFUTED as the original's behaviour by the rig's Q24b (PC 1,
 * r0004, MP71, 2026-11-18; a capture, hand-scored; hub rig/Q24b-PC1/ (attempt2/Q24b-summary.md)): its follower MOVES 10.5-12.6 u between the push
 * and the open (T1: pushed 9.44 u from the door's point, opened at 7.92), and C7 moved 1.37 u. Stage 6 calls
 * `FUN_0056cbf0`(actor, 4) and `FUN_0056dca0`(actor, 0) (D:L502627, D:L502649), whose bodies -- the movement state the
 * action sets -- are unread, so the stand stays as a named stand-in. Settles: a read of the two bodies, against Q24b's rows.
 */
export const HOSTAGE_DOOR_STAND_PLACEHOLDER = 'the body stands (zero commands) through the action' as const;
// NARROWED 2026-11-19 by LATER 1206 (research 428 s8.4-s8.5): the stand no longer spans the door program's `ai::MOVE` --
// from the use until the body is within 1.0 u of the MOVE's point or 0.4 s has passed it walks there
// (`HostageFollow.doorMove`; viewer `DOOR_MOVE_ARRIVE_READING`, `DOOR_MOVE_TIMEOUT_READING`). It stands from the push to
// the use (two game frames, stages 0 -> 6) and from the MOVE's end to the action's end, as before; stage 6's movement
// calls stay unread for those spans.

/**
 * HOSTAGE_DOOR_MOVE_STEER_PLACEHOLDER (LATER 1206; research 428 s8.5): while the door program's MOVE holds its goal on a
 * hostage, the port steers the body at the point with the follower's own direct steering (`HostageSteering.directStep`
 * at the follow's throttle, as `moveDirect`). The original's goal driver `FUN_00566dc0` writes the sticks (`+8` / `+0xc`)
 * by its own gains (`DAT_00650128`-`DAT_00650134`, D:L429100-429150), which are not transcribed. Settles: those gains
 * transcribed, or the rig's per-frame path of a hostage through its door MOVE.
 */
export const HOSTAGE_DOOR_MOVE_STEER_PLACEHOLDER = 'the follower direct steering at the point' as const;

/**
 * HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER (LATER 1206; research 428 s8.5): the MOVE's begin also gives the controller a
 * facing goal (`FUN_0056d920(ctrl, 3, dir, 0)`, D:L488975-488977: the flat direction toward the node's point); how the
 * controller turns the body to it is not read, so the port holds the facing (`HostageFollow`'s door goal) and turns the
 * body by no rule of it. Settles: `FUN_0056d920`'s goal and the turn that reads it, read.
 */
export const HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER = 'the facing held, not turned to' as const;

/**
 * HOSTAGE_DOOR_SHUT_BEHIND_READING (research 428 s3): the walker's shut-behind block (D:L429517-429541) uses the door again
 * to shut it once the follower stands on the cell the type-1 body saved, but the body saves it only past three gates
 * (r1 0x56804c-0x5680d4, each a set bit skipping the save: the controller's +0xb4 not below the first of five limits, its
 * +0x264 & 0x2, the actor's +0xc8 & 0x20000). The door match recorded them through the open (C2, C5, C7: +0xb4 0.0,
 * +0x264 & 0x2 clear, +0xc8 = 0xc0020000): gate three skips the save, and the rig saw no shut (4 of 4, and C2, C5, C7).
 * Not built. Settles: what sets the actor's +0xc8 & 0x20000 on a hostage, and a run where it is clear (research 428 s1).
 */
export const HOSTAGE_DOOR_SHUT_BEHIND_READING = 'not built: the door stays open behind the hostage' as const;

/**
 * HOSTAGE_DOOR_REACH_PLACEHOLDER (research 428 s5 item 4): the door program's `ai::ANIMATE` (`Open door`) is pushed on
 * the presser; the room's hook plays it on a seated player only, so the hostage body plays no reach. Whether the port's
 * hostage body should play that push is not settled. Settles: the No_weapon set's `Open door` entry and the rig's video.
 */
export const HOSTAGE_DOOR_REACH_PLACEHOLDER = 'no reach: the door\'s animate plays on a seated player only' as const;

/**
 * Every bound marker of `HOSTAGE_DOOR_ACTION_READING`'s type whose action is a door of the room's door set, as that door's
 * index in it (`doorNodes`: the set's `DoorSpec.node`s in order; matched case-insensitively, the first of a repeated
 * name), keyed by cell.
 */
export function followDoorCells(markers: ReadonlyMap<string, DoorMarker>, doorNodes: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  doorNodes.forEach((n, i) => { if (!index.has(n.toLowerCase())) index.set(n.toLowerCase(), i); });   // the first, as the room's own lookups
  const out = new Map<string, number>();
  for (const [k, m] of markers) {
    if (m.type !== HOSTAGE_DOOR_ACTION_READING.type) continue;
    const i = index.get(m.node.toLowerCase());
    if (i !== undefined) out.set(k, i);
  }
  return out;
}

/** The door index `followDoorCells` gives cell `loc`, else null. */
export function followDoorAt(cells: ReadonlyMap<string, number>, loc: AiLoc): number | null {
  return cells.get(key(loc)) ?? null;
}

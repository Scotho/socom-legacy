/**
 * FP-REPITCH (the controller's ruling (B), 2026-11-25; reading, pending review): the one-shot re-pitch the original's
 * camera makes on the pass its mode changes, before it builds the view (r0004 CAppCamera::Tick D4:L149867-149895, the
 * last mode kept at cam+0x13a; ATLAS's throw-aim reading s13.2). Measured on r0004 (PC 2): REPITCH-BACK-PC2
 * (-9.17 -> +4.28 -> -8.70), C7-OFFCLAMP-PC2 (first-person looks -5.88 / +1.85 / +4.24 / +7.10 at open / d 30 / 25 / 21),
 * THROW-H15-PC2 leg B (the pitch set once at the switch and held with no look input).
 *
 * Transcribed from r0001's twins (the calls equal to r0004's, ATLAS s13.8):
 * - third -> first, `FUN_0029a3f0` (D:L142266-142320; r0004 FUN_0029b980 D4:L150150-150208): the vertex is the head
 *   eye `FUN_0029ae50` (the port's `./cameraRig` `scopeEye`), the look the head's +0x1070 turning (0, 0, -1)
 *   (D:L142289, D:L142294), the point the stored aim point +0x1458 (D:L142299-142301) taken into the body's space
 *   (D:L142302-142307); each one's angle `FUN_001b38e0(dy, dz)` in the body's y-z plane (D:L142297, D:L142308), both
 *   wrapped into [0, 2 pi] (D:L142309-142316), and the pitch `cam+0xc4 +0x130` moved by their difference, unclamped
 *   (D:L142317-142318), then `FUN_005af470` turns the head (D:L142319-142320).
 * - first -> third, `FUN_00299ed0` (D:L142129-142198; r0004 FUN_0029b460 D4:L150013-150084): the same about the tether's
 *   target (`FUN_0029a950`, the port's `localCamera(...).target`) and the look (0, 0, -1000) (D:L142156), the result
 *   clamped to +-1.57 rad (D:L142185-142194).
 * With z behind, the look's angle is pi - pitch and the point's pi - its elevation, so the new pitch is the elevation from
 * the vertex to the point along the body's facing: the head's centre line then passes through the third person's T.
 * The body's x (across) is no part of it, and the yaw is not changed.
 *
 * Not built here (named): the third mode change (`FUN_0029a180`, D:L142203-142261; r0004 FUN_0029b710, new mode 1 from
 * 2: the tether helper, not the walk's views); and the room -- see `FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER`.
 */

const DEG = Math.PI / 180;
const TAU = 6.2831855;                                       // the loops' constant (D:L142309-142316)

/**
 * FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER (LATER 1582; the controller's ruling (B), 2026-11-25; a named DEPARTURE from
 * the original's behaviour, not a browser adaptation -- ATLAS's second read F1): the original writes the new pitch
 * straight into the controller and the head on the switch's pass (`FUN_0029a3f0` D:L142317-142320; r0004 D4:L150203-150206).
 * The port lays it on the page's camera (`./walk` `setScoped`) and the body -- the page's own mover and the room's alike --
 * takes it through each command's look, held by the look gate (OT.R38, `./net/lookGate` `lookAllowance`) to ~1.87 degrees
 * a tick (`LOOK_RATE_MAX_ADAPTATION`'s pitch 1.462 rad/s + `PITCH_RETURN` 0.5 rad/s, at `TICK` 1/60), a still body's
 * banked allowance (`LOOK_SLACK_TICKS_PLACEHOLDER`, 4 ticks) on top of the first: r0004's 7-17 degree re-pitches
 * (THROW-H15-PC2 7.1; C7-OFFCLAMP-PC2 11.0 / 13.4 / 16.3; REPITCH-BACK-PC2 13.0) reach the body in ~1-5 ticks, page and
 * room agreeing. Inside that window a throw leaves on the pitch reached so far, and the ROOM's cone reads the ramp as a
 * full-stick pitch turn (the page's does not: `./matchFirearm` `viewLanes` carries `lastLook`, review 1 F1), where the
 * original's switch moves no stick. Settled by a wire word for the switch (option (A): one command's pitch laid as given,
 * as the turret mount's `allowSnap`) -- the owner's to name, for v0.4.33.
 */
export const FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER = "the re-pitch reaches the body at the look gate's law" as const;

/** `FUN_00299ed0`'s clamp on the first -> third pitch: 0x3fc8f5c3 / 0xbfc8f5c3 = +-1.57 rad (D:L142185-142194). */
export const FIRST_TO_THIRD_PITCH_CLAMP = 1.57;

/** World to the actor's space (x right, y up over the feet, -z ahead): `./cameraRig` `toWorld`'s inverse. */
export function toActor(feet: readonly number[], yawDegrees: number, w: readonly number[]): [number, number, number] {
  const y = yawDegrees * DEG, c = Math.cos(y), s = Math.sin(y);
  const dx = w[0]! - feet[0]!, dz = w[2]! - feet[2]!;
  return [dx * c - dz * s, w[1]! - feet[1]!, dx * s + dz * c];
}

const wrap = (a: number): number => {
  let v = a;
  while (v < 0) v += TAU;
  while (TAU < v) v -= TAU;
  return v;
};

/**
 * The re-pitch (degrees, up positive) a view switch lays: the vertex (the head eye, or the tether's target) and the
 * stored aim point in the world, the body's yaw, the look's pitch now; `clamp` for the first -> third helper alone.
 * Only the difference of the two points enters, so the feet cancel.
 */
export function repitchToward(vertex: readonly number[], point: readonly number[], yawDegrees: number, pitchDegrees: number, clamp: boolean): number {
  const p = pitchDegrees * DEG;
  // the look: (0, 0, -1) turned by the head's pitch about x -- (0, sin p, -cos p) -- from the vertex
  const a1 = wrap(Math.atan2(Math.sin(p), -Math.cos(p)));
  const d = toActor(vertex, yawDegrees, point);              // the point in the body's frame, about the vertex
  const a2 = wrap(Math.atan2(d[1], d[2]));
  let next = p + (a1 - a2);
  if (clamp) next = next > FIRST_TO_THIRD_PITCH_CLAMP ? FIRST_TO_THIRD_PITCH_CLAMP : next < -FIRST_TO_THIRD_PITCH_CLAMP ? -FIRST_TO_THIRD_PITCH_CLAMP : next;
  return next / DEG;
}

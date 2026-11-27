import type { Stance } from './walk';

/**
 * LATER 711 -- the push-apart between bodies, step (1): the CONTACT SLIDE (research 426 s2, s4; simulation track;
 * reading, pending review). `FUN_0054f7e0` (D:L417351-417668), run for each moving SEAL once a frame, online from the
 * actor's update (D:L416574-416576) and offline from the task "body_collide_tick" (`FUN_0054f570`, D:L417278-417314):
 * for each other SEAL already inside the two radii's sum (the neighbour list's distance at the frame's start,
 * D:L417582), the two cylinders are swept over the frame's displacement (`FUN_00550330`, D:L417669-417755) and, on a hit
 * moving inward, the inward part of the displacement is removed (r0001 0x550074-0x550104). Head-on that stops the body;
 * off-centre it slides round; nothing pushes it back out (unflagged). It writes only the moving body.
 *
 * The muzzle push (research 426 s3, the local human's) is step (2): not here (`PUSH_APART_MUZZLE_REACH_READING`).
 */

/** The cylinder's radius by the stance word `+0x174` (`Walker.stance`; r0001 0x54f99c-0x54f9cc own, 0x54fbb8-0x54fc2c other). */
export const PUSH_APART_RADIUS_READING: Readonly<Record<Stance, number>> = { stand: 6, crouch: 7, prone: 8 };

/**
 * Two AI bodies (both controllers' vtable `+0x30` answering 1): both radii x 0.65 (`DAT_0064fcc0`, read in the image)
 * for the sweep, after the gate is formed with the unscaled radii (r0001 0x54fe68-0x54fee8; research 426 s3).
 */
export const PUSH_APART_AI_PAIR_SCALE_READING = 0.65;

/**
 * The page's other bodies' stance: the posture the snapshot carries (`BodyState.stance`), not the other body's own stance
 * word `+0x174`, which the original indexes (r1 0x54fb68 the radius, 0x550000 the height) and which is not on the wire.
 * A remote copy in a crouch run (stance word crouch, posture stand) is taken at stand's 6 / 19.1 where the original
 * takes crouch's 7 / 15: a gap in the port's wire. Settled by the stance word on the wire, or the rig's crouch-run
 * contact leg.
 */
export const PUSH_APART_REMOTE_STANCE_PLACEHOLDER = 'the drawn posture' as const;

/**
 * The order the bodies are taken in when two or more are in contact at once: the original's neighbour list's sort
 * order by its comparator -- NEAREST FIRST by 3-D distance squared (`+0xd8`, built by `FUN_002a0a10` D:L145876-145985,
 * sorted by `FUN_002a12e0`, the comparator at 0x2a1140 comparing entry `+0x10`; 8f's second read). The removals do not
 * commute when two normals are not orthogonal.
 */
export const PUSH_APART_ORDER_READING = 'nearest first' as const;

/**
 * The original's list is not kept sorted every frame (the fold check's reading of `FUN_002a0a10`, 2026-11-15): a full
 * sort happens only on a rebuild (the object count changed, D:L145893-145899) and only when the call's third argument is
 * set (the 3-object window, `DAT_003de2e8` 3, D:L145749-145776); otherwise a re-sort is triggered only when an entry is
 * nearer than its predecessor by more than 100 in distance squared (`DAT_003de2f0`) and inside `+0xcc`
 * (D:L145935-145983). Two standing bodies both in contact differ by less than 100 in distance squared (both under 144),
 * so an inversion between them can last until the next rebuild. The port sorts fresh every call.
 */
export const PUSH_APART_ORDER_STALE_PLACEHOLDER = 'sorted fresh each call' as const;
/** The cylinder's height by the stance word (r0001 0x54f9d4-0x54fa10; 0x4198cccd is 19.1), passed to `FUN_00550330` on the stack. */
export const PUSH_APART_HEIGHT_READING: Readonly<Record<Stance, number>> = { stand: 19.1, crouch: 15, prone: 6 };

/**
 * The x1.75 on a body's radius while its weapon-raised envelope (`+0x1160`) is over 0.05 (D:L417451-417454,
 * D:L417499-417502; research 426 s5): not applied. The port does not carry the envelope on its bodies, and the rig's
 * teammate legs (research 426 s6) fit the plain radii; what raises the envelope (a pad button, D:L453520) is unread.
 */
export const PUSH_APART_RAISED_PLACEHOLDER = 'not applied' as const;

/**
 * An UPRIGHT body meeting a prone (or state-8) one: the original skips it and sets the mover's `+0x21c` to value 2
 * (r1 D:L417485-417489, kept in r0004 at r4 0x554b58-0x554ba4). What reads that value -- the "floor on prone bodies" of
 * LATER 711's row -- is unread, so the port only skips (research 426 s2, s8, s10). Settled by the reader of `+0x21c`'s
 * value 2, and the rig's Q22-WP legs P1/P2 (a walk and a run into a prone teammate).
 */
export const PUSH_APART_PRONE_PLACEHOLDER = 'an upright mover skips a prone body; +0x21c value 2 unread' as const;

/**
 * A PRONE moving body (r0004's flag: own stance word `+0x174` 2, or action 0x13 / 0x19 on top, r4 0x554888-0x5548cc --
 * the port flags the prone stance only; those two actions are unnamed): it skips every body not in state 2 or 8
 * (r4 0x554ba8-0x554bb4), and on an inward hit against a prone one the displacement is zeroed and the dot floored at
 * -1 before the normal's part is taken off (r4 0x5551f0-0x555250; research 426 s5.2, re-read by the bodies seat): the
 * move is replaced by an outward step of min(|dot|, this) along the normal, with no tangential part. Per game frame in
 * the original; the port applies it per 60 Hz tick (its moves are a tick's), which binds at no crawl speed:
 * `seal_prone_crawl`'s 11 u/s is 0.18 u a tick. A DIVE: the port's stance is prone from the dive's start (viewer
 * `traversal.ts`), so the flag holds through a dive's carry -- a dive into a prone body meets the cap (up to 1 u a tick
 * pushed back, 60 u/s, against the original's 1 u a 30 Hz frame) and a dive passes through an upright one (the flag's
 * skip). Whether the original's diver holds the flag (`+0x174` 2, or 0x13 / 0x19 on top through the dive) is unread
 * (research 426 s10.2; the fresh review's finding 1). [reading, pending review]
 */
export const PUSH_APART_PRONE_STEP_READING = 1;

/**
 * Hostages: the original's hostage is the same SEAL-class actor (type byte 2) and would collide. Left out of step (1)
 * by the main controller's ruling (2026-11-15): the hostage lane's doorway work comes first; it joins when that lane
 * says so. Only the seats' bodies (players and bots) are offered.
 */
export const PUSH_APART_HOSTAGE_PLACEHOLDER = 'hostages not offered' as const;

/** Another body as the push-apart reads it: its feet, its stance word and whether its controller is an AI's (`+0x30`). */
export interface OtherBody { x: number; y: number; z: number; stance: Stance; ai?: boolean }

/**
 * One displacement `[dx, dy, dz]` of a body at `(x, y, z)` in `stance` against the other bodies: each body already inside
 * the radii's sum takes the inward part off, in the list's order (the original's loop, D:L417473-417655). An upright
 * body skips a prone one (`+0x21c` value 2, D:L417485-417489). Coincident centres give a zero normal, which the
 * original's normalise leaves zero (`FUN_00309110`), so nothing acts. Returns the displacement to move by.
 */
export function contactSlide(
  x: number, y: number, z: number, stance: Stance, d: readonly [number, number, number], bodies: readonly OtherBody[],
  ai = false, carried?: [number, number],
): [number, number, number] {
  let [dx, dy, dz] = d;
  const proneFlag = stance === 'prone';                                // r0004's flag (PUSH_APART_PRONE_STEP_READING)
  const rA0 = PUSH_APART_RADIUS_READING[stance], hA = PUSH_APART_HEIGHT_READING[stance];
  // Nearest first (`PUSH_APART_ORDER_READING`): a sorted copy when two or more are offered.
  const d2 = (b: OtherBody): number => (x - b.x) ** 2 + (y - b.y) ** 2 + (z - b.z) ** 2;
  const order = bodies.length > 1 ? [...bodies].sort((p, q) => d2(p) - d2(q)) : bodies;
  for (const b of order) {
    if (proneFlag ? b.stance !== 'prone' : b.stance === 'prone') continue;   // the flag's skip; the upright body's prone skip (PUSH_APART_PRONE_PLACEHOLDER)
    const rB0 = PUSH_APART_RADIUS_READING[b.stance], hB = PUSH_APART_HEIGHT_READING[b.stance];
    const px = x - b.x, py = y - b.y, pz = z - b.z;
    const gate = rA0 + rB0;
    if (px * px + py * py + pz * pz >= gate * gate) continue;          // not yet inside: the neighbour list's gate, unscaled
    const k = ai && b.ai ? PUSH_APART_AI_PAIR_SCALE_READING : 1;        // two AI bodies: both radii x 0.65 for the sweep
    const R = gate * k;
    // The height slabs over the frame (`FUN_00550330`'s first half): level, they must overlap; else the entry and exit times.
    let t0 = 0, t1 = 1;
    if (dy === 0) {
      if (b.y + hB < y || y + hA < b.y) continue;
    } else {
      const enter = (dy > 0 ? (b.y - y) - hA : (b.y + hB) - y) / dy;
      const exit = (dy > 0 ? (b.y + hB) - y : (b.y - y) - hA) / dy;
      if (exit < 0 || enter > 1) continue;
      t0 = Math.max(0, enter); t1 = Math.min(1, exit);
    }
    // The horizontal circle of radius R swept over the displacement; inside at the start, the contact time is the slab's entry.
    const a = dx * dx + dz * dz, half = px * dx + pz * dz, c = px * px + pz * pz - R * R;
    let t = t0;
    if (a > 0) {
      const disc = half * half - a * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      const lo = (-half - root) / a, hi = (-half + root) / a;
      if (hi < t0 || lo > t1) continue;
      t = Math.max(lo, t0);
    } else if (c > 0) continue;
    const nx = px + t * dx, nz = pz + t * dz, n = Math.hypot(nx, nz);
    if (n === 0) continue;                                             // FUN_00309110: a zero normal stays zero
    const ux = nx / n, uz = nz / n, dot = dx * ux + dz * uz;
    if (dot < 0) {
      if (proneFlag) {                                                 // r4 0x5551f0-0x555250: zeroed, the dot floored, an outward step
        const f = Math.max(dot, -PUSH_APART_PRONE_STEP_READING);
        dx = -f * ux; dy = 0; dz = -f * uz;
      } else { dx -= dot * ux; dz -= dot * uz; }                       // the inward part removed
    }
    // The velocity carried through the air and a landing (`+0x1350`): its inward part removed too (0x550108-0x550174).
    if (carried) { const into = carried[0] * ux + carried[1] * uz; if (into < 0) { carried[0] -= into * ux; carried[1] -= into * uz; } }
  }
  return [dx, dy, dz];
}


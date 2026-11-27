import { describe, expect, it } from 'vitest';
import { ACTION_CONTEXT_ORDER, ActionSelection, type ContextInputs } from '../src/actionContext';
import { CameraEffects, turnLook } from '../src/cameraEffects';
import { HostagePage, type HostagePageDeps } from '../src/hostagePage';
import { bodyVolumes, rayBody, type HitBody } from '../src/net/hitVolumes';
import type { HostageStateWire } from '../src/net/protocol';

/**
 * LATER 1261 (issue #832; product track, a test of the page's own code, no game behaviour changes): the release gate's
 * `handsonActionOrder.spec.ts` was red 2/2 at the v0.4.27 cut and green before and since, each red an offer absent at one
 * read. What this file rules out, and what it does not (the batch review of 82274cd305, F2-c):
 *
 * A. Under a FIXED placeholder body (`bodyVolumes(..., null)`: `placeholderVolumes`' capsules, not the hostage's own
 *    `escorteeVolumesOf` nor the drawn body the browser spec picks on) and a still aim through it, the page module's pick
 *    (`HostagePage` -> `crosshairPick` -> `orderTestRefusal`, the ray met by `rayBody`, asked afresh each frame) offers
 *    FOLLOW! on every frame, unturned and at the corners of the camera_effects jiggle's range as the disc runs it
 *    (LATER 1246; `cameraJiggle.test.ts` (b): yaw +-k/2, pitch 0..-k, down only; k = 0.05 deg/s x 1 s). So no flicker
 *    lives in the page module or the pick with every input held. NOT covered, and still open for #832: the drawn body's
 *    pose (research 199 row 9: the hostage starts civ_stand2crouch 2 s after spawn), `RemotePlayers.aimBodies`' filters,
 *    the hull's surfaces, a cell boundary, the hostageState stream. The control: an aim just ABOVE the head's top edge is
 *    met only when the jiggle's downward pitch carries the ray into the head -- the edge flip PC 1's L1246 capture shows
 *    the original's use pick making.
 *
 * B. The action list (`ActionSelection`, `../src/actionContext.ts` ~:97-102) keeps a d-pad rotation while the offers stay
 *    as they are, and is REBUILT in `ACTION_CONTEXT_ORDER` when one drops or returns ("The list is rebuilt when
 *    availability changes"; the HUD's list, research 87 s5): one frame with FOLLOW! absent takes a turned list back to the
 *    order's head -- a fair account of the spec's second red ("Left again reaches the TAKE", received `escortee`), not a
 *    proof of its cause.
 */

type V3 = [number, number, number];
const HOSTAGE = 240;
/** The hostage at the origin facing +z; the SEAL's eye 15 u south of it at a standing head's height (as the spec stands it). */
const HOSTAGE_FEET: V3 = [0, 0, 0];
const EYE: V3 = [0, 15.884, 15];
/** The placeholder capsules (`bodyVolumes` with no volumes), a fixed body: see the header for what that does not cover. */
const BODY: HitBody = bodyVolumes(HOSTAGE_FEET, 0, 'stand', null);
const K = Math.fround((0.05 * Math.PI) / 180);

const hostage: HostageStateWire = { id: HOSTAGE, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 };

/** A page whose aim is `far()` from EYE, the bodies the real ray test meets. */
function page(far: () => V3): HostagePage {
  const deps: HostagePageDeps = {
    self: () => ({ id: 1, alive: true, spectator: false, side: 'seal', feet: [EYE[0], 0, EYE[2]] }),
    hostages: () => [hostage],
    feet: (id) => (id === HOSTAGE ? HOSTAGE_FEET : null),
    aim: () => ({ eye: EYE, far: far() }),
    bodies: (eye, dir, reach) => {
      const hit = rayBody(eye, dir, reach, BODY);
      return hit ? [{ id: HOSTAGE, distance: hit.t }] : [];
    },
    surfaces: () => [],
    cellOf: (feet) => ({ map: 0, x: Math.floor(feet[0]! / 10), z: Math.floor(feet[2]! / 10) }),
    order: () => true,
  };
  return new HostagePage(deps);
}

/** The body's centre and its top: the stance set's capsules' bounds. */
function bounds(): { centre: V3; top: number } {
  const caps = BODY.caps ?? [];
  expect(caps.length, 'the stance set has capsules').toBeGreaterThan(0);
  const ys = caps.flatMap((c) => [c.a[1] + c.r, c.b[1] + c.r, c.a[1] - c.r, c.b[1] - c.r]);
  const top = Math.max(...ys), bottom = Math.max(0, Math.min(...ys));
  return { centre: [HOSTAGE_FEET[0], (top + bottom) / 2, HOSTAGE_FEET[2]], top };
}

/**
 * The jiggle's turns at the corners of its range as the disc runs it (`cameraJiggle.test.ts` (b): yaw +-k/2, pitch 0..-k,
 * the view turned DOWN only), each made by the node's own legs (as the F1 case there): a pitch leg (-k, 1 s), a yaw leg
 * (+-k, 0.5 s), and both in turn. The sign: a positive node x turns the view up (the review's probe), so down is -k.
 */
function jiggleTurns(): number[][] {
  const out: number[][] = [];
  const legs: [number, number, number][][] = [
    [[0, K, 0.5]], [[0, -K, 0.5]], [[-K, 0, 1]], [[-K, 0, 1], [0, K, 0.5]], [[-K, 0, 1], [0, -K, 0.5]],
  ];
  for (const seq of legs) {
    const node = new CameraEffects();
    node.rotate({ op: 'rotate', node: 1, flags: 1, xyz: [0, 0, 0] } as never);
    for (const [wx, wy, seconds] of seq) {
      const leg = node.motion({ op: 'motion', motion: { node: 1, flags: 0x101, lifetime: seconds, angular: { w: [wx, wy, 0], accel: [0, 0, 0] } } } as never);
      for (let i = 0; i < Math.round(seconds * 60); i++) leg(1 / 60);
    }
    const t = node.turn();
    expect(t, 'the legs turned the node').not.toBeNull();
    out.push(t!);
  }
  return out;
}

describe('LATER 1261 A: the FOLLOW! offer holds on a still body under a still aim (issue #832)', () => {
  it('aimed through the body, every frame offers FOLLOW!, unturned and at each corner of the jiggle\'s range', () => {
    const { centre } = bounds();
    const turns = jiggleTurns();
    let turn: number[] | null = null;
    const p = page(() => (turn ? turnLook(EYE, centre, turn) : centre));
    const missing: string[] = [];
    for (let f = 0; f < 4 * 60; f++) {                       // a jiggle period's frames, each corner in turn
      turn = f % (turns.length + 1) === 0 ? null : turns[(f % (turns.length + 1)) - 1]!;
      p.frame();
      const o = p.offer();
      if (!o || o.text !== 'FOLLOW!') missing.push(`frame ${f}: ${p.why()}`);
    }
    expect(missing, 'frames without FOLLOW! under a still aim through the body').toEqual([]);
  });

  it('the control: aimed just above the head’s top edge, the jiggle’s downward pitch carries the ray into the head (the edge flip of L1246)', () => {
    const { top } = bounds();
    // The aim's height at the hostage found to within 1e-6 of the last that meets the body (its top edge), from inside the
    // torso (the centreline passes between the legs low down) up past the head's top.
    let lo = 10, hi = top + 5;
    const meets = (y: number): boolean => { const p = page(() => [0, y, 0]); return p.offer() !== null; };
    expect(meets(lo) && !meets(hi), 'the torso meets the body; above the head does not').toBe(true);
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (meets(m)) lo = m; else hi = m; }
    // Just above the edge: unturned the ray misses; the full downward pitch (about 0.0137 u at the hostage) meets the head.
    const above: V3 = [0, lo + 0.005, 0];
    expect(page(() => above).offer(), 'unturned, just above the head: no pick').toBeNull();
    const turns = jiggleTurns();
    const met = turns.map((t) => page(() => turnLook(EYE, above, t)).offer() !== null);
    expect(met.some(Boolean), 'a downward jiggle turn meets the head').toBe(true);
    expect(met.some((m) => !m), 'a yaw-only turn keeps missing: the pick flips with the jiggle’s phase').toBe(true);
  });
});

describe('LATER 1261 B: the action list keeps a turn while the offers hold, and is rebuilt when one drops or returns', () => {
  const all: ContextInputs = { escortee: true, victory: true, pickup: true };
  it('the order is escortee, victory, pickup (ACTION_CONTEXT_ORDER, OT.R128 as amended)', () => {
    expect(ACTION_CONTEXT_ORDER.filter((c) => all[c])).toEqual(['escortee', 'victory', 'pickup']);
  });

  it('Left turns the head to the dance and the turn holds over frames while the offers stay', () => {
    const s = new ActionSelection();
    expect(s.pick(all)).toBe('escortee');
    s.rotate('left');
    for (let f = 0; f < 120; f++) expect(s.pick(all), `frame ${f}`).toBe('victory');
    s.rotate('left');
    expect(s.pick(all)).toBe('pickup');
  });

  it('one frame without FOLLOW! rebuilds the list, and its return puts escortee back at the head: the turn is lost (the spec\'s second red)', () => {
    const s = new ActionSelection();
    s.pick(all);
    s.rotate('left');
    expect(s.pick(all)).toBe('victory');
    expect(s.pick({ victory: true, pickup: true })).toBe('victory');            // FOLLOW! absent one frame: rebuilt
    expect(s.list()).toEqual(['victory', 'pickup']);
    s.rotate('left');                                                            // a press in that frame
    expect(s.pick(all), 'FOLLOW! back: the list rebuilt in the order, the turns gone').toBe('escortee');
    expect(s.list()).toEqual(['escortee', 'victory', 'pickup']);
  });
});

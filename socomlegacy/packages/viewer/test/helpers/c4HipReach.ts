import { rootY, type Stance } from '../../src/mover';

/**
 * LATER 1139 (research 440 s8): ONE C4 reach gate for the page and the room -- the plant takes its target only while the
 * squared 3-D distance from the hip (`skel_root`) to the aim's point is under 396 (`FUN_005be9a0` D:L475400-475405,
 * `body+0x208 < 396`; the word's writer `FUN_00215c10`, research 202 s2.1, research 394). PROVEN on the running original:
 * the capture `later1139-c4reach` (r0004, 2026-11-18, Shadow PC #3; PINE reads of `body+0x208` beside HUD shots, 19 holds
 * in 7 rounds across 3 games): the prompt shows at `+0x208` <= 395.68 and never at >= 396.23; 19.8 u shows it, 20.0 u
 * does not; the word is the live squared distance, not clamped. The hip itself is the port's stand-in, `hipPoint`
 * (`C4_HIP_POINT_READING`): straight over the feet at the stance's root (11.484 / 5.504 / 2.168).
 *
 * One table, driven by the page (`viewer/test/c4HipReach.test.ts`) and the room (`match/test/roomC4HipReach.test.ts`).
 */
export const C4_HIP_CAPTURE = 'later1139-c4reach (r0004, 2026-11-18): +0x208 <= 395.68 prompts, >= 396.23 does not';

/** The proven gate, squared units (the capture's bracket 395.68-396.23 holds 396.0). */
export const HIP_REACH_SQ = 396;

export interface HipCase {
  /** What the case shows. */
  name: string;
  posture: Stance;
  /** The aim's point along the ground from the feet (the body faces it). */
  along: number;
  /** The point's height over the feet; `hip` the stance's root (`rootY`), `hip+10` a ledge ten over it. */
  up: number | 'hip' | 'hip+10';
  /** A GLASS pane (looked through by the aim, research 440 s2) stands between the body and the point. */
  pane?: boolean;
  taken: boolean;
}

/** The point's height over the feet for a case. */
export function caseUp(c: HipCase): number {
  return c.up === 'hip' ? rootY(c.posture) : c.up === 'hip+10' ? rootY(c.posture) + 10 : c.up;
}

/** The case's squared distance from the stand-in hip (straight over the feet at `rootY`). */
export function caseHipSq(c: HipCase): number {
  const dy = caseUp(c) - rootY(c.posture);
  return c.along * c.along + dy * dy;
}

/** The gate's own cases. */
export const HIP_CASES: readonly HipCase[] = [
  { name: 'standing, the point at hip height, 19 u: taken', posture: 'stand', along: 19, up: 'hip', taken: true },
  { name: 'standing, the point at hip height, 21 u: refused', posture: 'stand', along: 21, up: 'hip', taken: false },
  { name: "the capture's pair: 19.8 u taken", posture: 'stand', along: 19.8, up: 'hip', taken: true },
  { name: "the capture's pair: 20.0 u refused", posture: 'stand', along: 20, up: 'hip', taken: false },
  { name: 'through a GLASS pane, 19 u: taken', posture: 'stand', along: 19, up: 'hip', pane: true, taken: true },
  { name: 'through a GLASS pane, 21 u: refused', posture: 'stand', along: 21, up: 'hip', pane: true, taken: false },
  { name: 'crouched, the point 12 up, 19 along: refused (20.08 from the hip)', posture: 'crouch', along: 19, up: 12, taken: false },
  { name: 'prone, the point 12 up, 17 along: taken', posture: 'prone', along: 17, up: 12, taken: true },
  { name: 'prone, the point 12 up, 18 along: refused', posture: 'prone', along: 18, up: 12, taken: false },
  { name: 'a ledge 10 over the hip, 17 along: taken', posture: 'stand', along: 17, up: 'hip+10', taken: true },
  { name: 'a ledge 10 over the hip, 18 along: refused', posture: 'stand', along: 18, up: 'hip+10', taken: false },
  { name: 'standing, a point at floor level, 16 along: taken', posture: 'stand', along: 16, up: 0, taken: true },
  { name: 'standing, a point at floor level, 17 along: refused', posture: 'stand', along: 17, up: 0, taken: false },
];

/**
 * Research 440 s4's places, by the sweep's ground gap between the looked-through face's box and the target's kept faces'
 * box (a lower bound on the feet-to-point distance). Synthetic: the point at hip height `gap` along, standing -- not the
 * maps' own stand points (no disc read here).
 */
export const PLACES_REFUSED = [
  { map: 'MP6', target: 'access1', front: 'beer3 GLASS', gap: 20.2 },
  { map: 'MP6', target: 'access1', front: 'beer4 GLASS', gap: 19.9 },
  { map: 'MP73', target: 'kill_radio', front: 'special_windows/window04 GLASS', gap: 25.6 },
  { map: 'MP83', target: 'access1', front: 'wc15 CHAINLINK_FENCE', gap: 25.4 },
  { map: 'MP83', target: 'access2', front: 'wc13 CHAINLINK_FENCE', gap: 26.4 },
] as const;
export const PLACES_TAKEN = [
  { map: 'MP11', target: 'access1/access2', front: "the gate's own di_chain CHAINLINK_FENCE", gap: 0.0 },
  { map: 'MP11', target: 'access1/access2', front: 'the static fences CHAINLINK_FENCE', gap: 1.4 },
  { map: 'MP6', target: 'the table things (ashtrays, tin cups, plates)', front: 'the bottles GLASS (the farthest)', gap: 12.3 },
  { map: 'MP6', target: 'access1', front: 'beer8 GLASS', gap: 16.5 },
] as const;

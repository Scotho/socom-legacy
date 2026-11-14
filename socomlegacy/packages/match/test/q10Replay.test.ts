import { beforeAll, describe, expect, it } from 'vitest';
import { sampleClip } from '@s2u/scene';
import { applyHit, freshHealth, PART } from '../../viewer/src/net/damage';
import { NO_PART, placedVolumes, posedBoxes, rayRecords, type V3 } from '../../viewer/src/net/hitVolumes';
import { writePose } from '../../viewer/src/animator';
import { simSkeletonsFromBytes, type SimSkeleton } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { bodyApplications, walkOrder } from '../src/bodyWalk';

/**
 * Q10 (finding 15, "red mist that would not register"; the main controller's order (67), 2026-11-13): the original's
 * measured rounds laid on the port's boxes, walk and damage. A capture comparison: the original side is MEASURED -- the
 * rig's Q10 (r0004, two PCSX2 consoles, MP2; the shadow seat, 2026-11-13, the box store's
 * `gate-runner/shadow/out/2026-11-13/q10-hitreg/block1-4.out`), each victim's six part healths and armours read from memory
 * before and after every round, three rounds a spot -- and the port side is the port's reading (research 398's walk,
 * research 217 s3.6b's boxes, `FUN_005a5830`'s damage), unit-tested here on fixture data. No capture is scored here.
 *
 * The original: a scuba SEAL B standing still, its yaw written to 90 (facing the shooter at -x), feet at y 100; the
 * Terrorist shooter A at (840.5, 100, 613) (one row 840.529, 612.713), the 552 in single taps. Each row logs the camera's
 * eye (`cam+0x2c`), the crosshair ray's hit point (`actor+0x3c0`: where the camera's aim ray met B, the face of the first
 * box it struck), the aim's height and lateral offset on B, and the range A-B to 0.1 u. B's feet: y = hit.y - h,
 * z = hit.z - lateral, x = A.x + sqrt(range^2 - dz^2), the range's rounding tried either side (`DX`).
 *
 * The port: MP2's first SEAL (`seal_A_scuba`, the rig's B) at those feet and yaw, posed at its standing idle at `PHASES`
 * phases (the original's phase is not logged; B stood still, so the idle is its pose), its boxes as the room takes them
 * (`posedBoxes`, `placedVolumes`, `rayRecords`), walked by the room's rule (`walkOrder`, `bodyApplications`) and applied
 * by the room's `applyHit` with the rig's round, D = 32, P = 3 (solved from the rows: body armour 25 -> 20.6 is
 * 25 x (10 - P) / 40 at P = 3; body 50 -> 35.5 is D - 17.5). The line is the camera's (eye -> hit); the round leaves the
 * muzzle and crosses that line at the aim point, so on B the two differ by the muzzle's offset x (distance past the aim
 * point / range): hundredths of a unit over the body's depth.
 *
 * Blood: a record is the port's blood. The original plays a round's impact by the struck node's material, PERSON for a
 * body, before and apart from any damage test (`FUN_003c8920` D:L319497-319500; reading, pending review), so a round that
 * meets any box of B bleeds, a no-damage bone's too, and a round that meets none does not. A row's `bleed` asserts it.
 * Lines: the camera's line (eye -> the crosshair ray's hit) is the one the rig logs. The round's own line (its start and
 * direction) is asked of the rig; until the rig reads it, neither the camera's line nor a muzzle line built in the port
 * counts as the round's line, and a row near the body's edge is `report`, not asserted.
 *
 * Held (the first run, 2026-11-13, agent/pose-dump e86562447c): 13 of the 15 rows give the original's parts and the
 * original's healths at every phase and every rounding (`exact`). The two 11.7 u BODY rows (s1-front-2, -3) give BODY at
 * every case, and at most idle phases an EXTRA left-arm application before it (the forearm's edge on the line in the
 * port's idle, not in the original's frame): the port's disagreement there is one more application, never a refused
 * round (`extraArm`). Not covered: the live locomotion pose, the Fire set on the target, back and side shots, the
 * Terrorist model, the foot under 0.8 u, the shoulder edges 2.5-3.5 u off the axis (the rig's next spots).
 */

const MP2 = fixture('RUN/MP2.ZDB'), READERC = fixture('RUN/READERC.ZAR'), PACK = fixture('RUN/MOTION_P.ZAR');
const HAVE = !!(MP2 && READERC && PACK);
const PHASES = 24;
const DX = [-0.05, 0, 0.05];
const A: V3 = [840.5, 100, 613];
const ROUND = { damage: 32, piercing: 3 };
const NAME: Record<number, string> = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
const { LARM, BODY, LLEG } = PART;

/** The rig's after-healths (head/rarm/larm/body/rleg/lleg), the six read off memory after the round. */
const AFTER_BODY = [8, 21.3, 21.3, 35.5, 21.3, 21.3], AFTER_LARM = [8, 30, 15.5, 50, 30, 30];
const AFTER_LLEG = [8, 30, 30, 50, 30, 15.5], AFTER_LARM_BODY = [8, 21.3, 15.5, 35.5, 21.3, 21.3];

interface Row {
  id: string; eye: V3; hit: V3; h: number; lat: number; range: number; a?: V3;
  /** The original's parts struck, from the moved healths (a limb at its cap after a BODY hit is the cap, not a hit). */
  parts: readonly number[];
  /** The original's six healths after the round. */
  after: readonly number[];
  /** How the port holds the row: `exact`, the original's parts and healths at every case; `extraArm`, see the header. */
  held: 'exact' | 'extraArm' | 'report';
  /**
   * The round's own start, where the rig read it (the muzzle at the shot); absent, the line starts at the camera's eye.
   * The two lines cross at the aim point; at an edge of the body they can meet different boxes (r1 of Q10-T).
   */
  from?: V3;
  /** B's root read back at the shot (actor +0x1c), where the rig logged it; absent, B's feet from the range (`feetOf`). */
  root?: V3;
  /** The target's model (MP2's `seal` or `terrorist` types); absent, the rig's first B, `seal_A_scuba`. */
  model?: string;
  /**
   * Whether the line meets any box of B (a record: the port's blood, research 91 s23): `true` where the original bled
   * (the rig's 120 ms picture), `false` where its ray met nothing; absent, not asserted (the damaging rows meet B).
   */
  bleed?: boolean;
  /** The round, solved from the row's moved healths; absent, `ROUND` (the 552 at 33.9 u on the SEAL). */
  round?: { damage: number; piercing: number };
}
/** block1-4.out, every fired row (the stopped and skipped rows have no line). */
const ROWS: readonly Row[] = [
  { id: 's2-front-1 collar', eye: [842.999, 109.904, 612.916], hit: [871.783, 115.034, 611.944], h: 15.03, lat: 0.09, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'exact' },
  { id: 's2-front-2 collar', eye: [842.999, 109.904, 612.916], hit: [871.452, 115.045, 611.963], h: 15.04, lat: 0.11, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'exact' },
  { id: 's2-front-3 collar', eye: [842.999, 109.904, 612.916], hit: [871.445, 115.053, 611.964], h: 15.05, lat: 0.11, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'exact' },
  { id: 's1-front-1 11.7', eye: [842.999, 109.904, 612.916], hit: [870.495, 111.770, 611.996], h: 11.77, lat: 0.14, range: 33.9, parts: [LARM], after: AFTER_LARM, held: 'exact' },
  { id: 's1-front-2 11.7', eye: [842.999, 109.904, 612.916], hit: [872.010, 111.685, 611.947], h: 11.68, lat: 0.09, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'extraArm' },
  { id: 's1-front-3 11.7', eye: [842.999, 109.904, 612.916], hit: [872.016, 111.698, 611.944], h: 11.70, lat: 0.09, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'extraArm' },
  { id: 's7-front-1 shin', eye: [843.000, 109.904, 612.997], hit: [870.589, 104.047, 612.973], h: 4.05, lat: 1.21, range: 33.8, parts: [LLEG], after: AFTER_LLEG, held: 'exact' },
  { id: 's7-front-2 shin', eye: [843.000, 109.904, 613.004], hit: [870.576, 104.142, 613.059], h: 4.14, lat: 1.20, range: 33.9, parts: [LLEG], after: AFTER_LLEG, held: 'exact' },
  { id: 's7-front-3 shin', eye: [843.000, 109.904, 613.004], hit: [870.578, 104.122, 613.059], h: 4.12, lat: 1.20, range: 33.9, parts: [LLEG], after: AFTER_LLEG, held: 'exact' },
  { id: 's3-front-1 collar 1.86', eye: [842.989, 109.904, 612.762], hit: [872.930, 115.277, 609.900], h: 15.28, lat: -1.86, range: 33.8, parts: [BODY], after: AFTER_BODY, held: 'exact' },
  { id: 's3-front-2 collar 1.86', eye: [842.989, 109.904, 612.769], hit: [872.959, 115.268, 609.997], h: 15.27, lat: -1.86, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'exact' },
  { id: 's3-front-3 collar 1.86', eye: [842.989, 109.904, 612.769], hit: [873.023, 115.329, 609.992], h: 15.33, lat: -1.86, range: 33.9, parts: [BODY], after: AFTER_BODY, held: 'exact' },
  { id: 's2b-belly-1', eye: [843.028, 109.904, 612.676], hit: [870.993, 112.788, 612.272], h: 12.79, lat: 0.08, range: 35.7, a: [840.529, 100, 612.713], parts: [LARM, BODY], after: AFTER_LARM_BODY, held: 'exact' },
  { id: 's2b-belly-2', eye: [842.999, 109.904, 612.916], hit: [868.852, 112.652, 612.053], h: 12.65, lat: 0.20, range: 33.9, parts: [LARM, BODY], after: AFTER_LARM_BODY, held: 'exact' },
  { id: 's2b-belly-3', eye: [842.999, 109.904, 612.916], hit: [869.113, 112.559, 612.039], h: 12.56, lat: 0.18, range: 33.9, parts: [LARM, BODY], after: AFTER_LARM_BODY, held: 'exact' },
  // FOOT predictions (before the rig's foot rounds; 8a's spot is lat -2.0 h 1.0): a line from A's eye to a point on
  // his root's plane, at the stated lateral (world z, -z his right by our reading) and height; reported, not asserted.
  { id: 'foot-pred lat -1.5 h 0.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0.5, lat: -1.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 100.5, 611.5] },
  { id: 'foot-pred lat -1.5 h 1.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.0, lat: -1.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 101.0, 611.5] },
  { id: 'foot-pred lat -1.5 h 1.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.5, lat: -1.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 101.5, 611.5] },
  { id: 'foot-pred lat -1.5 h 2.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 2.0, lat: -1.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 102.0, 611.5] },
  { id: 'foot-pred lat -2.0 h 0.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0.5, lat: -2.0, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 100.5, 611.0] },
  { id: 'foot-pred lat -2.0 h 1.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.0, lat: -2.0, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 101.0, 611.0] },
  { id: 'foot-pred lat -2.0 h 1.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.5, lat: -2.0, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 101.5, 611.0] },
  { id: 'foot-pred lat -2.0 h 2.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 2.0, lat: -2.0, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 102.0, 611.0] },
  { id: 'foot-pred lat -2.5 h 0.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0.5, lat: -2.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 100.5, 610.5] },
  { id: 'foot-pred lat -2.5 h 1.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.0, lat: -2.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 101.0, 610.5] },
  { id: 'foot-pred lat -2.5 h 1.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.5, lat: -2.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 101.5, 610.5] },
  { id: 'foot-pred lat -2.5 h 2.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 2.0, lat: -2.5, range: 0, root: [874.4, 100.0, 613.0], eye: [843.0, 109.904, 612.9], hit: [874.4, 102.0, 610.5] },
  // F91 (the rig's foot line, held for this prediction, 2026-11-13): A's eye to his root's plane at lateral -2.35, 1.3 up.
  { id: 'F91 foot line', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.3, lat: -2.35, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 101.3, 610.65] },
  // EDGE preview (F95, before the open spot's line): A's eye to his root's plane at lateral -3.55 (his right, by our reading).
  { id: 'edge-preview h 15.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.0, lat: -3.55, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 115.0, 609.45] },
  { id: 'edge-preview h 15.3', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.3, lat: -3.55, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 115.3, 609.45] },
  { id: 'edge-preview h 15.6', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.6, lat: -3.55, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 115.6, 609.45] },
  { id: 'edge-preview h 15.9', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.9, lat: -3.55, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 115.9, 609.45] },
  { id: 'edge-preview h 16.2', model: 'al_gman01', held: 'report', parts: [], after: [], h: 16.2, lat: -3.55, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 116.2, 609.45] },
  { id: 'edge-preview h 16.5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 16.5, lat: -3.55, range: 0, root: [875.5, 100, 613], eye: [842.99, 109.90, 612.9], hit: [875.5, 116.5, 609.45] },
  // c1 (F95, the rig's clear spot, 2026-11-13): the foot line and the edge at -3.55, LOW 15.3 and HIGH 16.2.
  { id: 'c1 foot line', model: 'al_gman01', held: 'report', parts: [], after: [], h: 1.3, lat: -2.35, range: 0, root: [875.5, 100.004, 690], eye: [842.99, 109.90, 689.9], hit: [875.5, 101.304, 687.65] },
  { id: 'c1 edge LOW 15.3', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.3, lat: -3.55, range: 0, root: [875.5, 100.004, 690], eye: [842.99, 109.90, 689.9], hit: [875.5, 115.304, 686.45] },
  { id: 'c1 edge HIGH 16.2', model: 'al_gman01', held: 'report', parts: [], after: [], h: 16.2, lat: -3.55, range: 0, root: [875.5, 100.004, 690], eye: [842.99, 109.90, 689.9], hit: [875.5, 116.204, 686.45] },
  // Q10-T match 3 (al_gman01), the fixed-zoom six on their exact camera lines (q10t-rows-interim.csv); reported.
  { id: 'T Q10T-fz-front-z-3.57-unscoped-2 scoped orig BODY', model: 'al_gman01', held: 'report', parts: [], after: [], h: 16.43, lat: -3.56, range: 35.0, eye: [842.987, 115.197, 612.746], hit: [875.323, 116.434, 609.440] },
  { id: 'T Q10T-fz-front-z-3.57-unscoped-3 unscoped orig BODY', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.97, lat: -3.54, range: 33.9, eye: [842.976, 109.904, 612.655], hit: [874.044, 115.975, 608.318] },
  { id: 'T Q10T-fz-front-z-3.57-scoped-1 scoped orig none', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.34, lat: -3.55, range: 33.9, eye: [842.978, 109.904, 612.672], hit: [874.126, 115.338, 608.541] },
  { id: 'T Q10T-fz-front-z-3.57-scoped-2 scoped orig none', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.24, lat: -3.57, range: 33.9, eye: [842.976, 109.904, 612.655], hit: [874.271, 115.236, 608.285] },
  { id: 'T Q10T-fz-front-z-3.57-scoped-3 scoped orig none', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.38, lat: -3.56, range: 33.9, eye: [842.976, 109.904, 612.655], hit: [874.192, 115.377, 608.295] },
  { id: 'T Q10T-fz-front-z-3.57-unscoped-4 unscoped orig none', model: 'al_gman01', held: 'report', parts: [], after: [], h: 15.91, lat: -3.56, range: 33.9, eye: [842.976, 109.904, 612.655], hit: [874.156, 115.913, 608.301] },
  // Q10-T match 4 LOW (al_gman01, play type 1), exact camera lines at the rig's root, then shifted 0.537 toward A (the
  // constant offset of the original's skeleton from +0x1c against the port's from its feet, read at matching phases).
  { id: 'L -3.40 orig DAMAGED shift 0.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [875.003, 100.0, 611.236], eye: [842.977, 109.904, 612.664], hit: [873.361, 115.651, 608.529] },
  { id: 'L -3.40 orig DAMAGED shift 0.537', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [874.466, 100.0, 611.236], eye: [842.977, 109.904, 612.664], hit: [873.361, 115.651, 608.529] },
  { id: 'L -3.55 orig DAMAGED shift 0.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [874.842, 100.0, 612.018], eye: [842.976, 109.904, 612.652], hit: [873.871, 115.812, 608.3] },
  { id: 'L -3.55 orig DAMAGED shift 0.537', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [874.305, 100.0, 612.018], eye: [842.976, 109.904, 612.652], hit: [873.871, 115.812, 608.3] },
  { id: 'L -3.70 orig none shift 0.0', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [874.357, 100.0, 611.857], eye: [842.975, 109.904, 612.646], hit: [874.157, 115.792, 608.173] },
  { id: 'L -3.70 orig none shift 0.537', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [873.82, 100.0, 611.857], eye: [842.975, 109.904, 612.646], hit: [874.157, 115.792, 608.173] },
  // c1 PRONE foot line (the rig's closed-loop aim, held for this prediction).
  { id: 'P prone foot', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [875.5, 100.004, 690], eye: [845.593, 108.438, 690.440], hit: [875.734, 101.544, 687.806] },
  // c1 PRONE foot r5 as fired (contact +0.76 / 1.25 / -2.43 from his root; eye as the prone test's).
  { id: 'P prone r5', model: 'al_gman01', held: 'report', parts: [], after: [], h: 0, lat: 0, range: 0, root: [875.5, 100.004, 690], eye: [845.593, 108.438, 690.440], hit: [876.26, 101.254, 687.57] },
];

/** B's feet from a row (see the header); `dx` the range's rounding tried. */
function feetOf(r: Row, dx: number): V3 {
  if (r.root) return [r.root[0] + dx, r.root[1], r.root[2]];
  const a = r.a ?? A, z = r.hit[2] - r.lat, dz = z - a[2];
  return [a[0] + Math.sqrt(r.range * r.range - dz * dz) + dx, r.hit[1] - r.h, z];
}

interface Case { parts: number[]; hp: number[]; records: string }

describe.skipIf(!HAVE)(`Q10: the original's measured rounds on the port's boxes (finding 15)${HAVE ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // Read in `beforeAll`, not at collection: vitest runs a skipped describe's factory (BL-7, skipIfFactories).
  let types: ReturnType<typeof simSkeletonsFromBytes> | null = null;
  let sim: SimSkeleton | null = null;
  /** A model of MP2's player types by name (the SEALs', then the Terrorists'). */
  const byModel = (model: string): SimSkeleton | null =>
    [...(types?.seal ?? []), ...(types?.terrorist ?? [])].find((s) => s?.model === model) ?? null;
  beforeAll(() => {
    types = simSkeletonsFromBytes(MP2!, READERC, PACK);
    sim = byModel('seal_A_scuba');
  });
  /** Every case of a row: each idle phase at each rounding of B's x. */
  const cases = (r: Row): Case[] => {
    const s = r.model ? byModel(r.model)! : sim!, clip = s.idles.stand!;
    const round = r.round ?? ROUND;
    const o = r.from ?? r.eye;
    const d = [r.hit[0] - o[0], r.hit[1] - o[1], r.hit[2] - o[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    const dir: V3 = [d[0]! / len, d[1]! / len, d[2]! / len];
    const out: Case[] = [];
    for (const dx of DX) {
      const feet = feetOf(r, dx);
      for (let k = 0; k < PHASES; k++) {
        writePose(s.skeleton, sampleClip(clip, (k / PHASES) * clip.duration, { loop: true }).parts);
        const boxes = posedBoxes(s.skeleton);
        s.skeleton.resetToBind();
        const recs: { distance: number; tag: { id: number; part: number }; bone: string }[] = [];
        rayRecords(o, dir, 400, placedVolumes(feet, 90, boxes), (part, t, bone) => {
          recs.push({ distance: t, tag: { id: 2, part }, bone: s.skeleton.parts[bone]?.name ?? String(bone) });
        });
        walkOrder(recs);
        const applied = bodyApplications(recs, false);
        const h = freshHealth();
        for (const a of applied) applyHit(h, a.tag.part, round.damage, round.piercing);
        out.push({
          parts: applied.map((a) => a.tag.part), hp: h.hp.map((v) => Number(v.toFixed(1))),
          records: recs.map((x) => `${x.bone}${x.tag.part === NO_PART ? '(-)' : ''}@${(x.distance - len).toFixed(2)}`).join(' '),
        });
      }
    }
    return out;
  };
  /**
   * The posed `spinehi`'s origin at the idle's key 0, beside a row (67's check that the rig's lateral is measured from the
   * root, as B's position is): its body-frame x (right) and z, and the world lateral it stands at, B's z at yaw 90 being
   * feet.z - x (`./helpers/hitPoseRoom` `toWorld`), as the rig's `aim_lat_on_B` = aim.z - B.z.
   */
  const spineOf = (r: Row): string => {
    const s = r.model ? byModel(r.model)! : sim!, clip = s.idles.stand!;
    writePose(s.skeleton, sampleClip(clip, 0, { loop: true }).parts);
    const i = s.skeleton.parts.findIndex((p) => p.name === 'spinehi');
    const w = s.skeleton.world[i]!;
    const x = w[12]!, z = w[14]!;
    // F79's comparison (8a): the box's eight corners in the world at the row's feet (dx 0) and yaw 90, beside the rig's
    // live read of the original's spinehi matrix and its six box floats at node +0x40.
    const box = s.skeleton.parts[i]!.bbox, feet = feetOf(r, 0), rad = Math.PI / 2, c = Math.cos(rad), sn = Math.sin(rad);
    const corners: string[] = [];
    for (const bx of [box[0]!, Math.min(box[3]!, 3.01)]) for (const by of [box[1]!, box[4]!]) for (const bz of [box[2]!, box[5]!]) {
      const px = w[0]! * bx + w[4]! * by + w[8]! * bz + w[12]!, py = w[1]! * bx + w[5]! * by + w[9]! * bz + w[13]!;
      const pz = w[2]! * bx + w[6]! * by + w[10]! * bz + w[14]!;
      corners.push(`(${(feet[0] + px * c + pz * sn).toFixed(2)}, ${(feet[1] + py).toFixed(2)}, ${(feet[2] - px * sn + pz * c).toFixed(2)})`);
    }
    s.skeleton.resetToBind();
    // The rig's frame at yaw 90 (world x = body z, world z = -body x): spinehi's local axes and origin, beside the original's W rows.
    const ax = (k: number): string => `(${[w[4 * k + 2]!, w[4 * k + 1]!, -w[4 * k]!].map((v) => v.toFixed(3)).join(', ')})`;
    const axes = `axes in the rig's frame x ${ax(0)} y ${ax(1)} z ${ax(2)}; origin rel. root (${w[14]!.toFixed(3)}, ${w[13]!.toFixed(3)}, ${(-w[12]!).toFixed(3)})`;
    return `spinehi origin body x ${x.toFixed(3)} z ${z.toFixed(3)} (world lateral ${(-x).toFixed(3)}); ${axes}; the row's lateral ${r.lat}; `
      + `box (own frame, max x held to 3.01) ${Array.from(box).map((v) => v.toFixed(3)).join(' ')}; world corners ${corners.join(' ')}`;
  };
  /** The posed foot and calf nodes' range over the idle phases, in the rig's frame at yaw 90 (world x = body z, world z = -body x). */
  const nodesOf = (r: Row): string => {
    const s = r.model ? byModel(r.model)! : sim!, clip = s.idles.stand!;
    const names = ['rfoot', 'rtoe', 'rcalf', 'lfoot', 'ltoe', 'lcalf', 'skel_root'];
    const lo = new Map<string, number[]>(), hi = new Map<string, number[]>();
    for (let k = 0; k < PHASES; k++) {
      writePose(s.skeleton, sampleClip(clip, (k / PHASES) * clip.duration, { loop: true }).parts);
      for (const n of names) {
        const i = s.skeleton.parts.findIndex((p) => p.name === n);
        if (i < 0) continue;
        const w = s.skeleton.world[i]!, v = [w[14]!, w[13]!, -w[12]!];
        lo.set(n, (lo.get(n) ?? v).map((x, j) => Math.min(x, v[j]!)));
        hi.set(n, (hi.get(n) ?? v).map((x, j) => Math.max(x, v[j]!)));
      }
    }
    s.skeleton.resetToBind();
    return names.filter((n) => lo.has(n)).map((n) => `${n} ${lo.get(n)!.map((x, j) => `${x.toFixed(2)}..${hi.get(n)![j]!.toFixed(2)}`).join(' / ')}`).join('; ');
  };
  const show = (c: Case): string => `${c.records} -> ${c.parts.map((p) => NAME[p]).join('+') || 'NONE'} hp ${c.hp.join('/')}`;

  it('the model is the rig\'s: MP2\'s first SEAL, seal_A_scuba, with its standing idle', () => {
    expect(sim?.model).toBe('seal_A_scuba');
    expect(sim?.idles.stand).not.toBeNull();
  });

  it.each(ROWS.filter((r) => r.held === 'exact').map((r) => [r.id, r] as const))(
    '%s: the original\'s parts and healths at every idle phase and rounding', (_id, r) => {
      const all = cases(r);
      console.log(`Q10 ${r.id}: original ${r.parts.map((p) => NAME[p]).join('+')}; port ${show(all[0]!)}; ${spineOf(r)}`);
      for (const c of all) {
        expect(c.parts, show(c)).toEqual(r.parts);
        expect(c.hp, show(c)).toEqual(r.after);
        if (r.bleed !== undefined) expect(c.records !== '', `${show(c)}: a record (blood) ${r.bleed ? 'expected' : 'not expected'}`).toBe(r.bleed);
      }
    });

  it.each(ROWS.filter((r) => r.held === 'extraArm').map((r) => [r.id, r] as const))(
    '%s: BODY at every case; at some phases the original\'s BODY alone, at the others one extra left-arm application before it', (_id, r) => {
      const all = cases(r);
      const alone = all.filter((c) => c.parts.length === 1 && c.parts[0] === BODY);
      const extra = all.filter((c) => c.parts.length === 2 && c.parts[0] === LARM && c.parts[1] === BODY);
      console.log(`Q10 ${r.id}: ${spineOf(r)}`);
      console.log(`Q10 ${r.id}: original BODY; port BODY alone ${alone.length}/${all.length}, LARM+BODY ${extra.length}/${all.length}`);
      expect(alone.length + extra.length, 'every case is one of the two').toBe(all.length);
      expect(alone.length, 'the original\'s outcome at some phase').toBeGreaterThan(0);
      for (const c of alone) expect(c.hp, show(c)).toEqual(r.after);
      for (const c of extra) expect(c.hp, show(c)).toEqual(AFTER_LARM_BODY);
    });

  it.each(ROWS.filter((r) => r.held === 'report').map((r) => [r.id, r] as const))(
    '%s: reported, not asserted -- every box the line meets, in order, at each case', (_id, r) => {
      const all = cases(r);
      const seen = new Map<string, number>();
      for (const c of all) seen.set(show(c), (seen.get(show(c)) ?? 0) + 1);
      console.log(`Q10 ${r.id} (reported; distances past the original's hit point); ${spineOf(r)}:`);
      console.log(`  the port's idle nodes over ${PHASES} phases, relative to his root, the rig's frame (x+ away from A, y up, z- his right): ${nodesOf(r)}`);
      for (const [k, n] of [...seen].sort((p, q) => q[1] - p[1])) console.log(`  ${String(n).padStart(3)}x ${k}`);
      expect(all.length).toBe(PHASES * DX.length);
    });

  it('the spread, as the rig read it: a body hit caps every limb; an arm hit alone moves that arm and nothing else', () => {
    const b = freshHealth(); applyHit(b, BODY, ROUND.damage, ROUND.piercing);
    const l = freshHealth(); applyHit(l, LARM, ROUND.damage, ROUND.piercing);
    expect(b.hp.map((v) => Number(v.toFixed(1)))).toEqual(AFTER_BODY);
    expect(Number(b.armour[BODY]!.toFixed(1))).toBe(20.6);
    expect(l.hp.map((v) => Number(v.toFixed(1)))).toEqual(AFTER_LARM);
    expect(Number(l.armour[LARM]!.toFixed(1))).toBe(20.6);
  });
});

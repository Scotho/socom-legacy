// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, gridCast, launchGrenade, MARK141, stepGrenade, type GrenadeEvent } from '@s2u/scene';
import { simMapFromBytes, type SimMap } from '../src/simMap';

/**
 * GRENADE-ONE-SIDED on the disc (GRENADE_FLIGHT_ONE_SIDED_READING; research 85 §5.1). A dev-disc test: it skips without
 * `SOCOM_DISC`. Shadow PC 2's r0004 capture GRENADE-CEILING-C-PC2 (capture evidence, a per-frame PINE logger of the
 * projectile pool, unscored; its record outside the repository, `s2u-records/GRENADE-CEILING-C-PC2/x2/GRENADE-CEILING-C-PC2/`
 * RESULT.md "BACK FACE" and `runs/bf-*`/probe.csv) threw a flashbang on MP51 at three single-sided faces from BEHIND: each
 * crossed the face's plane with its velocity unchanged. Here each of those releases (the pool entry's first row: p0 +0x48,
 * v +0x60) is flown by the port's flight over MP51's hull: no contact before the plane, the plane crossed, and the first
 * contact where the original's was. The front control (face 3008 from its front, k 0.375) is flown beside them.
 *
 * The original's first contact: the logger's row k reads the position at the START of game frame k and the velocity at its
 * END (the rows before the contact advance by the previous row's velocity x 525/15734 s), so the bounce placement (hit +
 * 0.1 n) is the position read one game frame after the row whose velocity turned: t2, t3 and the control have that row
 * (`runs/bf-4517-t2` rows at 6740/6773 ms, `bf-776-t3` 6673/6706 ms, `bf-3008-front` 6122/6156 ms); t1's logger missed that
 * frame (6940 -> 7007 ms, two frames), so its placement is the next row's position less one frame of the turned velocity
 * after a frame's gravity (vy -14.338 - 3.270). Not RESULT.md's "first contact at" figures, which are the turning row's
 * start-of-frame positions, a frame short. The bar: 2 u, seat-shadow's for the page side by side
 * (`s2u-records/PBACK-PAGE-PC4/x/PBACK-PAGE-PC4/RESULT.md`, "SAME").
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const MP51_FILE = RUN && existsSync(RUN) ? (readdirSync(RUN).find((f) => /^MP51\.ZDB$/i.test(f)) ?? '') : '';
const HAVE_MP51 = !!MP51_FILE;
type V3 = [number, number, number];
const NL = String.fromCharCode(10);
const BAR = 2;

interface BackFaceThrow {
  name: string;
  /** The face thrown at (the capture's index, its owner and normal) and a point on its plane (RESULT.md; for t2, t3 the port's own back hit on it, PBACK-PAGE-PC4 (a)). */
  face: string; plane: V3; normal: V3;
  /** The pool entry's first row (p0, v): runs/<name>/probe.csv. */
  p0: V3; v0: V3;
  /** The original's first bounce placement (hit + 0.1 n), derived as the header says. */
  placed: V3;
  /** Whether the throw meets the face from behind (the face is passed) or from its front (the control: it is met). */
  behind: boolean;
}

const THROWS: BackFaceThrow[] = [
  { name: 'bf-3008-t1', face: '3008 worldmodel/wc09/di_extwalls_h02_1', plane: [626.16, 140.32, 444.2], normal: [0, 0, 1],
    p0: [626.1563, 140.3171, 441.8667], v0: [-0.000936, 48.42246, 233.19994], placed: [626.155, 143.400, 647.903], behind: true },
  { name: 'bf-4517-t2', face: '4517 worldmodel/wc13A/di_bridge_wc13_sides', plane: [701.55, 32.52, 944.54], normal: [0.997, 0, 0.081],
    p0: [698.1984, 31.9226, 944.2811], v0: [232.47961, 48.42246, 18.31494], placed: [851.577, 41.458, 956.421], behind: true },
  { name: 'bf-776-t3', face: '776 worldmodel/wc03', plane: [908.82, 61.74, 146.61], normal: [0.707, -0.028, 0.707],
    p0: [908.0540, 61.5249, 145.8570], v0: [167.30763, 48.42246, 162.45111], placed: [1008.465, 71.955, 243.254], behind: true },
  { name: 'bf-3008-front', face: '3008 worldmodel/wc09/di_extwalls_h02_1 (FRONT control)', plane: [626.16, 140.32, 444.2], normal: [0, 0, 1],
    p0: [636.0947, 93.4507, 457.6713], v0: [-5.58572, 91.11580, -219.98558], placed: [635.752, 98.753, 444.263], behind: false },
  // BACKFACE-FAR-PC2 (s2u-records/BACKFACE-FAR-PC2/x/BACKFACE-FAR-PC2/, RESULT.md "The front control"): face 4515 from its
  // front, `runs/f4515-front`/probe.csv. The velocity turned on the row at 8291.9 ms; the placement is the next row's
  // position (8325.3 ms). Its plane point is that placement less 0.1 n (RESULT.md's n).
  { name: 'f4515-front', face: '4515 worldmodel/wc13A/di_bridge_wc13_sides (FRONT control, BACKFACE-FAR)', plane: [702.388, 40.144, 936.861], normal: [0.995, -0.041, 0.093],
    p0: [754.2900, 32.1413, 940.1708], v0: [-232.7274, 48.4225, -14.8376], placed: [702.4879, 40.1400, 936.8708], behind: false },
];

/**
 * BACKFACE-FAR-PC2 (Shadow PC 2 on r0004, 2026-11-25, unscored; RESULT.md "Result: 3/3 PASS-THROUGH"): a flashbang crosses
 * face 623 (`worldmodel/wc02A`, n (-1, 0, 0), the plane x = 1247.9) from BEHIND mid-flight, 128.4 u from the release, with
 * no contact up to the log's end. p0, v0 the pool entry's first row (runs/<run>/probe.csv, as above); `before`/`after` the
 * rows either side of the plane; `frames` the game frames the log covers after the release (its last row, 9192.8 ms).
 * The original ran one HALF-length frame early in these flights (the rows at 8075.0 and 8125.1 ms step x by -3.896, half
 * of v x 525/15734 s, and vy falls 4.91 over the first two steps, 1.5 frames of gravity), so its rows sit half a frame
 * along the path from the port's fixed-step frame points (3.9 u apart at 233 u/s). The rows are therefore held to the
 * port's flown PATH (each row's distance to its frame-to-frame segments), within the same 2 u bar.
 */
interface BackFacePass { name: string; p0: V3; v0: V3; before: V3; after: V3; frames: number }
const FACE_623 = { face: '623 worldmodel/wc02A', plane: [1247.9, 0, 0] as V3, normal: [-1, 0, 0] as V3 };
const PASSES: BackFacePass[] = [
  { name: 'f623-back t1', p0: [1369.3104, 145.8718, 149.5136], v0: [-233.0966, 48.4225, 6.9414],
    before: [1248.7467, 156.9764, 153.1039], after: [1240.9689, 156.7917, 153.3355], frames: 34 },
  { name: 'f623-back-t23 t1', p0: [1369.3104, 145.8718, 149.5136], v0: [-233.0966, 48.4225, 6.9414],
    before: [1248.7467, 156.9764, 153.1039], after: [1240.9689, 156.7917, 153.3355], frames: 34 },
  { name: 'f623-back-t23 t2', p0: [1369.5721, 145.8484, 149.4315], v0: [-233.1391, 48.4225, 5.3252],
    before: [1248.9875, 156.9530, 152.1857], after: [1241.2084, 156.7683, 152.3633], frames: 33 },
];

/**
 * BACKFACE-FAR-PC2's set-aside runs (RESULT.md "Set aside"): aimed at face 6159 (`worldmodel/wc17A`), each met something
 * else first, short of the simulation's prediction (near `wc13/di_roof_b07`). The one capture that could show a face the
 * port's one-sided flight refuses and the original meets, so each is flown for its first contact. `runs/f6159-back` (3/3
 * identical releases and contacts: one case) turned on the row at 6373.3 ms, `runs/f6159-front` at 6473.4 ms; the placement
 * is the next row's position (6406.6 ms, 6506.7 ms).
 */
const CONTACTS: { name: string; p0: V3; v0: V3; placed: V3 }[] = [
  { name: 'f6159-back (3/3 identical)', p0: [1002.4007, 115.6843, 998.4371], v0: [-121.7130, 48.4225, -198.9174], placed: [964.6520, 125.4937, 936.7486] },
  { name: 'f6159-front', p0: [891.4360, 67.5398, 835.4342], v0: [117.5298, 48.4225, 201.4174], placed: [940.2903, 78.5362, 919.1573] },
];

const side = (t: BackFaceThrow, p: readonly number[]): number =>
  (p[0]! - t.plane[0]) * t.normal[0] + (p[1]! - t.plane[1]) * t.normal[1] + (p[2]! - t.plane[2]) * t.normal[2];
const fmt = (p: readonly number[]): string => p.map((v) => v.toFixed(2)).join(', ');

describe.skipIf(!HAVE_MP51)('GRENADE-ONE-SIDED: PC 2\'s r0004 back-face releases flown by the port on MP51', () => {
  const map: SimMap | null = HAVE_MP51 ? simMapFromBytes(new Uint8Array(readFileSync(resolve(RUN, MP51_FILE))), `RUN/${MP51_FILE}`) : null;

  for (const t of THROWS) {
    it(`${t.name}: ${t.behind ? 'passes the face from behind' : 'bounces off the face from its front'}; first contact within ${BAR} u of the original's`, () => {
      const cast = gridCast(map!.grid, map!.defaultMaterial ?? '');
      const g = launchGrenade([...t.p0], [...t.v0], MARK141);
      const path: V3[] = [[...g.pos]];
      let first: { frame: number; e: GrenadeEvent & { kind: 'bounce' }; placed: V3; vIn: V3; vOut: V3 } | null = null;
      for (let i = 1; i <= 90 && g.state === 'flight' && !first; i++) {
        const vIn: V3 = [g.vel[0], g.vel[1] - g.record.gravity * GAME_FRAME_DT, g.vel[2]];
        const events = stepGrenade(g, GAME_FRAME_DT, cast);
        const b = events.find((e): e is GrenadeEvent & { kind: 'bounce' } => e.kind === 'bounce');
        if (b) first = { frame: i, e: b, placed: [...g.pos], vIn, vOut: [...g.vel] };
        else path.push([...g.pos]);
      }
      const off = first ? Math.hypot(first.placed[0] - t.placed[0], first.placed[1] - t.placed[1], first.placed[2] - t.placed[2]) : Infinity;
      console.log([`GRENADE-ONE-SIDED ${t.name} at ${t.face}: start side ${side(t, t.p0).toFixed(2)}`,
        first
          ? `  first contact frame ${first.frame}: ${first.e.owner ?? '?'} ${first.e.material} n (${fmt(first.e.normal)}) at (${fmt(first.e.point)}), placed (${fmt(first.placed)}) against the original's (${fmt(t.placed)}): ${off.toFixed(2)} u; v (${fmt(first.vIn)}) -> (${fmt(first.vOut)})`
          : '  NO CONTACT in 90 frames'].join(NL));
      expect(first, 'a first contact').not.toBeNull();
      if (t.behind) {
        expect(side(t, t.p0), 'released behind the face').toBeLessThan(0);
        expect(path.some((p) => side(t, p) > 0), 'the plane crossed before the first contact').toBe(true);
      }
      expect(off, `first contact within ${BAR} u of the original's placement`).toBeLessThan(BAR);
    });
  }

  const side623 = (p: readonly number[]): number =>
    (p[0]! - FACE_623.plane[0]) * FACE_623.normal[0] + (p[1]! - FACE_623.plane[1]) * FACE_623.normal[1] + (p[2]! - FACE_623.plane[2]) * FACE_623.normal[2];
  for (const t of PASSES) {
    it(`BACKFACE-FAR ${t.name}: crosses ${FACE_623.face} from behind mid-flight, v unchanged, no contact in the log's ${t.frames} frames`, () => {
      const cast = gridCast(map!.grid, map!.defaultMaterial ?? '');
      const g = launchGrenade([...t.p0], [...t.v0], MARK141);
      const path: V3[] = [[...g.pos]];
      let crossing: { frame: number; vIn: V3; vOut: V3 } | null = null;
      let contact: (GrenadeEvent & { kind: 'bounce' }) | null = null;
      for (let i = 1; i <= t.frames && g.state === 'flight' && !contact; i++) {
        const vIn: V3 = [g.vel[0], g.vel[1] - g.record.gravity * GAME_FRAME_DT, g.vel[2]];
        const was = side623(g.pos);
        const events = stepGrenade(g, GAME_FRAME_DT, cast);
        contact = events.find((e): e is GrenadeEvent & { kind: 'bounce' } => e.kind === 'bounce') ?? null;
        path.push([...g.pos]);
        if (!crossing && was < 0 && side623(g.pos) >= 0) crossing = { frame: i, vIn, vOut: [...g.vel] };
      }
      // A row's distance to the port's flown path: the nearest of its frame-to-frame segments (the header: the original's half frame).
      const toSegment = (q: V3, a: V3, b: V3): number => {
        const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], aq: V3 = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
        const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
        const s = l2 > 0 ? Math.max(0, Math.min(1, (aq[0] * ab[0] + aq[1] * ab[1] + aq[2] * ab[2]) / l2)) : 0;
        return Math.hypot(aq[0] - ab[0] * s, aq[1] - ab[1] * s, aq[2] - ab[2] * s);
      };
      const near = (q: V3): number => Math.min(...path.slice(1).map((b, i) => toSegment(q, path[i]!, b)));
      console.log([`GRENADE-ONE-SIDED ${t.name} at ${FACE_623.face}: start side ${side623(t.p0).toFixed(2)}`,
        crossing ? `  crossed on frame ${crossing.frame}: v (${fmt(crossing.vIn)}) -> (${fmt(crossing.vOut)})` : '  NOT CROSSED',
        contact ? `  CONTACT: ${contact.owner ?? '?'} ${contact.material} at (${fmt(contact.point)})` : '  no contact',
        `  the original's rows to the port's path: before ${near(t.before).toFixed(2)} u, after ${near(t.after).toFixed(2)} u`].join(NL));
      expect(side623(t.p0), 'released behind the face').toBeLessThan(0);
      expect(contact, 'no contact in the frames the original logged').toBeNull();
      expect(crossing, 'the plane crossed').not.toBeNull();
      expect(crossing!.vOut, 'v unchanged across the plane (gravity only)').toEqual(crossing!.vIn);
      expect(near(t.before), `the original's row before the plane within ${BAR} u of the port's path`).toBeLessThan(BAR);
      expect(near(t.after), `the original's row after the plane within ${BAR} u of the port's path`).toBeLessThan(BAR);
    });
  }

  for (const t of CONTACTS) {
    it(`BACKFACE-FAR set aside, ${t.name}: the port's first contact within ${BAR} u of the original's`, () => {
      const cast = gridCast(map!.grid, map!.defaultMaterial ?? '');
      const g = launchGrenade([...t.p0], [...t.v0], MARK141);
      let first: { frame: number; e: GrenadeEvent & { kind: 'bounce' }; placed: V3 } | null = null;
      for (let i = 1; i <= 90 && g.state === 'flight' && !first; i++) {
        const b = stepGrenade(g, GAME_FRAME_DT, cast).find((e): e is GrenadeEvent & { kind: 'bounce' } => e.kind === 'bounce');
        if (b) first = { frame: i, e: b, placed: [...g.pos] };
      }
      const off = first ? Math.hypot(first.placed[0] - t.placed[0], first.placed[1] - t.placed[1], first.placed[2] - t.placed[2]) : Infinity;
      console.log(first
        ? `GRENADE-ONE-SIDED ${t.name}: first contact frame ${first.frame}: ${first.e.owner ?? '?'} ${first.e.material} n (${fmt(first.e.normal)}) at (${fmt(first.e.point)}), placed (${fmt(first.placed)}) against the original's (${fmt(t.placed)}): ${off.toFixed(2)} u`
        : `GRENADE-ONE-SIDED ${t.name}: NO CONTACT in 90 frames`);
      expect(first, 'a first contact').not.toBeNull();
      expect(off, `first contact within ${BAR} u of the original's placement`).toBeLessThan(BAR);
    });
  }
});

import { probeFloor, probeGround, type Grid } from '@s2u/scene';

/**
 * LATER 415 (research 329 §1.2): the renderer's region gate, as far as the teammates' tags read it. The scene walk
 * `FUN_003389c0` (D:L236069-236074, D:L236164) draws a node only when `FUN_00290b80(camera, 1 << the node's zone index)`
 * passes -- `DAT_003de208` is 0, or the camera's `+0x2a8` mask holds the bit -- and `FUN_002269a0` tags a body only when
 * its node was drawn this frame or the last (`FUN_00315580(node, 2)`, D:L77376). A region is the first word of a
 * polygon's params (`FUN_002dc1b0`: `**(hit+0xc)`, 0xffffffff with no hit; its neighbour `FUN_002dc1d0` reads the third
 * word's material bits) -- `WorldPoly.region` (research 36 §6), a mask of the zones seen from that floor.
 *
 * The camera (`DAT_0045c380+0x128`, the view's `+0xb4`):
 * - `+0x2a0`: the region of the floor under the shown body, written by that body's ground probe (`FUN_005b5d40`
 *   D:L470276-470281, the shown actor `DAT_00415ff0+0xbc`; a hit more than 20 above the body dropped, D:L470270-470272)
 *   through `FUN_00290bd0` (D:L137122-137130), which writes nothing for 0 and rewrites `+0x2a8`.
 * - `+0x2a4`, `+0x2a8`: `FUN_00295b00` (D:L140037-140049) finds the floor at or below the eye (`FUN_0031dfd0`, its pick
 *   `FUN_002d4c20` D:L175859-175904) and, unless that floor is a SEAL's (`FUN_0059acd0`: a `CSealEx` node), hands
 *   `FUN_00290c00` (D:L137136-137142) its region -- every bit for a spectator (`FUN_002c2fd0`: the "JoinAsSpectator"
 *   variable or `DAT_004413d8`) -- which, when not 0, sets `+0x2a4` and `+0x2a8` = `+0x2a0` | 1 | `+0x2a4`. All of it
 *   sits inside the probe's hit branch (D:L140039-140040): with no floor at or below the eye nothing is written, a
 *   spectator's included (LATER 415's review, F1); only a hit with no params gives 0xffffffff.
 *
 * A body's node zone index, bits 13-17 of `node+0x5c` (`FUN_00550570` D:L417757-417797, `CZSealBody`'s vtable slot at
 * 0x6691c4, so every body runs it): when `FUN_00290b30(camera, its floor's region)` passes -- `+0x2a0` | 1 meets the
 * region, a 0 region counting as 1 -- the top set bit of `+0x2a0` | 1 (`FUN_00290b20`); else left as it was. A new node
 * copies its parent's (D:L216018-216020); the port starts every body at 0, whose bit every mask holds.
 *
 * The scene walk's other node tests: `+0x5c` bit 0, and `+0x5f` bit 7 as the zone test's enable (D:L236069-236072: a
 * clear bit draws the node untested; set for a new node by `FUN_00317060` D:L215962-215966, inherited from its parent)
 * -- a body's node holds both in every case read, so the port takes them as set; the opacity and the frustum are the page's own (`./hudTags`). The original tests a tag's body
 * drawn this frame or the last (`FUN_00315580(node, 2)`); the port gates on this frame (LATER 415's review, F5).
 */

/** No floor: `FUN_002dc1b0`'s 0xffffffff. */
export const NO_REGION = 0xffffffff;

/**
 * REGION_GATE_READING (LATER 415): `DAT_003de208`, the gate's switch (`FUN_00290b30`, `FUN_00290b80`: 0 passes every
 * node). Never assigned by name in the decompilation and held in bss; 1 in a Frostfire match's RAM snapshot
 * (`logs/parity/frostA_probe600_vf0.rdram`, 0x3de208) -- a capture reading at one moment, its writer unlocated. Settles
 * it: the byte's writer found, or a trace of it through a round on more than one map.
 */
export const REGION_GATE_READING = 1;

/**
 * REGION_ORDER_READING (LATER 415): within a frame the port takes the shown body's floor (`+0x2a0`), then each body's
 * zone, then the eye (`+0x2a8`). The original sets `+0x2a0` inside the shown body's own tick and each body's zone in its
 * own, in the actor list's order (unread), and the eye in the camera's update after the bodies (`FUN_00295b00`). The
 * bodies' own drawing (LATER 489, `RemotePlayers.applyZoneGate`) follows in the same frame, before its render. A page
 * whose walker has no grid (fly mode: a spectator, a dead page watching) does not frame the gate and draws every body;
 * a dead watcher's zone cull is not applied (the original follows the watched body's floor).
 * Settles it: the actor list's order and where the camera update runs in the frame.
 */
export const REGION_ORDER_READING = "the shown body's floor, the bodies, the eye" as const;

/**
 * REGION_FORCE_ALL_READING (LATER 415): `FUN_00546cf0` and `FUN_00546e40` (D:L412520, D:L412564; the second a
 * `CZSealBody` vtable slot, 0x6691dc) write every bit into the camera's `+0x2a0` and its eye word -- what they are, and
 * when they run, is unread, so the port never forces the masks. Settles it: their callers read (a camera or a mount's
 * switch is the guess) and a case where every region is seen.
 */
export const REGION_FORCE_ALL_READING = 'unread' as const;

/**
 * REGION_EYE_BODY_READING (LATER 415's review, F4): `FUN_00295b00` keeps `+0x2a4` when the highest hit at or below the
 * eye is a SEAL's polygon (`FUN_0059acd0`: the node casts to `CSealEx`); the port's grid holds no body, so under an eye
 * over a body it takes the floor below instead -- a known difference, the eye over a body's polygons rare. Settles it:
 * the bodies' collision in the eye's probe (the port's grid is the map's hull and its placed models only).
 */
export const REGION_EYE_BODY_READING = 'the floor below (no body in the grid)' as const;

/**
 * REGION_ROUND_RESET_READING (LATER 568's review, F2): the port's `RegionCull.reset` at a round's start (`matchMount.ts`
 * `roundClear`, `main.ts` `clearAir`) has no source. The camera is built only on the map's load (`FUN_00318da0` ->
 * `FUN_0031fd20` D:L217125, the camera `FUN_00293a80` at the world's `+0x128`, D:L221101-221108; `FUN_00364ee0`'s
 * D:L262133 builds a once-only camera of its own, `DAT_0049e9e0`), and nothing read rebuilds or rewrites its masks at a
 * round's start, so the original most likely keeps the last round's. The port keeps its round-start reset (the
 * constructor's words, LATER 568) until that is settled. Settles it: a round start's writers of `+0x2a0`..`+0x2a8`
 * read, or a capture of the masks across a round's start.
 */
export const REGION_ROUND_RESET_READING = "the constructor's words at a round's start (unsourced; the original likely keeps them)" as const;

/** The highest set bit's index of a mask (`FUN_00550570`'s loop). */
const topBit = (m: number): number => 31 - Math.clz32(m >>> 0);

/**
 * The region of the floor at or below `point` (`FUN_0031dfd0(0, world, point, 1)` then `FUN_002d4c20`: of the column's
 * hits, the highest whose height is at or under the point's); null with no hit, which writes nothing (D:L140039-140040).
 */
export function regionUnder(grid: Grid, point: readonly number[]): number | null {
  let best: { y: number; region: number } | null = null;
  for (const h of probeGround(grid, point[0]!, point[2]!)) {
    if (h.y <= point[1]! && (best === null || h.y > best.y)) best = { y: h.y, region: h.poly.region >>> 0 };
  }
  return best ? best.region : null;
}

/** One frame's inputs (`RegionCull.frame`): the shown body's feet, the eye, the spectator, the bodies' feet. */
export interface RegionFrame {
  viewed: readonly number[] | null;
  eye: readonly number[] | null;
  spectator: boolean;
  bodies: readonly { id: number; feet: readonly number[] | null }[];
}

/**
 * The camera's masks and the bodies' zone indices, a page's (the original's camera and each body's node). LATER 568: the
 * camera's constructor `FUN_00293a80` (its vtable 0x406120 at `+0x60`, D:L138685) writes `+0x2a0` 0, `+0x2a4` 0 and
 * `+0x2a8` 1 (D:L138755-138757), so a fresh camera's mask holds bit 0 -- the zone every body starts at -- until a floor of
 * a non-zero region rewrites it.
 */
export class RegionCull {
  /** `+0x2a0`: the shown body's floor's region (0 until written; `FUN_00293a80` D:L138755). */
  floor = 0;
  /** `+0x2a4`: the eye's floor's region (0 until written; D:L138756). */
  eyeRegion = 0;
  /** `+0x2a8`: 1 until written (`FUN_00293a80` D:L138757). */
  mask = 1;
  private readonly zones = new Map<number, number>();

  /** `FUN_00290bd0`: the shown body's floor's region; 0 writes nothing. */
  viewFloor(region: number): void {
    if (region === 0) return;
    this.floor = region >>> 0;
    this.mask = (this.floor | 1 | this.eyeRegion) >>> 0;
  }

  /** `FUN_00550570`: a body's zone index from its floor's region (`NO_REGION` with no floor). */
  step(id: number, region: number): void {
    if (!REGION_GATE_READING) return;
    const r = region === 0 ? 1 : region;
    if (((this.floor | 1) & r) !== 0) this.zones.set(id, topBit(this.floor | 1));
  }

  /** `FUN_00295b00` -> `FUN_00290c00`: the eye's floor's region, every bit for a spectator; 0 writes nothing. */
  eye(region: number, spectator: boolean): void {
    const r = spectator ? NO_REGION : region;
    if (r === 0) return;
    this.eyeRegion = r >>> 0;
    this.mask = (this.floor | 1 | this.eyeRegion) >>> 0;
  }

  /** A body's zone index (0 until set). */
  zone(id: number): number {
    return this.zones.get(id) ?? 0;
  }

  /** `FUN_00290b80(camera, 1 << zone)`: the body drawn as far as the region gate says. */
  drawn(id: number): boolean {
    if (!REGION_GATE_READING) return true;
    return ((this.mask >>> 0) & ((1 << this.zone(id)) >>> 0)) !== 0;
  }

  /**
   * LATER 415's review, F2: a new map or round -- new nodes, every zone forgotten -- and the camera's constructor words
   * (LATER 568: `FUN_00293a80` D:L138755-138757, `+0x2a0` 0, `+0x2a4` 0, `+0x2a8` 1; was: the masks 0, which held no
   * zone's bit and left every body undrawn while the viewer's floors were region 0). At a new map the original builds a
   * new camera (D:L217125, D:L221101-221108); at a round's start it most likely keeps the masks --
   * `REGION_ROUND_RESET_READING`, open.
   */
  reset(): void {
    this.floor = 0;
    this.eyeRegion = 0;
    this.mask = 1;
    this.zones.clear();
  }

  /** Forgets a body (it left the room); its next zone starts at 0. */
  forget(id: number): void {
    this.zones.delete(id);
  }

  /**
   * One frame in `REGION_ORDER_READING`'s order: the shown body's floor (`probeFloor` under its feet, the body's ground
   * probe), each body's floor (the same probe; `NO_REGION` with none), then the eye (`regionUnder`). The floor under the
   * eye is never a body's here: the port's grid holds no body (`FUN_0059acd0`'s `CSealEx` skip has nothing to skip).
   */
  frame(grid: Grid, f: RegionFrame): void {
    if (f.viewed) {
      const h = probeFloor(grid, f.viewed[0]!, f.viewed[1]!, f.viewed[2]!);
      if (h) this.viewFloor(h.poly.region >>> 0);
    }
    for (const b of f.bodies) {
      if (!b.feet) continue;
      const h = probeFloor(grid, b.feet[0]!, b.feet[1]!, b.feet[2]!);
      this.step(b.id, h ? h.poly.region >>> 0 : NO_REGION);
    }
    // The eye's write is the hit's (D:L140039-140040): no floor at or below the eye, nothing -- a spectator's too.
    const under = f.eye ? regionUnder(grid, f.eye) : null;
    if (under !== null) this.eye(under, f.spectator);
  }
}

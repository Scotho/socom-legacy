import { BufferAttribute, BufferGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import type { Ladder } from '@s2u/scene';
import { DoorSet, type DoorSpec } from '../doors';
import { doorHinge } from './placedDoors';

/**
 * Which way a door swings and a ladder is climbed, drawn in the editor (the owner, 2026-11-06; a browser adaptation,
 * FG.R2 -- an editor guide, never drawn in a match), as the spawn discs show which way a spawn faces:
 *
 * - a door: an arc on the floor from its closed leaf's free edge to where that edge stands open, an arrowhead at the open
 *   end. The open pose is the door's own: its swing program (`DoorSpec.programs[0]`) run once to its end in a `DoorSet`
 *   with no hull (`../doors`), the leaf's move read off its `moved` hook -- nothing assumed about left or right;
 * - a ladder: a bar across its foot and an arrow out of it to the side it is climbed from (`@s2u/scene` `Ladder`'s
 *   normal, the climber's side).
 */

/** The overlays' colours: the billboards' own (`./mapDataBillboards`: D a door's, L a ladder's). */
export const DOOR_SWING_COLOUR = 0xa0c878;
export const LADDER_CLIMB_COLOUR = 0xe07a5f;

/** The leaf's move from closed to fully open (three's column-major, as `DoorSet`'s `moved` hands it), or null where it will not swing. */
function openDelta(spec: DoorSpec): Matrix4 | null {
  let last: ArrayLike<number> | null = null;
  const set = new DoorSet([{ ...spec, index: 0 }], null, { moved: (_s, m) => { last = m; } });
  if (!set.use(0)) return null;
  for (let i = 0; i < 1800 && set.state(0).busy; i++) set.step(1 / 30);
  return last ? new Matrix4().fromArray(Array.from(last as ArrayLike<number>)) : null;
}

/** A door's swing: its hinge, its leaf's free edge closed and open, the floor height, and the signed turn about y (radians). */
export interface Swing { hinge: [number, number, number]; from: Vector3; to: Vector3; y: number; angle: number }

/** The swing of `spec`, its leaf's points (`leaf`, world space at rest) giving its free edge; null where it does not turn. */
export function swingOf(spec: DoorSpec, leaf: readonly ArrayLike<number>[]): Swing | null {
  if (!spec.local || !spec.parent || !spec.programs?.length) return null;   // a door record without its node's matrices or program
  const hinge = doorHinge(spec);
  let far: Vector3 | null = null, best = -1, minY = Infinity;
  for (const pts of leaf) {
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const x = pts[i]!, y = pts[i + 1]!, z = pts[i + 2]!;
      minY = Math.min(minY, y);
      const d = Math.hypot(x - hinge[0], z - hinge[2]);
      if (d > best) { best = d; far = new Vector3(x, y, z); }
    }
  }
  if (!far || best < 1) return null;
  const delta = openDelta(spec);
  if (!delta) return null;
  const to = far.clone().applyMatrix4(delta);
  const a0 = Math.atan2(far.z - hinge[2], far.x - hinge[0]), a1 = Math.atan2(to.z - hinge[2], to.x - hinge[0]);
  let angle = a1 - a0;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle <= -Math.PI) angle += 2 * Math.PI;
  if (Math.abs(angle) < 0.05) return null;
  return { hinge, from: far, to, y: (Number.isFinite(minY) ? minY : hinge[1]) + 1, angle };
}

/** The swing drawn: the arc (line pairs) round the hinge at the floor, the open leaf's line, an arrowhead at the open end. */
export function swingSegments(s: Swing): number[] {
  const [hx, , hz] = s.hinge;
  const r = Math.hypot(s.from.x - hx, s.from.z - hz);
  const a0 = Math.atan2(s.from.z - hz, s.from.x - hx);
  const out: number[] = [];
  const at = (a: number): [number, number, number] => [hx + Math.cos(a) * r, s.y, hz + Math.sin(a) * r];
  const steps = 16;
  for (let k = 0; k < steps; k++) out.push(...at(a0 + (s.angle * k) / steps), ...at(a0 + (s.angle * (k + 1)) / steps));
  const a1 = a0 + s.angle;
  const tip = at(a1);
  out.push(hx, s.y, hz, ...tip);                                // the leaf, open
  // The arrowhead: back along the arc's way at the tip, splayed either side of it.
  const dir = Math.sign(s.angle);
  const tx = -Math.sin(a1) * dir, tz = Math.cos(a1) * dir, rx = Math.cos(a1), rz = Math.sin(a1);
  const len = Math.min(12, r * 0.3);
  for (const side of [1, -1]) out.push(...tip, tip[0] - tx * len + rx * side * len * 0.5, s.y, tip[2] - tz * len + rz * side * len * 0.5);
  return out;
}

/** A ladder's climb side drawn: a bar its width across its foot, an arrow from it out along its normal, an arrowhead. */
export function ladderSegments(l: Ladder): number[] {
  const y = l.bottom + 1;
  const px = -l.nz, pz = l.nx;                                  // across the ladder
  const len = Math.max(16, l.halfWidth * 2.5);
  const ex = l.x + l.nx * len, ez = l.z + l.nz * len;
  const head = Math.min(8, len * 0.35);
  return [
    l.x - px * l.halfWidth, y, l.z - pz * l.halfWidth, l.x + px * l.halfWidth, y, l.z + pz * l.halfWidth,
    l.x, y, l.z, ex, y, ez,
    ex, y, ez, ex - l.nx * head + px * head * 0.6, y, ez - l.nz * head + pz * head * 0.6,
    ex, y, ez, ex - l.nx * head - px * head * 0.6, y, ez - l.nz * head - pz * head * 0.6,
  ];
}

/** The swept wedge filled (as the spawn discs are): a fan of triangles from the hinge out to the arc, at the floor. */
export function swingTriangles(s: Swing): number[] {
  const [hx, , hz] = s.hinge;
  const r = Math.hypot(s.from.x - hx, s.from.z - hz);
  const a0 = Math.atan2(s.from.z - hz, s.from.x - hx);
  const steps = 16, out: number[] = [];
  for (let k = 0; k < steps; k++) {
    const a = a0 + (s.angle * k) / steps, b = a0 + (s.angle * (k + 1)) / steps;
    out.push(hx, s.y, hz, hx + Math.cos(a) * r, s.y, hz + Math.sin(a) * r, hx + Math.cos(b) * r, s.y, hz + Math.sin(b) * r);
  }
  return out;
}

/** A ladder's climb arrow filled: a shaft out of its foot along its normal, and a head at its end. */
export function ladderTriangles(l: Ladder): number[] {
  const y = l.bottom + 1;
  const px = -l.nz, pz = l.nx;
  const len = Math.max(16, l.halfWidth * 2.5);
  const head = Math.min(8, len * 0.35);
  const shaft = Math.max(1.5, l.halfWidth * 0.35);
  const neck = len - head;
  const p = (along: number, across: number): number[] => [l.x + l.nx * along + px * across, y, l.z + l.nz * along + pz * across];
  return [
    ...p(0, -shaft), ...p(neck, -shaft), ...p(neck, shaft),
    ...p(0, -shaft), ...p(neck, shaft), ...p(0, shaft),
    ...p(neck, -head * 0.8), ...p(len, 0), ...p(neck, head * 0.8),
  ];
}

/** Triangles as an editor guide's fill: translucent, over the world, never picked, never lit. */
export function overlayFill(triangles: readonly number[], colour: number, name: string): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles), 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.35, side: DoubleSide, depthTest: false, depthWrite: false, fog: false }));
  mesh.renderOrder = 9_999;
  mesh.raycast = () => undefined;
  mesh.name = name;
  mesh.userData['forgeLightingInstrument'] = true;
  mesh.userData['forgeGuide'] = true;
  return mesh;
}

/** A guide: its outline and its fill together, one object to move, show and hide. */
export function guideGroup(segments: readonly number[], triangles: readonly number[], colour: number, name: string): Group {
  const g = new Group();
  g.name = name;
  g.userData['forgeLightingInstrument'] = true;
  g.userData['forgeGuide'] = true;
  if (triangles.length) g.add(overlayFill(triangles, colour, `${name} fill`));
  if (segments.length) g.add(overlayLines(segments, colour, `${name} lines`));
  return g;
}

/** Line pairs as an editor guide: drawn over the world, never picked, never lit. */
export function overlayLines(segments: readonly number[], colour: number, name: string): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(segments), 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false }));
  lines.renderOrder = 10_000;
  lines.raycast = () => undefined;
  lines.name = name;
  lines.userData['forgeLightingInstrument'] = true;
  lines.userData['forgeGuide'] = true;
  return lines;
}

/** The guides' colours for turrets and hostages: their billboards' own (`./mapDataBillboards`: T, H). */
export const TURRET_GUIDE_COLOUR = 0xc77dff;
export const HOSTAGE_GUIDE_COLOUR = 0xf2d14b;

/** A yaw's way on the ground (degrees; 0 looks down -z, left positive: `../yaw`), as (x, z). */
export function yawWay(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [-Math.sin(r), -Math.cos(r)];
}

/** A guide's two parts: its outline (line pairs) and its fill (triangles). */
export interface GuideShapes { segments: number[]; triangles: number[] }

/** An arrow along a yaw out of `at` (its foot, at `at`'s height): a shaft and a head, `len` long, filled and outlined. */
export function facingShapes(at: readonly number[], yawDeg: number, len: number): GuideShapes {
  const [fx, fz] = yawWay(yawDeg);
  const px = -fz, pz = fx;                                      // across it
  const y = at[1]! + 1;
  const head = Math.min(10, len * 0.4), neck = len - head, shaft = Math.max(1.5, len * 0.08);
  const p = (along: number, across: number): number[] => [at[0]! + fx * along + px * across, y, at[2]! + fz * along + pz * across];
  return {
    triangles: [
      ...p(0, -shaft), ...p(neck, -shaft), ...p(neck, shaft), ...p(0, -shaft), ...p(neck, shaft), ...p(0, shaft),
      ...p(neck, -head * 0.6), ...p(len, 0), ...p(neck, head * 0.6),
    ],
    segments: [...p(0, 0), ...p(len, 0), ...p(len, 0), ...p(neck, -head * 0.6), ...p(len, 0), ...p(neck, head * 0.6)],
  };
}

/**
 * A turret's guide at its gun's pivot (`at`): a wedge over the yaws its gun turns through -- its limits (degrees, from
 * its facing, left positive), a ring all round where it has none -- and its facing's arrow.
 */
export function turretShapes(at: readonly number[], facingDeg: number, limitsDeg: readonly [number, number] | null, r: number): GuideShapes {
  const y = at[1]! + 1;
  const [lo, hi] = limitsDeg ?? [-180, 180];
  const steps = Math.max(8, Math.ceil((hi - lo) / 10));
  const point = (deg: number): number[] => { const [x, z] = yawWay(facingDeg + deg); return [at[0]! + x * r, y, at[2]! + z * r]; };
  const triangles: number[] = [], segments: number[] = [];
  for (let k = 0; k < steps; k++) {
    const a = lo + ((hi - lo) * k) / steps, b = lo + ((hi - lo) * (k + 1)) / steps;
    triangles.push(at[0]!, y, at[2]!, ...point(a), ...point(b));
    segments.push(...point(a), ...point(b));
  }
  if (limitsDeg) segments.push(at[0]!, y, at[2]!, ...point(lo), at[0]!, y, at[2]!, ...point(hi));
  const arrow = facingShapes(at, facingDeg, r * 1.25);
  return { triangles: [...triangles, ...arrow.triangles], segments: [...segments, ...arrow.segments] };
}

/**
 * `o` kept at its parent's place but never its turn: a hostage faces the reading's yaw in play whatever its marker's
 * (`HOSTAGE_FACING_READING`, `./hostages`), so its guide does not turn with the marker.
 */
export function keepWorldTurn(o: Object3D): void {
  const place = (): void => {
    const e = o.parent?.matrixWorld.elements;
    o.matrixWorld.makeTranslation(e?.[12] ?? 0, e?.[13] ?? 0, e?.[14] ?? 0);
    o.matrixWorldNeedsUpdate = false;
  };
  o.updateMatrixWorld = function (): void { place(); for (const c of o.children) c.updateMatrixWorld(true); };
  o.updateWorldMatrix = function (updateParents: boolean, updateChildren: boolean): void {
    if (updateParents && o.parent) o.parent.updateWorldMatrix(true, false);
    place();
    if (updateChildren) for (const c of o.children) c.updateWorldMatrix(false, true);
  };
}

/** A spectator view's guide colour: its billboard's own (`./mapDataBillboards`: V). */
export const VIEW_GUIDE_COLOUR = 0xff79c6;

/**
 * A spectator view's look: an arrow from its place `len` along its yaw (degrees, 0 down -z, left positive -- the port's
 * convention, `SCENIC_VIEWS_READING` and the fly camera's alike) and pitch (degrees, down negative), its head two barbs
 * and a filled point across it.
 */
export function viewShapes(at: readonly number[], yawDeg: number, pitchDeg: number, len: number): GuideShapes {
  const [wx, wz] = yawWay(yawDeg);
  const p = (pitchDeg * Math.PI) / 180;
  const dx = wx * Math.cos(p), dy = Math.sin(p), dz = wz * Math.cos(p);
  const sx = -wz, sz = wx;                                      // across it, level
  const end = [at[0]! + dx * len, at[1]! + dy * len, at[2]! + dz * len];
  const head = Math.min(10, len * 0.3), neck = len - head;
  const base = [at[0]! + dx * neck, at[1]! + dy * neck, at[2]! + dz * neck];
  const left = [base[0]! + sx * head * 0.5, base[1]!, base[2]! + sz * head * 0.5];
  const right = [base[0]! - sx * head * 0.5, base[1]!, base[2]! - sz * head * 0.5];
  return {
    segments: [at[0]!, at[1]!, at[2]!, ...end, ...end, ...left, ...end, ...right],
    triangles: [...left, ...end, ...right],
  };
}

/** The gizmos' colours for a placed or the map's gate and C4 barrier: their billboards' own (G; a damage trigger's X). */
export const GATE_GUIDE_COLOUR = 0x78c8a8;
export const BARRIER_GUIDE_COLOUR = 0xff9f43;
/**
 * The lines from a context action and a damage trigger to what their programs reach (`./actionSummary`): each its
 * billboard's colour (! and X). An editor guide (FG.R2), never drawn in a match.
 */
export const ACTION_LINK_COLOUR = 0xe0e0e0;
export const DAMAGE_LINK_COLOUR = 0xff9f43;
/** How high over each end's origin (its floor) a placed switch's line to its gate is drawn: clear of the floor. An editor value. */
export const SWITCH_LINK_LIFT = 5;
/** How near along the ground a reached place may stand to its own mark and still need no line: its own parts. An editor value. */
export const LINK_NEAR = 12;

/** A ring of radius `r` round `at` on its floor (`at`'s height, lifted 1): line pairs. */
export function ringSegments(at: readonly number[], r: number, steps = 32): number[] {
  const out: number[] = [];
  const y = at[1]! + 1;
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2, b = ((k + 1) / steps) * Math.PI * 2;
    out.push(at[0]! + Math.cos(a) * r, y, at[2]! + Math.sin(a) * r, at[0]! + Math.cos(b) * r, y, at[2]! + Math.sin(b) * r);
  }
  return out;
}

/**
 * A wire sphere of radius `r` round `at` (an editor guide: a script explosion's reach, the owner, 2026-11-10: "draw the
 * radius sphere"): `rings` latitude circles and `meridians` half-circles pole to pole, `steps` segments a whole circle.
 */
export function sphereSegments(at: readonly number[], r: number, rings = 5, meridians = 8, steps = 32): number[] {
  const out: number[] = [];
  if (!(r > 0)) return out;
  const [cx, cy, cz] = [at[0]!, at[1]!, at[2]!];
  for (let i = 1; i <= rings; i++) {
    const lat = -Math.PI / 2 + (i / (rings + 1)) * Math.PI, y = cy + Math.sin(lat) * r, rr = Math.cos(lat) * r;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2, b = ((k + 1) / steps) * Math.PI * 2;
      out.push(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, cx + Math.cos(b) * rr, y, cz + Math.sin(b) * rr);
    }
  }
  for (let m = 0; m < meridians; m++) {
    const lon = (m / meridians) * Math.PI * 2, ux = Math.cos(lon), uz = Math.sin(lon);
    for (let k = 0; k < steps / 2; k++) {
      const a = -Math.PI / 2 + (k / (steps / 2)) * Math.PI, b = -Math.PI / 2 + ((k + 1) / (steps / 2)) * Math.PI;
      out.push(cx + ux * Math.cos(a) * r, cy + Math.sin(a) * r, cz + uz * Math.cos(a) * r, cx + ux * Math.cos(b) * r, cy + Math.sin(b) * r, cz + uz * Math.cos(b) * r);
    }
  }
  return out;
}

/**
 * A C4 barrier's gizmo: its action's reach -- a ring of the action's `range` round its prompt (`MapAction.at`, where the
 * C4 context comes up), on the floor at the barrier's foot (`centre`'s height). The circle alone (the owner, 2026-11-06).
 */
export function accessShapes(centre: readonly number[], prompt: readonly number[], range: number): GuideShapes {
  return { segments: range > 0 ? ringSegments([prompt[0]!, centre[1]!, prompt[2]!], range) : [], triangles: [] };
}

/** A bomb plant site's gizmo colour: the bomb's billboard red (`./mapDataBillboards` `bombStart`, B). An editor's value. */
export const BOMB_SITE_GUIDE_COLOUR = 0xff4d4d;
/**
 * A placed switch's reach (the owner, 2026-11-10: "draw the range of the switches reach and height reach"; an editor
 * guide, a browser adaptation): its record's `range` and `elevation` as `bombSiteShapes` draws a site's -- the same two
 * `actions.rdr` fields, the same test (`../mapActions` `actionAtPick`) -- round its prompt's place.
 */
export const SWITCH_REACH_COLOUR = 0x7fd1ff;

/**
 * A bomb plant site's gizmo (a browser adaptation, FG.R2): the reach a planter must stand inside -- an MPBOMB context
 * action's `range` (horizontal) and `elevation` (above or below; -1 none, `ACTION_ELEVATION_NONE`), the disc's
 * `actions.rdr` 15 each when omitted (`BOMB_SITE_REACH`, research 173 s2). A cylinder of radius `range` round `at`: its
 * floor ring filled, and with a height test its top and bottom rings joined by four uprights.
 */
export function bombSiteShapes(at: readonly number[], range: number, elevation: number, steps = 32): GuideShapes {
  if (!(range > 0)) return { segments: [], triangles: [] };
  const segments = ringSegments(at, range, steps);
  const triangles: number[] = [];
  const y = at[1]! + 1;
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2, b = ((k + 1) / steps) * Math.PI * 2;
    triangles.push(at[0]!, y, at[2]!, at[0]! + Math.cos(a) * range, y, at[2]! + Math.sin(a) * range, at[0]! + Math.cos(b) * range, y, at[2]! + Math.sin(b) * range);
  }
  if (elevation > 0) {
    // `ringSegments` lifts its ring 1 off `at`: the top and bottom rings at `at` ± elevation exactly.
    segments.push(...ringSegments([at[0]!, at[1]! + elevation - 1, at[2]!], range, steps), ...ringSegments([at[0]!, at[1]! - elevation - 1, at[2]!], range, steps));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2, x = at[0]! + Math.cos(a) * range, z = at[2]! + Math.sin(a) * range;
      segments.push(x, at[1]! - elevation, z, x, at[1]! + elevation, z);
    }
  }
  return { segments, triangles };
}

/**
 * A gate's gizmo: a ring of its lever's `range` round the lever's prompt (`lever`). The circle alone (the owner,
 * 2026-11-06): no slide arrow. `centre` and `slide` are kept for the callers' one shape.
 */
export function gateShapes(_centre: readonly number[], _slide: readonly number[], lever: readonly number[], range: number): GuideShapes {
  return { segments: range > 0 ? ringSegments(lever, range) : [], triangles: [] };
}

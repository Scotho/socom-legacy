import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LineSegments, Mesh, Quaternion, Vector3, type Camera } from 'three';
import { abs, cameraPosition, float, fract, fwidth, max, min, mix, positionLocal, positionWorld, smoothstep, step, uniform, vec2, vec3 } from 'three/tsl';
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';

/**
 * The Forge's map grid (View > Map grid; a browser adaptation, FG.R2: the original has no editor): the snap's grid, drawn
 * over the base -- a disc map, an authored map or the blank floor alike -- through the origin, as a level editor's grid is (so a
 * placement at 0,0,0 sits on it, and what is drawn is where the grid snap lands).
 *
 * Its lines, in tiers (`gridTiers`): every grid step (the snap's, `setStep`); every `METRE_STEP` (1 m at the disc's
 * `MetersPerUnit` 0.1) and every `MAJOR_STEP` (10 m) brighter, each where it is a multiple of the step -- the metric
 * grid the disc's maps were laid out on (a probe of five maps' world vertices, 2026-11-15: 5 and 10 units far above a
 * power of two's share), fixed whatever the step, as a level editor's highlight lines are. A tier closer than a few pixels on
 * screen fades out (a level editor's "hide grid smaller than 4 pixels"), so a 1/16 step stays readable at any zoom. The axes
 * through the origin in the gizmo's colours: X red, Y green, Z blue.
 *
 * Drawn in the fragment shader (a quad a plane, its lines from the world position's derivatives) so any step and any
 * zoom costs the same, per view, with nothing rebuilt.
 *
 * A grid on each axis plane (the Forge's owner (crispy, OT.R112), 2026-11-15: "add the grids on all axes so that we can see them when changing
 * view in any direction"), one shown at a time as the view that draws looks (`orient`): a perspective view, the workplane's
 * (`Workplane`: flat at y = 0 unless set or picked), depth-tested so it lies under what stands over it, fading with
 * distance; an orthographic view, the workplane's while it faces the view, else the axis plane the view looks straight at
 * behind the whole map (as a level editor's 2D views draw their grid under everything), unfaded. A bright cyan (apart from the axes) that reads on a dark map and
 * the blank floor's grey.
 */
export const METRE_STEP = 10;
export const MAJOR_STEP = 100;
/** The floor's grid lifted off the floor it lies on so it does not fight the floor's own depth. */
const LIFT = 0.15;
/** An orthographic view's grid this far past the map's far side. */
const BEHIND = 1;
/** A tier's lines fade out between these spacings on screen (pixels): gone closer than the first. */
const FADE_PX: [number, number] = [4, 10];
/** An orthographic view draws the workplane's grid while its look is at least this square to it (|cos|), else its axis plane's. */
const ORTHO_FACING = 0.5;
/** A perspective view's grid fades out between these distances (units). */
const FAR_FADE: [number, number] = [4000, 14000];

const TIER_LOOK = [
  { color: 0x30d0dc, opacity: 0.5 },                           // the step's
  { color: 0x46dce6, opacity: 0.75 },                          // every metre
  { color: 0x5ae8f0, opacity: 0.95 },                          // every ten metres
] as const;
/** The transform gizmo's axis colours (three's TransformControls: x 0xff0000, y 0x00ff00, z 0x0000ff), by axis index. */
const AXIS_COLOURS = [0xff0000, 0x00ff00, 0x0000ff] as const;

/** The grid's extent: the map's, and its height (the origin always inside). */
export interface GridBounds { minX: number; maxX: number; minZ: number; maxZ: number; minY?: number; maxY?: number }

/**
 * The grid's tiers for a grid `step`: the step's own, then each metric line (`METRE_STEP`, `MAJOR_STEP`) coarser than it
 * and on it (a multiple of the step); null where a tier is not drawn.
 */
export function gridTiers(step: number): [number, number | null, number | null] {
  const on = (s: number): number | null => {
    if (!(s > step * (1 + 1e-9))) return null;
    const k = s / step;
    return Math.abs(k - Math.round(k)) < 1e-6 ? s : null;
  };
  return [step, on(METRE_STEP), on(MAJOR_STEP)];
}

/**
 * The workplane (the Forge's owner (crispy, OT.R112), 2026-11-16: "a button to set the current workplane from a click/sample button and a reset
 * button"; then "it should align to the sampled position's normal"; a browser adaptation, FG.R2): a plane -- a point on
 * it and its unit normal, the normal on the side it was picked from. The grid is drawn on it, what is placed on nothing
 * lands on it, and Snap to Workplane seats placements on it. Flat (normal +Y) at height 0 unless set.
 */
export type WorkplaneVec = [number, number, number];
export interface Workplane { at: WorkplaneVec; n: WorkplaneVec }
/** The flat workplane at height `y`. */
export const flatWorkplane = (y: number): Workplane => ({ at: [0, y, 0], n: [0, 1, 0] });
/** Flat: its normal straight up or down (a floor's, or a ceiling's picked from below). */
export const isFlatWorkplane = (w: Workplane): boolean => Math.abs(w.n[1]) > 1 - 1e-9;
/** Its signed distance from the origin along its normal. */
export const workplaneOffset = (w: Workplane): number => w.at[0] * w.n[0] + w.at[1] * w.n[1] + w.at[2] * w.n[2];
/** The flat workplane at height 0, unmoved. */
export const isDefaultWorkplane = (w: Workplane): boolean => w.n[1] === 1 && w.at[0] === 0 && w.at[1] === 0 && w.at[2] === 0;
const r3 = (v: number): number => Math.round(v * 1000) / 1000 + 0;
/**
 * The workplane's frame: its origin the world origin's foot on it, its rotation the one carrying +Y onto its normal (the
 * shortest), so a flat one's grid is the world's x/z lattice and a tilted one's that lattice tilted with it.
 */
export function workplaneFrame(w: Workplane): { origin: Vector3; q: Quaternion; n: Vector3 } {
  const n = new Vector3(...w.n).normalize();
  return { origin: n.clone().multiplyScalar(workplaneOffset(w)), q: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n), n };
}
/** `p` put on the workplane (along its normal), then on its grid while `step` (snap on) is given. */
export function onWorkplane(w: Workplane, p: Vector3, step: number | null): Vector3 {
  const { origin, q, n } = workplaneFrame(w);
  const out = p.clone().addScaledVector(n, workplaneOffset(w) - p.dot(n));
  if (!step) return out;
  const local = out.sub(origin).applyQuaternion(q.clone().invert());
  local.set(Math.round(local.x / step) * step, 0, Math.round(local.z / step) * step);
  return local.applyQuaternion(q).add(origin);
}
/** Where the ray from `origin` along `dir` meets the workplane, ahead and nearer than `reach`; null otherwise. */
export function rayOnWorkplane(w: Workplane, origin: Vector3, dir: Vector3, reach: number): Vector3 | null {
  const n = new Vector3(...w.n);
  const along = dir.dot(n);
  if (Math.abs(along) < 1e-6) return null;
  const t = (workplaneOffset(w) - origin.dot(n)) / along;
  return t > 0 && t < reach ? origin.clone().addScaledVector(dir, t) : null;
}
/**
 * The workplane through a picked surface `point` with the surface's normal `normal` (turned to the side it was picked
 * from): a normal within a hair of an axis taken as that axis (a float's tilt is no tilt); while `step` (grid snap on) is
 * given, its distance along the normal on the step at or past the surface on that side (the Forge's owner (crispy, OT.R112), 2026-11-16: "so that
 * the workplane is always above"), never rounded into what was picked.
 */
export function pickedWorkplane(point: Vector3, normal: Vector3, step: number | null): Workplane {
  const n = normal.clone().normalize();
  for (const i of [0, 1, 2]) if (Math.abs(n.getComponent(i)) > 1 - 1e-4) { n.set(0, 0, 0).setComponent(i, Math.sign(normal.getComponent(i))); break; }
  let d = point.dot(n);
  if (step) d = Math.ceil(d / step - 1e-6) * step;
  const nv: WorkplaneVec = [r3(n.x), r3(n.y), r3(n.z)];
  // The normal kept to three places, so it is re-normalised before the point is put on it.
  const nn = new Vector3(...nv).normalize();
  return { at: [r3(nn.x * d), r3(nn.y * d), r3(nn.z * d)], n: [nn.x, nn.y, nn.z] };
}

type Axis = 0 | 1 | 2;
type Node = ReturnType<typeof float>;

export class MapGrid {
  readonly group = new Group();
  /** The distance fade: on in a perspective view, off in an orthographic one. Set per view (`orient`), read at its draw. */
  private readonly fadeOn = uniform(1);
  /** Each tier's step and its opacity (0 while it is not drawn). */
  private readonly tierStep = TIER_LOOK.map(() => uniform(1));
  private readonly tierOpacity = TIER_LOOK.map((t) => uniform(t.opacity));
  /**
   * The axis-plane grids by their normal's axis: [0] the y-z plane, [1] the x-z plane, [2] the x-y plane -- an
   * orthographic view's backdrop while the workplane is edge-on to it.
   */
  private readonly planes: Group[] = [new Group(), new Group(), new Group()];
  /** The workplane's grid (`setWorkplane`): its quad across the frame's local x/z, the group carried into the frame. */
  private readonly work = new Group();
  /**
   * The workplane's two axis lines' colours: each the colour of the world axis it runs most along (a front view's upright
   * workplane: its local z is the world's Y, so green), set with it (`setWorkplane`).
   */
  private readonly workAxis = [uniform(new Color(AXIS_COLOURS[0])), uniform(new Color(AXIS_COLOURS[2]))] as const;
  /** The upright Y axis through the origin (a perspective view's). */
  private readonly upright = new Group();
  /** The extent, rounded out to whole major squares: [min, max] per axis. */
  private extent: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  private readonly dir = new Vector3();
  private step = 0;
  /**
   * The workplane (`Workplane`; the Forge's owner (crispy, OT.R112), 2026-11-16: "if the user has a bunch of geometry above the grid, the workplane
   * is hidden"; a browser adaptation): the grid a perspective view draws, and an orthographic view not edge-on to it.
   */
  private plane: Workplane = flatWorkplane(0);
  private readonly planeN = new Vector3(0, 1, 0);
  /** The extent as last placed (`place`). */
  private bounds: GridBounds | null = null;

  constructor() {
    this.group.name = 'forge map grid';
    this.group.visible = false;
    // A guide, not scenery: the lighting leaves it alone (FDL.R4's exception, as the blank floor's).
    this.group.userData['forgeLightingInstrument'] = true;
    this.group.add(...this.planes, this.work, this.upright);
    this.work.position.set(0, LIFT, 0);
    this.setStep(METRE_STEP);
  }

  /** The grid drawn at the snap's `step` (game units), its metric tiers over it (`gridTiers`). */
  setStep(step: number): void {
    if (!(step > 0) || step === this.step) return;
    this.step = step;
    gridTiers(step).forEach((s, i) => {
      this.tierStep[i]!.value = s ?? 1;
      this.tierOpacity[i]!.value = s === null ? 0 : TIER_LOOK[i]!.opacity;
    });
  }

  /** The grids over `bounds`, the origin and the workplane (rounded out to whole major squares). */
  place(bounds: GridBounds): void {
    this.bounds = bounds;
    const round = (lo: number, hi: number): [number, number] =>
      [Math.floor(Math.min(0, lo) / MAJOR_STEP) * MAJOR_STEP, Math.ceil(Math.max(0, hi) / MAJOR_STEP) * MAJOR_STEP];
    const wy = this.plane.at[1];
    this.extent = [
      round(bounds.minX, bounds.maxX),
      round(Math.min(bounds.minY ?? -MAJOR_STEP * 5, wy), Math.max(bounds.maxY ?? MAJOR_STEP * 5, wy)),
      round(bounds.minZ, bounds.maxZ),
    ];
    for (const n of [0, 1, 2] as Axis[]) this.build(n);
    this.buildWork();
    this.buildUpright();
  }

  /** The workplane `w`: its grid drawn there from the next view's draw (`orient`). */
  setWorkplane(w: Workplane): void {
    if (w.at.every((v, i) => v === this.plane.at[i]) && w.n.every((v, i) => v === this.plane.n[i])) return;
    this.plane = { at: [...w.at], n: [...w.n] };
    const { origin, q, n } = workplaneFrame(this.plane);
    this.planeN.copy(n);
    // Lifted off what it lies on, toward the side it was picked from, so it does not fight that surface's depth.
    this.work.position.copy(origin).addScaledVector(n, LIFT);
    this.work.quaternion.copy(q);
    this.work.updateMatrixWorld(true);
    // Each axis line in the colour of the world axis it runs most along.
    ([[1, 0, 0], [0, 0, 1]] as const).forEach((v, i) => {
      const d = new Vector3(...v).applyQuaternion(q);
      const k = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)];
      (this.workAxis[i]!.value as Color).set(AXIS_COLOURS[k.indexOf(Math.max(...k))]!);
    });
    if (this.bounds) this.place(this.bounds);                   // its quad over the map in its own frame
  }

  /** The workplane drawn (`setWorkplane`). */
  planeNow(): Workplane { return { at: [...this.plane.at], n: [...this.plane.n] }; }

  /** The grid's look on a plane, across its local axes `a` and `b`: the tiers' lines and the two axes through its origin. */
  private material(a: Axis, b: Axis, axisColours?: readonly [Node, Node]): MeshBasicNodeMaterial {
    // The quad's own coordinates (its group moved along its normal only, or into the workplane's frame): the lattice.
    const comp = (i: Axis): Node => (i === 0 ? positionLocal.x : i === 1 ? positionLocal.y : positionLocal.z) as unknown as Node;
    const pa = comp(a), pb = comp(b);
    const coord = vec2(pa, pb);
    // A tier's coverage at this fragment: 1 on a line (about a pixel wide), faded where its lines crowd on screen.
    const tier = (i: number): Node => {
      const g = coord.div(this.tierStep[i]!);
      const fw = fwidth(g);
      const off = abs(fract(g.sub(0.5)).sub(0.5)).div(fw);
      const line = float(1).sub(min(off.x, off.y)).saturate();
      const spacing = float(1).div(max(fw.x, fw.y));
      return line.mul(smoothstep(float(FADE_PX[0]), float(FADE_PX[1]), spacing)).mul(this.tierOpacity[i]!) as unknown as Node;
    };
    type V3 = ReturnType<typeof vec3>;
    const rgb = (c: number): V3 => { const k = new Color(c); return vec3(k.r, k.g, k.b) as unknown as V3; };
    const blend = (x: V3, y: V3, t: Node): V3 => mix(x, y, t) as unknown as V3;
    const [t0, t1, t2] = [tier(0), tier(1), tier(2)];
    let colour = blend(rgb(TIER_LOOK[0].color), rgb(TIER_LOOK[1].color), step(0.001, t1) as unknown as Node);
    colour = blend(colour, rgb(TIER_LOOK[2].color), step(0.001, t2) as unknown as Node);
    let alpha = max(max(t0, t1), t2);
    // The axes through the origin: where a is 0 the line runs along b (b's colour), and the other way about.
    const axisLine = (p: Node): Node => float(1.5).sub(abs(p).div(fwidth(p))).saturate() as unknown as Node;
    const onA = axisLine(pa), onB = axisLine(pb);
    colour = blend(colour, axisColours ? axisColours[1] as unknown as V3 : rgb(AXIS_COLOURS[b]), onA);
    colour = blend(colour, axisColours ? axisColours[0] as unknown as V3 : rgb(AXIS_COLOURS[a]), onB);
    alpha = max(alpha, max(onA, onB));
    const far = float(1).sub(smoothstep(float(FAR_FADE[0]), float(FAR_FADE[1]), positionWorld.distance(cameraPosition)).mul(this.fadeOn));
    // Pulled a little toward the camera in depth (the Forge's owner (crispy, OT.R112), 2026-11-16: a workplane picked off a floor was drawn under it):
    // a surface at the grid's own height never covers it, at any range; what stands above it still does.
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    m.colorNode = colour;
    m.opacityNode = alpha.mul(far);
    return m;
  }

  private static clear(g: Group): void {
    for (const c of [...g.children]) {
      g.remove(c);
      const o = c as Mesh;
      o.geometry.dispose();
      (o.material as { dispose(): void }).dispose();
    }
  }

  /** A quad across axes `a` and `b` over [a0, a1] x [b0, b1] (the third coordinate 0), drawn with the grid's look. */
  private quad(a: Axis, b: Axis, [a0, a1]: [number, number], [b0, b1]: [number, number], axisColours?: readonly [Node, Node]): Mesh {
    const point = (va: number, vb: number): number[] => { const p = [0, 0, 0]; p[a] = va; p[b] = vb; return p; };
    const quad = new BufferGeometry();
    quad.setAttribute('position', new BufferAttribute(Float32Array.from([...point(a0, b0), ...point(a1, b0), ...point(a1, b1), ...point(a0, b1)]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new Mesh(quad, this.material(a, b, axisColours));
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    return mesh;
  }

  /** The axis plane with normal `n` through the origin: a quad over the extent across its two other axes. */
  private build(n: Axis): void {
    const g = this.planes[n]!;
    MapGrid.clear(g);
    const [a, b] = ([0, 1, 2] as Axis[]).filter((x) => x !== n) as [Axis, Axis];
    g.add(this.quad(a, b, this.extent[a]!, this.extent[b]!));
  }

  /** The workplane's quad: the map's box (`extent`) seen in the workplane's frame, its x/z rounded out to major squares. */
  private buildWork(): void {
    MapGrid.clear(this.work);
    const { origin, q } = workplaneFrame(this.plane);
    const inv = q.clone().invert();
    let x0 = 0, x1 = 0, z0 = 0, z1 = 0;
    for (const cx of this.extent[0]!) for (const cy of this.extent[1]!) for (const cz of this.extent[2]!) {
      const l = new Vector3(cx, cy, cz).sub(origin).applyQuaternion(inv);
      x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x); z0 = Math.min(z0, l.z); z1 = Math.max(z1, l.z);
    }
    const out = (lo: number, hi: number): [number, number] => [Math.floor(lo / MAJOR_STEP) * MAJOR_STEP, Math.ceil(hi / MAJOR_STEP) * MAJOR_STEP];
    this.work.add(this.quad(0, 2, out(x0, x1), out(z0, z1), this.workAxis as unknown as readonly [Node, Node]));
  }

  /** The upright Y axis through the origin over the extent's heights. */
  private buildUpright(): void {
    MapGrid.clear(this.upright);
    const [y0, y1] = this.extent[1]!;
    const up = new BufferGeometry();
    up.setAttribute('position', new BufferAttribute(Float32Array.from([0, y0, 0, 0, y1, 0]), 3));
    const m = new LineBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const k = new Color(AXIS_COLOURS[1]);
    m.colorNode = vec3(k.r, k.g, k.b);
    const l = new LineSegments(up, m);
    l.frustumCulled = false;
    l.renderOrder = 2;
    this.upright.add(l);
  }

  /**
   * The grid for `camera`, before a view draws: a perspective camera, the workplane's, faded with distance, the upright
   * axis with it; an orthographic one, the workplane's while the view looks at it (`ORTHO_FACING`: a top view a flat one,
   * a front view one picked off a wall facing it), else the axis plane it looks at most squarely, moved just past the
   * map's far side along its look (behind everything, so the map draws over it); unfaded.
   */
  orient(camera: Camera): void {
    if ((camera as { isOrthographicCamera?: boolean }).isOrthographicCamera !== true) {
      for (const p of this.planes) p.visible = false;
      this.work.visible = true;
      this.upright.visible = true;
      this.fadeOn.value = 1;
      return;
    }
    this.fadeOn.value = 0;
    this.upright.visible = false;
    camera.getWorldDirection(this.dir);
    if (Math.abs(this.dir.dot(this.planeN)) > ORTHO_FACING) {
      for (const p of this.planes) p.visible = false;
      this.work.visible = true;
      return;
    }
    this.work.visible = false;
    const d = [this.dir.x, this.dir.y, this.dir.z] as const;
    let n: Axis = 0;
    for (const i of [1, 2] as Axis[]) if (Math.abs(d[i]) > Math.abs(d[n])) n = i;
    this.planes.forEach((p, i) => { p.visible = i === n; });
    const [lo, hi] = this.extent[n]!;
    const p = this.planes[n]!.position;
    p.set(0, 0, 0);
    p.setComponent(n, d[n] < 0 ? lo - BEHIND : hi + BEHIND);
  }

  setVisible(on: boolean): void { this.group.visible = on; }
}

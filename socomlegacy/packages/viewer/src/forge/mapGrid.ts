import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LineSegments, Mesh, Vector3, type Camera } from 'three';
import { abs, cameraPosition, float, fract, fwidth, max, min, mix, positionWorld, smoothstep, step, uniform, vec2, vec3 } from 'three/tsl';
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';

/**
 * The Forge's map grid (View > Map grid; a browser adaptation, FG.R2: the original has no editor): the snap's grid, drawn
 * over the base -- a disc map, an authored map or the blank floor alike -- through the origin, as Hammer's grid is (so a
 * placement at 0,0,0 sits on it, and what is drawn is where the grid snap lands).
 *
 * Its lines, in tiers (`gridTiers`): every grid step (the snap's, `setStep`); every `METRE_STEP` (1 m at the disc's
 * `MetersPerUnit` 0.1) and every `MAJOR_STEP` (10 m) brighter, each where it is a multiple of the step -- the metric
 * grid the disc's maps were laid out on (a probe of five maps' world vertices, 2026-11-15: 5 and 10 units far above a
 * power of two's share), fixed whatever the step, as Hammer's highlight lines are. A tier closer than a few pixels on
 * screen fades out (Hammer's "hide grid smaller than 4 pixels"), so a 1/16 step stays readable at any zoom. The axes
 * through the origin in the gizmo's colours: X red, Y green, Z blue.
 *
 * Drawn in the fragment shader (a quad a plane, its lines from the world position's derivatives) so any step and any
 * zoom costs the same, per view, with nothing rebuilt.
 *
 * A grid on each axis plane (the owner, 2026-11-15: "add the grids on all axes so that we can see them when changing
 * view in any direction"), one shown at a time as the view that draws looks (`orient`): a perspective view, the floor's
 * (y = 0), depth-tested so it lies under the ground it passes beneath, fading with distance; an orthographic view, the
 * plane it looks straight at, unfaded -- a top or bottom view the floor's, a side view's behind the whole map (as
 * Hammer's 2D views draw their grid under everything). A bright cyan (apart from the axes) that reads on a dark map and
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

type Axis = 0 | 1 | 2;
type Node = ReturnType<typeof float>;

export class MapGrid {
  readonly group = new Group();
  /** The distance fade: on in a perspective view, off in an orthographic one. Set per view (`orient`), read at its draw. */
  private readonly fadeOn = uniform(1);
  /** Each tier's step and its opacity (0 while it is not drawn). */
  private readonly tierStep = TIER_LOOK.map(() => uniform(1));
  private readonly tierOpacity = TIER_LOOK.map((t) => uniform(t.opacity));
  /** The plane grids by their normal's axis: [0] the y-z plane, [1] the floor (x-z), [2] the x-y plane. */
  private readonly planes: Group[] = [new Group(), new Group(), new Group()];
  /** The extent, rounded out to whole major squares: [min, max] per axis. */
  private extent: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  private readonly dir = new Vector3();
  private step = 0;

  constructor() {
    this.group.name = 'forge map grid';
    this.group.visible = false;
    // A guide, not scenery: the lighting leaves it alone (FDL.R4's exception, as the blank floor's).
    this.group.userData['forgeLightingInstrument'] = true;
    this.group.add(...this.planes);
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

  /** The grids over `bounds` and the origin (rounded out to whole major squares). */
  place(bounds: GridBounds): void {
    const round = (lo: number, hi: number): [number, number] =>
      [Math.floor(Math.min(0, lo) / MAJOR_STEP) * MAJOR_STEP, Math.ceil(Math.max(0, hi) / MAJOR_STEP) * MAJOR_STEP];
    this.extent = [
      round(bounds.minX, bounds.maxX),
      round(bounds.minY ?? -MAJOR_STEP * 5, bounds.maxY ?? MAJOR_STEP * 5),
      round(bounds.minZ, bounds.maxZ),
    ];
    for (const n of [0, 1, 2] as Axis[]) this.build(n);
  }

  /** The grid's look on the plane across axes `a` and `b`: the tiers' lines and the two axes through the origin. */
  private material(a: Axis, b: Axis): MeshBasicNodeMaterial {
    const comp = (i: Axis): Node => (i === 0 ? positionWorld.x : i === 1 ? positionWorld.y : positionWorld.z) as unknown as Node;
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
    colour = blend(colour, rgb(AXIS_COLOURS[b]), onA);
    colour = blend(colour, rgb(AXIS_COLOURS[a]), onB);
    alpha = max(alpha, max(onA, onB));
    const far = float(1).sub(smoothstep(float(FAR_FADE[0]), float(FAR_FADE[1]), positionWorld.distance(cameraPosition)).mul(this.fadeOn));
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
    m.colorNode = colour;
    m.opacityNode = alpha.mul(far);
    return m;
  }

  /** The plane through the origin with normal `n`: a quad over the extent across its two other axes; the floor's with the upright Y axis too. */
  private build(n: Axis): void {
    const g = this.planes[n]!;
    for (const c of [...g.children]) {
      g.remove(c);
      const o = c as Mesh;
      o.geometry.dispose();
      (o.material as { dispose(): void }).dispose();
    }
    const [a, b] = ([0, 1, 2] as Axis[]).filter((x) => x !== n) as [Axis, Axis];
    const [a0, a1] = this.extent[a]!, [b0, b1] = this.extent[b]!;
    const point = (va: number, vb: number): number[] => { const p = [0, 0, 0]; p[a] = va; p[b] = vb; return p; };
    const quad = new BufferGeometry();
    quad.setAttribute('position', new BufferAttribute(Float32Array.from([...point(a0, b0), ...point(a1, b0), ...point(a1, b1), ...point(a0, b1)]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new Mesh(quad, this.material(a, b));
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    g.add(mesh);
    if (n === 1) {                                             // the floor's upright Y
      const [y0, y1] = this.extent[1]!;
      const up = new BufferGeometry();
      up.setAttribute('position', new BufferAttribute(Float32Array.from([0, y0, 0, 0, y1, 0]), 3));
      const m = new LineBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      const k = new Color(AXIS_COLOURS[1]);
      m.colorNode = vec3(k.r, k.g, k.b);
      const l = new LineSegments(up, m);
      l.frustumCulled = false;
      l.renderOrder = 2;
      g.add(l);
    }
  }

  /**
   * The grid for `camera`, before a view draws: a perspective camera, the floor's on y = 0, faded with distance; an
   * orthographic one, the plane it looks at most squarely, moved just past the map's far side along its look (behind
   * everything, so the map draws over it), unfaded.
   */
  orient(camera: Camera): void {
    if ((camera as { isOrthographicCamera?: boolean }).isOrthographicCamera !== true) {
      this.planes.forEach((p, i) => { p.visible = i === 1; });
      this.planes[1]!.position.set(0, LIFT, 0);
      this.fadeOn.value = 1;
      return;
    }
    camera.getWorldDirection(this.dir);
    const d = [this.dir.x, this.dir.y, this.dir.z] as const;
    let n: Axis = 0;
    for (const i of [1, 2] as Axis[]) if (Math.abs(d[i]) > Math.abs(d[n])) n = i;
    this.planes.forEach((p, i) => { p.visible = i === n; });
    const [lo, hi] = this.extent[n]!;
    const p = this.planes[n]!.position;
    p.set(0, 0, 0);
    // Top and bottom: the floor's own, on y = 0 (a blank map's floor plane would hide it from above, past its far side);
    // a side view: past the map's far side, as the camera looks.
    p.setComponent(n, n === 1 ? LIFT : d[n] < 0 ? lo - BEHIND : hi + BEHIND);
    this.fadeOn.value = 0;
  }

  setVisible(on: boolean): void { this.group.visible = on; }
}

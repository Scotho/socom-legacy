import {
  BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group, Line, LineBasicMaterial, LinearFilter, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, RGBAFormat, UnsignedByteType, Vector3,
} from 'three';
import type { Material } from 'three';
import type { Rgba } from '@s2u/gs';
import { BULLET_MARK, DEFAULT_RIFLE, type DecalEntry, type WeaponRecord } from '@s2u/scene';
import type { SurfaceShade } from './surfaceShade';
import { markClipGeometry, markFrame, TEMP_DECAL_TRIANGLES, type MarkClipper, type MarkFrame } from './markClip';
import { hdTextures } from './hdTexturePack';
import { FireCore, type FireSource, type FireState, type FireMarkPlan, type ShotHit } from './fireCore';
export * from './fireCore';
type Vec3 = [number, number, number];

/** The mark's lift off the polygon's plane, toward the shooter, in units. */
export const DECAL_OFFSET = 0.05;

/**
 * The marks kept; the 151st reuses the oldest. `decals.rdr`'s `TEMP_DECAL_POOL` `BASE 150` (`OVERFLOW 50`): the game
 * trims its temporary pool back to the base, oldest first, every frame (`FUN_003bf110`, research 89 §5).
 */
export const MAX_DECALS = 150;

/** The tracer's start from the eye, in the view's own axes (right, up, ahead), units [estimate: a muzzle stand-in]. */
const MUZZLE_READING: Vec3 = [1.2, -1.5, 3];

/**
 * EFFECTS (socomlegacy/docs/research/89 §5): the mark per surface -- the polygon's material byte to its `decals.rdr` row of the
 * rifle's `DecalSet` (null: the material has no row, and the round leaves no mark) and a row's bitmap by texture name
 * (null: the dark disc). Without one every hit takes the constructor's mark.
 */
export interface MarkTable {
  row(material: number): DecalEntry | null;
  bitmap(texture: string): Rgba | null;
  /** The material a mark's bitmap draws with, when the table makes its own (the effects' GS arithmetic, brightened). */
  material?(texture: string): Material | null;
}

/** How many marks without a drawn wall under them are asked again a frame (`Fire.shadeLate`). */
const SHADE_RETRIES_PER_FRAME = 4;

/** The least elongation a slanting hit's mark is held to: `|dir . n|` at least this (research 89 §5, a reading). */
export const MARK_GRAZE_FLOOR = 0.2;

/**
 * The game's mark as a matrix on the unit quad (research 89 §5; `FUN_003d0ba0` decomp 323789, `FUN_00307810` 206429):
 * a square `side` across, square to the round's direction `dir` -- its up the world axis least aligned with the surface
 * normal, so no turn -- projected along `dir` onto the surface (the plane through `point` with normal `normal`, which
 * faces the shooter), then lifted `lift` along the normal. The projection stretches the mark on a slanting hit, as the
 * game's does; `MARK_GRAZE_FLOOR` bounds the stretch where the game's clip to the polygon would.
 */
export function projectedMark(point: Vec3, normal: Vec3, dir: Vec3, side: number, lift: number): Matrix4 {
  const n = new Vector3(...normal).normalize();
  const f = new Vector3(...dir).normalize();
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  const up0 = axes.reduce((best, a) => (Math.abs(a.dot(n)) < Math.abs(best.dot(n)) ? a : best));
  const right = new Vector3().crossVectors(f, up0);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0).cross(f);
  right.normalize();
  const up = new Vector3().crossVectors(right, f).normalize();
  let fn = f.dot(n);
  if (Math.abs(fn) < MARK_GRAZE_FLOOR) fn = fn < 0 ? -MARK_GRAZE_FLOOR : MARK_GRAZE_FLOOR;
  // Along f onto the plane: an offset v from the point lands at v - f (v.n) / (f.n).
  const onPlane = (v: Vector3): Vector3 => v.clone().addScaledVector(f, -v.dot(n) / fn).multiplyScalar(side);
  const x = onPlane(right), y = onPlane(up);
  const at = new Vector3(...point).addScaledVector(n, lift);
  return new Matrix4().makeBasis(x, y, n).setPosition(at);
}

/**
 * OBF-32: the `renderOrder` of the walk's decals -- the bullet marks (`Fire.place`), the footprints (`Effects.footfall`)
 * and the grenade's scorch -- in three's order. The original links a mark's packet into the struck visual's own chain
 * (`FUN_003b3800`, D:L306396-306413), and `FUN_003b4580` walks that chain (D:L307165-307190) after the visual's whole
 * command list, which `FUN_003b5f20` builds (D:L306946, D:L306993, D:L307040, D:L307083) with the reflection
 * (`FUN_003b5b90`, D:L307913, D:L307973; research 330 R330.2) and the detail pass in it: base, reflection, detail, then
 * the mark, in RenderWorld's walk. The particles drain after the whole walk, in the alpha pass `FUN_00336cb0`
 * (D:L235146-235180, called at D:L237235), writing no depth (D:L235137, D:L235185), so the smoke blends over a mark as
 * over the wall under it (research 89 §20.1; reading, pending review).
 *
 * three sorts its transparent list by `renderOrder` before depth, so the order is one number between the walk and the
 * particles: after every blended walk draw (`world.ts` `restOrder`, `order * 2^-24`), its detail pass (+0.5) and its
 * env pass (+0.75), and before the particle batches (`./particles` `PARTICLE_BATCH_RENDER_ORDER`). The gap holds while a
 * walk order stays under 2^21 (a placement rank under 8192, `loadMap.ts` `orderOf`; `world.ts` `REST_WALK_SCALE` says a
 * few hundred). Was 1 (W2.5, uncited): every mark drew after every puff, at any distance; -1 (OBF-32's first cut) drew it
 * under its own wall's blended packet and reflection. The world's alpha pass against the particles is LATER 593.
 */
export const WALK_DECAL_RENDER_ORDER = 0.875;

/** A quad of the mark's shape with a `color` attribute of its own (rgba, unity). */
export function markGeometry(quad: BufferGeometry): BufferGeometry {
  const g = quad.clone();
  const count = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(count * 4).fill(1), 4));
  return g;
}

/** Every corner of a mark's `color` to `rgba` (1.0 = the PS2's 0x80), or to unity for null. */
export function paintMark(geometry: BufferGeometry, rgba: readonly number[] | null): void {
  const colour = geometry.getAttribute('color') as Float32BufferAttribute | undefined;
  if (!colour) return;
  const [r, g, b, a] = rgba ?? [1, 1, 1, 1];
  for (let i = 0; i < colour.count; i++) colour.setXYZW(i, r!, g!, b!, a!);
  colour.needsUpdate = true;
}

/** A dark disc, 16x16, soft at its rim: the mark when `bullet_mark_stone.tif` is not to hand. */
function darkDisc(): Rgba {
  const size = 16, data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
      data[i + 3] = r >= 1 ? 0 : Math.round(220 * Math.min(1, (1 - r) * 3));
    }
  }
  return { width: size, height: size, data };
}

/** Existing graphics adapter over the shared firearm engine. Public API retained. */
export class Fire extends FireCore {
  constructor(
    source: FireSource,
    rifle: WeaponRecord = DEFAULT_RIFLE,
    mark: DecalEntry = BULLET_MARK,
    random: () => number = Math.random,
  ) {
    super(source, rifle, mark, random);
    this.material = new MeshBasicMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, fog: true, toneMapped: false, vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.setBitmap(null);
    const line = new BufferGeometry();
    line.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    this.tracer = new Line(line, new LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, fog: true, toneMapped: false }));
    this.tracer.frustumCulled = false;
    this.tracer.visible = false;
    this.object.add(this.tracer);
  }

  /** The marks and the tracer: `main.ts` adds it to the scene. */
  readonly object = new Group();

  private readonly geometry = new PlaneGeometry(1, 1);

  private readonly material: MeshBasicMaterial;

  private texture: DataTexture | null = null;

  private readonly decals: Mesh[] = [];

  /** LATER 277: each mark's hold on its hit node (`FireSource.holdOnNode`), released with it. */
  private readonly heldOn = new Map<Mesh, () => void>();

  private nextDecal = 0;

  private decalLimit = MAX_DECALS;

  private readonly tracer: Line;

  private tracerFrames = 0;

  private marks: MarkTable | null = null;

  /** EFFECTS: one material a mark bitmap, made on first use (the constructor's own is `material`). */
  private readonly markMaterials = new Map<string, Material>();

  /** EFFECTS: the world's drawn colour under a hit (`./surfaceShade`), or null: every mark at unity. */
  private shade: SurfaceShade | null = null;

  private lastShade: [number, number, number, number] | null = null;

  /** The test instrument `FireState.lastKept`: the last clip's kept triangles, or null when none was asked. */
  private lastKept: number | null = null;

  /**
   * EFFECTS: marks placed where no drawn surface was yet under them (the props stream in over the frames after a map
   * shows, `main.ts`'s reveal), asked again each frame until the wall is drawn or the mark is recycled.
   */
  private unshaded = new Map<Mesh, { point: Vec3; normal: Vec3 }>();

  /** EFFECTS: the clip to the drawn world (`./markClip`), or null: the projected square with one shade. */
  private clipper: MarkClipper | null = null;

  /**
   * EFFECTS: marks whose clip kept nothing while the dev viewer's world is still revealing (`MarkClipper.worldWhole`
   * false, MARK_LATE_REVEAL_ADAPTATION; research 431): no mesh and no slot of the ring, only the mark's frame, clipped
   * again a few a frame and given a slot when the clip keeps triangles; dropped once the world is whole.
   */
  private readonly unclipped = new Map<object, { frame: MarkFrame; material: Material; point: Vec3 }>();
  /** EFFECTS: the clip's scratch geometry: a mark is clipped into it first and takes a ring slot only if it kept a triangle. */
  private spareClip: BufferGeometry | null = null;

  /** EFFECTS: each clipped mark's world triangles and its place in the order, for the pool (`TEMP_DECAL_TRIANGLES`). */
  private readonly markTriangles = new Map<Mesh, { triangles: number; order: number }>();

  private markOrder = 0;

  /** EFFECTS (research 92 §6): the marks hung on a moving node (a door's leaf), and how to take each off it. */
  private readonly onNode = new Map<Mesh, () => void>();

  /** The mark's bitmap (`bullet_mark_stone.tif` off the map's `EFFE_TXR.ZED`), or null for the dark disc. */
  setBitmap(rgba: Rgba | null | undefined): void {
    this.texture?.dispose();
    const image = rgba ?? darkDisc();
    const t = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType);
    hdTextures.register(t, image);   // OT.R92 (HD-3): inert until the test room's HD pack is set
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texture = t;
    this.material.map = t;
    this.material.needsUpdate = true;
  }

  /**
   * EFFECTS (research 89 §5, the mark's colour): the world's drawn vertex colour under a hit, which the game modulates
   * the mark's texel by (`FUN_003beca0` puts the wall vertices' own colour words in the mark's packet); null: unity.
   */
  setShade(shade: SurfaceShade | null): void {
    this.shade = shade;
  }

  /**
   * EFFECTS (research 89 §5 and §13): clip each mark to the drawn world under it and shade it per vertex, as
   * `FUN_003b3ab0` builds it (`./markClip`); the pool then counts triangles, as the game's. Null: the projected square.
   */
  setClip(clipper: MarkClipper | null): void {
    this.clipper = clipper;
    this.setMarkClipped(clipper !== null);
  }

  setMarks(marks: MarkTable | null): void {
    this.marks = marks;
    this.setMarkRows(marks);
    for (const m of this.markMaterials.values()) { (m as MeshBasicMaterial).map?.dispose(); m.dispose(); }
    this.markMaterials.clear();
  }

  private markMaterial(texture: string): Material {
    const known = this.markMaterials.get(texture);
    if (known) return known;
    const provided = this.marks?.material?.(texture) ?? null;
    if (provided) { this.markMaterials.set(texture, provided); return provided; }
    const m = this.material.clone();
    const image = this.marks?.bitmap(texture) ?? darkDisc();
    const t = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType);
    hdTextures.register(t, image);   // OT.R92 (HD-3): inert until the test room's HD pack is set
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    m.map = t;
    this.markMaterials.set(texture, m);
    return m;
  }

  /**
   * The tracer's one frame alone (`update` runs it): a tracer lit since the last step is drawn in this frame, an older
   * one goes. PAR-54 (research 215 s7.6): a page whose firearm is still -- mounted on a turret, `update` not run -- steps
   * it every frame, as the game's world steps every tracer whoever fired it (`FUN_003d1f90` D:L324551 -> `FUN_003cc990`
   * D:L321474 -> `FUN_003d4bf0`).
   */
  override tracerFrame(): void {
    if (this.tracerFrames > 0) this.tracerFrames--;
    else this.tracer.visible = false;
  }

  /** EFFECTS: a few of the marks still without a drawn wall under them, asked again (`unshaded`). */
  private shadeLate(): void {
    if (!this.shade || this.unshaded.size === 0) return;
    let asked = 0;
    for (const [mesh, at] of this.unshaded) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      const rgba = this.shade(at.point, at.normal);
      this.unshaded.delete(mesh);
      if (rgba) paintMark(mesh.geometry, rgba);
      else this.unshaded.set(mesh, at);                 // to the back of the queue: the others get their turn
    }
  }

  /**
   * EFFECTS: a few of the held marks (`unclipped`) clipped again. Kept triangles: the mark takes its ring slot and is
   * drawn as `placeClipped` draws it (`adoptClip`). None: back of the queue while the world is still revealing; dropped,
   * never drawn and never given a slot, once it is whole (research 431: the original files no entry for a clip that
   * keeps nothing, `FUN_003b3ab0` D:L306632-306662).
   */
  private clipLate(): void {
    if (!this.clipper || this.unclipped.size === 0) return;
    let asked = 0;
    for (const [key, held] of this.unclipped) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      this.unclipped.delete(key);
      const kept = this.clipper.clip(held.frame, this.spareClip ??= markClipGeometry(), DECAL_OFFSET);
      if (kept === 0) {
        if (!this.clipper.worldWhole) this.unclipped.set(key, held);   // to the back of the queue
        continue;                                                       // whole: dropped, no slot, no pool room
      }
      this.adoptClip(kept, held.material, held.point);
    }
  }

  /**
   * The temporary pool back to `TEMP_DECAL_TRIANGLES` triangles, the oldest marks first (`FUN_003bf110`), never `keep`.
   */
  private trimPool(keep: Mesh): void {
    let live = 0;
    for (const [mesh, e] of this.markTriangles) if (mesh.visible) live += e.triangles;
    while (live > TEMP_DECAL_TRIANGLES) {
      let oldest: Mesh | null = null, order = Infinity;
      for (const [mesh, e] of this.markTriangles) {
        if (mesh !== keep && mesh.visible && e.order < order) { oldest = mesh; order = e.order; }
      }
      if (!oldest) break;
      oldest.visible = false;
      this.unclipped.delete(oldest);
      this.detach(oldest);
      live -= this.markTriangles.get(oldest)!.triangles;
    }
  }

  /** EFFECTS: a mark off the node it rode (recycled, trimmed, a new map); its matrix back to the world's identity. */
  private detach(mesh: Mesh): void {
    this.heldOn.get(mesh)?.();                          // LATER 277: no longer held on its node
    this.heldOn.delete(mesh);
    const off = this.onNode.get(mesh);
    if (!off) return;
    off();
    this.onNode.delete(mesh);
    mesh.matrix.identity();
    mesh.matrixWorldNeedsUpdate = true;
  }

  /**
   * EFFECTS: the mark just clipped onto the node the clip chose, when that node moves (`FireSource.attachToNode`);
   * and LATER 277, held on it whatever it is: the node switched off (a pane broken, a bridge blown) recycles the mark
   * and frees its room in the temporary pool (`NODE_OFF_MARKS_READING`, `./world`; one rule with the scorches', as
   * `FUN_003b36f0` D:L306336-306342 frees both kinds together).
   */
  private hangOnNode(mesh: Mesh): void {
    this.detach(mesh);
    const path = this.clipper?.lastNodePath ?? null;
    if (!path) return;
    const release = this.source.holdOnNode?.(path, () => { this.heldOn.delete(mesh); this.recycleMark(mesh); }) ?? null;
    if (release) this.heldOn.set(mesh, release);
    const off = this.source.attachToNode?.(path, mesh) ?? null;
    if (off) this.onNode.set(mesh, off);
  }

  /** LATER 277: a mark whose node was switched off -- drawn no more, off its node, out of the queues. */
  private recycleMark(mesh: Mesh): void {
    mesh.visible = false;
    this.unclipped.delete(mesh);
    this.unshaded.delete(mesh);
    this.detach(mesh);
  }

  /** EFFECTS: how many marks ride a moving node now (tests and the hook). */
  marksOnNodes(): number {
    return this.onNode.size;
  }

  tracerVisible(): boolean {
    return this.tracer.visible;
  }

  /** The marks placed so far, oldest first until the pool wraps (tests and the hook). */
  decalMeshes(): Mesh[] {
    return this.decals;
  }

  /**
   * The marks go, the kit stays: a round's end (CMPExitState `FUN_00223970` L76084 -> `FUN_0031c880` ->
   * `FUN_003bf050(0x4b5030)` L219059, the temporary pool emptied, every entry off its visual) and a new map (`reset`).
   */
  override clearMarks(): void {
    for (const d of this.decals) { this.detach(d); this.object.remove(d); d.geometry.dispose(); }
    this.unshaded.clear();
    this.unclipped.clear();
    this.markTriangles.clear();
    this.decals.length = 0;
    this.nextDecal = 0;
  }

  /**
   * ONL-18d (web research 166 §8): everything the fire made freed -- its marks, the tracer, the mark materials and
   * bitmap -- and its key let go: the front end's match makes a fire per match (`./matchFirearm`).
   */
  override dispose(): void {
    super.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
    this.texture = null;
    this.setMarks(null);                                 // the mark materials and their bitmaps
    this.tracer.geometry.dispose();
    (this.tracer.material as { dispose(): void }).dispose();
    this.object.remove(this.tracer);
  }

  /** Cosmetic drawing budget (`xboxPs2Effects`); zero omits marks. Never changes shots or ammunition. */
  setDecalLimit(limit: number): void {
    if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DECALS) throw new RangeError('Invalid bullet-mark limit');
    if (limit === this.decalLimit) return;
    this.clearMarks();
    this.decalLimit = limit;
  }

  protected override drawMark(hit: ShotHit, dir: Vec3, plan: FireMarkPlan): void {
    if (this.decalLimit === 0) {
      // Xbox PS2 adaptation: omit clipping, shading, textures and meshes. Marks share the recoil's random source; the
      // core draws the same values after this hook whether or not a mark was drawn (`FireCore.place`).
      this.lastShade = null;                            // diagnostic colour of the omitted mark
      return;
    }
    // Research 431 (the second read's F3): a clipped mark takes its ring slot only once its clip has kept a triangle.
    if (this.clipper) { this.placeClipped(hit, plan); return; }
    const mesh = this.takeSlot();
    const row = plan.row;
    if (mesh.geometry.userData.markClip) { mesh.geometry.dispose(); mesh.geometry = markGeometry(this.geometry); }
    this.markTriangles.delete(mesh);
    // EFFECTS (research 89 §5): the wall's own drawn colour under the hit modulates the mark, as the GS does it.
    this.lastShade = this.shade?.(hit.point, hit.normal) ?? null;
    paintMark(mesh.geometry, this.lastShade);
    if (this.shade && !this.lastShade) this.unshaded.set(mesh, { point: [...hit.point], normal: [...hit.normal] });
    else this.unshaded.delete(mesh);
    const n = new Vector3(...hit.normal);
    if (this.marks) {
      // EFFECTS: the game's mark (`FUN_003d0ba0`, decomp 323789; research 89 §5): the size drawn once, the square
      // projected along the round's direction onto the surface -- stretched on a slanting hit -- with no turn.
      const { side } = plan.sample();
      mesh.material = this.markMaterial(row.texture);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(projectedMark(hit.point, hit.normal, dir, side, DECAL_OFFSET));
      mesh.position.setFromMatrixPosition(mesh.matrix);   // the matrix is sheared: position only, for the hook
      mesh.visible = true;
      mesh.updateMatrixWorld(true);
      return;
    }
    mesh.matrixAutoUpdate = true;
    mesh.position.set(hit.point[0], hit.point[1], hit.point[2]).addScaledVector(n, DECAL_OFFSET);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
    // A turn about the normal, so the marks do not all share one grain.
    const { rotation, side } = plan.sample();
    mesh.rotateZ(rotation!);
    mesh.material = this.material;
    mesh.scale.set(side, side, 1);
    mesh.visible = true;
    mesh.updateMatrixWorld();
  }

  /**
   * EFFECTS (research 89 §5, §13 and §15): the game's mark -- the size drawn once, the square flat on the hit surface
   * with no turn -- clipped to the drawn world under it, each vertex the world's colour there (`./markClip`). Where the
   * clip keeps no drawn triangle the mark is not drawn and takes no room in the pool and no slot of the ring (WM-20,
   * research 431: `FUN_003b3ab0` files a triangle only in its kept branch, D:L306632-306662 -- a collision hull standing
   * more than 4.8 off its drawn mesh, Frostfire's pipes, shows no mark); while the dev viewer's world is still revealing
   * (`MarkClipper.worldWhole`, MARK_LATE_REVEAL_ADAPTATION) its frame is held, slotless, and clipped again a few a frame
   * (`clipLate`). Was: the bare square at unity, drawn in the air, in a slot of the ring.
   *
   * Projected along the hit polygon's normal, not the round: `FUN_003d0ba0` (323919) hands `FUN_003139e0` the hit
   * record's +0x10 negated (`FUN_00309180`, D:L323891), and `FUN_00307810` looks along that one vector. Along the round, a wall's 15-20 unit
   * triangles hit at a slant put a vertex past the 4.8 test and the whole wall was dropped (every mark on Frostfire's
   * container and Desert Glory's stone the bare square at unity, `test/markClipMaps.test.ts`).
   */
  private placeClipped(hit: ShotHit, plan: FireMarkPlan): void {
    const row = plan.row;
    const { side } = plan.sample();
    const material = this.marks ? this.markMaterial(row.texture) : this.material;
    const n = hit.normal;
    const frame = markFrame(hit.point, n, [-n[0], -n[1], -n[2]], side);
    // Clipped into the scratch geometry first: no ring slot, no pool room and nothing drawn unless a triangle is kept
    // (research 431; `FUN_003b3ab0` takes its pool entry only inside the kept branch, D:L306632-306662).
    const kept = this.clipper!.clip(frame, this.spareClip ??= markClipGeometry(), DECAL_OFFSET);
    this.lastKept = kept;                                // the test instrument only
    if (kept === 0) {
      this.lastShade = null;
      if (!this.clipper!.worldWhole) {                     // MARK_LATE_REVEAL_ADAPTATION: held, slotless, for a late clip
        const held = { frame, material, point: [hit.point[0], hit.point[1], hit.point[2]] as Vec3 };
        this.unclipped.set(held, held);
      }
      return;
    }
    const c = this.clipper!.centre;
    this.lastShade = this.clipper!.centreFound ? [c[0]!, c[1]!, c[2]!, c[3]!] : null;
    this.adoptClip(kept, material, hit.point);
  }

  /**
   * EFFECTS: the next slot of the ring of `MAX_DECALS` meshes -- a new mesh until the ring is full, then the oldest,
   * recycled (`nextDecal`) -- off any node it rode.
   */
  private takeSlot(): Mesh {
    let mesh = this.decals.length < this.decalLimit ? undefined : this.decals[this.nextDecal];
    if (!mesh) {
      // Each mark its own four corners, for its own colour (the geometry is the shared quad's, cloned).
      mesh = new Mesh(this.clipper ? markClipGeometry() : markGeometry(this.geometry), this.material);
      mesh.renderOrder = WALK_DECAL_RENDER_ORDER;        // after its wall's passes, before the smoke's particles
      this.decals.push(mesh);
      this.object.add(mesh);
    }
    this.nextDecal = (this.nextDecal + 1) % this.decalLimit;
    this.detach(mesh);                                  // a recycled mark leaves the node it was on
    return mesh;
  }

  /**
   * EFFECTS: a clip that kept `kept` triangles (in `spareClip`) takes its ring slot: the slot's mesh takes the clipped
   * geometry and its old one becomes the scratch; charged to the pool, hung on the clip's node, drawn.
   */
  private adoptClip(kept: number, material: Material, point: Vec3): void {
    const mesh = this.takeSlot();
    const old = mesh.geometry;
    mesh.geometry = this.spareClip!;
    if (old.userData.markClip) this.spareClip = old;
    else { old.dispose(); this.spareClip = markClipGeometry(); }
    mesh.material = material;
    this.unshaded.delete(mesh);
    this.markTriangles.set(mesh, { triangles: kept, order: this.markOrder++ });
    mesh.matrixAutoUpdate = false;
    mesh.matrix.identity();                                // the clip is in world space
    mesh.position.set(point[0], point[1], point[2]);       // for the hook; the matrix stays the identity
    // Research 92 §6: the game files each kept triangle in the hit visual's own decal list (`FUN_003b3800` 306396-306416,
    // from `FUN_003139e0` 213931-213935 per visual of the hit node; the heads made by the loader `FUN_003b2ea0`
    // 306133-306135) -- node-local by inference, so a mark on a door's leaf swings with it. The clip's node, when it
    // is a placement that moves, carries this one (`FireSource.attachToNode`); the world's own node never moves.
    this.hangOnNode(mesh);
    mesh.visible = true;
    mesh.updateMatrixWorld(true);
    this.trimPool(mesh);
  }

  protected override drawTracer(eye: Vec3, dir: Vec3, to: Vec3, fromMuzzle = false): void {
    const ahead = new Vector3(...dir);
    const right = new Vector3().crossVectors(ahead, new Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-9) right.set(1, 0, 0);
    right.normalize();
    const up = new Vector3().crossVectors(right, ahead).normalize();
    const start = fromMuzzle ? new Vector3(...eye)
      : new Vector3(...eye).addScaledVector(right, MUZZLE_READING[0]).addScaledVector(up, MUZZLE_READING[1])
        .addScaledVector(ahead, MUZZLE_READING[2]);
    const position = this.tracer.geometry.getAttribute('position') as Float32BufferAttribute;
    position.setXYZ(0, start.x, start.y, start.z);
    position.setXYZ(1, to[0], to[1], to[2]);
    position.needsUpdate = true;
    this.tracer.geometry.computeBoundingSphere();
    this.tracer.visible = true;
    this.tracerFrames = 1;
  }

  protected override presentationFrame(): void { this.tracerFrame(); this.shadeLate(); this.clipLate(); }
  protected override tracerDrawnInFrame(): void { this.tracerFrames = 0; }
  protected override resetPresentation(): void { this.lastShade = null; this.lastKept = null; this.tracerFrames = 0; this.tracer.visible = false; }
  protected override markAsked(): void { this.lastKept = null; }   // the test instrument: set again only by a clip
  protected override presentationStats(): Pick<FireState, 'decals' | 'lastShade' | 'lastKept'> {
    return { decals: this.decals.filter(d => d.visible).length, lastShade: this.lastShade ? [...this.lastShade] : null, lastKept: this.lastKept };
  }
}

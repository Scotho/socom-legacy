import { releaseRenderObjects } from './renderRelease';
import {
  AdditiveBlending, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, NormalBlending,
  PlaneGeometry, RGBAFormat, Sprite, SpriteMaterial, UnsignedByteType, BufferGeometry, Float32BufferAttribute, Line,
  LineBasicMaterial, LineSegments, Points, PointsMaterial, Quaternion, type Material, type Object3D, type Texture,
} from 'three';
import type { Rgba } from '@s2u/gs';
import {
  actorToWorldPoint, CLAYMORE_RULES, GRENADE_BLAST, THROW_ARC, releaseSeconds, tumbleQuaternion, weaponCategory,
  type ThrowableRecord, type V3,
} from '@s2u/scene';
import type { GrenadeAssets } from './grenadeAssets';
import { GRENADE_BITMAPS } from './grenadeAssets';
import { markMaterial } from './effectMaterials';
import { markGeometry, paintMark, WALK_DECAL_RENDER_ORDER } from './fire';
import type { SurfaceShade } from './surfaceShade';
import { markClipGeometry, PERM_DECAL_TRIANGLES, squareInto, type MarkClipper, type MarkFrame } from './markClip';
import { BOMB_MODEL_READING } from './bombPage';
import type { PlaySnapshot } from './walk';
import { hdTextures } from './hdTexturePack';
import {
  HAND_PLACEHOLDER, type GrenadeItem, THROWABLES, type ThrowableRecords, type HeldItem, type ScorchGround,
  type GrenadeSource, type GrenadeStats, type GrenadeSprite, type GrenadeSpriteRole, type Live, GrenadeCore,
} from './grenadeCore';
export * from './grenadeCore';

/** Production three.js presentation for the shared numeric throwable rules. */
/** MISSION R8's slerp ends (`GrenadeThrower.drawLive`), reused. */
const SLERP_FROM = new Quaternion();
const SLERP_TO = new Quaternion();
/** How many scorches without a drawn surface under them are asked again a frame (`GrenadeThrower.shadeLate`). */
const SHADE_RETRIES_PER_FRAME = 4;
const rand = (lo: number, hi: number, r: () => number): number => lo + (hi - lo) * r();

/**
 * Two unit axes across a unit normal, `t1 x t2 = n`: t1 the world x laid on the plane (the world z when the normal is
 * near x). For the up normal, (1, 0, 0) and (0, 0, -1).
 */
function tangents(n: V3): [V3, V3] {
  const a: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  let t1: V3 = [a[0] - d * n[0], a[1] - d * n[1], a[2] - d * n[2]];
  const l = Math.hypot(...t1);
  t1 = [t1[0] / l, t1[1] / l, t1[2] / l];
  const t2: V3 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
  return [t1, t2];
}
interface LiveDrawing { model: Group | null; line: Line | null; dots: Points | null }

export class GrenadeThrower extends GrenadeCore {

  /** Everything drawn: the hand's grenade, the ones in flight, the effects, the scorches. `main.ts` adds it once. */
  readonly object = new Group();
  private templates: Partial<Record<GrenadeItem, Group>> = {};
  private readonly hand = new Group();
  private handModel: Group | null = null;
  /** The clone on the body's held node, and which item it is. */
  private heldModel: { item: HeldItem; object: Group } | null = null;
  private detonatorTemplate: Group | null = null;
  private textures = new Map<string, Texture>();
  private readonly scorches: Mesh[] = [];
  /** EFFECTS: the scorches riding a moving node, and each one's detacher (`GrenadeSource.attachToNode`). */
  private readonly onNode = new Map<Mesh, () => void>();
  /** LATER 277: each scorch's hold on its hit node (`GrenadeSource.holdOnNode`), released with it. */
  private readonly heldOn = new Map<Mesh, () => void>();
  /**
   * The game's permanent decal pool (`PERM_DECAL_TRIANGLES`, research 89 §5): each scorch's entries (its kept world
   * triangles; the bare square's two while nothing drawn is under it yet), and their sum this map. Full, a scorch is
   * refused; nothing is recycled but a scorch whose node is switched off (LATER 277, `dropScorch`); the pool empties
   * with the map (`reset`, `FUN_003bf050`).
   */
  private readonly scorchTriangles = new Map<Mesh, number>();
  private readonly scorchGeometry = new PlaneGeometry(1, 1);
  /** `grenade_mark.tif` as decoded (`GrenadeAssets.bitmaps`), for the scorch's material; null: the dark stand-in. */
  private scorchBitmap: Rgba | null = null;
  /** The scorches' one material (the marks' GS arithmetic, `markMaterial`), made on first use, a map's life. */
  private scorchMaterial: Material | null = null;
  /** EFFECTS: the world's drawn colour under a point (`./surfaceShade`), or null: every scorch at unity. */
  private shade: SurfaceShade | null = null;
  private scorchShade: [number, number, number, number] | null = null;
  /** Scorches laid where no drawn surface was yet under them (the props stream in after the map shows), asked again. */
  private readonly unshaded = new Map<Mesh, V3>();
  /** EFFECTS: the clip to the drawn world (`./markClip`), or null: the flat square with one shade. */
  private clipper: MarkClipper | null = null;
  /** Clipped scorches with nothing drawn under them yet (the bare square meanwhile), clipped again a few a frame. */
  private readonly unclipped = new Map<Mesh, MarkFrame>();
  /** The held throw's arc (`FUN_005970b0`): one strip, refilled each frame while it shows. */
  private readonly arcLine: LineSegments;
  /** Every model the map's grenade templates hold, by model name (a round's `ModelName`, when the map has it). */
  private modelTemplates: Readonly<Record<string, Group>> | null = null;

  /** XR-06: the world bomb's model, made on its first placing from `BOMB_MODEL_READING`'s (the fittings' `Satchel`). */
  private bombModel: Object3D | null = null;

  private scorchWarm: Mesh | null = null;
  private scorchClipWarm: Mesh | null = null;
  private readonly drawings = new Map<Live, LiveDrawing>();
  private readonly sprites = new Map<GrenadeSprite, Sprite>();

  constructor(source: GrenadeSource, records: ThrowableRecords = THROWABLES, random: () => number = Math.random) {
    super(source, records, random);
    this.object.add(this.hand);
    this.hand.visible = false;
    this.arcLine = arcStrip();
    this.object.add(this.arcLine);
  }
  protected override recordModel(item: GrenadeItem, record: ThrowableRecord): void {
    const t = this.modelTemplates?.[record.model];
    if (t) this.templates[item] = t;
  }
  protected override createLive(l: Live, kind: 'selected' | 'item' | 'round', item?: GrenadeItem): void {
    const template = kind === 'selected' ? this.template : kind === 'round'
      ? this.modelTemplates?.[l.g.record.model] ?? null : this.templates[item!] ?? null;
    const model = template ? template.clone() : null;
    if (model) {
      model.position.set(...l.g.pos);
      if (l.facing !== undefined) model.rotation.set(0, (l.facing * Math.PI) / 180, 0);
      this.object.add(model);
    }
    this.drawings.set(l, { model, line: null, dots: null });
  }
  protected override placeLive(l: Live): void { this.drawings.get(l)?.model?.position.set(...l.g.pos); }
  protected override liveVisible(l: Live, visible: boolean): void {
    const model = this.drawings.get(l)?.model;
    if (model) model.visible = visible;
  }
  protected override arcDrawing(arc: { points: readonly V3[]; alphas: readonly number[]; color: V3 } | null): void {
    if (!arc) { this.arcLine.visible = false; return; }
    fillStrip(this.arcLine, arc.points, arc.alphas, arc.color);
    this.arcLine.visible = arc.alphas.length > 0;
  }
  override stats(): GrenadeStats {
    return { ...super.stats(), inHand: this.heldModel !== null && this.heldModel.object.visible,
      model: this.template !== null, scorchShade: this.scorchShade && [...this.scorchShade] };
  }

  private get template(): Group | null { return this.detonatorUp ? this.detonatorTemplate : this.templates[this.item_] ?? null; }

  /**
   * A new map: its throwables' models by model name (`WorldView.grenades`) and assets; the pouch refilled, the air and
   * the ground cleared.
   */
  setMap(templates: Readonly<Record<string, Group>> | null, assets: GrenadeAssets | null | undefined): void {
    this.reset();
    if (this.bombModel) { this.object.remove(this.bombModel); this.bombModel = null; }   // XR-06: the last map's bomb
    this.templates = {};
    this.modelTemplates = templates;
    for (const item of Object.keys(this.records) as GrenadeItem[]) {
      const t = templates?.[this.records[item]!.model];
      if (t) this.templates[item] = t;
    }
    this.detonatorTemplate = templates?.[CLAYMORE_RULES.detonator.model] ?? null;
    this.refreshHandModel();
    this.dropHeld();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const [name, rgba] of Object.entries(assets?.bitmaps ?? {})) this.textures.set(name, textureOf(rgba));
    this.scorchBitmap = assets?.bitmaps?.[GRENADE_BITMAPS.scorch] ?? null;
    if (this.scorchMaterial) { (this.scorchMaterial as MeshBasicMaterial).map?.dispose(); this.scorchMaterial.dispose(); }
    this.scorchMaterial = null;
    this.scorchWarm?.geometry.dispose();                // the warm-up's scorch was the old material's
    this.scorchWarm = null;
    this.scorchClipWarm?.geometry.dispose();            // and its clipped twin (the next map's warm-up makes both again)
    this.scorchClipWarm = null;
    this.defaultMaterial = assets?.defaultMaterial ?? '';
    this.cast = null;
    this.castGrid = null;
  }

  /**
   * The scorches go and the permanent pool is empty again (`permTriangles` 0): a round's end (CMPExitState
   * `FUN_00223970` L76084 -> `FUN_0031c880` -> `FUN_003bf050(0x4b5050)` L219060) and a new map (`reset`). What is in
   * the air and the pouch are not the pool's.
   */
  override clearScorches(): void {
    for (const s of this.scorches) { this.detach(s); this.object.remove(s); s.geometry.dispose(); }
    this.scorches.length = 0;
    this.scorchTriangles.clear();
    this.permTriangles = 0;
    this.unshaded.clear();
    this.unclipped.clear();
    this.scorchShade = null;
  }

  protected override refreshHandModel(): void {
    if (this.handModel) { this.hand.remove(this.handModel); releaseRenderObjects(this.handModel); }   // LATER 922: a per-use clone
    const t = this.template;
    this.handModel = t ? t.clone() : null;
    if (this.handModel) this.hand.add(this.handModel);
  }

  private dropHeld(): void {
    this.heldModel?.object.removeFromParent();
    releaseRenderObjects(this.heldModel?.object);                // LATER 922: the body-held clone, let go for good
    this.heldModel = null;
  }

  /**
   * EFFECTS (research 89 §13, the mark's colour): the world's drawn vertex colour under a point, which the game
   * modulates a scorch's texel by (`FUN_003beca0` puts the ground vertices' own colour words in its packet); null: unity.
   */
  setShade(shade: SurfaceShade | null): void {
    this.shade = shade;
  }

  /** EFFECTS (research 89 §13): clip each scorch to the drawn ground under it, shaded per vertex (`./markClip`). */
  setClip(clipper: MarkClipper | null): void {
    this.clipper = clipper;
  }

  /** The scorches on the ground, oldest first (the tests read their colour). */
  scorchMeshes(): readonly Mesh[] {
    return this.scorches;
  }

  /**
   * XR-06 (research 214 s1; `./bombPage` `BombPageView.worldBomb`): DEMOLITION's bomb lying in the world -- on the ground,
   * planted, defused -- drawn with the model the game hangs there, the fittings' `Satchel` (`BOMB_MODEL_READING`,
   * `./grenadeAssets`), at the point unturned (`FUN_0059dab0`: its frame stands it on its origin), or taken away (null).
   * A map whose fittings lack it draws none.
   */
  worldBomb(): { place(pos: readonly [number, number, number] | null): void } {
    return {
      place: (pos) => {
        if (!pos) { if (this.bombModel) this.bombModel.visible = false; return; }
        if (!this.bombModel) {
          const want = BOMB_MODEL_READING.model.toLowerCase();
          const key = Object.keys(this.modelTemplates ?? {}).find((k) => k.toLowerCase() === want);
          const t = key ? this.modelTemplates![key] : undefined;
          if (!t) return;
          this.bombModel = t.clone();
          this.bombModel.rotation.set(0, 0, 0);                    // `FUN_00307360(0,0,0)`: no turn
          this.object.add(this.bombModel);
        }
        this.bombModel.position.set(pos[0], pos[1], pos[2]);
        this.bombModel.visible = true;
      },
    };
  }

  /**
   * PAR-41 (RE-5's dev read, `./devSeen`; the dev hook's `devSeen()`): the world bomb's drawn model (`worldBomb`) as the
   * development instrument reads it -- whether shown and where, copied at the call, never the model -- or null before its
   * first placing on this map. Read only; a browser adaptation, changing nothing drawn.
   */
  worldBombForDev(): { visible: boolean; pos: [number, number, number] } | null {
    const m = this.bombModel;
    return m ? { visible: m.visible, pos: [m.position.x, m.position.y, m.position.z] } : null;
  }

  /**
   * The model where the flight has it. MISSION R8 -- a known deviation, a browser adaptation with no original (the
   * owner, 2026-10-04: "the speed is good, but the feeling was wrong"; "yes to the interp fix"; research 208 section 9):
   * the flight steps once per 30 Hz game frame (the original's arithmetic, kept), so the model is DRAWN between the last
   * two frames' positions by `flight.alpha()`, its tumble slerped, so it moves at the screen's rate instead of holding
   * for drawn frames and jumping. The flight, its events and the room are untouched; the original draws every frame it
   * steps (30 fps on a 30 fps screen).
   */
  protected override drawLive(l: Live, dt: number): void {
    const drawn = this.drawings.get(l);
    if (!drawn) return;
    if (drawn.model && l.g.state !== 'detonated' && l.facing === undefined) {
      const t = this.flight.alpha(), from = l.from;
      if (from) {
        const p = l.g.pos;
        drawn.model.position.set(from.pos[0] + (p[0] - from.pos[0]) * t, from.pos[1] + (p[1] - from.pos[1]) * t, from.pos[2] + (p[2] - from.pos[2]) * t);
      } else drawn.model.position.set(...l.g.pos);
      if (weaponCategory(l.g.record.id) === 0x79) {
        // A hand grenade: the node's turn is the free-flight step's (`FUN_003c9530` -> `FUN_00307360` ->
        // `FUN_00315790`), which `SetModelOrientation` (0x3cabe0) leaves alone for category 0x79 -- in flight and after,
        // a bounce and the rest keep the last free step's turn (research 202 §2.6, V5 §7.2; PF-07a).
        const [x, y, z, w] = tumbleQuaternion(l.g.tumble);
        drawn.model.quaternion.set(x, y, z, w);
        if (from) {
          const [fx, fy, fz, fw] = tumbleQuaternion(from.tumble);
          drawn.model.quaternion.slerpQuaternions(SLERP_FROM.set(fx, fy, fz, fw), SLERP_TO.set(x, y, z, w), t);
        }
      } else if (l.g.state !== 'flight') {
        drawn.model.rotation.set(Math.PI / 2, drawn.model.rotation.y, 0);   // a launched round at rest: lying on its side
      }
    }
    if (this.trail && l.trail.length > 1) {
      if (!drawn.line) {
        drawn.line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, toneMapped: false, depthTest: false, fog: false }));
        drawn.line.frustumCulled = false;
        drawn.line.renderOrder = 10003;                   // a debug overlay: drawn over the world
        this.object.add(drawn.line);
      }
      drawn.line.geometry.setAttribute('position', new Float32BufferAttribute(l.trail.flat(), 3));
      if (!drawn.dots) {
        // A dot a tick along the line, so the arc reads as a flight rather than a hairline.
        drawn.dots = new Points(new BufferGeometry(), new PointsMaterial({ color: 0xffe080, size: 5, sizeAttenuation: false, toneMapped: false, depthTest: false, fog: false }));
        drawn.dots.frustumCulled = false;
        drawn.dots.renderOrder = 10003;
        this.object.add(drawn.dots);
      }
      drawn.dots.geometry.setAttribute('position', new Float32BufferAttribute(l.trail.flat(), 3));
    }
  }

  protected override dropLive(l: Live): void {
    const drawn = this.drawings.get(l);
    if (!drawn) return;
    if (drawn.model) { this.object.remove(drawn.model); releaseRenderObjects(drawn.model); }   // LATER 922: the throw's own clone
    if (drawn.line) { this.object.remove(drawn.line); drawn.line.geometry.dispose(); (drawn.line.material as LineBasicMaterial).dispose(); }
    if (drawn.dots) { this.object.remove(drawn.dots); drawn.dots.geometry.dispose(); (drawn.dots.material as PointsMaterial).dispose(); }
    this.drawings.delete(l);
  }

  protected override sprite(bitmap: GrenadeSpriteRole, additive: boolean, color: V3): GrenadeSprite {
    const state = super.sprite(bitmap, additive, color);
    const map = this.textures.get(GRENADE_BITMAPS[bitmap]) ?? null;
    const material = new SpriteMaterial({
      map, color: map ? undefined : additive ? 0xffc070 : 0x807870, transparent: true, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending, fog: true, toneMapped: false,
    });
    material.color.setRGB(...color);
    const s = new Sprite(material);
    s.frustumCulled = false;
    s.renderOrder = additive ? 10002 : 10001;
    this.object.add(s);
    this.sprites.set(state, s);
    return state;
  }

  /**
   * `GRENADE_BLAST`'s `grenade_mark.tif` flat under a grenade that lay on the ground (the material's size, STONE's when
   * unlisted), on the ground under it (`groundUnder`; research 85 §7.3) [reading: the game marks under a blast in the
   * air too, sized by the probed surface's material; the viewer marks at rest only, by the material it lay on, and at
   * STONE's size for a material `GRENADE_BLAST` does not list (research 85 section 10, "the scorch")]. The unclipped
   * square (no clipper) stays flat.
   */
  protected override scorch(pos: V3, material: string, ground: ScorchGround | null): void {
    const [min, max] = GRENADE_BLAST[material] ?? GRENADE_BLAST.STONE!;
    // The permanent pool full (`FUN_003bf1a0` 313254 refuses every entry): no scorch at all, the old ones kept.
    if (this.permTriangles >= PERM_DECAL_TRIANGLES) return;
    if (this.clipper) { this.scorchClipped(ground?.point ?? pos, ground?.normal ?? [0, 1, 0], min, max); return; }
    // Its own four corners, for its own colour (the shared quad's, cloned), as `./fire`'s marks.
    const mark = new Mesh(markGeometry(this.scorchGeometry), this.scorchMaterialOf());
    // A `FUN_003139e0` decal like a bullet mark (research 89 §13): modulated by the ground's own drawn colour under it.
    this.scorchShade = this.shade?.(pos, [0, 1, 0]) ?? null;
    paintMark(mark.geometry, this.scorchShade);
    if (this.shade && !this.scorchShade) this.unshaded.set(mark, [...pos]);
    const size = rand(min, max, this.random);
    mark.scale.set(size, size, 1);
    mark.rotation.set(-Math.PI / 2, 0, rand(0, Math.PI * 2, this.random));
    mark.position.set(pos[0], pos[1] - 0.05, pos[2]);
    this.keepScorch(mark, this.squareEntries());
  }

  /** The bare square's pool entries: its two triangles, or the one the pool still has room for. */
  private squareEntries(): number {
    return Math.min(2, PERM_DECAL_TRIANGLES - this.permTriangles);
  }

  /** A scorch into the scene and the permanent pool, `entries` of its room taken. */
  private keepScorch(mark: Mesh, entries: number): void {
    // OBF-32: a walk decal, linked into the struck visual's chain as a bullet mark is (`FUN_003b3800`): drawn after its
    // ground's own passes, under the smoke's particles (`./fire` `WALK_DECAL_RENDER_ORDER`). Was unset (0).
    mark.renderOrder = WALK_DECAL_RENDER_ORDER;
    this.object.add(mark);
    this.scorches.push(mark);
    this.scorchTriangles.set(mark, entries);
    this.permTriangles += entries;
  }

  /**
   * The scorch as the game builds a `FUN_003139e0` decal (research 89 §13-§15): the square flat on the ground under the
   * blast, projected along that ground's normal negated (`FUN_003d0ba0` 323891 hands the column's record +0x10 scaled by
   * -1 to `FUN_00307810`), clipped to the drawn ground's triangles, each vertex the ground's colour there
   * (`./markClip`); the bare square at unity where nothing is drawn under it yet, clipped again a few a frame. Straight
   * down instead, a big sloped triangle's far vertices pass the 4.8 depth test and the scorch is dropped whole.
   */
  private scorchClipped(pos: V3, normal: V3, min: number, max: number): void {
    const size = rand(min, max, this.random);
    const turn = rand(0, Math.PI * 2, this.random);
    const c = Math.cos(turn), s = Math.sin(turn);
    // The square's turn about the normal as the unclipped one takes it about the up axis (on flat ground the axes are
    // exactly its: right (c, 0, -s), up (-s, 0, -c)) [reading: `FUN_00307810` takes no turn; the viewer's random one kept].
    const [t1, t2] = tangents(normal);
    const frame: MarkFrame = {
      origin: [...pos],
      right: [c * t1[0] + s * t2[0], c * t1[1] + s * t2[1], c * t1[2] + s * t2[2]],
      up: [-s * t1[0] + c * t2[0], -s * t1[1] + c * t2[1], -s * t1[2] + c * t2[2]],
      forward: [-normal[0], -normal[1], -normal[2]], side: size,
    };
    const mark = new Mesh(markClipGeometry(), this.scorchMaterialOf());
    // One pool entry per kept world triangle, the first ones while there is room (`FUN_003b3800` 306401-306417): a
    // scorch that only partly fits is partly drawn (SCORCH_PARTIAL_ORDER_READING: in the viewer's candidate order, not
    // the game's walk).
    const kept = this.clipper!.clip(frame, mark.geometry, 0.05, PERM_DECAL_TRIANGLES - this.permTriangles);
    if (kept > 0) {
      const centre = this.clipper!.centre;
      this.scorchShade = this.clipper!.centreFound ? [centre[0]!, centre[1]!, centre[2]!, centre[3]!] : null;
    } else {
      squareInto(frame, mark.geometry, 0.05, null);
      this.unclipped.set(mark, frame);
      this.scorchShade = null;
    }
    mark.matrixAutoUpdate = false;
    mark.position.set(pos[0], pos[1], pos[2]);          // for the tests; the matrix stays the identity (world space)
    mark.updateMatrixWorld(true);
    this.keepScorch(mark, kept > 0 ? kept : this.squareEntries());
    if (kept > 0) this.hangOnNode(mark);
  }

  /** EFFECTS: a scorch off the node it rode (a round's end, a new map); its matrix back to the world's identity. */
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

  /** EFFECTS: the scorch just clipped onto the node the clip chose, when that node moves (`FUN_003b3800` 306396-306416). */
  private hangOnNode(mesh: Mesh): void {
    this.detach(mesh);
    const path = this.clipper?.lastNodePath ?? null;
    if (!path) return;
    const off = this.source.attachToNode?.(path, mesh) ?? null;
    if (off) this.onNode.set(mesh, off);
    // LATER 277: held on its node whatever it is; switched off, the scorch goes (`dropScorch`).
    const release = this.source.holdOnNode?.(path, () => this.dropScorch(mesh)) ?? null;
    if (release) this.heldOn.set(mesh, release);
  }

  /**
   * LATER 277: a scorch whose node was switched off (`NODE_OFF_MARKS_READING`, `./world`) -- drawn no more, off its node,
   * its permanent pool entries freed: one rule with the marks', as `FUN_003b36f0` (D:L306336-306342) frees both kinds
   * of a visual's list together.
   */
  private dropScorch(mesh: Mesh): void {
    this.heldOn.delete(mesh);
    mesh.visible = false;
    this.unshaded.delete(mesh);
    this.unclipped.delete(mesh);
    this.detach(mesh);
    this.object.remove(mesh);
    mesh.geometry.dispose();
    const i = this.scorches.indexOf(mesh);
    if (i >= 0) this.scorches.splice(i, 1);
    this.permTriangles -= this.scorchTriangles.get(mesh) ?? 0;
    this.scorchTriangles.delete(mesh);
  }

  /** EFFECTS: how many scorches ride a moving node now (tests and the hook). */
  scorchesOnNodes(): number {
    return this.onNode.size;
  }

  /**
   * What a throw and its blast first draw, for the page to compile with the SEAL (`ViewerRenderer.prepare`, research 90
   * §9, #23): the arc's strip (hidden until R1 is held; the scene-wide warm-up reaches it last, after the throw on a
   * quick one -- it linked at the hold) and a scorch with the material every blast will use (made at the first blast
   * before, on a quad with a `color` lane no warmed draw had). The scorch is not in the scene: `prepare` parks it for
   * the call, so no frame draws it.
   */
  warmObjects(): Object3D[] {
    if (!this.scorchWarm) {
      this.scorchWarm = new Mesh(markGeometry(this.scorchGeometry), this.scorchMaterialOf());
      this.scorchWarm.name = 'scorch (warm-up)';
      this.scorchWarm.frustumCulled = false;
      // The clipped scorch (./markClip) draws a different lane set (no normal): warm that program too, on a square.
      const clipped = markClipGeometry();
      squareInto({ origin: [0, 0, 0], right: [1, 0, 0], up: [0, 0, -1], forward: [0, -1, 0], side: 1 }, clipped, 0.05, null);
      this.scorchClipWarm = new Mesh(clipped, this.scorchMaterialOf());
      this.scorchClipWarm.name = 'scorch clipped (warm-up)';
      this.scorchClipWarm.frustumCulled = false;
    }
    // FLASH-WARM (product track, a renderer warm-up): the map's throwable models -- the templates the hand's model and
    // every thrown copy are cloned from, sharing their geometries and bitmaps -- are in no scene, so their buffers and
    // textures were made at the first selection or throw (the owner's measurement at bb133165e: the first Mark141's
    // window made 4 geometries and a texture the second did not). Parked by `prepare` for the call, like the scorch.
    return [this.arcLine, this.scorchWarm, this.scorchClipWarm!, ...Object.values(this.modelTemplates ?? {})];
  }

  /**
   * The scorches' material: `grenade_mark.tif` in the marks' GS arithmetic (`markMaterial`: texel x the vertex colour,
   * clamped, brightened with the frame; source alpha over, no depth write), pulled a step nearer than a bullet mark;
   * without the bitmap a dark stand-in, modulated all the same.
   */
  private scorchMaterialOf(): Material {
    if (this.scorchMaterial) return this.scorchMaterial;
    const bitmap = this.scorchBitmap;
    const m: Material = bitmap ? markMaterial({ rgba: bitmap, gs: null }) : new MeshBasicMaterial({
      color: 0x151210, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, fog: true, toneMapped: false,
      opacity: 0.6,
    });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    this.scorchMaterial = m;
    return m;
  }

  /** EFFECTS: a few of the clipped scorches still without a drawn surface under them, clipped again (`unclipped`). */
  private clipLate(): void {
    if (!this.clipper || this.unclipped.size === 0) return;
    let asked = 0;
    for (const [mesh, frame] of this.unclipped) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      this.unclipped.delete(mesh);
      // The square's entries back to the pool, the clip's taken: at most what it held plus the room left.
      const held = this.scorchTriangles.get(mesh) ?? 0;
      const kept = this.clipper.clip(frame, mesh.geometry, 0.05, held + PERM_DECAL_TRIANGLES - this.permTriangles);
      if (kept === 0) { this.unclipped.set(mesh, frame); continue; }
      this.scorchTriangles.set(mesh, kept);
      this.permTriangles += kept - held;
      this.hangOnNode(mesh);
      if (mesh === this.scorches.at(-1) && this.clipper.centreFound) {
        const c = this.clipper.centre;
        this.scorchShade = [c[0]!, c[1]!, c[2]!, c[3]!];
      }
    }
  }

  /** EFFECTS: a few of the scorches still without a drawn surface under them, asked again (`unshaded`). */
  protected override shadeLate(): void {
    this.clipLate();
    if (!this.shade || this.unshaded.size === 0) return;
    let asked = 0;
    for (const [mesh, at] of this.unshaded) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      const rgba = this.shade(at, [0, 1, 0]);
      this.unshaded.delete(mesh);
      if (rgba) {
        paintMark(mesh.geometry, rgba);
        if (mesh === this.scorches.at(-1)) this.scorchShade = rgba;
      } else this.unshaded.set(mesh, at);               // to the back of the queue: the others get their turn
    }
  }

  // ---- the hand -----------------------------------------------------------------------------------------------

  protected override placeHand(snap: PlaySnapshot | null): void {
    const held = !!snap && this.equipped_ && (this.detonatorUp || this.selectedLeft() > 0) &&
      (this.phase_ === 'ready' || this.phase_ === 'holding' || !!this.pending || !!this.placing);
    // On the body's `grenade` node under `rhand` (`FUN_00553290`; the clips' `rifle` track carries the firearm apart).
    const node = this.source.heldNode?.() ?? null;
    const template = this.template;
    if (node && template) {
      const item = this.held() ?? this.item_;
      if (!this.heldModel || this.heldModel.item !== item || this.heldModel.object.parent !== node) {
        this.dropHeld();
        const object = template.clone();
        node.add(object);
        this.heldModel = { item, object };
      }
      this.heldModel.object.visible = held;
      this.hand.visible = false;
      return;
    }
    this.dropHeld();
    const show = held && this.source.view() === 'third' && this.handModel !== null;
    this.hand.visible = show;
    if (!show || !snap) return;
    let offset: V3 = HAND_PLACEHOLDER;
    if (this.pending) {
      // The clip lifts the hand toward its release point [placeholder for the skeleton's hand].
      const k = 1 - Math.max(0, this.pending.left) / Math.max(1e-6, releaseSeconds(this.pending.played));
      const to = this.pending.anim.offset;
      offset = [offset[0] + (to[0] - offset[0]) * k, offset[1] + (to[1] - offset[1]) * k, offset[2] + (to[2] - offset[2]) * k];
    }
    const at = actorToWorldPoint(snap.feet, snap.yaw, offset);
    this.hand.position.set(...at);
    this.hand.rotation.set(0, (snap.yaw * Math.PI) / 180, 0);
  }
  protected override placeSprite(state: GrenadeSprite, at: V3): void {
    super.placeSprite(state, at);
    this.sprites.get(state)?.position.set(...at);
  }
  protected override drawSprite(state: GrenadeSprite): void {
    const sprite = this.sprites.get(state);
    if (!sprite) return;
    sprite.position.set(...state.pos);
    sprite.scale.set(...state.scale);
    sprite.material.opacity = state.opacity;
  }
  protected override dropSprite(state: GrenadeSprite): void {
    const sprite = this.sprites.get(state);
    if (!sprite) return;
    this.object.remove(sprite);
    sprite.material.dispose();
    this.sprites.delete(state);
  }
}
/**
 * PLACEHOLDER (named): the arc's lines are translucent, so they go to the line list `FUN_003373b0` (0x488df8), whose
 * drawing was not traced; the opaque line path beside it (`FUN_00360030`) tests Z (`TEST_1` = 0x5000c), so the list
 * is taken to as well -- the ground hides the arc's part under it.
 */
export const ARC_DEPTH_TEST_PLACEHOLDER = true;

/**
 * The arc's strip: a line segment a pair of points, each end the colour with the segment's alpha (both ends alike, as
 * `FUN_005fff40` sends them), blended, unfogged (the line's `PRIM` 0x49 has no FGE), one pixel wide as a GS line.
 */
function arcStrip(): LineSegments {
  const n = (THROW_ARC.segments + 1) * 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 4), 4));
  const line = new LineSegments(geometry, new LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, depthTest: ARC_DEPTH_TEST_PLACEHOLDER, fog: false, toneMapped: false,
  }));
  line.name = 'throwArc';
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function fillStrip(line: LineSegments, points: readonly V3[], alphas: readonly number[], color: V3): void {
  const pos = line.geometry.getAttribute('position') as Float32BufferAttribute;
  const col = line.geometry.getAttribute('color') as Float32BufferAttribute;
  const n = Math.min(alphas.length, pos.count / 2);
  for (let i = 0; i < n; i++) {
    const a = points[i]!, b = points[i + 1]!, w = alphas[i]!;
    pos.setXYZ(2 * i, a[0], a[1], a[2]);
    pos.setXYZ(2 * i + 1, b[0], b[1], b[2]);
    col.setXYZW(2 * i, color[0], color[1], color[2], w);
    col.setXYZW(2 * i + 1, color[0], color[1], color[2], w);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  line.geometry.setDrawRange(0, n * 2);
}

function textureOf(rgba: Rgba): DataTexture {
  const t = new DataTexture(rgba.data, rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  hdTextures.register(t, rgba);   // OT.R92 (HD-3): inert until the test room's HD pack is set
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FrontSide, Group, LinearFilter, Mesh, NoColorSpace, OrthographicCamera,
  PerspectiveCamera, RepeatWrapping, RGBAFormat, Scene, UnsignedByteType, Vector2, type Camera, type Object3D,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture as textureNode, uv, vec4, vertexColor } from 'three/tsl';
import type { Rgba } from '@s2u/gs';
import type { UiModelEntry } from '@s2u/scene';
import type { HudRenderer } from './reticle';
import { ARMORY_WHITE, MODEL_CAMERA_READING, modelSplit, WHITE_TEXEL, type ArmoryQuad, type ShownModel } from './armoryLayout';
import type { ArmoryModel } from './armoryData';
import {hdTextures} from './hdTexturePack';

/**
 * The ARMORY's pass (web sprint 5, S3): `./armoryLayout`'s quads drawn over everything, on the HUD's path -- the game's
 * 640x448 frame fitted whole into the drawing buffer and centred (`armoryFrame`, ARMORY_FRAME_FIT: as the front end's
 * menus fit, not by height alone as WEAPON EXCHANGE and the scoreboard are), so it sits the same in the Modern view and
 * the PS2 one (whose buffer is the console's 640x448) -- each bitmap MODULATE-tinted on the GS's 0-128 scale (`./hud`). Unlike the HUD's fixed batches,
 * the order is the quads' own (a panel, then the text over it, then the next panel): each run of one bitmap is a draw of
 * its own, in turn.
 *
 * **The spinning preview** (research 95 §2.6, §3.7, §3.8; S3 part 2): each shown `MODELS` entry's model (`UI_GEO` /
 * `UI_MDL` in the `'bias'` form, S1) drawn in 3D over the dialog's objects and under the fader and the popup
 * (`UI_MODEL_DRAW_ORDER_READING`), at its entry's place (`MODEL_CAMERA_READING`), turned by its node's rotation (the
 * scripts' spin), its packets textured from `UI_TXR` and coloured by their vertex colours as their flags say
 * (`UI_MODEL_LIT_READING`).
 */

export { MODEL_CAMERA_READING, modelSplit, WHITE_TEXEL } from './armoryLayout';
/**
 * UI_MODEL_LIT_READING: the preview's packets are drawn as their nodes' flags say -- none of the 64 UI models' packets
 * asks for the light command (`lit` false on every one; their vertex colours near unity, 0.53-1.0 on average), so each
 * is its texel x its vertex colour (`./lighting` `applyLighting`'s unlit path), `UI.ZED`'s rig unused.
 */
export const UI_MODEL_LIT_READING = 'flags (none lit)' as const;
/**
 * SPIN_SCREEN_SENSE_READING (research 95 §8): the scripts' rotation applied as the file gives it in this camera's frame
 * (y up, right-handed, looking down -z): a turn about -y, so seen from above the model turns clockwise and its near side
 * moves to the screen's left. The UI model camera's handedness was not traced.
 */
export const SPIN_SCREEN_SENSE_READING = 'about -y as stored: clockwise from above' as const;
/**
 * A preview model's meshes as the scripts have set its parts (`./armoryLayout` `ARMORY_MODEL_PART_REF`): a mesh whose
 * part (its `userData.node`, as `setModels` tags it) is named in `hidden` -- exactly, as `strcmp` compares -- is hidden.
 */
export function showModelParts(group: Object3D, hidden: readonly string[]): void {
  group.traverse((o) => {
    const node: unknown = o.userData['node'];
    if (typeof node === 'string') o.visible = !hidden.includes(node);
  });
}

/** UI_MODEL_DRAW_ORDER_READING: the models after the dialog's objects, before the menu fader and the popup. */
export const UI_MODEL_DRAW_ORDER_READING = 'after the objects, under the fader' as const;

/** Where a model entry's origin projects on the 640x448 frame (`MODEL_CAMERA_READING`). */
export function modelFramePoint(e: Pick<UiModelEntry, 'azimuth' | 'elev' | 'distance'>): [number, number] {
  const f = MODEL_CAMERA_READING.focal;
  return [320 + (f * e.azimuth) / e.distance, 224 - (f * e.elev) / e.distance];
}


/**
 * ARMORY_FRAME_FIT (the owner, 2026-10-04: "the armory does not downscale at the proper resolution with the screensize
 * like menu UI would ... it will eventually be in the lobby flow of the root game so we should size it appropriately"):
 * the 640x448 frame fitted whole into the drawing buffer -- scaled by the smaller of width / 640 and height / 448 and
 * centred both ways, letterboxed -- as the front end's menus are (`./frontEnd`: the canvas's `object-fit: contain`).
 * Before, it was scaled by height / 448 alone (WEAPON EXCHANGE's and the scoreboard's rule, which stays theirs), so a
 * window narrower than 640:448 cut its sides off. A browser adaptation: the console's frame was always the screen.
 */
export function armoryFrame(width: number, height: number): { s: number; x0: number; y0: number } {
  const s = Math.max(0, Math.min(width / 640, height / 448));
  return { s, x0: (width - 640 * s) / 2, y0: (height - 448 * s) / 2 };
}

/**
 * The model camera's vertical field of view, in degrees, for a `width` x `height` buffer: the frame's field
 * (`MODEL_CAMERA_READING`) over its 448 x s rows, widened to the buffer's whole height seen through the same centre
 * (ARMORY_FRAME_FIT), so each model lands on its frame place (`modelFramePoint`) at the frame's scale, letterboxed or not.
 */
export function modelCameraFov(width: number, height: number): number {
  const { s } = armoryFrame(width, height);
  const half = Math.atan(Math.tan(MODEL_CAMERA_READING.fovY / 2) * (s > 0 ? height / (448 * s) : 1));
  return (2 * half * 180) / Math.PI;
}

/** A point on the drawing buffer (`width` x `height`) to the 640x448 frame: the pass's mapping undone (`armoryFrame`). */
export function frameOfBuffer(px: number, py: number, buffer: { width: number; height: number }): [number, number] {
  const { s, x0, y0 } = armoryFrame(buffer.width, buffer.height);
  if (s <= 0) return [NaN, NaN];
  return [(px - x0) / s, (py - y0) / s];
}

/**
 * A point on the canvas's CSS box (`box`, from `getBoundingClientRect`) to the 640x448 frame: to the drawing buffer's
 * pixels first, then `frameOfBuffer`. The box's shape need not be the buffer's -- the PS2 look stretches the 640x448
 * buffer onto a 4:3 box (`styles.css` `body.ps2-look #view`) -- so the box is never read as the buffer. NaNs when
 * either is empty.
 */
export function frameOfClient(
  cx: number, cy: number, box: { width: number; height: number }, buffer: { width: number; height: number },
): [number, number] {
  if (box.width <= 0 || box.height <= 0) return [NaN, NaN];
  return frameOfBuffer((cx * buffer.width) / box.width, (cy * buffer.height) / box.height, buffer);
}

/** Consecutive quads of one bitmap, in order: one draw each. */
export function runsOf(quads: readonly ArmoryQuad[]): { texture: string; quads: ArmoryQuad[] }[] {
  const runs: { texture: string; quads: ArmoryQuad[] }[] = [];
  for (const q of quads) {
    const last = runs[runs.length - 1];
    if (last && last.texture === q.texture) last.quads.push(q); else runs.push({ texture: q.texture, quads: [q] });
  }
  return runs;
}

/** The models' white texel's key (a name no texture library can hold). */
const WHITE_KEY = '\u0000white';

function makeTexture(rgba: Rgba): DataTexture {
  // The bitmaps come top row first (`./armoryData`); the pass's camera looks with y down, so they go up unflipped.
  const t = new DataTexture(rgba.data, rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  hdTextures.register(t, rgba, true);   // `flipRows`'d (`./armoryData`): keyed turned back   // OT.R92 (HD-3): inert until the test room's HD pack is set
  return t;
}

function modelTexture(rgba: Rgba): DataTexture {
  // As the weapons' (`./world` `makeTexture`): not flipped, the stored byte the value, repeating.
  const t = new DataTexture(new Uint8Array(rgba.data.buffer, rgba.data.byteOffset, rgba.data.length), rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  t.flipY = false; t.colorSpace = NoColorSpace; t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.generateMipmaps = false;
  t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping; t.needsUpdate = true;
  hdTextures.register(t, rgba);   // OT.R92 (HD-3): inert until the test room's HD pack is set
  return t;
}

function quadGeometry(capacity: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 12), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(capacity * 8), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 16), 4));
  const index = new Uint32Array(capacity * 6);
  for (let i = 0; i < capacity; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  g.setIndex(new BufferAttribute(index, 1));
  g.setDrawRange(0, 0);
  return g;
}

interface Slot { mesh: Mesh; geometry: BufferGeometry; capacity: number; after: boolean }

/** The renderer the pass draws with: the HUD's, and the depth clear the models need where it has one. */
export type ArmoryRenderer = HudRenderer & { clearDepth?(): unknown };

export class ArmoryView {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  private readonly maps = new Map<string, { texture: DataTexture; material: MeshBasicNodeMaterial; width: number; height: number }>();
  private readonly slots: Slot[] = [];
  private readonly size = new Vector2();
  private buffer = { width: 0, height: 0 };
  private readonly modelScene = new Scene();
  private readonly modelCamera = new PerspectiveCamera((MODEL_CAMERA_READING.fovY * 180) / Math.PI, 640 / 448, 0.5, 1000);
  /** Each model's group, by lower-case model name. */
  private readonly models = new Map<string, Group>();
  /** The models' textures by lower-case name, and their materials by texture and culling: kept with the models. */
  private readonly modelTextures = new Map<string, DataTexture>();
  private readonly modelMaterials = new Map<string, MeshBasicNodeMaterial>();
  /** The one quad the warm-up draws each bitmap's material on (`warmTargets`), made once, disposed with the view. */
  private warmQuad: BufferGeometry | null = null;

  /** The screen's bitmaps (lower-case names, top row first); the old ones go. The white texel is always there. */
  setBitmaps(bitmaps: readonly (readonly [string, Rgba])[]): void {
    this.clear();
    for (const [name, rgba] of [...bitmaps, [ARMORY_WHITE, WHITE_TEXEL] as const]) {
      const texture = makeTexture(rgba);
      const material = new MeshBasicNodeMaterial();
      material.name = `armory ${name}`;
      material.colorNode = vec4(textureNode(texture, uv()).mul(vertexColor())).clamp(0, 1);
      material.transparent = true; material.depthTest = false; material.depthWrite = false;
      material.side = DoubleSide; material.fog = false; material.toneMapped = false;
      this.maps.set(name.toLowerCase(), { texture, material, width: rgba.width, height: rgba.height });
    }
  }

  /** The bitmaps' sizes, by name (what `./armoryLayout` reads). */
  sizes(): Record<string, { width: number; height: number }> {
    const out: Record<string, { width: number; height: number }> = {};
    for (const [n, m] of this.maps) out[n] = { width: m.width, height: m.height };
    return out;
  }

  /** The drawing buffer's size at the last render (the taps' mapping). */
  bufferSize(): { width: number; height: number } { return this.buffer; }

  /**
   * The preview models (the worker's decode, S1) and their textures (lower-case names, as stored): one group a model,
   * one mesh a packet, textured by name (including the original UI JUNK library, research 95 correction), and culled
   * as the packet says. Missing decoded textures retain the existing white fallback and reader diagnostic.
   * The UI models are the same for every map (`RUN/UI/UI_GEO.ZED`):
   * kept across map changes -- a model or a texture already held is not made again, and none goes until `dispose`.
   */
  setModels(models: readonly ArmoryModel[], textures: readonly (readonly [string, Rgba])[]): void {
    for (const [name, rgba] of textures) if (!this.modelTextures.has(name.toLowerCase())) this.modelTextures.set(name.toLowerCase(), modelTexture(rgba));
    if (!this.modelTextures.has(WHITE_KEY)) this.modelTextures.set(WHITE_KEY, modelTexture(WHITE_TEXEL));
    const material = (name: string | null, cull: boolean): MeshBasicNodeMaterial => {
      const key = `${name?.toLowerCase() ?? ''}|${cull}`;
      let m = this.modelMaterials.get(key);
      if (!m) {
        m = new MeshBasicNodeMaterial();
        m.name = `armory-model ${name ?? 'untextured'}`;
        const tex = (name ? this.modelTextures.get(name.toLowerCase()) : undefined) ?? this.modelTextures.get(WHITE_KEY)!;
        // GS MODULATE: the texel times the vertex colour, 1.0 the PS2's unity (`@s2u/mesh` `MeshData.colors`).
        m.colorNode = vec4(textureNode(tex, uv()).mul(vertexColor())).clamp(0, 1);
        m.alphaTest = 0.5; m.side = cull ? FrontSide : DoubleSide; m.fog = false; m.toneMapped = false;
        this.modelMaterials.set(key, m);
      }
      return m;
    };
    for (const { model, decoded } of models) {
      if (this.models.has(model.toLowerCase())) continue;
      const group = new Group();
      group.name = model; group.visible = false;
      for (const part of decoded.parts) {
        for (const mesh of part.meshes) {
          const g = new BufferGeometry();
          g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
          g.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
          g.setAttribute('color', new BufferAttribute(mesh.colors, 4));   // UI_MODEL_LIT_READING: the material colour as is
          g.setIndex(new BufferAttribute(mesh.indices, 1));
          const m = new Mesh(g, material(mesh.textureName, mesh.cull));
          m.name = `${part.node} (${mesh.textureName ?? 'untextured'})`;
          m.userData['node'] = part.node;                   // the scripts' part switch finds it (`showModelParts`)
          m.frustumCulled = false;
          group.add(m);
        }
      }
      this.models.set(model.toLowerCase(), group);
      this.modelScene.add(group);
    }
  }

  /** Whether a model is held. */
  hasModel(model: string): boolean { return this.models.has(model.toLowerCase()); }
  /** Whether any model is held (the page asks the worker for them once: they are every map's). */
  hasModels(): boolean { return this.models.size > 0; }

  /**
   * What the page's warm-up compiles before the screen first draws (`ViewerRenderer.prepare`): a quad of each bitmap on
   * the 2D pass, and every preview mesh in the model scene.
   */
  warmTargets(): { objects: Object3D[]; scene: Scene; camera: Camera }[] {
    const quad = this.warmQuad ??= quadGeometry(1);
    const flat: Object3D[] = [...this.maps.values()].map((m) => { const mesh = new Mesh(quad, m.material); mesh.frustumCulled = false; return mesh; });
    const meshes: Object3D[] = [];
    for (const g of this.models.values()) g.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o); });
    return [{ objects: flat, scene: this.scene, camera: this.camera }, { objects: meshes, scene: this.modelScene, camera: this.modelCamera }];
  }

  /**
   * Draws `quads` over whatever the renderer last drew, and the shown models between the dialog's objects and the fader
   * (`modelSplit`); nothing is cleared but the depth, for the models (where the renderer has `clearDepth`).
   */
  render(renderer: ArmoryRenderer, quads: readonly ArmoryQuad[], shown: readonly ShownModel[] = []): void {
    renderer.getDrawingBufferSize(this.size);
    const W = this.size.x, H = this.size.y;
    this.buffer = { width: W, height: H };
    for (const s of this.slots) s.mesh.visible = false;
    if (!quads.length || H <= 0) return;
    this.camera.left = 0; this.camera.right = W; this.camera.top = 0; this.camera.bottom = H;
    this.camera.updateProjectionMatrix();
    const { s, x0: fx, y0: fy } = armoryFrame(W, H);                       // ARMORY_FRAME_FIT: the whole frame, letterboxed
    const X = (x: number): number => fx + x * s, Y = (y: number): number => fy + y * s;
    const split = modelSplit(quads);
    let used = 0, at = 0;
    for (const run of runsOf(quads)) {
      const first = at;
      at += run.quads.length;
      const map = this.maps.get(run.texture);
      if (!map) continue;
      const slot = this.slot(used, run.quads.length);
      slot.after = first >= split;
      slot.mesh.material = map.material;
      slot.mesh.renderOrder = used;
      const pos = slot.geometry.getAttribute('position') as BufferAttribute;
      const tex = slot.geometry.getAttribute('uv') as BufferAttribute;
      const col = slot.geometry.getAttribute('color') as BufferAttribute;
      run.quads.forEach((q, i) => {
        const x0 = X(q.x), y0 = Y(q.y), x1 = X(q.x + q.w), y1 = Y(q.y + q.h);
        const corners: [number, number, number, number][] = [[x0, y0, q.u0, q.v0], [x1, y0, q.u1, q.v0], [x1, y1, q.u1, q.v1], [x0, y1, q.u0, q.v1]];
        corners.forEach(([x, y, u, v], k) => {
          pos.setXYZ(i * 4 + k, x, y, 0);
          tex.setXY(i * 4 + k, u / map.width, v / map.height);
          col.setXYZW(i * 4 + k, q.rgb[0] / 128, q.rgb[1] / 128, q.rgb[2] / 128, q.alpha / 128);
        });
      });
      pos.needsUpdate = true; tex.needsUpdate = true; col.needsUpdate = true;
      slot.geometry.setDrawRange(0, run.quads.length * 6);
      slot.mesh.visible = true;
      used++;
    }
    const drawn = this.slots.slice(0, used);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      // The dialog's objects; the models over them; then the fader and the popup (UI_MODEL_DRAW_ORDER_READING).
      for (const sl of drawn) sl.mesh.visible = !sl.after;
      renderer.render(this.scene, this.camera);
      if (this.placeModels(shown, W, H)) {
        renderer.clearDepth?.();
        renderer.render(this.modelScene, this.modelCamera);
      }
      if (drawn.some((sl) => sl.after)) {
        for (const sl of drawn) sl.mesh.visible = sl.after;
        renderer.render(this.scene, this.camera);
      }
    } finally { renderer.autoClear = autoClear; }
  }

  /**
   * The shown models placed for this frame (`MODEL_CAMERA_READING`): the camera's vertical field over the frame's
   * height (fitted and centred, `armoryFrame`, as the quads), each model at its entry's place turned by its node. False
   * when none shows.
   */
  private placeModels(shown: readonly ShownModel[], W: number, H: number): boolean {
    for (const g of this.models.values()) g.visible = false;
    let any = false;
    for (const { entry, rotation, hidden } of shown) {
      const g = this.models.get(entry.model.toLowerCase());
      if (!g) continue;
      g.visible = true;
      showModelParts(g, hidden ?? []);                     // ARMORY_MODEL_PART_REF: the 552's silencer off
      g.position.set(entry.azimuth, entry.elev, -entry.distance);
      g.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      any = true;
    }
    if (!any) return false;
    this.modelCamera.fov = modelCameraFov(W, H);
    this.modelCamera.aspect = W / H;
    this.modelCamera.updateProjectionMatrix();
    return true;
  }

  private slot(i: number, need: number): Slot {
    let s = this.slots[i];
    if (!s) {
      const geometry = quadGeometry(Math.max(8, need));
      const mesh = new Mesh(geometry);
      mesh.frustumCulled = false; mesh.visible = false;
      this.scene.add(mesh);
      s = { mesh, geometry, capacity: Math.max(8, need), after: false };
      this.slots.push(s);
    }
    if (need > s.capacity) {
      const capacity = Math.max(need, s.capacity * 2), geometry = quadGeometry(capacity);
      s.mesh.geometry = geometry; s.geometry.dispose(); s.geometry = geometry; s.capacity = capacity;
    }
    return s;
  }

  clear(): void {
    for (const m of this.maps.values()) { m.texture.dispose(); m.material.dispose(); }
    this.maps.clear();
    for (const s of this.slots) s.mesh.visible = false;
  }

  /** Everything the view made: the bitmaps, the quads, the models and their textures (the page's teardown). */
  dispose(): void {
    this.clear();
    for (const s of this.slots.splice(0)) { this.scene.remove(s.mesh); s.geometry.dispose(); }
    this.warmQuad?.dispose();
    this.warmQuad = null;
    for (const g of this.models.values()) {
      this.modelScene.remove(g);
      g.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose(); });
    }
    this.models.clear();
    for (const t of this.modelTextures.values()) t.dispose();
    this.modelTextures.clear();
    for (const m of this.modelMaterials.values()) m.dispose();
    this.modelMaterials.clear();
  }
}
